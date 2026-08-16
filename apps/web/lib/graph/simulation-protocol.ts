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

/** Index pair into `nodeIds` — links never carry strings across the wire. */
export type LinkPair = readonly [number, number];

export type SimulationHostMessage =
  | {
      config: ForceConfig;
      links: readonly LinkPair[];
      nodeIds: readonly string[];
      seed: number;
      type: "start";
    }
  | { config: Partial<ForceConfig>; type: "config" }
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
  if (value.type !== "start") return null;
  if (!Array.isArray(value.nodeIds) || !Array.isArray(value.links)) return null;
  const nodeIds = value.nodeIds.filter(
    (id): id is string => typeof id === "string",
  );
  if (nodeIds.length !== value.nodeIds.length) return null;
  const links: LinkPair[] = [];
  for (const link of value.links) {
    if (!Array.isArray(link) || link.length !== 2) return null;
    const [source, target] = link as [unknown, unknown];
    if (typeof source !== "number" || typeof target !== "number") return null;
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
    links.push([source, target]);
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
  for (const edge of data.edges) {
    const source = indexById.get(edge.source);
    const target = indexById.get(edge.target);
    if (source === undefined || target === undefined || source === target)
      continue;
    links.push([source, target]);
  }
  return { config: clampForceConfig(config), links, nodeIds, seed, type: "start" };
}
