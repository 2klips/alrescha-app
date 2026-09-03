import {
  createMcpHandler,
  McpServer,
  ProtocolError,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import { deriveArtifactFacets, routeQuery } from "@alrescha/core";

import { buildRepoOverview, findModuleForNode } from "./module-tools";

import {
  getWorkspaceArtifact,
  getWorkspaceFindings,
  queryWorkspaceBrain,
  searchWorkspaceIndex,
  selectWorkspaceContextPack,
} from "./data-brain";
import {
  collectNeighbors,
  getNodeContent,
  impactOf,
  searchWorkspaceNodes,
  tracePath,
} from "./graph-tools";
import {
  REPO_MAP_DEFAULT_BUDGET,
  REPO_MAP_MAX_BUDGET,
  REPO_MAP_MIN_BUDGET,
  buildGraphSchema,
  buildRepoMap,
} from "./repo-map";
import {
  AGENT_ASSERTION_RELATIONS,
  MEMORY_BLOCK_NAMES,
  createUlid,
  type McpPackMeasurement,
  type McpPrincipal,
  type McpStore,
} from "./store";

const SERVER_INFO = { name: "alrescha", version: "0.1.0" } as const;
const PRIVATE_TTL_MS = 60_000;
const READ_ONLY_TOOL = { destructiveHint: false, readOnlyHint: true } as const;
const WRITE_METADATA_TOOL = {
  destructiveHint: false,
  readOnlyHint: false,
} as const;
const NODE_TYPE_SCHEMA = z.enum([
  "artifact",
  "requirement",
  "evidence",
  "finding",
  "receipt",
  "context_pack",
  "memory",
]);
const RELATION_SCHEMA = z.enum([
  "requires",
  "implements",
  "tests",
  "supports",
  "contradicts",
  "supersedes",
  "references",
  "imports",
  "calls",
]);

function toolResult(payload: Record<string, unknown>) {
  // QW-10 proposed dropping the JSON-as-text duplicate, but the MCP spec's
  // backward-compat SHOULD (structured results also carry equivalent
  // unstructured content) is load-bearing for real agent clients that only
  // read text content — keep the duplicate until a real-client compat pass
  // proves otherwise.
  return {
    content: [{ text: JSON.stringify(payload), type: "text" as const }],
    structuredContent: payload,
  };
}

export interface HostedMcpEndpoint {
  close: () => Promise<void>;
  fetch: typeof globalThis.fetch;
}

function principalFromAuth(authInfo: AuthInfo | undefined): McpPrincipal {
  const extra = authInfo?.extra;
  if (
    !extra ||
    typeof extra.workspaceId !== "string" ||
    typeof extra.userId !== "string" ||
    typeof extra.tokenId !== "string"
  ) {
    throw new Error("Authenticated MCP principal is missing");
  }
  return {
    scopes: authInfo.scopes as McpPrincipal["scopes"],
    tokenId: extra.tokenId,
    userId: extra.userId,
    workspaceId: extra.workspaceId,
  };
}

function bearerSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function unauthorized(): Response {
  return Response.json(
    { error: "invalid_token" },
    {
      headers: {
        "WWW-Authenticate":
          'Bearer realm="Alrescha MCP", error="invalid_token"',
      },
      status: 401,
    },
  );
}

const GRAPH_NODE_SCHEMA = z.object({
  id: z.string(),
  path: z.string().nullable(),
  repositoryId: z.string(),
  type: NODE_TYPE_SCHEMA,
});
const GRAPH_EDGE_SCHEMA = z.object({
  derived: z.boolean(),
  relation: RELATION_SCHEMA,
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
});

const MEMORY_ENTRY_SCHEMA = z.object({
  anchorNodeId: z.string().nullable(),
  anchorPath: z.string().nullable(),
  entryKey: z.string(),
  id: z.string(),
  name: z.enum(MEMORY_BLOCK_NAMES),
  text: z.string(),
  updatedAt: z.string(),
});

/**
 * Tool definitions, hoisted to module scope (perf research MT-10).
 *
 * The SDK calls the server factory once per request, so anything built inside
 * it is built again for every `initialize`, `tools/list` and `tools/call`.
 * None of these definitions close over the request — only the handlers below
 * touch `principal` and `store` — so they are constructed once per process
 * and the per-request work is the closure binding alone.
 */
const ASSERT_LINK_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Assert a concept edge between two nodes (closed relation vocabulary). Bi-temporal: a conflicting assertion on the same pair is superseded, never deleted; an identical one is a noop.",
  inputSchema: z.object({
    reason: z.string().trim().min(1).max(500),
    relation: z.enum(AGENT_ASSERTION_RELATIONS),
    source_node_id: z.string().trim().min(1),
    target_node_id: z.string().trim().min(1),
  }),
  outputSchema: z.object({
    assertion: z.object({
      id: z.string().nullable(),
      invalidatedId: z.string().nullable(),
      outcome: z.enum(["added", "noop", "superseded", "unknown_node"]),
    }),
    workspaceId: z.string(),
  }),
};

