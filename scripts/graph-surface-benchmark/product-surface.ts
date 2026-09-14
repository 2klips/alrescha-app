/**
 * The v3 graph arm is the product, not a re-implementation of it (Phase 4
 * Wave E todo 25; R5 §4.5 ⒀, BUILD_PLAN_PHASE4 §검증 전략 "벤치는 프로덕션
 * 형태").
 *
 * - The store is what `alrescha serve --local` serves: a real scan of the
 *   corpus projected through `buildLocalWorkspace`, which carries no bodies —
 *   `content: ""` on every artifact, exactly the shape a hosted workspace has
 *   before enrich (OQ-039). v1/v2 measured a workspace built from the file
 *   corpus with bodies attached; that surface does not ship.
 * - The tools are whatever the hosted server factory answers to
 *   `tools/list`, converted to the provider's function-calling shape. The
 *   pre-registration pins that catalogue's digest, so a definition edited
 *   after the lock refuses to run rather than quietly measuring something
 *   else.
 * - Calls go through the SDK client and the hosted endpoint — the same
 *   serialisation an agent receives, double JSON included.
 *
 * One surface per graph-arm trial: the write tools land in a store the trial
 * owns, so a `log_progress` from one trial can never be another trial's
 * "existing todo".
 */

import { createHash } from "node:crypto";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import {
  normalizeTodoTitle,
  scanRepository,
  type RepositorySource,
} from "../../packages/core/src/index";
import { createHostedMcpEndpoint } from "../../packages/mcp/src/hosted";
import { buildLocalWorkspace } from "../../packages/mcp/src/local-workspace";
import {
  InMemoryMcpStore,
  type McpMemoryEntryData,
  type McpScope,
  type McpWorkspaceData,
} from "../../packages/mcp/src/store";
import type { TrialObservations } from "./report";
import type {
  AgentToolExecutor,
  ToolDefinition,
  ToolExecutor,
  ToolParameterSchema,
} from "./tools";

export interface ProductionWorkspaceBuild {
  readonly artifactCount: number;
  /** The scan's virtual commit id — same tree, same id. */
  readonly commitSha: string;
  readonly edgeCount: number;
  readonly workspace: McpWorkspaceData;
}

/**
 * A corpus directory, scanned and projected the way the CLI serves it.
 *
 * `excludedSegments` is applied to the tree before the scanner sees it, so
 * the graph arm and the checkout tools describe the same universe of files —
 * the harness's own outputs (`benchmarks/`, `.omo/`) would otherwise be
 * graph nodes whose names leak what the questions ask.
 */
export async function buildProductionWorkspace(input: {
  readonly excludedSegments: readonly string[];
  readonly memoryEntries?: readonly McpMemoryEntryData[];
  readonly repositoryFullName: string;
  readonly rootDir: string;
}): Promise<ProductionWorkspaceBuild> {
  const snapshot = await createLocalRepositorySource(input.rootDir);
  const excluded = new Set(input.excludedSegments);
  const source: RepositorySource = {
    fetchContent: (path, commitSha) =>
      snapshot.source.fetchContent(path, commitSha),
    async listTree(commitSha) {
      const tree = await snapshot.source.listTree(commitSha);
      return {
        ...tree,
        entries: tree.entries.filter(
          ({ path }) =>
            !path.split("/").some((segment) => excluded.has(segment)),
        ),
      };
    },
  };
  const plan = await scanRepository({
    commitSha: snapshot.commitSha,
    mode: "full",
    source,
  });
  const workspace = buildLocalWorkspace({
    plan,
    repositoryFullName: input.repositoryFullName,
  });
  return {
    artifactCount: plan.artifacts.length,
    commitSha: plan.commitSha,
    edgeCount: workspace.repositories[0]?.edges.length ?? 0,
    workspace: {
      ...workspace,
      memoryEntries: [...(input.memoryEntries ?? [])],
    },
  };
}

/**
 * The production-shape guarantee, checked rather than assumed: a workspace
 * with a body in it is the v1/v2 corpus, and running v3 over it would be the
 * contradiction R5 §4.5 ⒀ names.
 */
export function assertBodilessWorkspace(workspace: McpWorkspaceData): void {
  for (const repository of workspace.repositories) {
    for (const artifact of repository.artifacts) {
      if (artifact.content !== "") {
        throw new Error(
          `Production-shape store carries a body for ${artifact.path}; refusing to run.`,
        );
      }
    }
  }
}

export interface ProductCatalogEntry {
  readonly description: string;
  readonly inputSchema: unknown;
  readonly name: string;
}

/** SHA-256 of the catalogue as a definition set — order-free, prose included. */
export function productCatalogSha256(
  tools: readonly ProductCatalogEntry[],
): string {
  const canonical = [...tools]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ description, inputSchema, name }) => ({
      description,
      inputSchema,
      name,
    }));
  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}

export interface ProductToolCatalog {
  readonly entries: readonly ProductCatalogEntry[];
  readonly sha256: string;
  readonly tools: readonly ToolDefinition[];
}

