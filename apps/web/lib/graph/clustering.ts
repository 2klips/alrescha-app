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

export type HierarchyLevel = "far" | "mid";

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

/** `a/b/c.ts` is under `a/b`; `a/bc` is not. */
function under(path: string, directory: string): boolean {
  return directory.length > 0 && path.startsWith(`${directory}/`);
}

/**
 * Which directory a node belongs to, at a given zoom (Phase 4 Wave B todo 13).
 *
 * Louvain answers a question nobody asked. It finds communities in the *edge*
 * structure, so its groups are named `c7` and their membership shifts when an
 * import is added — a supernode that was "the auth module" last scan is a
 * different set of files this one, with no way for a reader to tell. A
 * repository already has a grouping everyone agrees on, and it is the
 * directory tree.
 *
 * So Far groups by package (or, where a repository declares none, by the
 * two-deep folder) and Mid groups by the folder a file is actually in. Both
 * are stable across scans, both have names a person recognises, and the
 * supernode can *be* the directory node rather than a synthetic stand-in.
 *
 * Louvain stays as the fallback for data with no hierarchy at all — every
 * demo fixture is in that state, and grouping those by a path they do not
 * have would collapse the whole graph to one dot.
 */
export function hierarchyAssignment(
  data: GraphData,
  level: HierarchyLevel,
  options: CommunityOptions = {},
): Map<string, string> {
  const directories = data.nodes.filter((node) => node.type === "directory");
  if (directories.length === 0) return communityAssignment(data, options);

  // Longest path first, so a lookup finds the most specific folder first.
  const byPath = [...directories].sort(
    (left, right) => right.path.length - left.path.length,
  );
  const packages = byPath.filter((node) => node.role === "package");

  const owner = (node: GraphNode): string | null => {
    const path = node.path.split(":")[0] ?? "";
    if (path.length === 0) return null;
    if (level === "far") {
      // A package is the landmark a reader navigates by. Where a repository
      // declares none, two segments is the depth at which a folder name still
      // means something: `apps/web`, not `apps` and not `apps/web/lib/graph`.
      const owningPackage = packages.find((entry) => under(path, entry.path));
      if (owningPackage) return owningPackage.id;
      const prefix = path.split("/").slice(0, 2).join("/");
      const folder = byPath.find((entry) => entry.path === prefix);
      if (folder) return folder.id;
      return prefix.length > 0 ? prefix : null;
    }
    const leaf = byPath.find((entry) => under(path, entry.path));
    return leaf ? leaf.id : null;
  };

  const assignment = new Map<string, string>();
  for (const node of data.nodes) {
    // A directory is its own group, so a folder never vanishes into its
    // parent and then reappears as one of that parent's members.
    const community =
      node.type === "directory"
        ? node.id
        : (owner(node) ?? folderCommunity(node));
    assignment.set(node.id, community);
  }
  return assignment;
}

/**
 * Directory nodes keyed by the community `hierarchyAssignment` gives them, so
 * a supernode can carry the folder's own name and path instead of a
 * synthesised label.
 */
export function hierarchyTemplates(data: GraphData): Map<string, GraphNode> {
  return new Map(
    data.nodes
      .filter((node) => node.type === "directory")
      .map((node) => [node.id, node]),
  );
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
  /**
   * Community key → the node that *is* that community, when there is one
   * (todo 13). With a hierarchy assignment this is the directory node, so a
   * supernode carries the folder's own name and path.
   */
  templates?: ReadonlyMap<string, GraphNode>;
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
  templates: ReadonlyMap<string, GraphNode> | undefined,
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
    .map(([community, group]) => {
      // The folder itself, when the assignment is a hierarchy (todo 13). A
      // supernode then carries a name a reader recognises and a path they can
      // open, instead of `c7` and "412 indexed artifacts".
      const folder = templates?.get(community);
      return {
        id: `${SUPERNODE_PREFIX}${community}`,
        members: group,
        template: {
          clusterCount: group.length,
          findingCount: group.reduce((sum, node) => sum + node.findingCount, 0),
          grade: worstGrade(group),
          id: `${SUPERNODE_PREFIX}${community}`,
          label: folder ? folder.label : community,
          path: folder ? folder.path : `${group.length} indexed artifacts`,
          // A folder stays a folder: it keeps its ring shape rather than
          // taking the shape of whatever it happens to contain most of.
          type: folder ? folder.type : dominantType(group),
        },
      };
    });

  const representative = (nodeId: string): string => {
    const community = assignment.get(nodeId);
    return community === undefined || expanded.has(community)
      ? nodeId
      : `${SUPERNODE_PREFIX}${community}`;
  };

  const merged = new Map<string, GraphEdge>();
  /** How many real edges each merged one stands for, for its thickness. */
  const counts = new Map<string, number>();
  for (const edge of data.edges) {
    const source = representative(edge.source);
    const target = representative(edge.target);
    if (source === target) continue;
    const key = source < target ? `${source}→${target}` : `${target}→${source}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const current = merged.get(key);
    if (
      !current ||
      GRADE_SEVERITY[edge.grade] > GRADE_SEVERITY[current.grade]
    ) {
      merged.set(key, { ...edge, id: `cluster-${key}`, source, target });
    }
  }

  return {
    edges: [...merged.entries()].map(([key, edge]) => ({
      ...edge,
      // One line between two folders can stand for one import or four
      // hundred, and drawn identically it says the same thing about both.
      mergedCount: counts.get(key) ?? 1,
    })),
    groups,
    kept,
  };
}

function collapseStructure(
  data: GraphData,
  assignment: ReadonlyMap<string, string>,
  expanded: ReadonlySet<string>,
  templates: ReadonlyMap<string, GraphNode> | undefined,
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
  const key = [...expanded].sort().join("\u0000");
  const cached = byExpanded.get(key);
  if (cached) return cached;
  const structure = buildStructure(data, assignment, expanded, templates);
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
  const structure = collapseStructure(
    input.data,
    input.assignment,
    expanded,
    input.templates,
  );

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