const EXPLAIN_MODULE_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Explain the module (deterministic structure cluster) containing a node. Prose is lazy: 'ready' serves the cached inferred summary, 'pending'/'stale' enqueue one credit-lifecycle enrich job and return the member list now — ask again after the worker runs.",
  inputSchema: z.object({
    node_id: z.string().trim().min(1),
  }),
  outputSchema: z.object({
    memberPaths: z.array(z.string()),
    moduleKey: z.string(),
    name: z.string(),
    refreshJobId: z.string().nullable(),
    state: z.enum(["pending", "ready", "stale"]),
    summary: z.string().nullable(),
    summaryGrade: z.literal("inferred"),
    workspaceId: z.string(),
  }),
};

const GET_ARTIFACT_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "Read an artifact by path or id with its graph-neighbor summary",
  inputSchema: z
    .object({
      id: z.string().trim().min(1).optional(),
      path: z.string().trim().min(1).optional(),
    })
    .refine(
      ({ id, path }) => Boolean(id) !== Boolean(path),
      "Provide exactly one of id or path",
    ),
  outputSchema: z.object({
    artifact: z
      .object({
        content: z.string(),
        id: z.string(),
        kind: z.string(),
        path: z.string(),
        repositoryId: z.string(),
        status: z.string(),
        summary: z.string(),
        title: z.string(),
      })
      .nullable(),
    neighbors: z.array(
      z.object({
        direction: z.enum(["incoming", "outgoing"]),
        id: z.string(),
        label: z.string(),
        path: z.string().optional(),
        relation: RELATION_SCHEMA,
        type: NODE_TYPE_SCHEMA,
      }),
    ),
    workspaceId: z.string(),
  }),
};

const GET_FINDINGS_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "Get findings with explicit status, severity, and provenance",
  inputSchema: z.object({
    filter: z
      .object({
        kind: z.string().optional(),
        severity: z.string().optional(),
        status: z.string().optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    findings: z.array(
      z.object({
        confidence: z.number(),
        evidenceGrade: z.enum(["inferred", "verified"]),
        id: z.string(),
        kind: z.string(),
        provenance: z.unknown(),
        repositoryId: z.string(),
        severity: z.string(),
        sourceNodeId: z.string().nullable(),
        status: z.string(),
        title: z.string(),
      }),
    ),
    workspaceId: z.string(),
  }),
};

const GET_GRAPH_SCHEMA_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Call first: this workspace's graph vocabulary — node kinds, edge relations and counts — so queries speak the stored graph instead of guessing one.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    nodeCounts: z.record(z.string(), z.number().int().nonnegative()),
    relationCounts: z.record(z.string(), z.number().int().nonnegative()),
    repositories: z.array(
      z.object({
        artifactCount: z.number().int().nonnegative(),
        fullName: z.string(),
        id: z.string(),
      }),
    ),
    text: z.string(),
    workspaceId: z.string(),
  }),
};

const GET_NEIGHBORS_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "ID-first neighborhood of a node (depth 1-2): node ids, types, paths, and connecting edges. No bodies — fetch content explicitly with get_node_content.",
  inputSchema: z.object({
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    node_id: z.string().trim().min(1),
    relations: z.array(RELATION_SCHEMA).max(7).optional(),
  }),
  outputSchema: z.object({
    edges: z.array(GRAPH_EDGE_SCHEMA),
    found: z.boolean(),
    nodes: z.array(GRAPH_NODE_SCHEMA),
    workspaceId: z.string(),
  }),
};

const GET_NODE_CONTENT_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "The explicit second step after ID-first traversal: stored content for one node id, or up to four at once via node_ids — batch related nodes into one call instead of one round-trip each (artifacts return their stored summary — raw source bodies are never persisted).",
  inputSchema: z.object({
    node_id: z.string().trim().min(1).optional(),
    node_ids: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(4)
      .optional()
      .describe("Batch form: up to 4 node ids fetched in one call"),
  }),
  outputSchema: z.object({
    node: z
      .object({
        content: z.string(),
        id: z.string(),
        kind: z.string(),
        path: z.string().nullable(),
        repositoryId: z.string(),
        type: NODE_TYPE_SCHEMA,
      })
      .nullable(),
    nodes: z.array(
      z.object({
        content: z.string(),
        id: z.string(),
        kind: z.string(),
        path: z.string().nullable(),
        repositoryId: z.string(),
        requestedId: z.string(),
        type: NODE_TYPE_SCHEMA,
      }),
    ),
    workspaceId: z.string(),
  }),
};

const IMPACT_OF_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "ID-first impact report for a node: direct dependents (edges into it), direct dependencies (edges out of it), and the depth-limited transitive closure.",
  inputSchema: z.object({
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    node_id: z.string().trim().min(1),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    impact: z
      .object({
        dependencies: z.object({
          edges: z.array(GRAPH_EDGE_SCHEMA),
          nodeIds: z.array(z.string()),
        }),
        dependents: z.object({
          edges: z.array(GRAPH_EDGE_SCHEMA),
          nodeIds: z.array(z.string()),
        }),
        transitiveNodeIds: z.array(z.string()),
      })
      .nullable(),
    workspaceId: z.string(),
  }),
};

