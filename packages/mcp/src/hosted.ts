import {
  createMcpHandler,
  McpServer,
  ProtocolError,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import { deriveArtifactFacets } from "@alrescha/core";

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
  MCP_EDGE_FAMILIES,
  MCP_EDGE_RELATIONS,
  MCP_EDGE_TIERS,
  MCP_NODE_TYPES,
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
/**
 * The output vocabulary, read from the package rather than copied (Codex
 * remedy P0-D). Both of these were hand-maintained duplicates and both had
 * fallen behind: the node enum would have rejected a `db_object` or
 * `section`, and the relation enum omitted the whole database family.
 * `packages/mcp/src/hosted.test.ts` pins them against the source arrays so a
 * new value fails a test instead of a request.
 */
export const NODE_TYPE_SCHEMA = z.enum(MCP_NODE_TYPES);
export const RELATION_SCHEMA = z.enum(MCP_EDGE_RELATIONS);
const EDGE_FAMILY_SCHEMA = z.enum(MCP_EDGE_FAMILIES);
const EDGE_TIER_SCHEMA = z.enum(MCP_EDGE_TIERS);

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

/**
 * The edge shape a tool answer carries. No longer an `outputSchema` —
 * every one of those was removed in todo 22, where they were 65% of the
 * catalogue's token cost — but still the one place the vocabulary is
 * written down, and `hosted.test.ts` pins it against the source arrays.
 *
 * An edge, with the reason it exists. `null` where the writer stated
 * nothing — a missing tier is reported as missing, never filled in.
 */
export const GRAPH_EDGE_SCHEMA = z.object({
  confidence: z.number().nullable(),
  derived: z.boolean(),
  family: EDGE_FAMILY_SCHEMA.nullable(),
  id: z.string(),
  provenance: z.object({
    method: z.string().nullable(),
    reason: z.string().nullable(),
    span: z
      .object({
        endLine: z.number(),
        path: z.string(),
        startLine: z.number(),
      })
      .nullable(),
  }),
  relation: RELATION_SCHEMA,
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  tier: EDGE_TIER_SCHEMA.nullable(),
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
    "Assert a concept edge between two nodes. A conflicting assertion supersedes; an identical one is a noop.",
  inputSchema: z.object({
    reason: z.string().trim().min(1).max(500),
    relation: z.enum(AGENT_ASSERTION_RELATIONS),
    source_node_id: z.string().trim().min(1),
    target_node_id: z.string().trim().min(1),
  }),
};

const EXPLAIN_MODULE_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Explain the module containing a node. Cached prose when ready; the member list plus an enqueued job otherwise.",
  inputSchema: z.object({
    node_id: z.string().trim().min(1),
  }),
};

/**
 * One reader for stored content (todo 22 ⑴).
 *
 * `get_node_content` read the same rows through a different door, so a caller
 * holding an id had to know which of two tools to ask. One selector — `path`,
 * `id`, or `ids` for a batch — and one answer shape.
 */
const GET_ARTIFACT_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Read stored content by path, id, or up to four ids. Summaries only — source bodies are never persisted.",
  inputSchema: z
    .object({
      id: z.string().trim().min(1).optional(),
      ids: z.array(z.string().trim().min(1)).min(1).max(4).optional(),
      max_chars: z.number().int().min(1).max(10_000).optional(),
      path: z.string().trim().min(1).optional(),
    })
    .refine(
      ({ id, ids, path }) =>
        [id, ids, path].filter((value) => value !== undefined).length === 1,
      "Provide exactly one of path, id, or ids",
    ),
};

const GET_FINDINGS_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Findings with status, severity and provenance. Open only unless status says otherwise.",
  inputSchema: z.object({
    filter: z
      .object({
        kind: z.string().optional(),
        severity: z.string().optional(),
        status: z
          .string()
          .optional()
          .describe("Defaults to 'open'; pass 'all' for every status."),
      })
      .optional(),
  }),
};

const GET_GRAPH_SCHEMA_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "This workspace's node kinds, edge relations and families, with counts.",
  inputSchema: z.object({}),
};

