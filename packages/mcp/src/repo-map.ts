import { personalizedPageRank, type PageRankEdge } from "@arr/core";

import type { McpNodeType, McpWorkspaceData } from "./store";

/**
 * Token-budgeted repo map + graph schema (Phase 3 Wave B todo 5).
 *
 * The Aider pattern: importance is personalized PageRank over the stored
 * graph, and the output is a signature skeleton packed greedily into a hard
 * token budget — orientation for the price of a file listing. `focus` seeds
 * the walk (the caller's open files or task symbols); without focus the walk
 * is uniform and the map shows global hubs.
 *
 * `get_graph_schema` is the "call me first" card (codebase-memory-mcp
 * ergonomics): what node kinds and relations exist here, with counts, so an
 * agent speaks this graph's vocabulary instead of guessing one.
 */

const CHARS_PER_TOKEN = 4;
const MAX_SYMBOLS_PER_LINE = 12;
export const REPO_MAP_MIN_BUDGET = 100;
export const REPO_MAP_MAX_BUDGET = 8_000;
export const REPO_MAP_DEFAULT_BUDGET = 1_200;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface WorkspaceGraph {
  readonly edges: readonly PageRankEdge[];
  readonly nodeIds: readonly string[];
}

/** Stored edges plus the derived requirement←artifact adjacency. */
function workspaceGraph(workspace: McpWorkspaceData): WorkspaceGraph {
  const nodeIds: string[] = [];
  const edges: PageRankEdge[] = [];
  for (const repository of workspace.repositories) {
    for (const artifact of repository.artifacts) nodeIds.push(artifact.id);
    for (const requirement of repository.requirements) {
      nodeIds.push(requirement.id);
      edges.push({
        source: requirement.sourceArtifactId,
        target: requirement.id,
      });
    }
    for (const evidence of repository.evidence) nodeIds.push(evidence.id);
    for (const finding of repository.findings) nodeIds.push(finding.id);
    for (const edge of repository.edges) {
      edges.push({ source: edge.sourceNodeId, target: edge.targetNodeId });
    }
  }
  return { edges, nodeIds };
}

export interface RepoMapEntry {
  readonly nodeId: string;
  readonly line: string;
  readonly path: string;
  readonly score: number;
}

export interface RepoMapResult {
  readonly entries: readonly RepoMapEntry[];
  readonly focusMatched: readonly string[];
  readonly omittedCount: number;
  readonly text: string;
  readonly tokenBudget: number;
  readonly tokenEstimate: number;
}

/**
 * PageRank-ranked signature skeleton under a hard token budget. Compact text
 * by design — the output format is itself the token optimization.
 */
export function buildRepoMap(
  workspace: McpWorkspaceData,
  input: { focus?: readonly string[]; tokenBudget?: number },
): RepoMapResult {
  const tokenBudget = Math.min(
    REPO_MAP_MAX_BUDGET,
    Math.max(REPO_MAP_MIN_BUDGET, input.tokenBudget ?? REPO_MAP_DEFAULT_BUDGET),
  );
  const graph = workspaceGraph(workspace);

  const artifacts = workspace.repositories.flatMap((repository) =>
    repository.artifacts.map((artifact) => ({
      artifact,
      repositoryFullName: repository.fullName,
    })),
  );

  const focusTerms = (input.focus ?? [])
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
  const focusMatched = artifacts
    .filter(({ artifact }) =>
      focusTerms.some(
        (term) =>
          artifact.path.toLowerCase().includes(term) ||
          artifact.symbols.some((symbol) =>
            symbol.toLowerCase().includes(term),
          ),
      ),
    )
    .map(({ artifact }) => artifact.id);

  const rank = personalizedPageRank({
    edges: graph.edges,
    nodes: graph.nodeIds,
    seeds: focusMatched,
  });

  const candidates = artifacts
    .map(({ artifact }) => {
      const symbols = artifact.symbols.slice(0, MAX_SYMBOLS_PER_LINE);
      const omittedSymbols = artifact.symbols.length - symbols.length;
      const line =
        symbols.length === 0
          ? `${artifact.path} — ${artifact.kind}`
          : `${artifact.path} — ${symbols.join(", ")}${
              omittedSymbols > 0 ? ` (+${omittedSymbols})` : ""
            }`;
      return {
        line,
        nodeId: artifact.id,
        path: artifact.path,
        score: rank.get(artifact.id) ?? 0,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.path.localeCompare(right.path),
    );

  const entries: RepoMapEntry[] = [];
  let usedTokens = 0;
  for (const candidate of candidates) {
    const cost = estimateTokens(`${candidate.line}\n`);
    if (usedTokens + cost > tokenBudget) break;
    usedTokens += cost;
    entries.push(candidate);
  }
  const omittedCount = candidates.length - entries.length;
  const lines = entries.map(({ line }) => line);
  if (omittedCount > 0) {
    lines.push(
      `… ${omittedCount} more files over the ${tokenBudget}-token budget`,
    );
  }

  return {
    entries,
    focusMatched,
    omittedCount,
    text: lines.join("\n"),
    tokenBudget,
    tokenEstimate: estimateTokens(lines.join("\n")),
  };
}

export interface GraphSchemaResult {
  readonly nodeCounts: Readonly<Partial<Record<McpNodeType, number>>>;
  readonly relationCounts: Readonly<Record<string, number>>;
  readonly repositories: readonly {
    readonly artifactCount: number;
    readonly fullName: string;
    readonly id: string;
  }[];
  readonly text: string;
}

/** The graph's vocabulary with counts — the recommended first call. */
export function buildGraphSchema(
  workspace: McpWorkspaceData,
): GraphSchemaResult {
  const nodeCounts: Partial<Record<McpNodeType, number>> = {};
  const relationCounts: Record<string, number> = {};
  const repositories: {
    artifactCount: number;
    fullName: string;
    id: string;
  }[] = [];

  const add = (type: McpNodeType, count: number): void => {
    if (count > 0) nodeCounts[type] = (nodeCounts[type] ?? 0) + count;
  };

  for (const repository of workspace.repositories) {
    repositories.push({
      artifactCount: repository.artifacts.length,
      fullName: repository.fullName,
      id: repository.id,
    });
    add("artifact", repository.artifacts.length);
    add("requirement", repository.requirements.length);
    add("evidence", repository.evidence.length);
    add("finding", repository.findings.length);
    add("receipt", repository.receipts.length);
    add("context_pack", repository.contextPacks.length);
    for (const edge of repository.edges) {
      relationCounts[edge.relation] = (relationCounts[edge.relation] ?? 0) + 1;
    }
  }

  const nodeLine = Object.entries(nodeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}:${count}`)
    .join(" ");
  const relationLine = Object.entries(relationCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relation, count]) => `${relation}:${count}`)
    .join(" ");

  const text = [
    `repositories: ${repositories
      .map(
        ({ artifactCount, fullName }) => `${fullName} (${artifactCount} files)`,
      )
      .join(", ")}`,
    `nodes: ${nodeLine || "none"}`,
    `edges: ${relationLine || "none"}`,
    "flow: search_nodes → get_neighbors/trace_path → get_node_content (ids first, bodies last)",
  ].join("\n");

  return { nodeCounts, relationCounts, repositories, text };
}
