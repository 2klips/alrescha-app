/**
 * How big a node is, in layout units.
 *
 * Split out of `render-frame` in Phase 4 Wave B todo 11, because the layout
 * needs it too: `forceCollide` keeps nodes from overlapping, and it can only
 * do that if its idea of a node's size is the renderer's idea of a node's
 * size. Two copies of this curve would let the physics separate nodes to a
 * distance the paint then covers up.
 */

/** Importance-proportional dot size — the Obsidian "constellation" cue. */
export function nodeRadius(degree: number, clusterCount?: number): number {
  const base = 3.2 + Math.sqrt(Math.max(0, degree)) * 1.9;
  const size = clusterCount
    ? base + Math.min(14, Math.sqrt(clusterCount) * 2.4)
    : base;
  return Math.min(26, size);
}
