/**
 * Wire protocol between the main thread and the d3-force Web Worker
 * (Phase 2A todo 4; RESEARCH_GRAPH_DATABRAIN §5-① "simulation and render split").
 *
 * Everything here is pure so the protocol can be exercised without a Worker,
 * a DOM or a GPU. Positions travel as a transferable `Float32Array` — the
 * worker allocates one buffer per frame and hands ownership to the main
 * thread, so no structured clone of the node array ever happens.
 */

import type { GraphData } from "../dashboard/graph-model";

/** The four Obsidian force sliders (help.obsidian.md/plugins/graph). */
export interface ForceConfig {
  /** Pull towards the origin. */
  centerStrength: number;
  /** Rest length of a link, in layout units. */
  linkDistance: number;
  /** Spring stiffness of a link. */
  linkStrength: number;
  /** Many-body repulsion magnitude (applied as a negative charge). */
  repelStrength: number;
}

export const DEFAULT_FORCE_CONFIG: ForceConfig = {
  centerStrength: 0.12,
  linkDistance: 90,
  linkStrength: 0.55,
  repelStrength: 260,
};

export const FORCE_LIMITS: Readonly<
  Record<keyof ForceConfig, { max: number; min: number }>
> = {
  centerStrength: { max: 1, min: 0 },
  linkDistance: { max: 400, min: 10 },
  linkStrength: { max: 1, min: 0 },
  repelStrength: { max: 2_000, min: 0 },
};

export const FORCE_KEYS = Object.keys(FORCE_LIMITS) as (keyof ForceConfig)[];

function clampValue(key: keyof ForceConfig, value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const limit = FORCE_LIMITS[key];
  return Math.min(limit.max, Math.max(limit.min, value));
}

/**
 * Merge a partial config onto the defaults, clamping to the published slider
 * range and ignoring anything non-numeric. A HUD slider, a persisted profile
 * and a worker message all go through this one door.
 */
export function clampForceConfig(
  partial?: Partial<ForceConfig> | null,
): ForceConfig {
  const config = { ...DEFAULT_FORCE_CONFIG };
  if (!partial) return config;
  for (const key of FORCE_KEYS) {
    const clamped = clampValue(key, partial[key]);
    if (clamped !== null) config[key] = clamped;
  }
  return config;
}

/** Two floats per node: `[x0, y0, x1, y1, …]`. */
export const POSITION_STRIDE = 2;

export interface Position {
  x: number;
  y: number;
}

export function encodePositions(
  positions: readonly Position[],
): Float32Array<ArrayBuffer> {
  const buffer = new Float32Array(positions.length * POSITION_STRIDE);
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index] as Position;
    buffer[index * POSITION_STRIDE] = position.x;
    buffer[index * POSITION_STRIDE + 1] = position.y;
  }
  return buffer;
}

/**
 * Rehydrate `id → {x, y}`. Extra ids (a node added since the frame was
 * produced) are skipped rather than read as `NaN`.
 */
export function decodePositions(
  nodeIds: readonly string[],
  buffer: Float32Array,
): Map<string, Position> {
  const positions = new Map<string, Position>();
  const usable = Math.min(
    nodeIds.length,
    Math.floor(buffer.length / POSITION_STRIDE),
  );
  for (let index = 0; index < usable; index += 1) {
    positions.set(nodeIds[index] as string, {
      x: buffer[index * POSITION_STRIDE] as number,
      y: buffer[index * POSITION_STRIDE + 1] as number,
    });
  }
  return positions;
}

/**
 * Edge families, in the order their wire code indexes (Phase 4 Wave B todo
 * 11). A family travels as a number for the same reason a node does: links
 * never carry strings across the wire.
 *
 * `structure` is first because it is the baseline the sliders are calibrated
 * against — see `LINK_FAMILY_FORCES`.
 */
export const LINK_FAMILIES = [
  "structure",
  "doc",
  "hierarchy",
  "database",
  "route",
  "statistical",
  "semantic",
  "evidence",
] as const;

export type LinkFamily = (typeof LINK_FAMILIES)[number];

