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
 * Aggregate a graph for display. Members of collapsed communities are replaced
 * by one supernode drawn at their centroid; intra-community edges disappear,
 * inter-community edges are merged (keeping the worst grade so broken evidence
 * stays visible at every zoom).
 */
export function collapseGraph(input: CollapseInput): CollapsedGraph {
  const expanded = input.expanded ?? new Set<string>();
  const members = new Map<string, GraphNode[]>();
  for (const node of input.data.nodes) {
    const community = input.assignment.get(node.id);
    if (community === undefined || expanded.has(community)) continue;
    members.set(community, [...(members.get(community) ?? []), node]);
  }

  const positionOf = (node: GraphNode): Position =>
    input.positions.get(node.id) ?? { x: node.x, y: node.y };

  const nodes: GraphNode[] = [];
  const positions = new Map<string, Position>();

  for (const node of input.data.nodes) {
    const community = input.assignment.get(node.id);
    if (community !== undefined && !expanded.has(community)) continue;
    nodes.push(node);
    positions.set(node.id, positionOf(node));
  }

  for (const [community, group] of [...members.entries()].sort((left, right) =>
    left[0] < right[0] ? -1 : 1,
  )) {
    const id = `${SUPERNODE_PREFIX}${community}`;
    const centroid = group.reduce(
      (sum, node) => {
        const position = positionOf(node);
        return {
          x: sum.x + position.x / group.length,
          y: sum.y + position.y / group.length,
        };
      },
      { x: 0, y: 0 },
    );
    nodes.push({
      clusterCount: group.length,
      findingCount: group.reduce((sum, node) => sum + node.findingCount, 0),
      grade: worstGrade(group),
      id,
      label: community,
      path: `${group.length} indexed artifacts`,
      type: dominantType(group),
      x: centroid.x,
      y: centroid.y,
    });
    positions.set(id, centroid);
  }

  const representative = (nodeId: string): string => {
    const community = input.assignment.get(nodeId);
    return community === undefined || expanded.has(community)
      ? nodeId
      : `${SUPERNODE_PREFIX}${community}`;
  };

  const merged = new Map<string, GraphEdge>();
  for (const edge of input.data.edges) {
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

  return { data: { edges: [...merged.values()], nodes }, positions };
}
