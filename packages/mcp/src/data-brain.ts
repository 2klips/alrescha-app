import {
  composeContextPack,
  personalizedPageRank,
  type ContextDocument,
  type ContextDocumentKind,
  type ContextTargetAgent,
  type PageRankEdge,
} from "@arr/core";

import type {
  McpArtifactData,
  McpFindingData,
  McpEdgeRelation,
  McpIndexEntryData,
  McpNodeType,
  McpWorkspaceData,
} from "./store";

export type SearchRank =
  "exact" | "title-heading" | "path-symbol" | "graph-neighbor";

export interface SearchIndexResult {
  excerpt: string;
  id: string;
  neighborIds: string[];
  nodeId: string;
  path: string;
  rank: SearchRank;
  repositoryId: string;
  score: number;
  title: string;
  type: McpNodeType;
}

interface WorkspaceIndexEntry {
  entry: McpIndexEntryData;
  repositoryId: string;
}

export interface BrainNode {
  id: string;
  label: string;
  path?: string | undefined;
  relations: McpEdgeRelation[];
  repositoryId: string;
  status: string;
  type: McpNodeType;
}

export interface BrainQueryFilter {
  path?: string | undefined;
  relations?: McpEdgeRelation[] | undefined;
  statuses?: string[] | undefined;
  types?: McpNodeType[] | undefined;
  withoutRelations?: McpEdgeRelation[] | undefined;
}

export interface ArtifactNeighbor {
  direction: "incoming" | "outgoing";
  id: string;
  label: string;
  path?: string | undefined;
  relation: McpEdgeRelation;
  type: McpNodeType;
}

export interface ArtifactWithNeighbors {
  artifact: (McpArtifactData & { repositoryId: string }) | null;
  neighbors: ArtifactNeighbor[];
}

export interface FindingQueryFilter {
  kind?: string | undefined;
  severity?: string | undefined;
  status?: string | undefined;
}

export interface WorkspaceFinding extends McpFindingData {
  repositoryId: string;
}

export interface SelectedContextPack {
  assumption: string;
  estimatedTokens: number;
  excluded: Array<{ path: string; reason: string }>;
  nodeIds: string[];
  omitted: Array<{
    estimatedTokens: number;
    path: string;
    rank: number;
    reason: string;
    title: string;
  }>;
  paths: string[];
  readingOrder: Array<{
    estimatedTokens: number;
    id: string;
    path: string;
    rank: number;
    reason: string;
    title: string;
  }>;
  targetAgent: ContextTargetAgent;
  text: string;
  title: string;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function queryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
}

function includesEveryToken(value: string, tokens: readonly string[]): boolean {
  const normalized = normalizeSearchText(value);
  return tokens.every((token) => normalized.includes(token));
}

function directRank(
  entry: McpIndexEntryData,
  query: string,
  tokens: readonly string[],
): SearchRank | null {
  const exactFields = [
    entry.title,
    entry.path,
    entry.searchKey,
    ...entry.headings,
    ...entry.tags,
    ...entry.symbols,
  ];
  if (exactFields.some((field) => normalizeSearchText(field) === query))
    return "exact";
  if (
    includesEveryToken(
      [entry.title, ...entry.headings, ...entry.tags].join(" "),
      tokens,
    )
  ) {
    return "title-heading";
  }
  if (includesEveryToken([entry.path, ...entry.symbols].join(" "), tokens))
    return "path-symbol";
  return null;
}

function excerptFor(
  workspace: McpWorkspaceData,
  nodeId: string,
  fallback: string,
): string {
  for (const repository of workspace.repositories) {
    const artifact = repository.artifacts.find(({ id }) => id === nodeId);
    if (artifact) return artifact.content.slice(0, 280);
    const requirement = repository.requirements.find(({ id }) => id === nodeId);
    if (requirement) return requirement.statement.slice(0, 280);
    const evidence = repository.evidence.find(({ id }) => id === nodeId);
    if (evidence) return `${evidence.kind}: ${evidence.verdict}`;
    const finding = repository.findings.find(({ id }) => id === nodeId);
    if (finding) return finding.title;
  }
  return fallback.slice(0, 280);
}