/**
 * What each family does to a spring, at the default slider positions.
 *
 * The same relation means different things depending on who wrote it, and a
 * layout that pulls all of them equally hard says they are all the same kind
 * of relatedness. They are not:
 *
 * - `structure` is the baseline — an import is the strongest claim that two
 *   files belong together, and its numbers are exactly the old defaults, so
 *   a repository with no family data lays out precisely as it did before.
 * - `hierarchy` (a directory containing a file) is short and slack: it is
 *   real containment, so members should sit near their folder, but it is not
 *   a dependency and must not out-pull one.
 * - `statistical` (co-change) is the weakest and longest. Two files that
 *   changed together are a hint, not a wire, and letting a correlation drag
 *   the layout as hard as an import is exactly how a graph starts asserting
 *   things nobody measured.
 * - `evidence` and `route` sit near structure because a test that runs a file
 *   and a route that reaches a handler are both real, traversable paths.
 *
 * Applied as a **ratio to the structure baseline**, so the sliders still
 * mean what they say: moving `linkStrength` scales the whole spread rather
 * than flattening it.
 */
export const LINK_FAMILY_FORCES: Readonly<
  Record<LinkFamily, { readonly distance: number; readonly strength: number }>
> = {
  database: { distance: 100, strength: 0.4 },
  doc: { distance: 120, strength: 0.3 },
  evidence: { distance: 90, strength: 0.45 },
  hierarchy: { distance: 30, strength: 0.3 },
  route: { distance: 70, strength: 0.45 },
  semantic: { distance: 110, strength: 0.3 },
  statistical: { distance: 140, strength: 0.1 },
  structure: { distance: 90, strength: 0.55 },
};

/** The family every other one is expressed relative to. */
export const BASELINE_LINK_FAMILY: LinkFamily = "structure";

/**
 * A family's wire code. An edge with no family — every demo fixture — is
 * `structure`, whose numbers are the defaults, so nothing about the existing
 * layout changes by adding this.
 */
export function linkFamilyCode(family?: string | null): number {
  const index = LINK_FAMILIES.indexOf(family as LinkFamily);
  return index === -1 ? LINK_FAMILIES.indexOf(BASELINE_LINK_FAMILY) : index;
}

export function linkFamilyOf(code: number): LinkFamily {
  return LINK_FAMILIES[code] ?? BASELINE_LINK_FAMILY;
}

/** Index pair into `nodeIds`, plus the family code (todo 11). */
export type LinkPair = readonly [number, number, number];

export type SimulationHostMessage =
  | {
      config: ForceConfig;
      links: readonly LinkPair[];
      nodeIds: readonly string[];
      seed: number;
      type: "start";
    }
  | { config: Partial<ForceConfig>; type: "config" }
  /**
   * Hold a node at a point while a pointer drags it (todo 11). Sent on every
   * pointer move, so it carries the position rather than asking the worker
   * to track one.
   */
  | { slot: number; type: "pin"; x: number; y: number }
  /** Let go. The node rejoins the physics from wherever it was left. */
  | { slot: number; type: "unpin" }
  /** Wake a settled layout without changing anything about it. */
  | { type: "reheat" }
  | { type: "stop" };

