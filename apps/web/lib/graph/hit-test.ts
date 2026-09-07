/**
 * Canvas hit testing for the brain map (Phase 4 Wave B todo 10).
 *
 * The pointer used to reach nodes through the DOM hit layer: one `<button>`
 * per node, parked over its painted position. That layer is capped, because
 * six hundred buttons is already a lot of DOM to reposition as the camera
 * moves — and a live scan of this repository produces **1,260 nodes**. Past
 * the cap a node was painted and could not be clicked. Nothing looked wrong;
 * those nodes were simply inert.
 *
 * So the pointer hits the canvas now. The DOM layer stays, smaller, for the
 * job only it can do — keyboard and assistive technology need real focusable
 * elements — and stops pretending to be the pointer's route.
 *
 * The index is built in **world** space, which is the space `RenderNode`
 * carries and the space the layout moves in. A camera move then costs
 * nothing: panning and zooming do not rebuild it, because nothing about the
 * graph changed.
 */

import { quadtree, type Quadtree } from "d3-quadtree";

import { screenToWorld } from "./camera";
import type { RenderFrame, RenderNode, Viewport } from "./render-frame";

/**
 * Smallest disc a pointer can land on, in screen pixels, whatever the node's
 * painted radius. Zoomed out a node is two pixels across, and asking anyone
 * to hit that is asking them to fail. It matches the DOM layer's own minimum
 * so the two affordances agree about how big a node is to a hand.
 */
export const MIN_HIT_RADIUS = 10;

export interface HitIndex {
  /**
   * The node under this point on screen, or null.
   *
   * Ties go to the *smaller* node. A small node drawn over a hub is the one
   * a viewer is aiming at — the hub is reachable across the rest of its own
   * area, and the small one is reachable nowhere else.
   */
  at(screenX: number, screenY: number): RenderNode | null;
  readonly size: number;
}

const EMPTY: HitIndex = { at: () => null, size: 0 };

/**
 * Build the index for a painted frame.
 *
 * Nodes faded out by a focus mode stay in it. They are still on screen, and
 * a viewer pointing at one means that one: a hit test that skipped them would
 * make "what I can see" and "what I can click" two different sets.
 */
export function buildHitIndex(
  frame: RenderFrame,
  viewport: Viewport,
): HitIndex {
  if (frame.nodes.length === 0) return EMPTY;
  const { camera } = frame;

  const tree: Quadtree<RenderNode> = quadtree<RenderNode>()
    .x((node) => node.x)
    .y((node) => node.y)
    .addAll([...frame.nodes]);

  /** A node's clickable radius in world units at this zoom. */
  const reachOf = (node: RenderNode): number =>
    Math.max(MIN_HIT_RADIUS / camera.scale, node.radius);

  // The quadtree finds candidates by centre distance, so the search has to
  // cover the largest node's own reach: a hub whose centre is far away can
  // still be under the pointer. Bounding it by the widest painted node keeps
  // the query from degenerating into a scan of everything.
  const widest = frame.nodes.reduce(
    (widestSoFar, node) => Math.max(widestSoFar, reachOf(node)),
    MIN_HIT_RADIUS / camera.scale,
  );

  return {
    at(screenX, screenY) {
      const point = screenToWorld(camera, viewport, { x: screenX, y: screenY });
      let best: RenderNode | null = null;
      let bestReach = Number.POSITIVE_INFINITY;
      tree.visit((node, x0, y0, x1, y1) => {
        // Prune whole quadrants that cannot hold a hit.
        if (
          x0 > point.x + widest ||
          x1 < point.x - widest ||
          y0 > point.y + widest ||
          y1 < point.y - widest
        ) {
          return true;
        }
        if (!("length" in node)) {
          for (
            let leaf: typeof node | undefined = node;
            leaf;
            leaf = leaf.next
          ) {
            const candidate = leaf.data;
            const reach = reachOf(candidate);
            const distance = Math.hypot(
              candidate.x - point.x,
              candidate.y - point.y,
            );
            if (distance > reach) continue;
            if (reach < bestReach) {
              best = candidate;
              bestReach = reach;
            }
          }
        }
        return false;
      });
      return best;
    },
    size: frame.nodes.length,
  };
}
