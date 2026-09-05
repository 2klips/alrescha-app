/**
 * Graph traversal for the hosted MCP surface (Phase 2B todo 4).
 *
 * Every function here is ID-first: results carry node ids, types, and paths —
 * addresses, never bodies. Content is a separate, explicit second step
 * (`getNodeContent`). Traversal covers the stored `edges` rows plus one
 * derived link — `requirement.sourceArtifactId → requirement` — the same
 * implicit adjacency the context-pack selector already uses; derived edges
 * are marked so a caller can tell them from stored rows.
 */

import type { McpEdgeRelation, McpNodeType, McpWorkspaceData } from "./store";
import { searchWorkspaceIndex } from "./data-brain";

export interface GraphNodeRef {
  readonly id: string;
  readonly path: string | null;
  readonly repositoryId: string;
  readonly type: McpNodeType;
}

export interface GraphEdgeRef {
  readonly derived: boolean;
  readonly relation: McpEdgeRelation;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}

interface GraphView {
  readonly adjacency: ReadonlyMap<string, readonly GraphEdgeRef[]>;
  readonly nodes: ReadonlyMap<string, GraphNodeRef>;
}

function buildGraphView(workspace: McpWorkspaceData): GraphView {
  const nodes = new Map<string, GraphNodeRef>();
  const edges: GraphEdgeRef[] = [];

  for (const repository of workspace.repositories) {
    const artifactPaths = new Map(
      repository.artifacts.map(({ id, path }) => [id, path]),
    );
    for (const artifact of repository.artifacts) {
      nodes.set(artifact.id, {
        id: artifact.id,
        path: artifact.path,
        repositoryId: repository.id,
        type: "artifact",
      });
    }
    for (const requirement of repository.requirements) {
      nodes.set(requirement.id, {
        id: requirement.id,
        path: artifactPaths.get(requirement.sourceArtifactId) ?? null,
        repositoryId: repository.id,
        type: "requirement",
      });
    }
    for (const evidence of repository.evidence) {
      nodes.set(evidence.id, {
        id: evidence.id,
        path: artifactPaths.get(evidence.sourceArtifactId) ?? null,
        repositoryId: repository.id,
        type: "evidence",
      });
    }
    for (const finding of repository.findings) {
      nodes.set(finding.id, {
        id: finding.id,
        path:
          "span" in finding.provenance ? finding.provenance.span.path : null,
        repositoryId: repository.id,
        type: "finding",
      });
    }
    for (const route of repository.routes ?? []) {
      nodes.set(route.nodeId, {
        id: route.nodeId,
        // A URL's path anchor is whichever file serves it; the edges say
        // which, so the node itself keeps none.
        path: null,
        repositoryId: repository.id,
        type: "route",
      });
    }
    for (const section of repository.sections ?? []) {
      nodes.set(section.nodeId, {
        id: section.nodeId,
        // The document that declares it: an agent asking about a decision
        // wants that file opened at that heading.
        path: section.sourcePath,
        repositoryId: repository.id,
        type: "section",
      });
    }
    for (const object of repository.dbObjects ?? []) {
      nodes.set(object.nodeId, {
        id: object.nodeId,
        // The migration that declares it: an agent asking about a table
        // wants that file opened, and `impact_of` reads this path.
        path: object.sourcePath,
        repositoryId: repository.id,
        type: "db_object",
      });
    }
    for (const receipt of repository.receipts) {
      nodes.set(receipt.id, {
        id: receipt.id,
        path: null,
        repositoryId: repository.id,
        type: "receipt",
      });
    }
    for (const pack of repository.contextPacks) {
      nodes.set(pack.id, {
        id: pack.id,
        path: pack.paths[0] ?? null,
        repositoryId: repository.id,
        type: "context_pack",
      });
    }

    for (const edge of repository.edges) {
      if (nodes.has(edge.sourceNodeId) && nodes.has(edge.targetNodeId)) {
        edges.push({
          derived: false,
          relation: edge.relation,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
        });
      }
    }
    for (const requirement of repository.requirements) {
      if (nodes.has(requirement.sourceArtifactId)) {
        edges.push({
          derived: true,
          relation: "references",
          sourceNodeId: requirement.sourceArtifactId,
          targetNodeId: requirement.id,
        });
      }
    }
  }

  edges.sort(
    (left, right) =>
      left.sourceNodeId.localeCompare(right.sourceNodeId) ||
      left.targetNodeId.localeCompare(right.targetNodeId) ||
      left.relation.localeCompare(right.relation),
  );

  const adjacency = new Map<string, GraphEdgeRef[]>();
  for (const edge of edges) {
    for (const endpoint of [edge.sourceNodeId, edge.targetNodeId]) {
      const list = adjacency.get(endpoint);
      if (list) {
        list.push(edge);
      } else {
        adjacency.set(endpoint, [edge]);
      }
    }
  }

  return { adjacency, nodes };
}

function edgeKey(edge: GraphEdgeRef): string {
  return `${edge.sourceNodeId}|${edge.relation}|${edge.targetNodeId}`;
}

