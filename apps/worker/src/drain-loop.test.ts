import { describe, expect, it, vi } from "vitest";

import type { ClaimedJob, WorkerQueue } from "./queue";
import { runDrainLoop } from "./drain-loop";

const job = (overrides: Partial<ClaimedJob> = {}): ClaimedJob => ({
  attemptCount: 1,
  creditCost: 0,
  id: "01J0000000000000000000000A",
  kind: "scan",
  maxAttempts: 3,
  payload: {},
  repositoryId: "01J0000000000000000000000B",
  runId: "01J0000000000000000000000C",
  workspaceId: "01J0000000000000000000000D",
  ...overrides,
});

const noopHandler = vi.fn().mockResolvedValue(undefined);
const handlers = {
  analyze: noopHandler,
  coach: noopHandler,
  enrich: noopHandler,
  judge: noopHandler,
  pack: noopHandler,
  scan: noopHandler,
};

/** A WorkerQueue backed by a fixed job queue per workspace; once a
 * workspace's jobs run out, further claims against it report idle (`null`),
 * exactly like the real `claim_next_job` would. */
function queueOf(jobsByWorkspace: Record<string, ClaimedJob[]>): WorkerQueue {
  const remaining = new Map(
    Object.entries(jobsByWorkspace).map(([id, jobs]) => [id, [...jobs]]),
  );
  return {
    claim: vi.fn(async (workspaceId: string) => {
      const queued = remaining.get(workspaceId);
      return queued && queued.length > 0 ? (queued.shift() ?? null) : null;
    }),
    finish: vi.fn().mockResolvedValue("succeeded"),
    heartbeat: vi.fn().mockResolvedValue(true),
    reject: vi.fn().mockResolvedValue("failed"),
    reserveCredits: vi.fn().mockResolvedValue(null),
  };
}

const workspaces = [{ id: "w0" }, { id: "w1" }, { id: "w2" }, { id: "w3" }];

describe("runDrainLoop (QW-3 round-robin scheduling)", () => {
  it("only claims against its own round-robin slice of workspaces", async () => {
    const queue = queueOf({
      w0: [job({ id: "job-w0" })],
      w1: [job({ id: "job-w1" })],
      w2: [job({ id: "job-w2" })],
      w3: [job({ id: "job-w3" })],
    });

    await runDrainLoop({
      concurrency: 2,
      handlers,
      loopIndex: 0,
      log: () => {},
      queue,
      workerId: "local-1-0",
      workspaces,
    });

    const claimedWorkspaces = vi
      .mocked(queue.claim)
      .mock.calls.map(([workspaceId]) => workspaceId);
    // loop 0 covers indices 0, 2 → w0, w2 — never w1/w3.
    expect(new Set(claimedWorkspaces)).toEqual(new Set(["w0", "w2"]));
  });

  it("assigns the complementary slice to a different loop index", async () => {
    const queue = queueOf({
      w0: [job()],
      w1: [job()],
      w2: [job()],
      w3: [job()],
    });

    await runDrainLoop({
      concurrency: 2,
      handlers,
      loopIndex: 1,
      log: () => {},
      queue,
      workerId: "local-1-1",
      workspaces,
    });

    const claimedWorkspaces = vi
      .mocked(queue.claim)
      .mock.calls.map(([workspaceId]) => workspaceId);
    // loop 1 covers indices 1, 3 → w1, w3 — never w0/w2.
    expect(new Set(claimedWorkspaces)).toEqual(new Set(["w1", "w3"]));
  });

  it("drains one workspace to idle before moving to the next assigned one", async () => {
    const queue = queueOf({
      w0: [job(), job(), job()],
      w2: [job()],
    });

    await runDrainLoop({
      concurrency: 2,
      handlers,
      loopIndex: 0,
      log: () => {},
      queue,
      workerId: "local-1-0",
      workspaces,
    });

    const claimedWorkspaces = vi
      .mocked(queue.claim)
      .mock.calls.map(([workspaceId]) => workspaceId);
    // 3 jobs + 1 idle claim on w0, then 1 job + 1 idle claim on w2.
    expect(claimedWorkspaces).toEqual(["w0", "w0", "w0", "w0", "w2", "w2"]);
  });

  it("reports false and logs nothing when its slice is entirely idle", async () => {
    const queue = queueOf({});
    const log = vi.fn();

    const worked = await runDrainLoop({
      concurrency: 2,
      handlers,
      loopIndex: 0,
      log,
      queue,
      workerId: "local-1-0",
      workspaces,
    });

    expect(worked).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("reports true and prefixes per-job logs with this loop's workerId", async () => {
    const queue = queueOf({ w0: [job()] });
    const log = vi.fn();

    const worked = await runDrainLoop({
      concurrency: 2,
      handlers,
      loopIndex: 0,
      log,
      queue,
      workerId: "local-1-0",
      workspaces,
    });

    expect(worked).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("local-1-0"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("succeeded"));
  });
});