const LOG_PROGRESS_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Record one compact structured progress update; never writes to the repository",
  inputSchema: z.object({
    refs: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    status: z.enum(["started", "progress", "done", "blocked"]),
    summary: z.string().trim().min(1).max(200),
    task: z.string().trim().min(1).max(120),
  }),
  outputSchema: z.object({
    event: z.object({
      id: z.string(),
      refs: z.array(z.string()),
      status: z.enum(["started", "progress", "done", "blocked"]),
      summary: z.string(),
      task: z.string(),
      todoId: z.string(),
    }),
    workspaceId: z.string(),
  }),
};

const MEMORY_READ_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Read the workspace's bounded memory blocks (gotchas / conventions / decisions) — durable notes earlier agents distilled. Filter by block name or anchor node.",
  inputSchema: z.object({
    anchor_node_id: z.string().trim().min(1).optional(),
    name: z.enum(MEMORY_BLOCK_NAMES).optional(),
  }),
  outputSchema: z.object({
    entries: z.array(MEMORY_ENTRY_SCHEMA),
    workspaceId: z.string(),
  }),
};

const MEMORY_WRITE_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Write one bounded memory entry (gotchas / conventions / decisions), keyed for reconciliation: same key + same text is a noop, a new text supersedes the old (never deleted), `remove` invalidates. At most 12 active entries per block — over the cap the write is rejected: distill, don't accumulate.",
  inputSchema: z.object({
    anchor_node_id: z.string().trim().min(1).optional(),
    entry_key: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    name: z.enum(MEMORY_BLOCK_NAMES),
    remove: z.boolean().optional(),
    text: z.string().trim().min(1).max(500).optional(),
  }),
  outputSchema: z.object({
    entry: z.object({
      id: z.string().nullable(),
      invalidatedId: z.string().nullable(),
      outcome: z.enum([
        "added",
        "invalidated",
        "noop",
        "rejected_cap",
        "unknown_node",
        "updated",
      ]),
    }),
    workspaceId: z.string(),
  }),
};

const QUERY_BRAIN_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Run a deterministic structured query over graph types, statuses, and relations",
  inputSchema: z.object({
    filter: z.object({
      path: z.string().trim().min(1).optional(),
      relations: z.array(RELATION_SCHEMA).optional(),
      statuses: z.array(z.string().trim().min(1)).optional(),
      types: z.array(NODE_TYPE_SCHEMA).optional(),
      withoutRelations: z.array(RELATION_SCHEMA).optional(),
    }),
  }),
  outputSchema: z.object({
    count: z.number().int().nonnegative(),
    nodes: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        path: z.string().optional(),
        relations: z.array(RELATION_SCHEMA),
        repositoryId: z.string(),
        status: z.string(),
        type: NODE_TYPE_SCHEMA,
      }),
    ),
    workspaceId: z.string(),
  }),
};

const RECORD_NOTE_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Record a private workspace note; never writes to the repository",
  inputSchema: z.object({
    target: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(2_000),
  }),
  outputSchema: z.object({
    note: z.object({
      id: z.string(),
      target: z.string().nullable(),
      text: z.string(),
    }),
    workspaceId: z.string(),
  }),
};

const RECORD_PROMPT_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Record one prompt for the authenticated member (ADR-011). Metadata by default; `raw_text` is stored only when the member's separate raw-sync switch is on, and the database rejects the write outright unless the workspace enabled capture AND the member consented.",
  inputSchema: z.object({
    raw_text: z.string().trim().min(1).max(20_000).optional(),
    rubric: z.record(z.string(), z.number().min(0).max(2)).optional(),
    target_node_ids: z.array(z.string().trim().min(1)).max(50).optional(),
    token_count: z.number().int().nonnegative().max(10_000_000),
    tool_name: z.string().trim().min(1).max(120),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    workspaceId: z.string(),
  }),
};

const RECORD_RULED_OUT_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Append one ruled-out attempt to the workspace log: a hypothesis that was tried and what happened. The log is append-only in the database, so a recorded dead end cannot later be edited or removed — that permanence is the point, since the next agent reads it to avoid repeating the attempt.",
  inputSchema: z.object({
    hypothesis: z.string().trim().min(1).max(2000),
    outcome: z.string().trim().min(1).max(2000),
    refs: z.array(z.string().trim().min(1)).max(50).optional(),
    repository_id: z.string().trim().min(1).optional(),
  }),
  outputSchema: z.object({
    attemptId: z.string(),
    workspaceId: z.string(),
  }),
};

const REPO_MAP_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Token-budgeted orientation map: files ranked by personalized PageRank (seeded by focus terms), each line a path plus its exported symbols. Compact text, no bodies.",
  inputSchema: z.object({
    focus: z
      .array(z.string().trim().min(1).max(400))
      .max(16)
      .optional()
      .describe("Paths or symbol names to bias the walk toward"),
    token_budget: z
      .number()
      .int()
      .min(REPO_MAP_MIN_BUDGET)
      .max(REPO_MAP_MAX_BUDGET)
      .optional(),
  }),
  outputSchema: z.object({
    focusMatched: z.array(z.string()),
    omittedCount: z.number().int().nonnegative(),
    text: z.string(),
    tokenBudget: z.number().int().positive(),
    tokenEstimate: z.number().int().nonnegative(),
    workspaceId: z.string(),
  }),
};

