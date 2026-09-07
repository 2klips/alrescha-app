/**
 * Which nodes get a DOM hit target, and how many (Phase 4 Wave B todo 10).
 *
 * Pure graph arithmetic, kept out of the component so a browser test can
 * import the budget it is asserting against without pulling JSX into a
 * config that does not compile it.
 */

import type { GraphData, GraphNode } from "../dashboard/graph-model";

/**
 * Upper bound on DOM hit targets — an **accessibility** budget now, not a
 * pointer one (Phase 4 Wave B todo 10).
 *
 * The layer used to be how the pointer reached a node, so the cap was also a
 * cap on what was clickable: a live scan of this repository produces 1,260
 * nodes, and past 600 a node was painted and inert. The canvas hit-tests
 * itself now, so every painted node is reachable by pointer whatever this
 * number is.
 *
 * What remains is the job only DOM can do: keyboard traversal and assistive
 * technology, which need real focusable elements. That is a list to walk, and
 * a list of 600 is not one — 200 highest-degree nodes is a reachable set,
 * costs a third of the DOM writes per camera move, and the roving tabindex
 * makes it one tab stop either way.
 */
export const HIT_TARGET_LIMIT = 200;

/** The nodes that get a DOM hit target: highest degree first, capped. */
export function hitTargets(
  data: GraphData,
  limit = HIT_TARGET_LIMIT,
): GraphNode[] {
  if (data.nodes.length <= limit) return [...data.nodes];
  const degrees = new Map<string, number>();
  for (const edge of data.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return [...data.nodes]
    .sort((left, right) => {
      const delta = (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0);
      return delta === 0 ? left.id.localeCompare(right.id) : delta;
    })
    .slice(0, limit);
}
