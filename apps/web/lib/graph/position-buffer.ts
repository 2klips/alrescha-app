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
  /**
   * Hold one node at a point, overriding whatever the worker reports for it
   * (Phase 4 Wave B todo 11).
   *
   * A dragged node has to be under the pointer *now*. The worker answers at
   * 30Hz and the interpolation then eases toward that answer, so waiting for
   * the round trip leaves the node visibly trailing the finger that is
   * supposed to be holding it.
   */
  hold(nodeId: string, position: Position): void;
  release(nodeId: string): void;
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
  const held = new Map<string, Position>();

  /**
   * Apply the held positions over a frame. A fresh map every time, because
   * `at` is compared by identity to decide whether anything moved — writing
   * into `current` would make a settled graph look unchanged while a node is
   * being dragged across it.
   */
  const withHeld = (
    positions: ReadonlyMap<string, Position>,
  ): ReadonlyMap<string, Position> => {
    if (held.size === 0) return positions;
    const merged = new Map(positions);
    for (const [id, position] of held) merged.set(id, position);
    return merged;
  };

  return {
    at(now) {
      if (frames === 0) return withHeld(current);
      const t = Math.min(1, Math.max(0, (now - currentAt) / frameMs));
      if (frames === 1 || t >= 1) return withHeld(current);
      const blended = new Map<string, Position>();
      for (const [id, target] of current) {
        const from = previous.get(id) ?? target;
        blended.set(id, {
          x: lerp(from.x, target.x, t),
          y: lerp(from.y, target.y, t),
        });
      }
      return withHeld(blended);
    },
    frames: () => frames,
    hold(nodeId, position) {
      held.set(nodeId, position);
    },
    push(nodeIds, buffer, now) {
      previous = current;
      current = decodePositions(nodeIds, buffer);
      currentAt = now;
      frames += 1;
    },
    release(nodeId) {
      held.delete(nodeId);
    },
    reset() {
      previous = new Map();
      current = new Map();
      currentAt = 0;
      frames = 0;
      held.clear();
    },
  };
}
