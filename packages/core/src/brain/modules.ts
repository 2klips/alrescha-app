/**
 * Module clusters over the structure graph (Phase 3 Wave C todo 8).
 *
 * The render layer clusters with Louvain for pretty supernodes; the *data*
 * layer cannot, because Louvain is randomized and a cache key must be
 * replayable. This is deterministic label propagation: sorted node order,
 * lexicographic tie-breaks, fixed rounds — the same import/call graph always
 * yields the same clusters, which is what lets a module summary be cached
 * against a member digest (LazyGraphRAG invalidation).
 */

import { createHash } from "node:crypto";

export interface ModuleGraphEdge {
  readonly source: string;
  readonly target: string;
}

export interface ModuleCluster {
  /** Stable id: `module:` + the lexicographically smallest member path. */
  readonly key: string;
  /** Sorted member paths. */
  readonly members: readonly string[];
  /** Human name: the longest shared directory prefix, or the seed file. */
  readonly name: string;
}

const PROPAGATION_ROUNDS = 10;
/** A module needs at least this many files to be worth summarizing. */
export const MODULE_MIN_MEMBERS = 2;

function sharedDirectory(paths: readonly string[]): string {
  const split = paths.map((path) => path.split("/").slice(0, -1));
  if (split.length === 0) return "";
  let prefix = split[0] ?? [];
  for (const parts of split.slice(1)) {
    let keep = 0;
    while (
      keep < prefix.length &&
      keep < parts.length &&
      prefix[keep] === parts[keep]
    ) {
      keep += 1;
    }
    prefix = prefix.slice(0, keep);
    if (prefix.length === 0) break;
  }
  return prefix.join("/");
}

export function deriveModuleClusters(input: {
  readonly edges: readonly ModuleGraphEdge[];
  readonly paths: readonly string[];
}): ModuleCluster[] {
  const nodes = [...new Set(input.paths)].sort();
  const known = new Set(nodes);
  const neighbors = new Map<string, string[]>();
  for (const node of nodes) neighbors.set(node, []);
  for (const edge of input.edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    neighbors.get(edge.source)?.push(edge.target);
    neighbors.get(edge.target)?.push(edge.source);
  }

  // Deterministic label propagation: labels start as the node's own path;
  // each round every node (in sorted order) adopts the most frequent label
  // among its neighbours, ties broken by the smallest label.
  const labels = new Map(nodes.map((node) => [node, node]));
  for (let round = 0; round < PROPAGATION_ROUNDS; round += 1) {
    let changed = false;
    for (const node of nodes) {
      const adjacent = neighbors.get(node) ?? [];
      if (adjacent.length === 0) continue;
      const counts = new Map<string, number>();
      for (const neighbor of adjacent) {
        const label = labels.get(neighbor) as string;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestCount = 0;
      for (const [label, count] of [...counts.entries()].sort((a, b) =>
        a[0] < b[0] ? -1 : 1,
      )) {
        if (count > bestCount) {
          best = label;
          bestCount = count;
        }
      }
      if (best !== null && best !== labels.get(node)) {
        labels.set(node, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byLabel = new Map<string, string[]>();
  for (const node of nodes) {
    const label = labels.get(node) as string;
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(node);
    else byLabel.set(label, [node]);
  }

  const clusters: ModuleCluster[] = [];
  for (const members of byLabel.values()) {
    if (members.length < MODULE_MIN_MEMBERS) continue;
    members.sort();
    const seed = members[0] as string;
    const directory = sharedDirectory(members);
    clusters.push({
      key: `module:${seed}`,
      members,
      name: directory || seed,
    });
  }
  return clusters.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Member freshness digest — same md5-over-sorted-lines formula as the concept
 * digest, so SQL and TypeScript can both compute it.
 */
export function moduleMemberDigest(
  members: readonly { readonly blobSha: string; readonly path: string }[],
): string {
  const joined = [...members]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.path}:${entry.blobSha}`)
    .join("\n");
  return createHash("md5").update(joined).digest("hex");
}

/** Display name for a member set — shared directory, or the seed file. */
export function moduleNameForMembers(members: readonly string[]): string {
  const sorted = [...members].sort();
  return sharedDirectory(sorted) || (sorted[0] ?? "");
}

/** The cluster containing a path, if any. */
export function moduleClusterOf(
  clusters: readonly ModuleCluster[],
  path: string,
): ModuleCluster | null {
  return clusters.find((cluster) => cluster.members.includes(path)) ?? null;
}
