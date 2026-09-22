import type { GraphNodeShape } from "../dashboard/graph-model";
import type { LodLevel } from "./lod";

/**
 * The symbol halo (Phase 4 Wave F todo 26, R5 §2.1 ③ / §2.4).
 *
 * A file's exported symbols are not nodes of the galaxy: they are loaded for
 * the file a person is looking at, and drawn around it. The arrangement is
 * Vogel's sunflower — the i-th symbol sits at angle i × golden angle and at
 * a radius that grows with √i — because that is the one placement that
 * keeps N points evenly spread around a centre for any N without a layout
 * pass, and the symbols take **no part in the simulation**: their
 * positions are a pure function of the owner's, recomputed each frame.
 *
 * The halo is a Near-zoom affordance, like status badges: at Mid and Far a
 * symbol folds into its owner (the `symbolOwner` collapse is exactly the
 * `declares` edge, read the other way), and the frame carries no item.
 */

export interface HaloSymbol {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
}

/** One file's layer, as the loader hands it to the engine. */
export interface SymbolHalo {
  readonly ownerId: string;
  readonly symbols: readonly HaloSymbol[];
}

export interface RenderHaloItem {
  color: number;
  id: string;
  kind: string;
  /** Whether the frame writes its name: false in the sector the owner's own label occupies. */
  labelled: boolean;
  name: string;
  radius: number;
  shape: GraphNodeShape;
  x: number;
  y: number;
}

export interface RenderHalo {
  items: RenderHaloItem[];
  /** Symbols past the draw limit — said, not silently dropped. */
  overflow: number;
  ownerId: string;
}

/** π(3 − √5): the angle that never repeats, so no two symbols share a spoke. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** A barrel with two hundred exports gets a ring, not a shroud. */
export const HALO_DRAW_LIMIT = 64;

/** How many halo items get a name written beside them at Near zoom. */
export const HALO_LABEL_LIMIT = 24;

/**
 * The owner's own label sits to its right; an item whose direction is within
 * this angle of it keeps its shape and loses its name, rather than writing
 * over the file's.
 */
export const OWNER_LABEL_SECTOR = 0.35;

/**
 * The four-shape grammar, for symbols: a class is a square (a structure), an
 * interface or type is a diamond (a contract), a function is a circle (a
 * thing that runs), everything else a ring.
 */
export function haloShapeFor(kind: string): GraphNodeShape {
  switch (kind) {
    case "class":
    case "struct":
      return "square";
    case "interface":
    case "type":
      return "diamond";
    case "function":
      return "circle";
    default:
      return "ring";
  }
}

export interface HaloOwner {
  readonly color: number;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Place a halo around its owner. Radius `s` of a symbol follows the owner's
 * (a third of it, bounded so a hub's halo is still legible); the first ring
 * clears the owner by three symbol radii and the spiral opens by 2.2·s per
 * √i, which keeps neighbouring items at least a diameter apart.
 */
export function layoutHalo(
  owner: HaloOwner,
  symbols: readonly HaloSymbol[],
  limit: number = HALO_DRAW_LIMIT,
): RenderHalo["items"] {
  const s = Math.min(4, Math.max(1.2, owner.radius * 0.32));
  const base = owner.radius + 3 * s;
  const spacing = 2.2 * s;
  return symbols.slice(0, limit).map((symbol, index) => {
    // From one golden angle, not zero: the first item lands upper-left, off
    // the side where the owner's label is written.
    const angle = (index + 1) * GOLDEN_ANGLE;
    const heading = Math.atan2(Math.sin(angle), Math.cos(angle));
    const distance = base + spacing * Math.sqrt(index);
    return {
      color: owner.color,
      id: symbol.id,
      kind: symbol.kind,
      labelled: Math.abs(heading) > OWNER_LABEL_SECTOR,
      name: symbol.name,
      radius: s,
      shape: haloShapeFor(symbol.kind),
      x: owner.x + Math.cos(angle) * distance,
      y: owner.y + Math.sin(angle) * distance,
    };
  });
}

/**
 * The halo a frame carries: the loaded layer, placed around its owner, at
 * Near zoom only, and only while the owner is on the frame — a collapsed
 * or filtered-out file has nothing to orbit.
 */
export function haloFor(input: {
  readonly halo: SymbolHalo | null | undefined;
  readonly lod: LodLevel;
  readonly owner: HaloOwner | undefined;
}): RenderHalo | null {
  const { halo, lod, owner } = input;
  if (!halo || lod !== "near" || !owner || halo.symbols.length === 0) {
    return null;
  }
  return {
    items: layoutHalo(owner, halo.symbols),
    overflow: Math.max(0, halo.symbols.length - HALO_DRAW_LIMIT),
    ownerId: halo.ownerId,
  };
}
