/**
 * Web Worker entry for the brain-map force simulation (Phase 2A todo 4).
 *
 * Deliberately thin: all behaviour lives in `worker-runtime.ts` so it is
 * testable without a Worker. Mounted from the client with
 * `new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" })`
 * and torn down with `terminate()`, which also clears this interval.
 */

import { SIMULATION_FRAME_MS, createSimulationRuntime } from "./worker-runtime";

/**
 * The worker global. Typed locally rather than by adding the `webworker` lib,
 * which would collide with the DOM lib the rest of `apps/web` compiles against.
 */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

const runtime = createSimulationRuntime({
  post: (message, transfer) =>
    scope.postMessage(message, (transfer ?? []) as Transferable[]),
});

setInterval(() => {
  runtime.step();
}, SIMULATION_FRAME_MS);

scope.addEventListener("message", (event) => {
  runtime.handle(event.data);
});