const GET_NEIGHBORS_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Neighbourhood of a node (depth 1-2): ids, types, paths and the connecting edges.",
  inputSchema: z.object({
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    families: z.array(EDGE_FAMILY_SCHEMA).max(8).optional(),
    node_id: z.string().trim().min(1),
    relations: z.array(RELATION_SCHEMA).max(7).optional(),
  }),
};

const IMPACT_OF_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Nodes a change to this one could reach, with the confidence and bound of the answer.",
  inputSchema: z.object({
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    /**
     * Opt-in, because the default answer is one existing callers already
     * depend on. `related-neighborhood` is proximity; `dependency-impact` is
     * what a change reaches (REMEDY §7.3, OQ-052).
     */
    mode: z.enum(["dependency-impact", "related-neighborhood"]).optional(),
    node_id: z.string().trim().min(1),
  }),
};

const LOG_PROGRESS_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description: "Record one progress event against a task.",
  inputSchema: z.object({
    refs: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    status: z.enum(["started", "progress", "done", "blocked"]),
    summary: z.string().trim().min(1).max(200),
    task: z.string().trim().min(1).max(120),
  }),
};

/**
 * Phase 4 Wave C todo 16. `readOnlyHint: false` because it changes something
 * — a job appears in the queue — even though it costs nothing and writes no
 * repository content. A tool that scheduled work while claiming to be
 * read-only would be lying to every client that gates on the hint.
 *
 * The tool count goes up by one here and comes back down in todo 22's
 * consolidation; the plan budgets that trade explicitly.
 */
const REQUEST_RESCAN_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description: "Queue a free rescan of a repository. Returns the mode and why.",
  inputSchema: z.object({
    mode: z.enum(["full", "incremental"]).optional(),
    repository_id: z.string().trim().min(1).optional(),
  }),
};

const MEMORY_READ_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "Read the workspace memory blocks.",
  inputSchema: z.object({
    anchor_node_id: z.string().trim().min(1).optional(),
    name: z.enum(MEMORY_BLOCK_NAMES).optional(),
  }),
};

const MEMORY_WRITE_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Write one memory entry. Reconciled: add, update, noop or remove.",
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
};

const QUERY_BRAIN_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Structured query over node types, statuses, relations, paths and risk.",
  inputSchema: z.object({
    filter: z.object({
      format: z.enum(["ids", "table"]).optional(),
      hasSummary: z.boolean().optional(),
      path: z.string().trim().min(1).optional(),
      pathGlob: z.string().trim().min(1).max(200).optional(),
      relations: z.array(RELATION_SCHEMA).optional(),
      sortBy: z.enum(["risk"]).optional(),
      statuses: z.array(z.string().trim().min(1)).optional(),
      types: z.array(NODE_TYPE_SCHEMA).optional(),
      withoutRelations: z.array(RELATION_SCHEMA).optional(),
    }),
  }),
};

const RECORD_NOTE_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description: "Record one note, optionally anchored to a node.",
  inputSchema: z.object({
    target: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(2_000),
  }),
};

const RECORD_PROMPT_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description:
    "Record one prompt for this member, subject to workspace consent.",
  inputSchema: z.object({
    raw_text: z.string().trim().min(1).max(20_000).optional(),
    rubric: z.record(z.string(), z.number().min(0).max(2)).optional(),
    target_node_ids: z.array(z.string().trim().min(1)).max(50).optional(),
    token_count: z.number().int().nonnegative().max(10_000_000),
    tool_name: z.string().trim().min(1).max(120),
  }),
};

const RECORD_RULED_OUT_TOOL = {
  annotations: WRITE_METADATA_TOOL,
  description: "Append one ruled-out attempt to the inspection log.",
  inputSchema: z.object({
    hypothesis: z.string().trim().min(1).max(2000),
    outcome: z.string().trim().min(1).max(2000),
    refs: z.array(z.string().trim().min(1)).max(50).optional(),
    repository_id: z.string().trim().min(1).optional(),
  }),
};

const REPO_MAP_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "A token-budgeted minimal index of this repository.",
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
};

const REPO_OVERVIEW_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "Repository shape: modules, counts and where the evidence is.",
  inputSchema: z.object({}),
};

