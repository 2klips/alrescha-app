/**
 * Tool surfaces for the two pre-registered arms (todo 15).
 *
 * file-exploration: the strong lexical baseline — list, grep, read.
 * graph-surface: the Phase 3 surfaces — schema, PageRank repo map, PPR
 * search, neighbors, content fallthrough, memory blocks.
 *
 * Every tool returns compact text under the pre-registered output caps; both
 * arms share `submit_answer`, which ends the trial.
 */

import type { RepositoryCorpus } from "../databrain-benchmark/context";
import { searchWorkspaceIndex } from "../../packages/mcp/src/data-brain";
import {
  buildGraphSchema,
  buildRepoMap,
} from "../../packages/mcp/src/repo-map";
import {
  collectNeighbors,
  getNodeContent,
  searchWorkspaceNodes,
} from "../../packages/mcp/src/graph-tools";
import type { McpWorkspaceData } from "../../packages/mcp/src/store";
import type { GraphSurfaceArm, GraphSurfaceProtocol } from "./manifest";

export interface ToolDefinition {
  readonly description: string;
  readonly name: string;
  readonly parameters: {
    readonly additionalProperties: false;
    readonly properties: Readonly<
      Record<string, { description?: string; type: string }>
    >;
    readonly required: readonly string[];
    readonly type: "object";
  };
}

export const SUBMIT_ANSWER_TOOL: ToolDefinition = {
  description:
    "Submit the final answer and end the task. Call this exactly once, when you can answer.",
  name: "submit_answer",
  parameters: {
    additionalProperties: false,
    properties: {
      answer: { description: "The complete final answer.", type: "string" },
    },
    required: ["answer"],
    type: "object",
  },
};

const FILE_EXPLORATION_TOOLS: ToolDefinition[] = [
  {
    description:
      "List repository file paths, optionally filtered by a path substring.",
    name: "list_files",
    parameters: {
      additionalProperties: false,
      properties: {
        filter: {
          description: "Case-insensitive path substring filter.",
          type: "string",
        },
      },
      required: [],
      type: "object",
    },
  },
  {
    description:
      "Search file contents for a literal string; returns path, line number, and a short excerpt per hit.",
    name: "grep_files",
    parameters: {
      additionalProperties: false,
      properties: {
        query: { description: "Literal text to search for.", type: "string" },
      },
      required: ["query"],
      type: "object",
    },
  },
  {
    description: "Read one file's content by its repository-relative path.",
    name: "read_file",
    parameters: {
      additionalProperties: false,
      properties: {
        path: { description: "Repository-relative path.", type: "string" },
      },
      required: ["path"],
      type: "object",
    },
  },
  SUBMIT_ANSWER_TOOL,
];

const GRAPH_SURFACE_TOOLS: ToolDefinition[] = [
  {
    description:
      "The graph's vocabulary with counts — call this first to learn what exists.",
    name: "get_graph_schema",
    parameters: {
      additionalProperties: false,
      properties: {},
      required: [],
      type: "object",
    },
  },
  {
    description:
      "Token-budgeted orientation map: files ranked by personalized PageRank (seeded by focus terms), each line a path plus its exported symbols.",
    name: "repo_map",
    parameters: {
      additionalProperties: false,
      properties: {
        focus: {
          description:
            "Space-separated paths or symbol names to bias the walk toward.",
          type: "string",
        },
      },
      required: [],
      type: "object",
    },
  },
  {
    description:
      "ID-first deterministic search over the knowledge graph (PPR-reranked). Returns node ids, types, and paths — request content separately.",
    name: "search_nodes",
    parameters: {
      additionalProperties: false,
      properties: {
        query: { description: "Search terms.", type: "string" },
      },
      required: ["query"],
      type: "object",
    },
  },
  {
    description:
      "Bidirectional neighbors of a node (depth 1), with edge relations.",
    name: "get_neighbors",
    parameters: {
      additionalProperties: false,
      properties: {
        node_id: { description: "Node id from search_nodes.", type: "string" },
      },
      required: ["node_id"],
      type: "object",
    },
  },
  {
    description:
      "Stored content by node id — the explicit second step after ID-first traversal. Pass ids as a space-separated list to batch up to 4 nodes in one call instead of one round-trip each.",
    name: "get_node_content",
    parameters: {
      additionalProperties: false,
      properties: {
        node_id: {
          description: "One node id, or up to 4 ids separated by spaces.",
          type: "string",
        },
      },
      required: ["node_id"],
      type: "object",
    },
  },
  {
    description:
      "Read the workspace's bounded memory blocks (gotchas / conventions / decisions) — durable notes earlier agents distilled.",
    name: "memory_read",
    parameters: {
      additionalProperties: false,
      properties: {},
      required: [],
      type: "object",
    },
  },
  SUBMIT_ANSWER_TOOL,
];

