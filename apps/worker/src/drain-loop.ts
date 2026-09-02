/**
 * Round-robin drain-loop scheduling (QW-3 — perf).
 *
 * `run-local.ts` used to drain workspaces strictly sequentially: one job at a
 * time, process-wide, fully draining workspace A before ever looking at
 * workspace B. One long-running enrich job on A therefore blocked every
 * other tenant's scan/analyze, even though `claim_next_job` is already
 * `FOR UPDATE SKIP LOCKED` with a lease and has no problem being called
 * concurrently.
 *
 * `run-local.ts` now runs `WORKER_CONCURRENCY` (default 4) of these loops
 * side by side. Each loop owns a disjoint, round-robin slice of the
 * process-wide workspace list — loop `loopIndex` takes the workspaces at
 * indices `loopIndex`, `loopIndex + concurrency`, `loopIndex + concurrency *
 * 2`, … — so no two loops ever contend for the same workspace, and each loop
 * still drains one workspace to idle before moving to the next, exactly like
 * the old single loop did.
 *
 * This lives in its own module (rather than inline in run-local.ts) only
 * because run-local.ts has a top-level `await main()` and so cannot be
 * imported by tests. Everything here is exercised the same way
 * worker.test.ts exercises `runWorkerOnce`: a mocked `WorkerQueue`, no
 * database.
 */

import { runWorkerOnce, type JobHandlers } from "./worker";

import type { WorkerQueue } from "./queue";

export interface WorkspaceRef {
  readonly id: string;
}

export interface DrainLoopInput {
  /** Total number of concurrent drain loops sharing `workspaces`. */
  readonly concurrency: number;
  readonly handlers: JobHandlers;
  /** This loop's index in [0, concurrency) — also its starting offset. */
  readonly loopIndex: number;
  /** Sink for per-job log lines; defaults to `console.log`. */
  readonly log?: (line: string) => void;
  readonly queue: WorkerQueue;
  /** Lease identity used for every claim/finish/heartbeat this loop makes. */
  readonly workerId: string;
  /** The full, process-wide workspace list for this poll cycle. */
  readonly workspaces: readonly WorkspaceRef[];
}

/**
 * Drains this loop's round-robin slice of `workspaces` — each workspace
 * fully, one job at a time, until that workspace goes idle — then reports
 * whether any job ran. Callers run `concurrency` of these concurrently (one
 * per `loopIndex` in `[0, concurrency)`) and should treat the whole poll
 * cycle as idle only once every loop returns `false`.
 */
export async function runDrainLoop(input: DrainLoopInput): Promise<boolean> {
  const log = input.log ?? console.log;
  let worked = false;

  for (
    let index = input.loopIndex;
    index < input.workspaces.length;
    index += input.concurrency
  ) {
    const workspaceId = input.workspaces[index]!.id;
    for (;;) {
      const outcome = await runWorkerOnce({
        handlers: input.handlers,
        log,
        queue: input.queue,
        workerId: input.workerId,
        workspaceId,
      });
      if (outcome === "idle") break;
      worked = true;
      log(`  ${input.workerId} job → ${outcome}`);
    }
  }

  return worked;
}
