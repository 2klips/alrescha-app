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

import { summaryAbsence, type SummaryAbsence } from "@alrescha/core";

import type {
  McpEdgeFamily,
  McpEdgeOmission,
  McpEdgeProvenance,
  McpEdgeRelation,
  McpEdgeTier,
  McpNodeType,
  McpWorkspaceData,
} from "./store";
import { searchWorkspaceIndex } from "./data-brain";

export interface GraphNodeRef {
  readonly id: string;
  readonly path: string | null;
  readonly repositoryId: string;
  readonly type: McpNodeType;
}

/**
 * An edge as a tool answer carries it (Codex remedy P0-D).
 *
 * It used to be four fields, and the family, the tier, the confidence and the
 * reason were dropped between the database and the agent — so "these two
 * files are connected" arrived with no way to ask how anyone knows. Storage
 * direction stays `sourceNodeId`/`targetNodeId` whichever way a traversal
 * walked it.
 *
 * `derived` marks an edge this layer computed rather than read: it has an id
 * of its own making and its `reason` says so.
 */
export interface GraphEdgeRef {
  readonly confidence: number | null;
  readonly derived: boolean;
  readonly family: McpEdgeFamily | null;
  readonly id: string;
  readonly provenance: McpEdgeProvenance;
  readonly relation: McpEdgeRelation;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly tier: McpEdgeTier | null;
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
        edges.push({ ...edge, derived: false });
      }
    }
    for (const requirement of repository.requirements) {
      if (nodes.has(requirement.sourceArtifactId)) {
        edges.push({
          confidence: 1,
          derived: true,
          family: "doc",
          id: `derived:${requirement.sourceArtifactId}:${requirement.id}`,
          provenance: {
            method: "requirement-source",
            reason: "the document this requirement was read from",
            span: null,
          },
          relation: "references",
          sourceNodeId: requirement.sourceArtifactId,
          targetNodeId: requirement.id,
          tier: "resolved",
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
  /**
   * Relations the read did not carry, and why. An empty list means the view
   * carried everything the store held; it never means "there is nothing
   * else" about the repository.
   */
  readonly omissions: readonly McpEdgeOmission[];
}

/** Everything the workspace read left out, merged across repositories. */
export function workspaceEdgeOmissions(
  workspace: McpWorkspaceData,
): readonly McpEdgeOmission[] {
  const merged = new Map<string, McpEdgeOmission>();
  for (const repository of workspace.repositories) {
    for (const omission of repository.edgeOmissions ?? []) {
      const held = merged.get(omission.relation);
      merged.set(omission.relation, {
        count: (held?.count ?? 0) + omission.count,
        reason: omission.reason,
        relation: omission.relation,
      });
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.relation.localeCompare(right.relation),
  );
}

/** Bidirectional frontier expansion, depth 1 or 2, optional relation filter. */
export function collectNeighbors(
  workspace: McpWorkspaceData,
  nodeId: string,
  depth: 1 | 2,
  relations?: readonly McpEdgeRelation[],
  families?: readonly McpEdgeFamily[],
): NeighborhoodResult | null {
  const view = buildGraphView(workspace);
  if (!view.nodes.has(nodeId)) {
    return null;
  }
  // A family filter narrows to the bands a caller asked about (todo 22 ⑸).
  // Without one every band answers, which is why the hierarchy has to be
  // excluded before it reaches the vocabulary filter — a folder containing a
  // file is a real edge and a useless neighbour.
  const allowed = (edge: GraphEdgeRef): boolean =>
    (!relations || relations.includes(edge.relation)) &&
    (!families || (edge.family !== null && families.includes(edge.family)));

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
    // What this view could not carry. A neighbourhood with no `contains`
    // edge is not a file in no folder; it is a view that does not carry
    // folders, and the difference is the caller's to know.
    omissions: workspaceEdgeOmissions(workspace),
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

/**
 * How `impact_of` was asked to traverse (Codex remedy P0-C / R-03, step S4).
 *
 * `related-neighborhood` is what the tool has always computed: an undirected
 * walk of every relation, depth 1 or 2. It answers "what is near this", which
 * is a useful question and **not** the question "what does changing this
 * break". With `A imports B` and `C imports B`, changing A reaches C in an
 * undirected walk — and C has never heard of A.
 *
 * `dependency-impact` is the directional answer: consumers reached backwards
 * along `imports` and `calls`, transitively. It is opt-in, and the default
 * stays where it was, because the existing field means what it has always
 * meant and changing that silently would hand every current caller a
 * different answer to the same call (REMEDY §7.3, OQ-052).
 */
export type ImpactMode = "dependency-impact" | "related-neighborhood";

/** Bumped when the meaning of a mode's answer changes, never in place. */
export const IMPACT_SEMANTICS_VERSION = 2;

/** Edges a directional walk will expand before it reports itself stopped. */
export const IMPACT_EDGE_BUDGET = 5_000;

/** Hops a directional walk will take. Deep enough to be a blast radius. */
export const IMPACT_MAX_DISTANCE = 10;

/**
 * Relations a change actually travels along. A folder containing a file, a
 * README naming it and a statistical co-change are all real edges, and none
 * of them means "editing this breaks that" (REMEDY §7.1).
 */
const DEPENDENCY_RELATIONS = new Set<McpEdgeRelation>(["calls", "imports"]);

export interface ImpactCandidate {
  /** Hops from the changed node. 1 is a direct consumer. */
  readonly distance: number;
  readonly nodeId: string;
  readonly path: string | null;
  /** One minimal path back to the change, nearest edge first. */
  readonly via: readonly GraphEdgeRef[];
}

export interface DependencyImpact {
  /**
   * Consumers that would have to be looked at, **not** things proven broken:
   * structural reachability is a candidate, and only running something is
   * evidence (REMEDY §7.2).
   */
  readonly candidates: readonly ImpactCandidate[];
  /** True only when the walk ended because it ran out of graph. */
  readonly complete: boolean;
  /**
   * Tests that reach the change. Collected, never expanded through: a test
   * importing a file makes the test related, not everything the test touches
   * (REMEDY §7.1, the test-terminal rule).
   */
  readonly relatedTests: readonly string[];
  readonly stoppedBy: "budget" | "distance" | null;
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
  /**
   * The directional answer, and `null` in `related-neighborhood` mode — the
   * tool did not compute one, which is a different statement from computing
   * an empty one.
   */
  readonly dependencyImpact: DependencyImpact | null;
  readonly mode: ImpactMode;
  /** What the read could not carry (S2a); an absence here is not proof. */
  readonly omissions: readonly McpEdgeOmission[];
  readonly semanticsVersion: number;
  /**
   * The undirected neighbourhood, depth-limited. Named for what it is: this
   * is proximity, not blast radius.
   */
  readonly transitiveNodeIds: readonly string[];
}

/**
 * Consumers reached backwards along `imports` and `calls`.
 *
 * The adjacency is built once, target to source, and the walk is a BFS with a
 * visited set, so a cycle terminates and a re-export chain is followed once.
 * A file nobody imports has no consumers, whatever else it sits next to.
 */
function dependencyImpactOf(view: GraphView, nodeId: string): DependencyImpact {
  const consumers = new Map<string, GraphEdgeRef[]>();
  const seenEdges = new Set<string>();
  for (const edges of view.adjacency.values()) {
    for (const edge of edges) {
      if (!DEPENDENCY_RELATIONS.has(edge.relation)) continue;
      const key = `${edge.sourceNodeId}|${edge.relation}|${edge.targetNodeId}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const held = consumers.get(edge.targetNodeId);
      if (held) held.push(edge);
      else consumers.set(edge.targetNodeId, [edge]);
    }
  }

  const candidates: ImpactCandidate[] = [];
  const visited = new Set([nodeId]);
  let frontier: { id: string; path: GraphEdgeRef[] }[] = [
    { id: nodeId, path: [] },
  ];
  let expanded = 0;
  let stoppedBy: DependencyImpact["stoppedBy"] = null;

  for (let distance = 1; distance <= IMPACT_MAX_DISTANCE; distance += 1) {
    const next: { id: string; path: GraphEdgeRef[] }[] = [];
    for (const current of frontier) {
      for (const edge of consumers.get(current.id) ?? []) {
        expanded += 1;
        if (expanded > IMPACT_EDGE_BUDGET) {
          stoppedBy = "budget";
          break;
        }
        const consumer = edge.sourceNodeId;
        if (visited.has(consumer)) continue;
        visited.add(consumer);
        const via = [edge, ...current.path];
        candidates.push({
          distance,
          nodeId: consumer,
          path: view.nodes.get(consumer)?.path ?? null,
          via,
        });
        next.push({ id: consumer, path: via });
      }
      if (stoppedBy) break;
    }
    if (stoppedBy || next.length === 0) break;
    frontier = next;
    if (distance === IMPACT_MAX_DISTANCE) stoppedBy = "distance";
  }

  // Tests are collected across the reached set and never expanded from.
  const reached = new Set([nodeId, ...candidates.map((entry) => entry.nodeId)]);
  const tests = new Set<string>();
  for (const edges of view.adjacency.values()) {
    for (const edge of edges) {
      if (edge.relation === "tests" && reached.has(edge.targetNodeId)) {
        tests.add(edge.sourceNodeId);
      }
    }
  }

  return {
    candidates: candidates.sort(
      (left, right) =>
        left.distance - right.distance ||
        left.nodeId.localeCompare(right.nodeId),
    ),
    complete: stoppedBy === null,
    relatedTests: [...tests].sort((left, right) => left.localeCompare(right)),
    stoppedBy,
  };
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
 * leaving it), and — depending on `mode` — either the depth-limited
 * undirected neighbourhood beyond both, or the directional set of consumers a
 * change would reach.
 *
 * The legacy fields compute exactly what they always did in both modes. The
 * mode decides what the *new* field carries, so an existing caller gets the
 * same answer to the same call and a new one can ask the right question
 * (REMEDY §7.3).
 */
export function impactOf(
  workspace: McpWorkspaceData,
  nodeId: string,
  depth: 1 | 2,
  mode: ImpactMode = "related-neighborhood",
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

  const dependencyImpact =
    mode === "dependency-impact" ? dependencyImpactOf(view, nodeId) : null;
  // Routes are a projection of whatever set the caller asked about: the
  // neighbourhood in the old mode, the consumers in the new one.
  const affected = dependencyImpact
    ? new Set([
        nodeId,
        ...dependencyImpact.candidates.map((entry) => entry.nodeId),
      ])
    : new Set([nodeId, ...direct, ...transitive]);

  return {
    affectedRoutes: affectedRoutesFor(workspace, affected),
    dependencyImpact,
    mode,
    omissions: workspaceEdgeOmissions(workspace),
    semanticsVersion: IMPACT_SEMANTICS_VERSION,
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
  /**
   * Why `content` is empty, when it is (Wave D todo 19 보완 R-02).
   *
   * The one freshness rule runs at the store boundary, so prose written for
   * an older blob never arrives here — it arrives as `""`. An empty string
   * with no explanation reads as "this file has nothing to say", and an
   * agent acts on that differently than on "nobody has described this file
   * yet" or "the description is out of date". Absent when there is content.
   */
  readonly contentAbsence?: SummaryAbsence;
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
      // One rule, one sentence: the same helper the inspector card and the
      // search excerpt use, so three surfaces cannot give three accounts of
      // the same absence (todo 19 보완 R-02).
      const absence = artifact.content
        ? null
        : summaryAbsence(artifact.summaryState ?? { state: "missing" });
      return {
        content: artifact.content,
        ...(absence ? { contentAbsence: absence } : {}),
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
