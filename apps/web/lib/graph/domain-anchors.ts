import { BRAIN_AREAS, type BrainArea } from "@alrescha/core/artifact-facets";

import { graphNodeArea, type GraphData } from "../dashboard/graph-model";
import type { AnchorPoint } from "./simulation-protocol";

/**
 * Where each Data Brain area lives when the domain anchor slider is on
 * (Phase 4 Wave B todo 13 ⓓ).
 *
 * The anchors sit on a circle, one per area in `BRAIN_AREAS` order, so the
 * bands separate radially rather than stacking. The radius is a layout
 * distance, not a screen one: it is a few link lengths out from the origin,
 * far enough that a weak pull (≤ 0.05) can tell the bands apart and near
 * enough that it never overpowers a link. A node's area is the same answer
 * the colour bands and the overview use (`graphNodeArea`), so an anchor is
 * never a second opinion about where a file belongs.
 */
export const DOMAIN_ANCHOR_RADIUS = 420;

export function domainAnchorPoint(area: BrainArea): readonly [number, number] {
  const index = Math.max(0, BRAIN_AREAS.indexOf(area));
  const angle = (index / BRAIN_AREAS.length) * Math.PI * 2 - Math.PI / 2;
  return [
    Math.round(Math.cos(angle) * DOMAIN_ANCHOR_RADIUS),
    Math.round(Math.sin(angle) * DOMAIN_ANCHOR_RADIUS),
  ];
}

/** One anchor per node, in `data.nodes` order — the layout's slot order. */
export function domainAnchorsFor(data: GraphData): AnchorPoint[] {
  return data.nodes.map((node) => domainAnchorPoint(graphNodeArea(node)));
}
