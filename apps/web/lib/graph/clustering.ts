/**
 * Community-detection supernodes (Phase 2A todo 5).
 *
 * Rule from `BUILD_PLAN_PHASE2A_UI.md` and the research spec §5-①: graphs of
 * ≤3,000 nodes render raw — that is the Obsidian aesthetic and collapsing them
 * would be a downgrade. Above that, Far zoom collapses communities into
 * supernodes as a *visual* aggregation: the worker keeps simulating the raw
 * graph, and a supernode is drawn at the centroid of its members. Nothing here
 * touches the layout, so expanding a community costs one frame, not a reheat.
 */

import louvain from "graphology-communities-louvain";

import type {
  EvidenceGrade,
  GraphData,
  GraphEdge,
  GraphNode,
} from "../dashboard/graph-model";
import { buildGraphologyGraph, createRandomSource } from "./force-simulation";
import type { LodLevel } from "./lod";
import type { Position } from "./simulation-protocol";

/** Below this, raw rendering wins. */
export const RAW_RENDER_NODE_LIMIT = 3_000;

export const SUPERNODE_PREFIX = "community:";

export function isSupernodeId(id: string): boolean {
  return id.startsWith(SUPERNODE_PREFIX);
}

export function communityIdFromSupernode(id: string): string {
  return id.slice(SUPERNODE_PREFIX.length);
}

/** Folder/module fallback: the first two path segments, or the artifact type. */
export function folderCommunity(node: GraphNode): string {
  const segments = node.path.split(":")[0]?.split("/") ?? [];
  const folder = segments.slice(0, Math.min(2, segments.length - 1));
  return folder.length > 0 ? folder.join("/") : node.type;
}

export interface CommunityOptions {
  /** Force the folder fallback (used to prove the fallback path works). */
  strategy?: "auto" | "folder";
  seed?: number;
}

/**
 * `nodeId → community key`. Louvain first; the folder fallback takes over when
 * louvain cannot say anything useful (empty/edgeless graph, or a single blob),
 * because one community for the whole repo collapses to a single dot.
 */
export function communityAssignment(
  data: GraphData,
  options: CommunityOptions = {},
): Map<string, string> {
  const byFolder = () =>
    new Map(data.nodes.map((node) => [node.id, folderCommunity(node)]));

  if (options.strategy === "folder" || data.edges.length === 0)
    return byFolder();

  try {
    const graph = buildGraphologyGraph(data);
    if (graph.size === 0) return byFolder();
    const communities = louvain(graph, {
      rng: createRandomSource(options.seed ?? 1),
    });
    const distinct = new Set(Object.values(communities));
    if (distinct.size < 2) return byFolder();
    const assignment = new Map<string, string>();
    for (const node of data.nodes) {
      const community = communities[node.id];
      assignment.set(
        node.id,
        community === undefined ? folderCommunity(node) : `c${community}`,
      );
    }
    return assignment;
  } catch {
    return byFolder();
  }
}

/** Supernodes only exist above the raw limit, and only at Far zoom. */
export function shouldCollapse(nodeCount: number, lod: LodLevel): boolean {
  return nodeCount > RAW_RENDER_NODE_LIMIT && lod === "far";
}

const GRADE_SEVERITY: Record<EvidenceGrade, number> = {
  broken: 2,
  inferred: 1,
  verified: 0,
};

/** The worst grade in a community wins — a supernode must never look healthier than its contents. */
function worstGrade(nodes: readonly GraphNode[]): EvidenceGrade {
  let worst: EvidenceGrade = "verified";
  for (const node of nodes) {
    if (GRADE_SEVERITY[node.grade] > GRADE_SEVERITY[worst]) worst = node.grade;
  }
  return worst;
}

