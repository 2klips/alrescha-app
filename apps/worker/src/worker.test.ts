import { describe, expect, it, vi } from "vitest";

import { JudgmentValidationError } from "@alrescha/core";

import type { ClaimedJob, WorkerQueue } from "./queue";
import {
  MAX_RETRY_DEFERRAL_SECONDS,
  retryDelaySeconds,
  runWorkerOnce,
} from "./worker";

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

describe("retryDelaySeconds", () => {
  const now = 1_757_678_400_000;

  it("is the seconds until the named time, plus a second of grace", () => {
    expect(retryDelaySeconds({ retryAt: now + 60_000 }, now)).toBe(61);
    expect(retryDelaySeconds({ retryAt: now + 500 }, now)).toBe(2);
  });

  it("is bounded at an hour", () => {
    expect(retryDelaySeconds({ retryAt: now + 10 * 3_600_000 }, now)).toBe(
      MAX_RETRY_DEFERRAL_SECONDS,
    );
  });

  it("is nothing for a time already past, a missing time, or a non-error", () => {
    expect(retryDelaySeconds({ retryAt: now - 1 }, now)).toBeUndefined();
    expect(retryDelaySeconds({ retryAt: null }, now)).toBeUndefined();
    expect(retryDelaySeconds({ retryAt: "soon" }, now)).toBeUndefined();
    expect(retryDelaySeconds(new Error("plain"), now)).toBeUndefined();
    expect(retryDelaySeconds(null, now)).toBeUndefined();
    expect(retryDelaySeconds(undefined, now)).toBeUndefined();
  });
});

describe("background worker orchestration", () => {
  it("runs deterministic jobs without reserving credits", async () => {
    const workerQueue = queue(job());
    const handler = vi.fn().mockResolvedValue(undefined);
    const outcome = await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        docpage: handler,
        docskeleton: handler,
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
        docpage: handler,
        docskeleton: handler,
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
      .mockRejectedValue(
        new Error("Anthropic coaching request failed with status 529."),
      );
    const log = vi.fn();
    await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        docpage: handler,
        docskeleton: handler,
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
      const handler = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 100_000)),
        );
      const running = runWorkerOnce({
        handlers: {
          analyze: handler,
          coach: handler,
          docpage: handler,
          docskeleton: handler,
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
      expect(
        vi.mocked(workerQueue.heartbeat).mock.calls.length,
      ).toBeGreaterThanOrEqual(9);
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
        docpage: handler,
        docskeleton: handler,
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

  it("defers the retry to the time a rate-limited failure names", async () => {
    const workerQueue = queue(job({ kind: "analyze" }));
    vi.mocked(workerQueue.finish).mockResolvedValue("retrying");
    const failure = Object.assign(
      new Error(
        "GitHub repository request failed: 403 primary-rate-limit; retry after 1800s",
      ),
      { retryAt: Date.now() + 1_800_000 },
    );
    const handler = vi.fn().mockRejectedValue(failure);
    const log = vi.fn();

    const outcome = await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        docpage: handler,
        docskeleton: handler,
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

    expect(outcome).toBe("retrying");
    const [, , succeeded, message, deferral] =
      vi.mocked(workerQueue.finish).mock.calls[0] ?? [];
    expect(succeeded).toBe(false);
    expect(message).toBe(failure.message);
    // 1800s plus a second of grace, less however long the test itself took.
    expect(deferral).toBeGreaterThanOrEqual(1799);
    expect(deferral).toBeLessThanOrEqual(1801);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/retry deferred 18\d\ds$/),
    );
  });

  it("leaves the queue's own backoff alone when the failure names no time", async () => {
    const workerQueue = queue(job());
    vi.mocked(workerQueue.finish).mockResolvedValue("retrying");
    const handler = vi
      .fn()
      .mockRejectedValue(
        new Error("GitHub repository request failed: 403 forbidden"),
      );

    await runWorkerOnce({
      handlers: {
        analyze: handler,
        coach: handler,
        docpage: handler,
        docskeleton: handler,
        enrich: handler,
        judge: handler,
        pack: handler,
        scan: handler,
      },
      queue: workerQueue,
      workerId: "worker-1",
      workspaceId: job().workspaceId,
    });

    expect(workerQueue.finish).toHaveBeenCalledWith(
      "01J0000000000000000000000A",
      "worker-1",
      false,
      "GitHub repository request failed: 403 forbidden",
    );
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
        docpage: handler,
        docskeleton: handler,
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