function scoreFor(rank: SearchRank): number {
  if (rank === "exact") return 400;
  if (rank === "title-heading") return 300;
  if (rank === "path-symbol") return 200;
  return 100;
}

/**
 * PPR rerank (Phase 3 Wave B todo 5): connectivity reorders near-ties inside
 * a tier, never across tiers — the bonus (≤50) stays under the 100-point tier
 * gap, so a lexical winner cannot be overturned (the Graft weighting rule).
 * The walk is seeded by the direct lexical hits; with no direct hit there is
 * nothing to personalize and the bonus is zero everywhere.
 */
const PPR_TIER_BONUS = 50;

function connectivityBonus(
  workspace: McpWorkspaceData,
  seeds: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  if (seeds.size === 0) return new Map();
  const nodeIds = new Set<string>();
  const edges: PageRankEdge[] = [];
  for (const repository of workspace.repositories) {
    for (const artifact of repository.artifacts) nodeIds.add(artifact.id);
    for (const requirement of repository.requirements) {
      nodeIds.add(requirement.id);
      edges.push({
        source: requirement.sourceArtifactId,
        target: requirement.id,
      });
    }
    for (const evidence of repository.evidence) nodeIds.add(evidence.id);
    for (const finding of repository.findings) nodeIds.add(finding.id);
    for (const edge of repository.edges) {
      edges.push({ source: edge.sourceNodeId, target: edge.targetNodeId });
    }
  }
  const rank = personalizedPageRank({
    edges,
    nodes: [...nodeIds],
    seeds: [...seeds],
  });
  const bonus = new Map<string, number>();
  for (const [nodeId, score] of rank) {
    bonus.set(nodeId, score * PPR_TIER_BONUS);
  }
  return bonus;
}

export function searchWorkspaceIndex(
  workspace: McpWorkspaceData,
  input: { query: string; typeFilter?: McpNodeType },
): SearchIndexResult[] {
  const query = normalizeSearchText(input.query);
  const tokens = queryTokens(input.query);
  const entries: WorkspaceIndexEntry[] = workspace.repositories.flatMap(
    (repository) =>
      repository.indexEntries.map((entry) => ({
        entry,
        repositoryId: repository.id,
      })),
  );
  const ranks = new Map<string, SearchRank>();
  const directNodeIds = new Set<string>();

  for (const { entry } of entries) {
    const rank = directRank(entry, query, tokens);
    if (!rank) continue;
    ranks.set(entry.id, rank);
    directNodeIds.add(entry.nodeId);
  }
  const neighborNodeIds = new Set(
    entries
      .filter(({ entry }) => directNodeIds.has(entry.nodeId))
      .flatMap(({ entry }) => entry.neighborIds),
  );
  for (const { entry } of entries) {
    if (!ranks.has(entry.id) && neighborNodeIds.has(entry.nodeId)) {
      ranks.set(entry.id, "graph-neighbor");
    }
  }

  const bonus = connectivityBonus(workspace, directNodeIds);

  return entries
    .flatMap(({ entry, repositoryId }) => {
      const rank = ranks.get(entry.id);
      if (!rank || (input.typeFilter && entry.type !== input.typeFilter))
        return [];
      return [
        {
          excerpt: excerptFor(workspace, entry.nodeId, entry.searchKey),
          id: entry.id,
          neighborIds: [...entry.neighborIds],
          nodeId: entry.nodeId,
          path: entry.path,
          rank,
          repositoryId,
          score: scoreFor(rank) + (bonus.get(entry.nodeId) ?? 0),
          title: entry.title,
          type: entry.type,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.localeCompare(right.path) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 20);
}

function repositoryNodes(workspace: McpWorkspaceData): BrainNode[] {
  return workspace.repositories.flatMap((repository) => {
    const artifactPaths = new Map(
      repository.artifacts.map((artifact) => [artifact.id, artifact.path]),
    );
    const nodes: BrainNode[] = [
      ...repository.artifacts.map((artifact) => ({
        id: artifact.id,
        label: artifact.title,
        path: artifact.path,
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: artifact.status,
        type: "artifact" as const,
      })),
      ...repository.requirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.statement,
        path: artifactPaths.get(requirement.sourceArtifactId),
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: requirement.status,
        type: "requirement" as const,
      })),
      ...repository.evidence.map((evidence) => ({
        id: evidence.id,
        label: `${evidence.kind}: ${evidence.verdict}`,
        path: artifactPaths.get(evidence.sourceArtifactId),
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: evidence.status ?? evidence.verdict,
        type: "evidence" as const,
      })),
      ...repository.findings.map((finding) => ({
        id: finding.id,
        label: finding.title,
        path:
          "span" in finding.provenance
            ? finding.provenance.span.path
            : undefined,
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: finding.status,
        type: "finding" as const,
      })),
      ...repository.receipts.map((receipt) => ({
        id: receipt.id,
        label: `Receipt ${receipt.commitSha.slice(0, 7)}`,
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: receipt.status,
        type: "receipt" as const,
      })),
      ...repository.contextPacks.map((pack) => ({
        id: pack.id,
        label: pack.title,
        path: pack.paths[0],
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: "available",
        type: "context_pack" as const,
      })),
    ];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of repository.edges) {
      for (const nodeId of [edge.sourceNodeId, edge.targetNodeId]) {
        const node = byId.get(nodeId);
        if (node && !node.relations.includes(edge.relation))
          node.relations.push(edge.relation);
      }
    }
    for (const node of nodes) node.relations.sort();
    return nodes;
  });
}