function dominantType(nodes: readonly GraphNode[]): GraphNode["type"] {
  const counts = new Map<GraphNode["type"], number>();
  for (const node of nodes)
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  let best: GraphNode["type"] = nodes[0]?.type ?? "document";
  let bestCount = -1;
  for (const [type, count] of [...counts.entries()].sort((left, right) =>
    left[0] < right[0] ? -1 : 1,
  )) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

export interface CollapsedGraph {
  data: GraphData;
  /** Supernode centroids merged with the raw positions of expanded members. */
  positions: Map<string, Position>;
}

export interface CollapseInput {
  assignment: ReadonlyMap<string, string>;
  data: GraphData;
  /** Communities the user clicked open — rendered raw. */
  expanded?: ReadonlySet<string>;
  positions: ReadonlyMap<string, Position>;
}

/**
 * The half of a collapse that does not depend on where the nodes currently
 * are (perf research MT-4). Membership, the merged edge set, and every
 * supernode field except its centroid are functions of
 * `(data, assignment, expanded)` alone — and that triple changes when the user
 * clicks a community open, not sixty times a second.
 */
interface CollapseStructure {
  /** Merged inter-community edges — identical for every frame of this key. */
  readonly edges: readonly GraphEdge[];
  /** Communities in sorted key order, each with its members. */
  readonly groups: readonly {
    readonly id: string;
    readonly members: readonly GraphNode[];
    /** Everything about the supernode that a centroid does not decide. */
    readonly template: Omit<GraphNode, "x" | "y">;
  }[];
  /** Nodes rendered raw, in input order. */
  readonly kept: readonly GraphNode[];
}

/**
 * `data → assignment → expanded-key → structure`. Both outer levels are weak,
 * so a discarded graph takes its cache with it; the inner map is bounded
 * because a user can only click so many communities open before the zoom
 * leaves the collapse band entirely.
 */
const structureCache = new WeakMap<
  GraphData,
  WeakMap<ReadonlyMap<string, string>, Map<string, CollapseStructure>>
>();

/** Enough for a session's worth of expand/collapse clicks on one graph. */
const STRUCTURE_CACHE_LIMIT = 16;

function buildStructure(
  data: GraphData,
  assignment: ReadonlyMap<string, string>,
  expanded: ReadonlySet<string>,
): CollapseStructure {
  const members = new Map<string, GraphNode[]>();
  const kept: GraphNode[] = [];
  for (const node of data.nodes) {
    const community = assignment.get(node.id);
    if (community === undefined || expanded.has(community)) {
      kept.push(node);
      continue;
    }
    // Push, not spread-and-replace: the old form copied the array on every
    // insert, which is quadratic in the size of a community.
    const group = members.get(community);
    if (group) group.push(node);
    else members.set(community, [node]);
  }

  const groups = [...members.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([community, group]) => ({
      id: `${SUPERNODE_PREFIX}${community}`,
      members: group,
      template: {
        clusterCount: group.length,
        findingCount: group.reduce((sum, node) => sum + node.findingCount, 0),
        grade: worstGrade(group),
        id: `${SUPERNODE_PREFIX}${community}`,
        label: community,
        path: `${group.length} indexed artifacts`,
        type: dominantType(group),
      },
    }));

  const representative = (nodeId: string): string => {
    const community = assignment.get(nodeId);
    return community === undefined || expanded.has(community)
      ? nodeId
      : `${SUPERNODE_PREFIX}${community}`;
  };

  const merged = new Map<string, GraphEdge>();
  for (const edge of data.edges) {
    const source = representative(edge.source);
    const target = representative(edge.target);
    if (source === target) continue;
    const key = source < target ? `${source}→${target}` : `${target}→${source}`;
    const current = merged.get(key);
    if (
      !current ||
      GRADE_SEVERITY[edge.grade] > GRADE_SEVERITY[current.grade]
    ) {
      merged.set(key, { ...edge, id: `cluster-${key}`, source, target });
    }
  }

  return { edges: [...merged.values()], groups, kept };
}

function collapseStructure(
  data: GraphData,
  assignment: ReadonlyMap<string, string>,
  expanded: ReadonlySet<string>,
): CollapseStructure {
  let byAssignment = structureCache.get(data);
  if (!byAssignment) {
    byAssignment = new WeakMap();
    structureCache.set(data, byAssignment);
  }
  let byExpanded = byAssignment.get(assignment);
  if (!byExpanded) {
    byExpanded = new Map();
    byAssignment.set(assignment, byExpanded);
  }
  // Content key, not identity: the engine mutates one long-lived `expanded`
  // set rather than replacing it.
  const key = [...expanded].sort().join(" ");
  const cached = byExpanded.get(key);
  if (cached) return cached;
  const structure = buildStructure(data, assignment, expanded);
  if (byExpanded.size >= STRUCTURE_CACHE_LIMIT) {
    const oldest = byExpanded.keys().next();
    if (!oldest.done) byExpanded.delete(oldest.value);
  }
  byExpanded.set(key, structure);
  return structure;
}

/**
 * Aggregate a graph for display. Members of collapsed communities are replaced
 * by one supernode drawn at their centroid; intra-community edges disappear,
 * inter-community edges are merged (keeping the worst grade so broken evidence
 * stays visible at every zoom).
 *
 * Everything except the centroids is cached per `(data, assignment, expanded)`
 * — see `CollapseStructure`. The returned value is a fresh object graph, so a
 * caller may hold two results at once; only the shared node and edge records
 * are, as everywhere else in this module, read-only.
 */
export function collapseGraph(input: CollapseInput): CollapsedGraph {
  const expanded = input.expanded ?? new Set<string>();
  const structure = collapseStructure(input.data, input.assignment, expanded);

  const positionOf = (node: GraphNode): Position =>
    input.positions.get(node.id) ?? { x: node.x, y: node.y };

  const nodes: GraphNode[] = [...structure.kept];
  const positions = new Map<string, Position>();
  for (const node of structure.kept) positions.set(node.id, positionOf(node));

  for (const group of structure.groups) {
    let x = 0;
    let y = 0;
    for (const node of group.members) {
      const position = positionOf(node);
      x += position.x / group.members.length;
      y += position.y / group.members.length;
    }
    nodes.push({ ...group.template, x, y });
    positions.set(group.id, { x, y });
  }

  return { data: { edges: [...structure.edges], nodes }, positions };
}
