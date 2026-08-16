/**
 * Main-thread interpolation of worker position frames (Phase 2A todo 4).
 *
 * The simulation streams at ~30Hz but the renderer paints at display rate, so
 * the last two frames are kept and linearly interpolated. Nodes that appear or
 * disappear between frames are handled without a jump: a new node is simply
 * born at its first reported position.
 */

import { decodePositions, type Position } from "./simulation-protocol";

export interface PositionBuffer {
  /** Positions at `now`, interpolated between the last two frames. */
  at(now: number): ReadonlyMap<string, Position>;
  frames(): number;
  push(nodeIds: readonly string[], buffer: Float32Array, now: number): void;
  reset(): void;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function createPositionBuffer(frameMs = 33): PositionBuffer {
  let previous = new Map<string, Position>();
  let current = new Map<string, Position>();
  let currentAt = 0;
  let frames = 0;

  return {
    at(now) {
      if (frames === 0) return current;
      const t = Math.min(1, Math.max(0, (now - currentAt) / frameMs));
      if (frames === 1 || t >= 1) return current;
      const blended = new Map<string, Position>();
      for (const [id, target] of current) {
        const from = previous.get(id) ?? target;
        blended.set(id, {
          x: lerp(from.x, target.x, t),
          y: lerp(from.y, target.y, t),
        });
      }
      return blended;
    },
    frames: () => frames,
    push(nodeIds, buffer, now) {
      previous = current;
      current = decodePositions(nodeIds, buffer);
      currentAt = now;
      frames += 1;
    },
    reset() {
      previous = new Map();
      current = new Map();
      currentAt = 0;
      frames = 0;
    },
  };
}