export function queryWorkspaceBrain(
  workspace: McpWorkspaceData,
  filter: BrainQueryFilter,
): BrainNode[] {
  const normalizedPath = filter.path
    ? normalizeSearchText(filter.path)
    : undefined;
  return repositoryNodes(workspace)
    .filter((node) => !filter.types || filter.types.includes(node.type))
    .filter((node) => !filter.statuses || filter.statuses.includes(node.status))
    .filter(
      (node) =>
        !filter.relations ||
        filter.relations.every((relation) => node.relations.includes(relation)),
    )
    .filter(
      (node) =>
        !filter.withoutRelations ||
        filter.withoutRelations.every(
          (relation) => !node.relations.includes(relation),
        ),
    )
    .filter(
      (node) =>
        !normalizedPath ||
        normalizeSearchText(node.path ?? "").includes(normalizedPath),
    )
    .sort(
      (left, right) =>
        left.type.localeCompare(right.type) ||
        (left.path ?? "").localeCompare(right.path ?? "") ||
        left.id.localeCompare(right.id),
    );
}

export function getWorkspaceArtifact(
  workspace: McpWorkspaceData,
  selector: { id?: string | undefined; path?: string | undefined },
): ArtifactWithNeighbors {
  const matches = workspace.repositories.flatMap((repository) =>
    repository.artifacts
      .filter((artifact) =>
        selector.id
          ? artifact.id === selector.id
          : artifact.path === selector.path,
      )
      .map((artifact) => ({ artifact, repository })),
  );
  matches.sort((left, right) =>
    left.repository.id.localeCompare(right.repository.id),
  );
  const match = matches[0];
  if (!match) return { artifact: null, neighbors: [] };

  const nodes = new Map(
    repositoryNodes(workspace).map((node) => [node.id, node]),
  );
  const neighbors: ArtifactNeighbor[] = [];
  for (const edge of match.repository.edges) {
    if (edge.targetNodeId === match.artifact.id) {
      const node = nodes.get(edge.sourceNodeId);
      if (node) {
        neighbors.push({
          direction: "incoming",
          id: node.id,
          label: node.label,
          ...(node.path ? { path: node.path } : {}),
          relation: edge.relation,
          type: node.type,
        });
      }
    }
    if (edge.sourceNodeId === match.artifact.id) {
      const node = nodes.get(edge.targetNodeId);
      if (node) {
        neighbors.push({
          direction: "outgoing",
          id: node.id,
          label: node.label,
          ...(node.path ? { path: node.path } : {}),
          relation: edge.relation,
          type: node.type,
        });
      }
    }
  }

  return {
    artifact: { ...match.artifact, repositoryId: match.repository.id },
    neighbors: neighbors.sort(
      (left, right) =>
        left.relation.localeCompare(right.relation) ||
        left.direction.localeCompare(right.direction) ||
        left.id.localeCompare(right.id),
    ),
  };
}