/**
 * v2 surface addition (preregistration.v2.json): the excerpt search entry
 * point the shipped product routes simple lookups to (route_query). The v1
 * arm deliberately excluded it and reproduced the graph-only quality ceiling;
 * v2 measures the surface as actually shipped.
 */
const SEARCH_INDEX_TOOL: ToolDefinition = {
  description:
    "Deterministic index search WITH excerpts (PPR-reranked) — the fastest path for single-fact questions. Use graph traversal for multi-hop or structural questions.",
  name: "search_index",
  parameters: {
    additionalProperties: false,
    properties: {
      query: { description: "Search terms.", type: "string" },
    },
    required: ["query"],
    type: "object",
  },
};

const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition> = new Map(
  [...FILE_EXPLORATION_TOOLS, ...GRAPH_SURFACE_TOOLS, SEARCH_INDEX_TOOL].map(
    (tool) => [tool.name, tool],
  ),
);

export function toolDefinitionsForArm(arm: GraphSurfaceArm): ToolDefinition[] {
  return arm === "file-exploration"
    ? FILE_EXPLORATION_TOOLS
    : GRAPH_SURFACE_TOOLS;
}

/** Resolve the arm's tool surface from the pre-registered tool-name list. */
export function toolDefinitionsForNames(
  names: readonly string[],
): ToolDefinition[] {
  return names.map((name) => {
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool) throw new TypeError(`Unknown pre-registered tool: ${name}`);
    return tool;
  });
}