export type SimulationWorkerMessage =
  | { nodeCount: number; type: "ready" }
  | {
      alpha: number;
      positions: Float32Array;
      revision: number;
      type: "positions";
    }
  | { revision: number; type: "settled" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validate a message arriving at the worker; `null` means "drop it". */
export function parseHostMessage(value: unknown): SimulationHostMessage | null {
  if (!isRecord(value)) return null;
  if (value.type === "stop") return { type: "stop" };
  if (value.type === "config") {
    if (!isRecord(value.config)) return null;
    const config: Partial<ForceConfig> = {};
    for (const key of FORCE_KEYS) {
      const clamped = clampValue(key, value.config[key]);
      if (clamped !== null) config[key] = clamped;
    }
    return { config, type: "config" };
  }
  if (value.type === "reheat") return { type: "reheat" };
  if (value.type === "pin" || value.type === "unpin") {
    const slot = value.slot;
    if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
      return null;
    }
    if (value.type === "unpin") return { slot, type: "unpin" };
    // A pin without a finite point is not a pin: `fx = NaN` fixes a node at
    // nowhere and takes the rest of the layout with it.
    if (
      typeof value.x !== "number" ||
      typeof value.y !== "number" ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y)
    ) {
      return null;
    }
    return { slot, type: "pin", x: value.x, y: value.y };
  }
  if (value.type !== "start") return null;
  if (!Array.isArray(value.nodeIds) || !Array.isArray(value.links)) return null;
  const nodeIds = value.nodeIds.filter(
    (id): id is string => typeof id === "string",
  );
  if (nodeIds.length !== value.nodeIds.length) return null;
  const links: LinkPair[] = [];
  for (const link of value.links) {
    if (!Array.isArray(link) || link.length !== 3) return null;
    const [source, target, family] = link as [unknown, unknown, unknown];
    if (
      typeof source !== "number" ||
      typeof target !== "number" ||
      typeof family !== "number"
    ) {
      return null;
    }
    if (
      !Number.isInteger(source) ||
      !Number.isInteger(target) ||
      source < 0 ||
      target < 0 ||
      source >= nodeIds.length ||
      target >= nodeIds.length
    ) {
      return null;
    }
    // An unknown family code is read as the baseline rather than dropped: a
    // link the layout cannot classify is still a link, and losing it would
    // change the shape of the graph over a vocabulary mismatch.
    links.push([source, target, linkFamilyCode(linkFamilyOf(family))]);
  }
  return {
    config: clampForceConfig(value.config as Partial<ForceConfig>),
    links,
    nodeIds,
    seed: typeof value.seed === "number" ? value.seed : 1,
    type: "start",
  };
}

/** Validate a message arriving on the main thread; `null` means "drop it". */
export function parseWorkerMessage(
  value: unknown,
): SimulationWorkerMessage | null {
  if (!isRecord(value)) return null;
  if (value.type === "ready" && typeof value.nodeCount === "number") {
    return { nodeCount: value.nodeCount, type: "ready" };
  }
  if (value.type === "settled" && typeof value.revision === "number") {
    return { revision: value.revision, type: "settled" };
  }
  if (
    value.type === "positions" &&
    value.positions instanceof Float32Array &&
    typeof value.revision === "number" &&
    typeof value.alpha === "number"
  ) {
    return {
      alpha: value.alpha,
      positions: value.positions,
      revision: value.revision,
      type: "positions",
    };
  }
  return null;
}

/**
 * Build the `start` message for a graph. Edges whose endpoints are missing are
 * dropped here rather than crashing the worker mid-simulation.
 */
export function createStartMessage(
  data: GraphData,
  config?: Partial<ForceConfig>,
  seed = 1,
): Extract<SimulationHostMessage, { type: "start" }> {
  const nodeIds = data.nodes.map((node) => node.id);
  const indexById = new Map(nodeIds.map((id, index) => [id, index]));
  const links: LinkPair[] = [];
  /**
   * One spring per node *pair*, not per edge. Two files that both import and
   * call each other are one relationship as far as the layout is concerned;
   * counting it twice doubled the pull on exactly the pairs that already sit
   * closest, and the derived `tests` relation would have made it three
   * (R5 §2.2 D3). Direction is irrelevant to a spring, so the key is ordered.
   */
  /** Pair key → where its spring sits in `links`, so a stronger family can replace it in place. */
  const slotOfPair = new Map<number, number>();
  for (const edge of data.edges) {
    const source = indexById.get(edge.source);
    const target = indexById.get(edge.target);
    if (source === undefined || target === undefined || source === target)
      continue;
    const low = source < target ? source : target;
    const high = source < target ? target : source;
    const key = low * nodeIds.length + high;
    const family = linkFamilyCode(edge.family);
    const at = slotOfPair.get(key);
    if (at === undefined) {
      slotOfPair.set(key, links.length);
      links.push([source, target, family]);
      continue;
    }
    // One pair, one spring — but which family? The **strongest** one wins.
    // Two files joined by both an import and a co-change are wired together;
    // letting the weaker claim decide the spring would file a real
    // dependency under "they tend to change at the same time".
    const existing = links[at] as LinkPair;
    if (
      LINK_FAMILY_FORCES[linkFamilyOf(family)].strength >
      LINK_FAMILY_FORCES[linkFamilyOf(existing[2])].strength
    ) {
      links[at] = [existing[0], existing[1], family];
    }
  }
  return {
    config: clampForceConfig(config),
    links,
    nodeIds,
    seed,
    type: "start",
  };
}