const REQUEST_CONTEXT_PACK_TOOL = {
  annotations: READ_ONLY_TOOL,
  description: "Select stored documents for a task within a token budget.",
  inputSchema: z.object({
    target_agent: z
      .enum(["claude-code", "codex", "cursor", "generic"])
      .optional(),
    task_description: z.string().trim().min(1).max(1_000),
    token_budget: z.number().int().min(128).max(32_000).optional(),
  }),
};

/**
 * The one entry point (todo 22 ⑴).
 *
 * `search_nodes` was the same ranking with excerpts stripped, and two names
 * for one query is a choice every caller had to make and nobody could make
 * well. `include_excerpt: false` is that tool now.
 */
const SEARCH_INDEX_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Search the deterministic index. include_excerpt=false returns ids, types and paths only.",
  inputSchema: z.object({
    domain_filter: z
      .enum(["frontend", "backend", "shared", "unclassified"])
      .optional(),
    excerpt_chars: z.number().int().min(0).max(1_000).optional(),
    include_excerpt: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    query: z.string().trim().min(1),
    type_filter: NODE_TYPE_SCHEMA.optional(),
  }),
};

const TRACE_PATH_TOOL = {
  annotations: READ_ONLY_TOOL,
  description:
    "Shortest evidence path between two nodes, one explain line per hop.",
  inputSchema: z.object({
    from_node_id: z.string().trim().min(1),
    max_depth: z.number().int().min(1).max(6).optional(),
    to_node_id: z.string().trim().min(1),
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
    // The batch form is what `get_node_content` was: one result per input, in
    // input order, misses included. A batch that dropped its misses came
    // back shorter than it went out, and a caller cannot retry an id it was
    // never handed back (Codex remedy 9.1).
    if (selector.ids) {
      const workspace = await readWorkspace();
      const nodes = selector.ids.map((requestedId) => {
        const node = getNodeContent(workspace, requestedId);
        return node
          ? {
              ...node,
              content: selector.max_chars
                ? node.content.slice(0, selector.max_chars)
                : node.content,
              found: true as const,
              requestedId,
            }
          : { found: false as const, requestedId };
      });
      emitAccessEvent(
        store,
        principal,
        "get_artifact",
        nodes.flatMap((entry) => (entry.found ? [entry.id] : [])),
      );
      return toolResult({ nodes, workspaceId: principal.workspaceId });
    }
    const [workspace, found] = await Promise.all([
      readWorkspace(),
      // Targeted: the artifact is looked up by id or path rather than
      // filtered out of the budgeted workspace read, so a repository past
      // that budget still answers for its own files (Codex remedy P0-B).
      store.findArtifacts(principal, selector),
    ]);
    const result = getWorkspaceArtifact(workspace, selector, found);
    // An id that is not an artifact — a requirement, an evidence row, a
    // finding — is what `get_node_content` used to answer, and a caller
    // holding an id should not have to know which kind it has before
    // choosing a tool (todo 22 ⑴). `artifact: null` still says which
    // reader answered.
    const node =
      !result.artifact && selector.id
        ? (getNodeContent(workspace, selector.id) ?? null)
        : null;
    emitAccessEvent(store, principal, "get_artifact", [
      ...(result.artifact ? [result.artifact.id] : []),
      ...(node ? [node.id] : []),
      ...result.neighbors.map(({ id }) => id),
    ]);
    return toolResult({
      ...result,
      ...(node
        ? {
            node: selector.max_chars
              ? { ...node, content: node.content.slice(0, selector.max_chars) }
              : node,
          }
        : {}),
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
    async ({ depth, families, node_id, relations }) => {
      const workspace = await readWorkspace();
      const result = collectNeighbors(
        workspace,
        node_id,
        depth ?? 1,
        relations,
        families,
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
        omissions: result?.omissions ?? [],
        workspaceId: principal.workspaceId,
      });
    },
  );

  server.registerTool(
    "impact_of",
    IMPACT_OF_TOOL,
    async ({ depth, mode, node_id }) => {
      const workspace = await readWorkspace();
      const impact = impactOf(workspace, node_id, depth ?? 2, mode);
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
              ...(impact.dependencyImpact?.candidates ?? []).map(
                ({ nodeId }) => nodeId,
              ),
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
    // The nodes the entry names light up like any other touch (todo 19 ⑹).
    // A write that changed the graph and left no trace in the access stream
    // was invisible to the live map and to the telemetry that counts what a
    // session did — only the reads were.
    emitAccessEvent(store, principal, "log_progress", event.refs);
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
    const { coverage, nodes, table } = queryWorkspaceBrain(workspace, filter);
    emitAccessEvent(
      store,
      principal,
      "query_brain",
      nodes.map(({ id }) => id),
    );
    return toolResult({
      count: nodes.length,
      coverage,
      nodes,
      ...(table ? { table } : {}),
      workspaceId: principal.workspaceId,
    });
  });

  server.registerTool(
    "record_note",
    RECORD_NOTE_TOOL,
    async ({ target, text }) => {
      requireScope("mcp:write");
      const note = await store.appendNote(principal, { target, text });
      // The node the note is about, when it names one (todo 19 ⑹). A note
      // with no target touched nothing, and an event with no nodes is still
      // the record that the session wrote here.
      emitAccessEvent(
        store,
        principal,
        "record_note",
        note.target ? [note.target] : [],
      );
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

  // Registered here so the advertised catalogue keeps the alphabetical order
  // the contract test pins — the list is registration order, and a tool that
  // landed in the middle of it would move every entry after it.
  server.registerTool(
    "request_rescan",
    REQUEST_RESCAN_TOOL,
    async ({ mode, repository_id }) => {
      requireScope("mcp:write");
      const result = await store.requestRescan(principal, {
        ...(mode === undefined ? {} : { mode }),
        ...(repository_id === undefined ? {} : { repositoryId: repository_id }),
      });
      emitAccessEvent(store, principal, "request_rescan", []);
      return toolResult({ ...result, workspaceId: principal.workspaceId });
    },
  );

  server.registerTool(
    "search_index",
    SEARCH_INDEX_TOOL,
    async ({
      domain_filter,
      excerpt_chars,
      include_excerpt,
      limit,
      query,
      type_filter,
    }) => {
      const workspace = await readWorkspace();
      const ranked = searchWorkspaceIndex(workspace, {
        query,
        ...(type_filter ? { typeFilter: type_filter } : {}),
      });
      const filtered = domain_filter
        ? ranked.filter(
            (result) =>
              deriveArtifactFacets(result.path, "code_metadata").domain ===
              domain_filter,
          )
        : ranked;
      // `include_excerpt: false` is what `search_nodes` was — the same
      // ranking with the prose *omitted*, not blanked. An empty string is
      // still a key on the wire, and the point of the ID-first entry point
      // is that a caller pays for ids and paths and nothing else (todo 22 ⑴).
      const kept = filtered
        .slice(0, limit ?? filtered.length)
        .map(({ excerpt, excerptAbsence, title, ...rest }) =>
          include_excerpt === false
            ? rest
            : {
                ...rest,
                excerpt:
                  excerpt_chars === undefined
                    ? excerpt
                    : excerpt.slice(0, excerpt_chars),
                ...(excerptAbsence ? { excerptAbsence } : {}),
                title,
              },
        );
      emitAccessEvent(
        store,
        principal,
        "search_index",
        kept.map(({ nodeId }) => nodeId),
      );
      return toolResult({
        query,
        results: kept,
        // What the cap left out, so a caller narrows the query rather than
        // reading the page it got as the whole answer.
        truncated: Math.max(0, filtered.length - kept.length),
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

/**
 * The same tool surface, for a transport that authenticates once rather than
 * per request (Wave C todo 17).
 *
 * `createHostedMcpEndpoint` derives the principal from a bearer token on
 * every HTTP request. A stdio connection has no such header: the process was
 * started by the person it serves, and the principal is decided before the
 * first message. Exporting the factory rather than a second server keeps
 * that the *only* difference — every tool, hint and schema below is shared,
 * so a tool cannot exist on one transport and not the other.
 */
export function createMcpServerFor(options: {
  cacheTtlMs?: number;
  principal: McpPrincipal;
  store: McpStore;
}): McpServer {
  return createServer(
    options.store,
    options.principal,
    options.cacheTtlMs ?? PRIVATE_TTL_MS,
  );
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
