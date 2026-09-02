import { describe, expect, it, vi } from "vitest";

import { JudgmentValidationError } from "@alrescha/core";

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
    reject: vi.fn().mockResolvedValue("failed"),
    reserveCredits: vi.fn().mockResolvedValue("01J0000000000000000000000E"),
  };
}

describe("background worker orchestration", () => {
  it("runs deterministic jobs without reserving credits", async () => {
    const workerQueue = queue(job());
    const handler = vi.fn().mockResolvedValue(undefined);
    const outcome = await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        enrich: handler,
        judge: handler,
        pack: handler,
        scan: handler,
      },
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
    const handler = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));
    const outcome = await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        enrich: handler,
        judge: handler,
        pack: handler,
        scan: handler,
      },
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

  it("logs the failure reason, because the outcome alone never says why", async () => {
    const workerQueue = queue(job({ attemptCount: 2, kind: "coach" }));
    vi.mocked(workerQueue.finish).mockResolvedValue("retrying");
    const handler = vi
      .fn()
      .mockRejectedValue(new Error("Anthropic coaching request failed with status 529."));
    const log = vi.fn();
    await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        enrich: handler,
        judge: handler,
        pack: handler,
        scan: handler,
      },
      log,
      queue: workerQueue,
      workerId: "worker-1",
      workspaceId: job().workspaceId,
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /worker-1 coach 01J0000000000000000000000A attempt 2 failed: Anthropic coaching request failed with status 529\./,
      ),
    );
  });

  it("renews the lease on a timer while a slow handler runs", async () => {
    vi.useFakeTimers();
    try {
      const workerQueue = queue(job({ creditCost: 1, kind: "coach" }));
      // A 100s model call — the production coaching smoke measured exactly
      // that — against a 30s lease; without renewal it would have been reaped.
      const handler = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100_000)),
      );
      const running = runWorkerOnce({
        handlers: {
          analyze: handler,
          coach: handler,
          enrich: handler,
          judge: handler,
          pack: handler,
          scan: handler,
        },
        queue: workerQueue,
        workerId: "worker-1",
        workspaceId: job().workspaceId,
      });

      await vi.advanceTimersByTimeAsync(100_000);
      expect(await running).toBe("succeeded");
      // Ten seconds apart for a hundred seconds: nine or ten renewals, and
      // none once the job is finished.
      expect(vi.mocked(workerQueue.heartbeat).mock.calls.length).toBeGreaterThanOrEqual(9);
      const renewals = vi.mocked(workerQueue.heartbeat).mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(vi.mocked(workerQueue.heartbeat).mock.calls.length).toBe(renewals);
    } finally {
      vi.useRealTimers();
    }
  });

  it("terminally rejects schema-invalid judgments so reserved credits refund immediately", async () => {
    const workerQueue = queue(job({ creditCost: 12, kind: "judge" }));
    const handler = vi
      .fn()
      .mockRejectedValue(
        new JudgmentValidationError("mock", "mock-model", "a".repeat(64), [
          { code: "invalid_value", path: "evidenceGrade" },
        ]),
      );

    const outcome = await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        enrich: handler,
        judge: handler,
        pack: handler,
        scan: handler,
      },
      queue: workerQueue,
      workerId: "worker-1",
      workspaceId: job().workspaceId,
    });

    expect(outcome).toBe("failed");
    expect(workerQueue.reject).toHaveBeenCalledWith(
      "01J0000000000000000000000A",
      "worker-1",
      "Provider returned a schema-invalid judgment.",
    );
    expect(workerQueue.finish).not.toHaveBeenCalled();
  });

  it("pauses exhausted-credit judgments with top-up guidance", async () => {
    const workerQueue = queue(job({ creditCost: 12, kind: "judge" }));
    vi.mocked(workerQueue.reserveCredits).mockRejectedValue(
      new Error("insufficient workspace credits"),
    );
    const handler = vi.fn().mockResolvedValue(undefined);

    const outcome = await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        enrich: handler,
        judge: handler,
        pack: handler,
        scan: handler,
      },
      queue: workerQueue,
      workerId: "worker-1",
      workspaceId: job().workspaceId,
    });

    expect(outcome).toBe("failed");
    expect(handler).not.toHaveBeenCalled();
    expect(workerQueue.reject).toHaveBeenCalledWith(
      "01J0000000000000000000000A",
      "worker-1",
      "Judgment paused: credits unavailable. Add credits or configure BYOK, then retry.",
    );
  });
});