const REPO_OVERVIEW_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Architecture overview: deterministic module clusters with sizes, plus cached module prose where fresh. Zero model calls — the grep-can't-answer 'what is this repo' entry point.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    repositories: z.array(
      z.object({
        artifactCount: z.number().int().nonnegative(),
        fullName: z.string(),
        modules: z.array(
          z.object({
            key: z.string(),
            memberCount: z.number().int().positive(),
            name: z.string(),
            summary: z.string().nullable(),
          }),
        ),
        repositoryId: z.string(),
      }),
    ),
    text: z.string(),
    workspaceId: z.string(),
  }),
};

const REQUEST_CONTEXT_PACK_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Select a load-on-demand context pack for a task and token budget",
  inputSchema: z.object({
    target_agent: z
      .enum(["claude-code", "codex", "cursor", "generic"])
      .optional(),
    task_description: z.string().trim().min(1).max(1_000),
    token_budget: z.number().int().min(128).max(32_000).optional(),
  }),
  outputSchema: z.object({
    assumption: z.string(),
    estimatedTokens: z.number().int().nonnegative(),
    excluded: z.array(z.object({ path: z.string(), reason: z.string() })),
    nodeIds: z.array(z.string()),
    omitted: z.array(
      z.object({
        estimatedTokens: z.number().int().positive(),
        path: z.string(),
        rank: z.number().int().positive(),
        reason: z.string(),
        title: z.string(),
      }),
    ),
    paths: z.array(z.string()),
    readingOrder: z.array(
      z.object({
        estimatedTokens: z.number().int().positive(),
        id: z.string(),
        path: z.string(),
        rank: z.number().int().positive(),
        reason: z.string(),
        title: z.string(),
      }),
    ),
    targetAgent: z.enum(["claude-code", "codex", "cursor", "generic"]),
    text: z.string(),
    title: z.string(),
    workspaceId: z.string(),
  }),
};

const ROUTE_QUERY_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Deterministic query routing: simple lookups go to text search, multi-hop or relational questions go to the graph tools. The decision carries its matched signals and a fallback for when the chosen route returns nothing.",
  inputSchema: z.object({
    question: z.string().trim().min(1).max(1_000),
  }),
  outputSchema: z.object({
    fallback: z.object({
      reason: z.string(),
      route: z.enum(["graph", "search"]),
      tools: z.array(z.string()),
    }),
    matchedSignals: z.array(z.string()),
    reason: z.string(),
    recommendedTools: z.array(z.string()),
    route: z.enum(["graph", "search"]),
    workspaceId: z.string(),
  }),
};

const SEARCH_INDEX_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "Search the deterministic Alrescha data index",
  inputSchema: z.object({
    query: z.string().trim().min(1),
    type_filter: NODE_TYPE_SCHEMA.optional(),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(
      z.object({
        excerpt: z.string(),
        id: z.string(),
        neighborIds: z.array(z.string()),
        nodeId: z.string(),
        path: z.string(),
        rank: z.enum([
          "exact",
          "title-heading",
          "path-symbol",
          "graph-neighbor",
        ]),
        repositoryId: z.string(),
        // Tier score plus the fractional connectivity bonus (todo 5).
        score: z.number(),
        title: z.string(),
        type: NODE_TYPE_SCHEMA,
      }),
    ),
    workspaceId: z.string(),
  }),
};

const SEARCH_NODES_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "ID-first node search — the same deterministic ranking as search_index with excerpts stripped: node ids, types, paths, and neighbor ids only. search_index remains the text entry point; this is the graph entry point.",
  inputSchema: z.object({
    query: z.string().trim().min(1),
    type_filter: NODE_TYPE_SCHEMA.optional(),
    // Phase 2D todo 5 — optional facet filter, derived from the stored
    // path (deterministic, ADR-013-equivalent). Backward compatible.
    domain_filter: z
      .enum(["frontend", "backend", "shared", "unclassified"])
      .optional(),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(
      z.object({
        neighborIds: z.array(z.string()),
        nodeId: z.string(),
        path: z.string(),
        rank: z.string(),
        repositoryId: z.string(),
        score: z.number(),
        type: NODE_TYPE_SCHEMA,
      }),
    ),
    workspaceId: z.string(),
  }),
};

const TRACE_PATH_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "ID-first shortest evidence path between two nodes (max depth 6), with graphify-style explain lines per hop. Derived edges are marked with *.",
  inputSchema: z.object({
    from_node_id: z.string().trim().min(1),
    max_depth: z.number().int().min(1).max(6).optional(),
    to_node_id: z.string().trim().min(1),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    path: z
      .object({
        edges: z.array(GRAPH_EDGE_SCHEMA),
        explain: z.array(z.string()),
        hops: z.number(),
        nodeIds: z.array(z.string()),
      })
      .nullable(),
    workspaceId: z.string(),
  }),
};