function clip(text: string, maxChars: number): string {
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}\n… (${text.length - maxChars} chars clipped)`;
}

export interface ToolExecutor {
  execute(name: string, args: Record<string, unknown>): string;
}

export function createToolExecutor(input: {
  arm: GraphSurfaceArm;
  caps: GraphSurfaceProtocol["toolOutputCaps"];
  corpus: RepositoryCorpus;
  /** Pre-registered tool-name list; defaults to the v1 arm surface. */
  toolNames?: readonly string[];
  workspace: McpWorkspaceData;
}): ToolExecutor {
  const { arm, caps, corpus, workspace } = input;
  const allowed = new Set(
    input.toolNames ?? toolDefinitionsForArm(arm).map(({ name }) => name),
  );

  function run(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case "list_files": {
        const filter =
          typeof args.filter === "string" ? args.filter.toLowerCase() : null;
        const paths = corpus.entries
          .map(({ path }) => path)
          .filter((path) => !filter || path.toLowerCase().includes(filter));
        const shown = paths.slice(0, caps.listFilesMaxPaths);
        const omitted = paths.length - shown.length;
        return [
          ...shown,
          ...(omitted > 0
            ? [`… ${omitted} more paths (narrow the filter)`]
            : []),
        ].join("\n");
      }
      case "grep_files": {
        const query =
          typeof args.query === "string" ? args.query.toLowerCase() : "";
        if (query.length === 0) return "grep_files requires a query.";
        const hits: string[] = [];
        for (const entry of corpus.entries) {
          if (hits.length >= caps.grepFilesMaxHits) break;
          const lines = entry.content.split("\n");
          for (const [lineIndex, line] of lines.entries()) {
            if (!line.toLowerCase().includes(query)) continue;
            const excerpt = line.trim();
            hits.push(
              `${entry.path}:${lineIndex + 1}: ${
                excerpt.length <= caps.grepExcerptChars
                  ? excerpt
                  : `${excerpt.slice(0, caps.grepExcerptChars)}…`
              }`,
            );
            if (hits.length >= caps.grepFilesMaxHits) break;
          }
        }
        return hits.length === 0 ? "No matches." : hits.join("\n");
      }
      case "read_file": {
        const path = typeof args.path === "string" ? args.path : "";
        const entry = corpus.entries.find(
          (candidate) => candidate.path === path,
        );
        return entry
          ? clip(entry.content, caps.fileContentChars)
          : `File not found: ${path}`;
      }
      case "get_graph_schema": {
        return buildGraphSchema(workspace).text;
      }
      case "repo_map": {
        const focus =
          typeof args.focus === "string" && args.focus.trim().length > 0
            ? args.focus.trim().split(/\s+/).slice(0, 16)
            : undefined;
        const map = buildRepoMap(workspace, {
          ...(focus ? { focus } : {}),
          tokenBudget: caps.repoMapDefaultBudget,
        });
        return map.text;
      }
      case "search_nodes": {
        const query = typeof args.query === "string" ? args.query : "";
        if (query.length === 0) return "search_nodes requires a query.";
        const results = searchWorkspaceNodes(workspace, query).slice(
          0,
          caps.searchNodesMaxResults,
        );
        return results.length === 0
          ? "No nodes matched."
          : results
              .map(
                (result) =>
                  `${result.nodeId} [${result.type}] ${result.path} (rank ${result.rank})`,
              )
              .join("\n");
      }
      case "get_neighbors": {
        const nodeId = typeof args.node_id === "string" ? args.node_id : "";
        const neighborhood = collectNeighbors(workspace, nodeId, 1);
        if (!neighborhood) return `Unknown node: ${nodeId}`;
        return [
          ...neighborhood.nodes.map(
            (node) => `${node.id} [${node.type}] ${node.path ?? ""}`,
          ),
          ...neighborhood.edges.map(
            (edge) =>
              `${edge.sourceNodeId} -${edge.relation}-> ${edge.targetNodeId}`,
          ),
        ].join("\n");
      }
      case "get_node_content": {
        const raw = typeof args.node_id === "string" ? args.node_id : "";
        const nodeIds = raw.trim().split(/\s+/).filter(Boolean).slice(0, 4);
        if (nodeIds.length === 0) return "get_node_content requires node_id.";
        // Mirrors the shipped batch form: up to 4 nodes per call, each
        // clipped independently; unknown ids report inline.
        return nodeIds
          .map((nodeId) => {
            const content = getNodeContent(workspace, nodeId);
            return content
              ? `# ${content.path ?? content.id} [${content.kind}]\n\n${clip(content.content, caps.fileContentChars)}`
              : `Unknown node: ${nodeId}`;
          })
          .join("\n\n");
      }
      case "search_index": {
        const query = typeof args.query === "string" ? args.query : "";
        if (query.length === 0) return "search_index requires a query.";
        const results = searchWorkspaceIndex(workspace, { query }).slice(
          0,
          caps.searchNodesMaxResults,
        );
        return results.length === 0
          ? "No index entries matched."
          : results
              .map(
                (result) =>
                  `${result.nodeId} [${result.type}] ${result.path} (rank ${result.rank})\n  ${clip(result.excerpt, 280).replaceAll("\n", " ")}`,
              )
              .join("\n");
      }
      case "memory_read": {
        const entries = workspace.memoryEntries ?? [];
        return entries.length === 0
          ? "No memory entries."
          : entries
              .map(
                (entry) =>
                  `[${entry.name}/${entry.entryKey}] ${entry.text} (source: ${entry.anchorPath ?? "workspace"})`,
              )
              .join("\n");
      }
      default:
        return `Unknown tool: ${name}`;
    }
  }

  return {
    execute(name, args) {
      if (!allowed.has(name)) {
        return `Tool ${name} is not available in this arm.`;
      }
      return run(name, args);
    },
  };
}