export function getWorkspaceFindings(
  workspace: McpWorkspaceData,
  filter: FindingQueryFilter = {},
): WorkspaceFinding[] {
  return workspace.repositories
    .flatMap((repository) =>
      repository.findings.map((finding) => ({
        ...finding,
        repositoryId: repository.id,
      })),
    )
    .filter((finding) => !filter.kind || finding.kind === filter.kind)
    .filter(
      (finding) => !filter.severity || finding.severity === filter.severity,
    )
    .filter((finding) => !filter.status || finding.status === filter.status)
    .sort(
      (left, right) =>
        left.severity.localeCompare(right.severity) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
}

export function selectWorkspaceContextPack(
  workspace: McpWorkspaceData,
  input: {
    targetAgent?: ContextTargetAgent;
    taskDescription: string;
    tokenBudget: number;
  },
): SelectedContextPack {
  const documentKinds = new Set<ContextDocumentKind>([
    "agents",
    "claude",
    "skill",
    "cursor_rule",
    "spec",
    "adr",
    "todo_progress",
  ]);
  const documents: ContextDocument[] = workspace.repositories.flatMap(
    (repository) => {
      const relatedNodeIds = new Map<string, Set<string>>();
      const connect = (left: string, right: string) => {
        const leftConnections = relatedNodeIds.get(left) ?? new Set<string>();
        leftConnections.add(right);
        relatedNodeIds.set(left, leftConnections);
      };

      for (const edge of repository.edges) {
        connect(edge.sourceNodeId, edge.targetNodeId);
        connect(edge.targetNodeId, edge.sourceNodeId);
      }
      for (const requirement of repository.requirements) {
        connect(requirement.sourceArtifactId, requirement.id);
        connect(requirement.id, requirement.sourceArtifactId);
      }

      return repository.artifacts.flatMap((artifact) => {
        if (!documentKinds.has(artifact.kind as ContextDocumentKind)) return [];

        return [
          {
            content: artifact.content,
            id: artifact.id,
            kind: artifact.kind as ContextDocumentKind,
            path: artifact.path,
            relatedNodeIds: [...(relatedNodeIds.get(artifact.id) ?? [])],
            title: artifact.title,
          },
        ];
      });
    },
  );
  const relations = workspace.repositories.flatMap((repository) => [
    ...repository.edges.map((edge) => ({
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      type: edge.relation,
    })),
    ...repository.requirements.map((requirement) => ({
      sourceId: requirement.id,
      sourceLabel: requirement.statement,
      targetId: requirement.sourceArtifactId,
      type: "specified_by",
    })),
  ]);
  const pack = composeContextPack({
    documents,
    relations,
    targetAgent: input.targetAgent ?? "generic",
    taskDescription: input.taskDescription,
    tokenBudget: input.tokenBudget,
  });
  const selectedNodeIds = new Set(pack.readingOrder.map(({ id }) => id));

  for (const repository of workspace.repositories) {
    for (const requirement of repository.requirements) {
      if (selectedNodeIds.has(requirement.sourceArtifactId))
        selectedNodeIds.add(requirement.id);
    }
    for (const edge of repository.edges) {
      if (selectedNodeIds.has(edge.sourceNodeId))
        selectedNodeIds.add(edge.targetNodeId);
      if (selectedNodeIds.has(edge.targetNodeId))
        selectedNodeIds.add(edge.sourceNodeId);
    }
  }

  const omitted = pack.omitted.map(
    ({ estimatedTokens, path, rank, reason, title }) => ({
      estimatedTokens,
      path,
      rank,
      reason,
      title,
    }),
  );

  return {
    assumption: pack.assumption,
    estimatedTokens: pack.estimatedTokens,
    excluded: omitted.map(({ path, reason }) => ({ path, reason })),
    nodeIds: [...selectedNodeIds],
    omitted,
    paths: pack.readingOrder.map(({ path }) => path),
    readingOrder: pack.readingOrder.map(
      ({ estimatedTokens, id, path, rank, reason, title }) => ({
        estimatedTokens,
        id,
        path,
        rank,
        reason,
        title,
      }),
    ),
    targetAgent: pack.targetAgent,
    text: pack.formattedText,
    title: `Context for ${input.taskDescription}`,
  };
}
