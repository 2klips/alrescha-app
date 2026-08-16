/**
 * The body of the simulation Web Worker, extracted so it can be unit tested
 * without a Worker (Phase 2A todo 4).
 *
 * Contract: the host sends `start`/`config`/`stop`; the runtime answers with
 * `ready`, then one `positions` frame per `step()` at roughly 30Hz, then
 * `settled` once alpha falls under `alphaMin`. Every `positions` buffer is
 * transferred, so the main thread receives ownership and the worker allocates
 * a fresh one next frame.
 */

import { createForceLayout, type ForceLayout } from "./force-simulation";
import {
  parseHostMessage,
  type SimulationWorkerMessage,
} from "./simulation-protocol";

/** ~30Hz, matching the research spec's position streaming rate. */
export const SIMULATION_FRAME_MS = 33;

/** d3's own default stop threshold. */
export const SIMULATION_ALPHA_MIN = 0.001;

export interface SimulationRuntimeOptions {
  /** Physics ticks folded into one emitted frame. */
  ticksPerFrame?: number;
  post: (
    message: SimulationWorkerMessage,
    transfer?: readonly Transferable[],
  ) => void;
}

export interface SimulationRuntime {
  dispose(): void;
  handle(raw: unknown): void;
  running(): boolean;
  /** Advance the physics and emit one frame. Returns false when idle. */
  step(): boolean;
}

export function createSimulationRuntime(
  options: SimulationRuntimeOptions,
): SimulationRuntime {
  const ticksPerFrame = Math.max(1, options.ticksPerFrame ?? 2);
  let layout: ForceLayout | null = null;
  let revision = 0;
  let settled = false;

  function stop() {
    layout?.stop();
    layout = null;
    settled = false;
  }

  return {
    dispose: stop,
    handle(raw) {
      const message = parseHostMessage(raw);
      if (!message) return;
      if (message.type === "stop") {
        stop();
        return;
      }
      if (message.type === "config") {
        layout?.setConfig(message.config);
        settled = false;
        return;
      }
      layout?.stop();
      revision += 1;
      settled = false;
      layout = createForceLayout({
        config: message.config,
        links: message.links,
        nodeCount: message.nodeIds.length,
        seed: message.seed,
      });
      options.post({ nodeCount: message.nodeIds.length, type: "ready" });
    },
    running: () => layout !== null && !settled,
    step() {
      const active = layout;
      if (!active || settled) return false;
      active.tick(ticksPerFrame);
      const positions = active.positions();
      options.post(
        {
          alpha: active.alpha(),
          positions,
          revision,
          type: "positions",
        },
        [positions.buffer],
      );
      if (active.alpha() < SIMULATION_ALPHA_MIN) {
        settled = true;
        options.post({ revision, type: "settled" });
      }
      return true;
    },
  };
}
