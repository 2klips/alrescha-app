import { describe, expect, it, vi } from "vitest";

import type { ClaimedJob, WorkerQueue } from "./queue";
import { runWorkerOnce } from "./worker";

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

function queue(claimedJob: ClaimedJob): WorkerQueue {
  return {
    claim: vi.fn().mockResolvedValue(claimedJob),
    finish: vi.fn().mockResolvedValue("succeeded"),
    heartbeat: vi.fn().mockResolvedValue(true),
    reserveCredits: vi.fn().mockResolvedValue("01J0000000000000000000000E"),
  };
}

describe("background worker orchestration", () => {
  it("runs deterministic jobs without reserving credits", async () => {
    const workerQueue = queue(job());
    const handler = vi.fn().mockResolvedValue(undefined);
    const outcome = await runWorkerOnce({
      handlers: { analyze: handler, judge: handler, pack: handler, scan: handler },
      queue: workerQueue,
      workerId: "worker-1",
      workspaceId: job().workspaceId,
    });

    expect(outcome).toBe("succeeded");
    expect(workerQueue.reserveCredits).not.toHaveBeenCalled();
  });

  it("reserves judgment credits and converts handler failure to queue retry", async () => {
    const workerQueue = queue(job({ creditCost: 12, kind: "judge" }));
    vi.mocked(workerQueue.finish).mockResolvedValue("retrying");
    const handler = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const outcome = await runWorkerOnce({
      handlers: { analyze: handler, judge: handler, pack: handler, scan: handler },
      queue: workerQueue,
      workerId: "worker-1",
      workspaceId: job().workspaceId,
    });

    expect(outcome).toBe("retrying");
    expect(workerQueue.reserveCredits).toHaveBeenCalledOnce();
    expect(workerQueue.finish).toHaveBeenCalledWith(
      "01J0000000000000000000000A",
      "worker-1",
      false,
      "provider unavailable",
    );
  });
});