/**
 * The lock: the live catalogue must be the one the pre-registration pinned,
 * by digest and by name order. A definition edited after the lock — a new
 * tool, a new enum value in an input schema — is a different experiment,
 * and the runner refuses rather than measuring it under the old name.
 */
export function assertCatalogPinned(
  catalog: ProductToolCatalog,
  pinned: {
    readonly productCatalogSha256: string;
    readonly productTools: readonly string[];
  },
): void {
  if (catalog.sha256 !== pinned.productCatalogSha256) {
    throw new Error(
      `The product tools/list catalogue digest ${catalog.sha256} does not match the pre-registered ${pinned.productCatalogSha256}; refusing to run.`,
    );
  }
  const liveNames = catalog.tools.map(({ name }) => name);
  if (JSON.stringify(liveNames) !== JSON.stringify(pinned.productTools)) {
    throw new Error(
      `The product tools/list names [${liveNames.join(", ")}] differ from the pre-registered [${pinned.productTools.join(", ")}]; refusing to run.`,
    );
  }
}

export interface ProductSurface {
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  readonly catalog: ProductToolCatalog;
  close(): Promise<void>;
  observations(): TrialObservations;
  readonly store: InMemoryMcpStore;
}

function clip(text: string, maxChars: number): string {
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}\n… (${text.length - maxChars} chars clipped)`;
}

const ENDPOINT_URL = "https://mcp.alrescha.test/mcp";
const PROTOCOL_VERSION = "2026-07-28";

export async function openProductSurface(input: {
  readonly scopes: readonly McpScope[];
  readonly toolResultChars: number;
  readonly workspace: McpWorkspaceData;
}): Promise<ProductSurface> {
  // The trial owns its store: the fixture object stays pristine for the next.
  const workspace = structuredClone(input.workspace);
  const store = new InMemoryMcpStore({ workspaces: [workspace] });
  const issued = await store.issueAccessToken({
    actorUserId: workspace.ownerUserId,
    name: "graph-surface-benchmark",
    scopes: [...input.scopes],
    workspaceId: workspace.id,
  });
  const endpoint = createHostedMcpEndpoint({ store });
  const client = new Client(
    { name: "graph-surface-benchmark", version: "3.0.0" },
    {
      cachePartition: issued.secret.slice(0, 12),
      versionNegotiation: { mode: { pin: PROTOCOL_VERSION } },
    },
  );
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT_URL), {
    authProvider: { token: async () => issued.secret },
    fetch: endpoint.fetch,
  });
  await client.connect(transport);
  const listed = await client.listTools();
  const entries: ProductCatalogEntry[] = listed.tools.map((tool) => ({
    description: tool.description ?? "",
    inputSchema: tool.inputSchema,
    name: tool.name,
  }));
  const catalog: ProductToolCatalog = {
    entries,
    sha256: productCatalogSha256(entries),
    tools: entries.map((entry) => ({
      description: entry.description,
      name: entry.name,
      parameters: entry.inputSchema as ToolParameterSchema,
    })),
  };
  const declaredTodos = workspace.todos ?? [];

  return {
    async callTool(name, args) {
      try {
        const result = await client.callTool({ arguments: args, name });
        const text = (
          (result.content ?? []) as Array<{
            text?: string;
            type?: string;
          }>
        )
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("\n");
        return clip(
          result.isError ? `error: ${text}` : text,
          input.toolResultChars,
        );
      } catch (error) {
        // A refused call is a wasted turn, as it would be for a real agent —
        // never a harness crash.
        const message = error instanceof Error ? error.message : String(error);
        return clip(`error: ${message}`, input.toolResultChars);
      }
    },
    catalog,
    async close() {
      await client.close();
      await endpoint.close();
    },
    observations() {
      const events = store.progressEventsForWorkspace(workspace.id);
      const progressMatched: Record<string, number> = {};
      for (const event of events) {
        const key = event.matched ?? "unknown";
        progressMatched[key] = (progressMatched[key] ?? 0) + 1;
      }
      const minted = store.todosForWorkspace(workspace.id);
      const everyTitle = [...declaredTodos, ...minted].map((todo) => ({
        id: todo.id,
        title: normalizeTodoTitle(todo.title),
      }));
      const todosDuplicated = minted.filter((todo) => {
        const title = normalizeTodoTitle(todo.title);
        return everyTitle.some(
          (other) => other.id !== todo.id && other.title === title,
        );
      }).length;
      return {
        progressMatched,
        todosCreated: minted.length,
        todosDuplicated,
      };
    },
    store,
  };
}

/**
 * The graph arm's executor: checkout tools answered by the corpus executor,
 * product tools by the surface, everything else refused by name.
 */
export function createProductExecutor(input: {
  readonly fileExecutor: ToolExecutor;
  readonly fileTools: readonly string[];
  readonly productTools: readonly string[];
  readonly surface: ProductSurface;
}): AgentToolExecutor {
  const fileTools = new Set(input.fileTools);
  const productTools = new Set(input.productTools);
  return {
    execute(name, args) {
      if (fileTools.has(name)) return input.fileExecutor.execute(name, args);
      if (productTools.has(name)) return input.surface.callTool(name, args);
      return `Tool ${name} is not available in this arm.`;
    },
  };
}