function createServer(
  store: McpStore,
  principal: McpPrincipal,
  cacheTtlMs: number,
  scheduleAfterResponse?: (task: () => void | Promise<void>) => void,
): McpServer {
  // Fire-and-forget fan-out for one access event (insert + realtime
  // broadcast). A bare `queueMicrotask` can be dropped on a serverless
  // runtime that freezes the process the instant the HTTP response is sent
  // (QW-17), so `scheduleAfterResponse` — Next.js's `after()`, wired in from
  // the web layer, which keeps the invocation alive until the callback
  // settles — is preferred when the host provides one. Falls back to
  // `queueMicrotask` so direct callers (including the contract tests, which
  // construct the endpoint with no web/request context at all) keep working
  // unchanged.
  function emitAccessEvent(
    store: McpStore,
    principal: McpPrincipal,
    tool: string,
    targetNodeIds: readonly string[],
    packTokens?: Pick<McpPackMeasurement, "baselineTokens" | "selectedTokens">,
  ): void {
    const occurredAt = new Date();
    const event = {
      id: createUlid(occurredAt),
      occurredAt: occurredAt.toISOString(),
      targetNodeIds: [...new Set(targetNodeIds)],
      tokenId: principal.tokenId,
      tool,
      workspaceId: principal.workspaceId,
    };
    const measurement = packTokens
      ? {
          accessEventId: event.id,
          ...packTokens,
          occurredAt: event.occurredAt,
          workspaceId: event.workspaceId,
        }
      : undefined;
    const channel = `workspace:${principal.workspaceId}:access-events`;
    const dispatch = async (): Promise<void> => {
      await Promise.allSettled([
        Promise.resolve().then(() =>
          store.recordAccessEvent(event, measurement),
        ),
        Promise.resolve().then(() => store.publishAccessEvent(channel, event)),
      ]);
    };
    if (scheduleAfterResponse) scheduleAfterResponse(dispatch);
    else queueMicrotask(() => void dispatch());
  }

  const server = new McpServer(SERVER_INFO, {
    cacheHints: {
      "resources/list": { cacheScope: "private", ttlMs: cacheTtlMs },
      "resources/read": { cacheScope: "private", ttlMs: cacheTtlMs },
      "server/discover": { cacheScope: "private", ttlMs: cacheTtlMs },
      "tools/list": { cacheScope: "private", ttlMs: cacheTtlMs },
    },
  });
  const resourceUri = (name: string) =>
    `alrescha://workspace/${principal.workspaceId}/${name}`;
  const requireScope = (scope: "mcp:read" | "mcp:write") => {
    if (!principal.scopes.includes(scope)) {
      throw new ProtocolError(-32001, "MCP token lacks required scope", {
        requiredScope: scope,
      });
    }
  };
  const readWorkspace = async () => {
    requireScope("mcp:read");
    return store.loadWorkspace(principal);
  };
  const registerJsonResource = (
    name: string,
    title: string,
    description: string,
    read: () => Promise<{ payload: unknown; targetNodeIds: string[] }>,
  ) => {
    server.registerResource(
      name,
      resourceUri(name),
      {
        cacheHint: { cacheScope: "private", ttlMs: cacheTtlMs },
        description,
        mimeType: "application/json",
        title,
      },
      async (uri) => {
        const result = await read();
        emitAccessEvent(
          store,
          principal,
          `resource:${name}`,
          result.targetNodeIds,
        );
        return {
          contents: [
            {
              mimeType: "application/json",
              text: JSON.stringify(result.payload),
              uri: uri.href,
            },
          ],
        };
      },
    );
  };

  registerJsonResource(
    "overview",
    "Project overview",
    "Workspace repository overview",
    async () => {
      const workspace = await readWorkspace();
      return {
        payload: {
          repositories: workspace.repositories.map((repository) => ({
            artifactCount: repository.artifacts.length,
            defaultBranch: repository.defaultBranch,
            findingCount: repository.findings.length,
            fullName: repository.fullName,
            id: repository.id,
            openFindingCount: repository.findings.filter(
              ({ status }) => status === "open",
            ).length,
            overview: repository.overview,
            receiptCount: repository.receipts.length,
          })),
          repositoryCount: workspace.repositories.length,
          workspaceId: workspace.id,
        },
        targetNodeIds: workspace.repositories.flatMap((repository) =>
          repository.artifacts.map(({ id }) => id),
        ),
      };
    },
  );
  registerJsonResource(
    "artifacts",
    "Artifact inventory",
    "Indexed repository artifacts",
    async () => {
      const workspace = await readWorkspace();
      return {
        payload: {
          artifacts: workspace.repositories.flatMap((repository) =>
            repository.artifacts.map((artifact) => ({
              headings: artifact.headings,
              id: artifact.id,
              kind: artifact.kind,
              path: artifact.path,
              repositoryId: repository.id,
              status: artifact.status,
              summary: artifact.summary,
              symbols: artifact.symbols,
              tags: artifact.tags,
              title: artifact.title,
            })),
          ),
          workspaceId: workspace.id,
        },
        targetNodeIds: workspace.repositories.flatMap((repository) =>
          repository.artifacts.map(({ id }) => id),
        ),
      };
    },
  );
  registerJsonResource(
    "findings",
    "Findings",
    "Current drift and assurance findings",
    async () => {
      const workspace = await readWorkspace();
      const findings = workspace.repositories.flatMap((repository) =>
        repository.findings.map((finding) => ({
          ...finding,
          repositoryId: repository.id,
        })),
      );
      return {
        payload: { findings, workspaceId: workspace.id },
        targetNodeIds: findings.map(
          (finding) => finding.sourceNodeId ?? finding.id,
        ),
      };
    },
  );
  registerJsonResource(
    "receipts-summary",
    "Receipt summary",
    "In-toto-shaped assurance receipt summaries",
    async () => {
      const workspace = await readWorkspace();
      const receipts = workspace.repositories.flatMap((repository) =>
        repository.receipts.map((receipt) => ({
          ...receipt,
          repositoryId: repository.id,
        })),
      );
      return {
        payload: { receipts, workspaceId: workspace.id },
        targetNodeIds: receipts.map(({ id }) => id),
      };
    },
  );
  registerJsonResource(
    "context-packs",
    "Context packs",
    "Available load-on-demand context packs",
    async () => {
      const workspace = await readWorkspace();
      const contextPacks = workspace.repositories.flatMap((repository) =>
        repository.contextPacks.map((pack) => ({
          ...pack,
          repositoryId: repository.id,
        })),
      );
      return {
        payload: { contextPacks, workspaceId: workspace.id },
        targetNodeIds: contextPacks.flatMap(({ nodeIds }) => nodeIds),
      };
    },
  );

  server.registerTool(
    "assert_link",
    ASSERT_LINK_TOOL,
    async ({ reason, relation, source_node_id, target_node_id }) => {
      requireScope("mcp:write");
      const assertion = await store.assertLink(principal, {
        reason,
        relation,
        sourceNodeId: source_node_id,
        targetNodeId: target_node_id,
      });
      emitAccessEvent(store, principal, "assert_link", [
        source_node_id,
        target_node_id,
      ]);
      return toolResult({
        assertion,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "explain_module",
    EXPLAIN_MODULE_TOOL,
    async ({ node_id }) => {
      const workspace = await readWorkspace();
      const explanation = findModuleForNode(workspace, node_id);
      if (!explanation) {
        throw new Error(
          "Node is not part of a structure module (no import/call cluster).",
        );
      }
      let refreshJobId: string | null = null;
      if (explanation.state !== "ready") {
        // Lazy generation: the enqueue is idempotent per (module, digest),
        // and billing inherits the enrich lifecycle wholesale.
        refreshJobId = (
          await store.requestModuleSummary(principal, {
            memberDigest: explanation.memberDigest,
            memberPaths: [...explanation.cluster.members],
            moduleKey: explanation.cluster.key,
            repositoryId: explanation.repositoryId,
          })
        ).jobId;
      }
      const memberIds = workspace.repositories
        .flatMap((repository) => repository.artifacts)
        .filter((artifact) =>
          explanation.cluster.members.includes(artifact.path),
        )
        .map(({ id }) => id);
      emitAccessEvent(store, principal, "explain_module", memberIds);
      return toolResult({
        memberPaths: [...explanation.cluster.members],
        moduleKey: explanation.cluster.key,
        name: explanation.cluster.name,
        refreshJobId,
        state: explanation.state,
        summary: explanation.summary?.summary ?? null,
        summaryGrade: "inferred" as const,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool("get_artifact", GET_ARTIFACT_TOOL, async (selector) => {
    const workspace = await readWorkspace();
    const result = getWorkspaceArtifact(workspace, selector);
    emitAccessEvent(store, principal, "get_artifact", [
      ...(result.artifact ? [result.artifact.id] : []),
      ...result.neighbors.map(({ id }) => id),
    ]);
    return toolResult({
      ...result,
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool("get_findings", GET_FINDINGS_TOOL, async ({ filter }) => {
    const workspace = await readWorkspace();
    const findings = getWorkspaceFindings(workspace, filter);
    emitAccessEvent(
      store,
      principal,
      "get_findings",
      findings.map((finding) => finding.sourceNodeId ?? finding.id),
    );
    return toolResult({
      findings,
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool("get_graph_schema", GET_GRAPH_SCHEMA_TOOL, async () => {
    const workspace = await readWorkspace();
    const schema = buildGraphSchema(workspace);
    emitAccessEvent(store, principal, "get_graph_schema", []);
    return toolResult({
      ...schema,
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool(
    "get_neighbors",
    GET_NEIGHBORS_TOOL,
    async ({ depth, node_id, relations }) => {
      const workspace = await readWorkspace();
      const result = collectNeighbors(
        workspace,
        node_id,
        depth ?? 1,
        relations,
      );
      emitAccessEvent(
        store,
        principal,
        "get_neighbors",
        result ? result.nodes.map(({ id }) => id) : [],
      );
      return toolResult({
        edges: result?.edges ?? [],
        found: result !== null,
        nodes: result?.nodes ?? [],
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "get_node_content",
    GET_NODE_CONTENT_TOOL,
    async ({ node_id, node_ids }) => {
      if (!node_id && (!node_ids || node_ids.length === 0)) {
        throw new Error("get_node_content requires node_id or node_ids");
      }
      const workspace = await readWorkspace();
      const requested = node_ids ?? (node_id ? [node_id] : []);
      const nodes = requested.flatMap((requestedId) => {
        const found = getNodeContent(workspace, requestedId);
        return found ? [{ ...found, requestedId }] : [];
      });
      // `node` keeps the original single-node contract; `nodes` is the batch.
      const node = node_id
        ? (getNodeContent(workspace, node_id) ?? null)
        : null;
      emitAccessEvent(
        store,
        principal,
        "get_node_content",
        nodes.map(({ id }) => id),
      );
      return toolResult({ node, nodes, workspaceId: principal.workspaceId });
    },
  );

  server.registerTool(
    "impact_of",
    IMPACT_OF_TOOL,
    async ({ depth, node_id }) => {
      const workspace = await readWorkspace();
      const impact = impactOf(workspace, node_id, depth ?? 2);
      emitAccessEvent(
        store,
        principal,
        "impact_of",
        impact
          ? [
              node_id,
              ...impact.dependents.nodeIds,
              ...impact.dependencies.nodeIds,
              ...impact.transitiveNodeIds,
            ]
          : [],
      );
      return toolResult({
        found: impact !== null,
        impact,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool("log_progress", LOG_PROGRESS_TOOL, async (input) => {
    requireScope("mcp:write");
    const event = await store.appendProgress(principal, input);
    return toolResult({
      event: {
        id: event.id,
        refs: event.refs,
        status: event.status,
        summary: event.summary,
        task: event.task,
        todoId: event.todoId,
      },
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool(
    "memory_read",
    MEMORY_READ_TOOL,
    async ({ anchor_node_id, name }) => {
      const workspace = await readWorkspace();
      const entries = (workspace.memoryEntries ?? []).filter(
        (entry) =>
          (!name || entry.name === name) &&
          (!anchor_node_id || entry.anchorNodeId === anchor_node_id),
      );
      emitAccessEvent(
        store,
        principal,
        "memory_read",
        entries.flatMap((entry) =>
          entry.anchorNodeId ? [entry.anchorNodeId] : [],
        ),
      );
      return toolResult({
        entries,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "memory_write",
    MEMORY_WRITE_TOOL,
    async ({ anchor_node_id, entry_key, name, remove, text }) => {
      requireScope("mcp:write");
      if (!remove && !text) {
        throw new Error("memory_write requires text unless remove is true");
      }
      const entry = await store.writeMemory(principal, {
        anchorNodeId: anchor_node_id,
        entryKey: entry_key,
        name,
        remove,
        text,
      });
      emitAccessEvent(
        store,
        principal,
        "memory_write",
        anchor_node_id ? [anchor_node_id] : [],
      );
      return toolResult({
        entry,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool("query_brain", QUERY_BRAIN_TOOL, async ({ filter }) => {
    const workspace = await readWorkspace();
    const nodes = queryWorkspaceBrain(workspace, filter);
    emitAccessEvent(
      store,
      principal,
      "query_brain",
      nodes.map(({ id }) => id),
    );
    return toolResult({
      count: nodes.length,
      nodes,
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool(
    "record_note",
    RECORD_NOTE_TOOL,
    async ({ target, text }) => {
      requireScope("mcp:write");
      const note = await store.appendNote(principal, { target, text });
      return toolResult({
        note: { id: note.id, target: note.target, text: note.text },
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "record_prompt",
    RECORD_PROMPT_TOOL,
    async ({ raw_text, rubric, target_node_ids, token_count, tool_name }) => {
      requireScope("mcp:write");
      const recorded = await store.recordPrompt(principal, {
        ...(raw_text === undefined ? {} : { rawText: raw_text }),
        ...(rubric === undefined ? {} : { rubric }),
        ...(target_node_ids === undefined
          ? {}
          : { targetNodeIds: target_node_ids }),
        tokenCount: token_count,
        toolName: tool_name,
      });
      // No access event: prompt capture is a separate store with separate
      // consent, and the glow stream must never carry prompt text (ADR-004).
      return toolResult({
        recordId: recorded.id,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "record_ruled_out",
    RECORD_RULED_OUT_TOOL,
    async ({ hypothesis, outcome, refs, repository_id }) => {
      requireScope("mcp:write");
      const recorded = await store.recordRuledOut(principal, {
        hypothesis,
        outcome,
        ...(refs === undefined ? {} : { refs }),
        ...(repository_id === undefined ? {} : { repositoryId: repository_id }),
      });
      // No access event: this writes to the inspection log, not the graph, so
      // there are no touched nodes to light up (ADR-004).
      return toolResult({
        attemptId: recorded.id,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "repo_map",
    REPO_MAP_TOOL,
    async ({ focus, token_budget }) => {
      const workspace = await readWorkspace();
      const map = buildRepoMap(workspace, {
        ...(focus ? { focus } : {}),
        tokenBudget: token_budget ?? REPO_MAP_DEFAULT_BUDGET,
      });
      emitAccessEvent(
        store,
        principal,
        "repo_map",
        map.entries.map(({ nodeId }) => nodeId),
      );
      return toolResult({
        focusMatched: map.focusMatched,
        omittedCount: map.omittedCount,
        text: map.text,
        tokenBudget: map.tokenBudget,
        tokenEstimate: map.tokenEstimate,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool("repo_overview", REPO_OVERVIEW_TOOL, async () => {
    const workspace = await readWorkspace();
    const overview = buildRepoOverview(workspace);
    emitAccessEvent(store, principal, "repo_overview", []);
    return toolResult({
      repositories: overview.repositories.map((repository) => ({
        artifactCount: repository.artifactCount,
        fullName: repository.fullName,
        modules: repository.modules.map((module) => ({ ...module })),
        repositoryId: repository.repositoryId,
      })),
      text: overview.text,
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool(
    "request_context_pack",
    REQUEST_CONTEXT_PACK_TOOL,
    async ({ target_agent, task_description, token_budget }) => {
      const workspace = await readWorkspace();
      const contextPack = selectWorkspaceContextPack(workspace, {
        ...(target_agent ? { targetAgent: target_agent } : {}),
        taskDescription: task_description,
        tokenBudget: token_budget ?? 2_000,
      });
      const baselineTokens =
        contextPack.estimatedTokens +
        contextPack.omitted.reduce(
          (total, omitted) => total + omitted.estimatedTokens,
          0,
        );
      emitAccessEvent(
        store,
        principal,
        "request_context_pack",
        contextPack.nodeIds,
        baselineTokens > 0
          ? {
              baselineTokens,
              selectedTokens: contextPack.estimatedTokens,
            }
          : undefined,
      );
      return toolResult({
        ...contextPack,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool("route_query", ROUTE_QUERY_TOOL, async ({ question }) => {
    requireScope("mcp:read");
    const decision = routeQuery(question);
    // The access event records only the tool name and timestamp — the
    // question text itself is never stored (WORK_SPEC §11).
    emitAccessEvent(store, principal, "route_query", []);
    return toolResult({
      ...decision,
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool(
    "search_index",
    SEARCH_INDEX_TOOL,
    async ({ query, type_filter }) => {
      const workspace = await readWorkspace();
      const results = searchWorkspaceIndex(workspace, {
        query,
        ...(type_filter ? { typeFilter: type_filter } : {}),
      });
      emitAccessEvent(
        store,
        principal,
        "search_index",
        results.map(({ nodeId }) => nodeId),
      );
      return toolResult({
        query,
        results,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "search_nodes",
    SEARCH_NODES_TOOL,
    async ({ query, type_filter, domain_filter }) => {
      const workspace = await readWorkspace();
      const unfiltered = searchWorkspaceNodes(workspace, query, type_filter);
      const results = domain_filter
        ? unfiltered.filter(
            (result) =>
              deriveArtifactFacets(result.path, "code_metadata").domain ===
              domain_filter,
          )
        : unfiltered;
      emitAccessEvent(
        store,
        principal,
        "search_nodes",
        results.map(({ nodeId }) => nodeId),
      );
      return toolResult({
        query,
        results,
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "trace_path",
    TRACE_PATH_TOOL,
    async ({ from_node_id, max_depth, to_node_id }) => {
      const workspace = await readWorkspace();
      const path = tracePath(
        workspace,
        from_node_id,
        to_node_id,
        max_depth ?? 4,
      );
      emitAccessEvent(
        store,
        principal,
        "trace_path",
        path ? [...path.nodeIds] : [],
      );
      return toolResult({
        found: path !== null,
        path,
        workspaceId: principal.workspaceId,
      });
    },
  );

  return server;
}

export function createHostedMcpEndpoint(options: {
  cacheTtlMs?: number;
  /**
   * Schedules the post-response access-event fan-out (QW-17). Pass a host
   * primitive that keeps the invocation alive after the response is sent —
   * e.g. Next.js's `after()` from "next/server" — so the write can't be
   * dropped by a serverless runtime freezing the process on response. Omit
   * to keep the previous `queueMicrotask` behavior (fine for tests and
   * long-lived servers, unsafe on serverless).
   */
  scheduleAfterResponse?: (task: () => void | Promise<void>) => void;
  store: McpStore;
}): HostedMcpEndpoint {
  const cacheTtlMs = options.cacheTtlMs ?? PRIVATE_TTL_MS;
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new RangeError("cacheTtlMs must be a non-negative safe integer");
  }
  const handler = createMcpHandler(
    ({ authInfo }) =>
      createServer(
        options.store,
        principalFromAuth(authInfo),
        cacheTtlMs,
        options.scheduleAfterResponse,
      ),
    { legacy: "reject" },
  );

  return {
    close: handler.close,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const secret = bearerSecret(request);
      if (!secret) return unauthorized();
      const principal = await options.store.authenticateAccessToken(secret);
      if (!principal) return unauthorized();
      const authInfo: AuthInfo = {
        clientId: principal.userId,
        extra: {
          tokenId: principal.tokenId,
          userId: principal.userId,
          workspaceId: principal.workspaceId,
        },
        scopes: [...principal.scopes],
        token: secret,
      };
      return handler.fetch(request, { authInfo });
    },
  };
}