function otherEnd(edge: GraphEdgeRef, nodeId: string): string {
  return edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
}

export interface NeighborhoodResult {
  readonly edges: readonly GraphEdgeRef[];
  readonly nodes: readonly GraphNodeRef[];
}

/** Bidirectional frontier expansion, depth 1 or 2, optional relation filter. */
export function collectNeighbors(
  workspace: McpWorkspaceData,
  nodeId: string,
  depth: 1 | 2,
  relations?: readonly McpEdgeRelation[],
): NeighborhoodResult | null {
  const view = buildGraphView(workspace);
  if (!view.nodes.has(nodeId)) {
    return null;
  }
  const allowed = (edge: GraphEdgeRef): boolean =>
    !relations || relations.includes(edge.relation);

  const visited = new Set([nodeId]);
  const collectedEdges = new Map<string, GraphEdgeRef>();
  let frontier = [nodeId];
  for (let step = 0; step < depth; step += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const edge of view.adjacency.get(current) ?? []) {
        if (!allowed(edge)) {
          continue;
        }
        collectedEdges.set(edgeKey(edge), edge);
        const neighbor = otherEnd(edge, current);
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  return {
    edges: [...collectedEdges.values()],
    nodes: [...visited]
      .sort((left, right) => left.localeCompare(right))
      .map((id) => view.nodes.get(id))
      .filter((node): node is GraphNodeRef => node !== undefined),
  };
}

export interface TracedPath {
  readonly edges: readonly GraphEdgeRef[];
  /** graphify-style explanation lines: `<source> -relation-> <target>`. */
  readonly explain: readonly string[];
  readonly hops: number;
  readonly nodeIds: readonly string[];
}

/**
 * Deterministic BFS shortest path, traversing edges in either direction but
 * reporting each hop with its stored direction.
 */
export function tracePath(
  workspace: McpWorkspaceData,
  fromNodeId: string,
  toNodeId: string,
  maxDepth: number,
): TracedPath | null {
  const view = buildGraphView(workspace);
  if (!view.nodes.has(fromNodeId) || !view.nodes.has(toNodeId)) {
    return null;
  }
  if (fromNodeId === toNodeId) {
    return { edges: [], explain: [], hops: 0, nodeIds: [fromNodeId] };
  }

  const cameFrom = new Map<string, { edge: GraphEdgeRef; from: string }>();
  const visited = new Set([fromNodeId]);
  let frontier = [fromNodeId];
  for (let step = 0; step < maxDepth && frontier.length > 0; step += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const edge of view.adjacency.get(current) ?? []) {
        const neighbor = otherEnd(edge, current);
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        cameFrom.set(neighbor, { edge, from: current });
        if (neighbor === toNodeId) {
          const edges: GraphEdgeRef[] = [];
          const nodeIds = [toNodeId];
          let cursor = toNodeId;
          while (cursor !== fromNodeId) {
            const hop = cameFrom.get(cursor);
            if (!hop) {
              return null;
            }
            edges.unshift(hop.edge);
            nodeIds.unshift(hop.from);
            cursor = hop.from;
          }
          return {
            edges,
            explain: edges.map(
              (hop) =>
                `${hop.sourceNodeId} -${hop.relation}${hop.derived ? "*" : ""}-> ${hop.targetNodeId}`,
            ),
            hops: edges.length,
            nodeIds,
          };
        }
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

export interface AffectedRoute {
  readonly methods: readonly string[];
  readonly nodeId: string;
  readonly tier: "reference" | "resolved";
  readonly url: string;
}

export interface ImpactReport {
  /**
   * URLs this change reaches (Phase 4 Wave A′ todo 6): every route served by
   * a file in the impact set, plus the node itself when it is a route. The
   * contract is shared with the budget work in todo 22 — "what does editing
   * this break" is a question about screens and endpoints, not about files.
   */
  readonly affectedRoutes: readonly AffectedRoute[];
  readonly dependencies: {
    readonly edges: readonly GraphEdgeRef[];
    readonly nodeIds: readonly string[];
  };
  readonly dependents: {
    readonly edges: readonly GraphEdgeRef[];
    readonly nodeIds: readonly string[];
  };
  readonly transitiveNodeIds: readonly string[];
}

function affectedRoutesFor(
  workspace: McpWorkspaceData,
  affected: ReadonlySet<string>,
): AffectedRoute[] {
  const routes: AffectedRoute[] = [];
  for (const repository of workspace.repositories) {
    for (const route of repository.routes ?? []) {
      const serves =
        affected.has(route.nodeId) ||
        repository.edges.some(
          (edge) =>
            edge.relation === "handles" &&
            edge.sourceNodeId === route.nodeId &&
            affected.has(edge.targetNodeId),
        );
      if (serves) routes.push(route);
    }
  }
  return routes.sort((left, right) => left.url.localeCompare(right.url));
}

/**
 * Direct dependents (edges pointing at the node), direct dependencies (edges
 * leaving it), and the depth-limited transitive closure beyond both.
 */
export function impactOf(
  workspace: McpWorkspaceData,
  nodeId: string,
  depth: 1 | 2,
): ImpactReport | null {
  const view = buildGraphView(workspace);
  if (!view.nodes.has(nodeId)) {
    return null;
  }
  const touching = view.adjacency.get(nodeId) ?? [];
  const dependentEdges = touching.filter(
    (edge) => edge.targetNodeId === nodeId,
  );
  const dependencyEdges = touching.filter(
    (edge) => edge.sourceNodeId === nodeId,
  );
  const direct = new Set([
    ...dependentEdges.map(({ sourceNodeId }) => sourceNodeId),
    ...dependencyEdges.map(({ targetNodeId }) => targetNodeId),
  ]);

  const neighborhood = collectNeighbors(workspace, nodeId, depth);
  const transitive = (neighborhood?.nodes ?? [])
    .map(({ id }) => id)
    .filter((id) => id !== nodeId && !direct.has(id));

  return {
    affectedRoutes: affectedRoutesFor(
      workspace,
      new Set([nodeId, ...direct, ...transitive]),
    ),
    dependencies: {
      edges: dependencyEdges,
      nodeIds: [
        ...dependencyEdges.map(({ targetNodeId }) => targetNodeId),
      ].sort((left, right) => left.localeCompare(right)),
    },
    dependents: {
      edges: dependentEdges,
      nodeIds: [...dependentEdges.map(({ sourceNodeId }) => sourceNodeId)].sort(
        (left, right) => left.localeCompare(right),
      ),
    },
    transitiveNodeIds: transitive,
  };
}

export interface NodeContent {
  readonly content: string;
  readonly id: string;
  readonly kind: string;
  readonly path: string | null;
  readonly repositoryId: string;
  readonly type: McpNodeType;
}

/**
 * The explicit second step after ID-first traversal: stored content for one
 * node. Nothing is fetched — artifacts return their stored summary text (raw
 * bodies are never persisted, WORK_SPEC guardrail 3).
 */
export function getNodeContent(
  workspace: McpWorkspaceData,
  nodeId: string,
): NodeContent | null {
  for (const repository of workspace.repositories) {
    const artifactPaths = new Map(
      repository.artifacts.map(({ id, path }) => [id, path]),
    );
    const artifact = repository.artifacts.find(({ id }) => id === nodeId);
    if (artifact) {
      return {
        content: artifact.content,
        id: artifact.id,
        kind: artifact.kind,
        path: artifact.path,
        repositoryId: repository.id,
        type: "artifact",
      };
    }
    const requirement = repository.requirements.find(({ id }) => id === nodeId);
    if (requirement) {
      return {
        content: requirement.statement,
        id: requirement.id,
        kind: "requirement",
        path: artifactPaths.get(requirement.sourceArtifactId) ?? null,
        repositoryId: repository.id,
        type: "requirement",
      };
    }
    const evidence = repository.evidence.find(({ id }) => id === nodeId);
    if (evidence) {
      return {
        content: `${evidence.kind}: ${evidence.verdict}`,
        id: evidence.id,
        kind: evidence.kind,
        path: artifactPaths.get(evidence.sourceArtifactId) ?? null,
        repositoryId: repository.id,
        type: "evidence",
      };
    }
    const finding = repository.findings.find(({ id }) => id === nodeId);
    if (finding) {
      return {
        content: `[${finding.evidenceGrade}] ${finding.title}`,
        id: finding.id,
        kind: finding.kind,
        path:
          "span" in finding.provenance ? finding.provenance.span.path : null,
        repositoryId: repository.id,
        type: "finding",
      };
    }
    const pack = repository.contextPacks.find(({ id }) => id === nodeId);
    if (pack) {
      return {
        content: pack.content,
        id: pack.id,
        kind: "context_pack",
        path: pack.paths[0] ?? null,
        repositoryId: repository.id,
        type: "context_pack",
      };
    }
  }
  return null;
}

export interface NodeSearchResult {
  readonly nodeId: string;
  readonly neighborIds: readonly string[];
  readonly path: string;
  readonly rank: string;
  readonly repositoryId: string;
  readonly score: number;
  readonly type: McpNodeType;
}

/**
 * ID-first search: the same deterministic ranking as `search_index`, with the
 * excerpt and title stripped. `search_index` remains the text entry point;
 * this is the graph entry point — ids in, traversal next, content last.
 */
export function searchWorkspaceNodes(
  workspace: McpWorkspaceData,
  query: string,
  typeFilter?: McpNodeType,
): NodeSearchResult[] {
  return searchWorkspaceIndex(workspace, {
    query,
    ...(typeFilter ? { typeFilter } : {}),
  }).map((result) => ({
    neighborIds: result.neighborIds,
    nodeId: result.nodeId,
    path: result.path,
    rank: result.rank,
    repositoryId: result.repositoryId,
    score: result.score,
    type: result.type,
  }));
}
