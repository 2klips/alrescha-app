/**
 * Zoom level-of-detail and label decluttering (Phase 2A todo 5).
 *
 * Normative source: `spec/RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` §5-① —
 * three levels (Far / Mid / Near) and the Sigma-style grid selection ("one top
 * label per screen cell, nodes under a pixel-size threshold get none").
 *
 * Every decision here is a pure function of screen-space geometry, so the LOD
 * bands and the label set are asserted deterministically instead of by
 * screenshotting a canvas.
 */

import type { Viewport } from "./render-frame";

export const LOD_LEVELS = ["far", "mid", "near"] as const;

export type LodLevel = (typeof LOD_LEVELS)[number];

/**
 * Node diameter in CSS pixels at which each level begins. Tying the level to
 * rendered node size rather than raw zoom keeps the bands stable when the
 * degree-scaled radii change.
 */
export const LOD_PIXEL_THRESHOLDS = { mid: 8, near: 18 } as const;

/** Below this rendered size a node never gets a label (Sigma's `label_rendered_size_threshold`). */
export const LABEL_SIZE_THRESHOLD = 6;

/** Screen-space label grid cell, in CSS pixels (Sigma's `label_grid_cell_size`). */
export const LABEL_GRID_CELL_SIZE = 96;

/** Hub labels kept at Far zoom, where the grid would otherwise show nothing. */
export const FAR_HUB_LABEL_LIMIT = 6;

/** Obsidian's single "text fade threshold" slider, normalised to 0…1. */
export const DEFAULT_TEXT_FADE_THRESHOLD = 0.5;

export function nodePixelSize(radius: number, scale: number): number {
  return radius * 2 * scale;
}

export function lodForPixelSize(pixelSize: number): LodLevel {
  if (pixelSize >= LOD_PIXEL_THRESHOLDS.near) return "near";
  if (pixelSize >= LOD_PIXEL_THRESHOLDS.mid) return "mid";
  return "far";
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * The level for a whole view. The median radius decides it, so one enormous
 * hub cannot drag an otherwise-distant view into Near.
 */
export function resolveLod(radii: readonly number[], scale: number): LodLevel {
  return lodForPixelSize(nodePixelSize(median(radii), scale));
}

export interface LabelCandidate {
  degree: number;
  id: string;
  label: string;
  pixelSize: number;
  screenX: number;
  screenY: number;
}

export interface LabelSelectionOptions {
  cellSize?: number;
  farHubLimit?: number;
  lod: LodLevel;
  /** 0…1 slider: higher fades more labels out. */
  textFadeThreshold?: number;
  viewport: Viewport;
}

/** Off-screen labels cost text uploads for nothing; a small margin avoids popping at the edge. */
const VIEWPORT_MARGIN = 48;

function onScreen(candidate: LabelCandidate, viewport: Viewport): boolean {
  return (
    candidate.screenX >= -VIEWPORT_MARGIN &&
    candidate.screenY >= -VIEWPORT_MARGIN &&
    candidate.screenX <= viewport.width + VIEWPORT_MARGIN &&
    candidate.screenY <= viewport.height + VIEWPORT_MARGIN
  );
}

/**
 * Ranking used both for "best in cell" and for the Far hub list. Degree first
 * (the constellation's bright stars), then rendered size, then id — the id tie
 * break is what makes the selection reproducible across runs.
 */
function betterThan(left: LabelCandidate, right: LabelCandidate): boolean {
  if (left.degree !== right.degree) return left.degree > right.degree;
  if (left.pixelSize !== right.pixelSize)
    return left.pixelSize > right.pixelSize;
  return left.id < right.id;
}

/**
 * The rendered-size floor a label must clear. The slider scales it, so dragging
 * "text fade threshold" up thins labels out exactly the way Obsidian's does.
 */
export function labelSizeFloor(
  lod: LodLevel,
  textFadeThreshold = DEFAULT_TEXT_FADE_THRESHOLD,
): number {
  const fade = Math.min(1, Math.max(0, textFadeThreshold));
  if (lod === "near") return LABEL_SIZE_THRESHOLD * (0.4 + fade * 0.6);
  return LABEL_SIZE_THRESHOLD * (0.6 + fade * 1.4);
}

/**
 * The label set for one frame, returned sorted by id so the result is a stable
 * value rather than an iteration-order accident.
 *
 * - Far: the top-N hubs only.
 * - Mid: one best label per screen-space grid cell, above the size floor.
 * - Near: every on-screen label above a relaxed floor.
 */
export function selectLabels(
  candidates: readonly LabelCandidate[],
  options: LabelSelectionOptions,
): string[] {
  const visible = candidates.filter((candidate) =>
    onScreen(candidate, options.viewport),
  );

  if (options.lod === "far") {
    const limit = options.farHubLimit ?? FAR_HUB_LABEL_LIMIT;
    if (limit <= 0) return [];
    const hubs = [...visible]
      .sort((left, right) => (betterThan(left, right) ? -1 : 1))
      .slice(0, limit);
    return hubs.map((candidate) => candidate.id).sort();
  }

  const floor = labelSizeFloor(options.lod, options.textFadeThreshold);
  const eligible = visible.filter((candidate) => candidate.pixelSize >= floor);

  if (options.lod === "near") {
    return eligible.map((candidate) => candidate.id).sort();
  }

  const cellSize = options.cellSize ?? LABEL_GRID_CELL_SIZE;
  const best = new Map<string, LabelCandidate>();
  for (const candidate of eligible) {
    const cell = `${Math.floor(candidate.screenX / cellSize)}:${Math.floor(
      candidate.screenY / cellSize,
    )}`;
    const current = best.get(cell);
    if (!current || betterThan(candidate, current)) best.set(cell, candidate);
  }
  return [...best.values()].map((candidate) => candidate.id).sort();
}

/** Status badges are a Near-zoom affordance only. */
export function showsStatusBadges(lod: LodLevel): boolean {
  return lod === "near";
}
