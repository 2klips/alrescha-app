import { describe, expect, it } from "vitest";

import {
  buildCommitAnalysisCards,
  type AnalysisJobInput,
  type AnalysisRunInput,
} from "../packages/core/src/index";

const RUN: AnalysisRunInput = {
  commitSha: "a".repeat(40),
  createdAt: "2026-08-17T09:00:00.000Z",
  id: "run-1",
  repository: "2klips/arr-app",
  triggerKind: "push",
};

function job(overrides: Partial<AnalysisJobInput>): AnalysisJobInput {
  return {
    claimedAt: null,
    completedAt: null,
    kind: "scan",
    lastError: null,
    runId: "run-1",
    status: "queued",
    ...overrides,
  };
}

function build(jobs: readonly AnalysisJobInput[]) {
  const cards = buildCommitAnalysisCards({ jobs, receipts: [], runs: [RUN] });
  expect(cards).toHaveLength(1);
  return cards[0]!;
}

describe("commit card status transitions", () => {
  it("starts pending while every job is queued", () => {
    const card = build([
      job({ kind: "scan" }),
      job({ kind: "analyze" }),
    ]);
    expect(card.status).toBe("pending");
    expect(card.durationMs).toBeNull();
    expect(card.failureReason).toBeNull();
  });

  it("is pending when the run has no jobs yet", () => {
    expect(build([]).status).toBe("pending");
  });

  it("moves to analyzing when any job is claimed", () => {
    const card = build([
      job({
        claimedAt: "2026-08-17T09:01:00.000Z",
        completedAt: "2026-08-17T09:01:10.000Z",
        kind: "scan",
        status: "succeeded",
      }),
      job({ kind: "analyze", status: "queued" }),
    ]);
    expect(card.status).toBe("analyzing");
    // An in-flight run has no measured duration — there is no fabricated one.
    expect(card.durationMs).toBeNull();
  });

  it("completes when every job succeeded, with the measured wall time", () => {
    const card = build([
      job({
        claimedAt: "2026-08-17T09:01:00.000Z",
        completedAt: "2026-08-17T09:01:10.000Z",
        kind: "scan",
        status: "succeeded",
      }),
      job({
        claimedAt: "2026-08-17T09:01:11.000Z",
        completedAt: "2026-08-17T09:01:42.000Z",
        kind: "analyze",
        status: "succeeded",
      }),
    ]);
    expect(card.status).toBe("completed");
    expect(card.durationMs).toBe(42_000);
    expect(card.failureReason).toBeNull();
  });

  it("fails as soon as one job fails, keeping the stored reason verbatim", () => {
    const reason = "GitHub tree fetch answered 502 <html>Bad Gateway</html>";
    const card = build([
      job({
        claimedAt: "2026-08-17T09:01:00.000Z",
        completedAt: "2026-08-17T09:01:10.000Z",
        kind: "scan",
        status: "succeeded",
      }),
      job({
        claimedAt: "2026-08-17T09:01:11.000Z",
        completedAt: "2026-08-17T09:02:00.000Z",
        kind: "analyze",
        lastError: reason,
        status: "failed",
      }),
    ]);
    expect(card.status).toBe("failed");
    expect(card.failureReason).toBe(reason);
    expect(card.durationMs).toBe(60_000);
  });

  it("treats a cancelled job as failure and tolerates a missing reason", () => {
    const card = build([
      job({ kind: "scan", status: "cancelled" }),
      job({ kind: "analyze", status: "queued" }),
    ]);
    expect(card.status).toBe("failed");
    expect(card.failureReason).toBeNull();
    expect(card.durationMs).toBeNull();
  });

  it("never reports a negative or unparseable duration", () => {
    const inverted = build([
      job({
        claimedAt: "2026-08-17T09:05:00.000Z",
        completedAt: "2026-08-17T09:01:00.000Z",
        kind: "scan",
        status: "succeeded",
      }),
    ]);
    expect(inverted.durationMs).toBeNull();
    const unparseable = build([
      job({
        claimedAt: "not-a-date",
        completedAt: "2026-08-17T09:01:00.000Z",
        kind: "scan",
        status: "succeeded",
      }),
    ]);
    expect(unparseable.durationMs).toBeNull();
  });

  it("orders job steps scan-first for the detail view", () => {
    const card = build([
      job({ kind: "analyze" }),
      job({ kind: "scan" }),
    ]);
    expect(card.jobs.map(({ kind }) => kind)).toEqual(["scan", "analyze"]);
  });
});

describe("commit card findings delta", () => {
  it("attaches the receipt matched by run id", () => {
    const cards = buildCommitAnalysisCards({
      jobs: [],
      receipts: [
        {
          commitSha: RUN.commitSha,
          findings: { opened: 3, openTotal: 7, resolved: 1 },
          id: "receipt-1",
          runId: "run-1",
        },
      ],
      runs: [RUN],
    });
    expect(cards[0]!.receiptId).toBe("receipt-1");
    expect(cards[0]!.findingsDelta).toEqual({
      opened: 3,
      openTotal: 7,
      resolved: 1,
    });
  });

  it("falls back to the commit sha only for receipts without a run id", () => {
    const cards = buildCommitAnalysisCards({
      jobs: [],
      receipts: [
        {
          commitSha: RUN.commitSha,
          findings: { opened: 9, openTotal: 9, resolved: 9 },
          id: "receipt-other-run",
          runId: "run-2",
        },
        {
          commitSha: RUN.commitSha,
          findings: { opened: 1, openTotal: 4, resolved: 2 },
          id: "receipt-orphan",
          runId: null,
        },
      ],
      runs: [RUN],
    });
    expect(cards[0]!.receiptId).toBe("receipt-orphan");
    expect(cards[0]!.findingsDelta).toEqual({
      opened: 1,
      openTotal: 4,
      resolved: 2,
    });
  });

  it("shows no delta when there is no receipt", () => {
    const card = build([]);
    expect(card.receiptId).toBeNull();
    expect(card.findingsDelta).toBeNull();
  });
});

describe("job-less runs (local ingest)", () => {
  const localRun: AnalysisRunInput = {
    ...RUN,
    commitSha: "d".repeat(40),
    completedAt: "2026-08-17T09:00:03.500Z",
    id: "run-local",
    startedAt: "2026-08-17T09:00:00.000Z",
    status: "succeeded",
    triggerKind: "manual",
  };

  it("trusts the stored run status and its server-measured duration", () => {
    const cards = buildCommitAnalysisCards({
      jobs: [],
      receipts: [],
      runs: [localRun],
    });
    expect(cards[0]).toMatchObject({
      durationMs: 3_500,
      status: "completed",
      triggerKind: "manual",
    });
    expect(cards[0]!.jobs).toEqual([]);
  });

  it("maps every stored status onto a card status", () => {
    const statuses = (
      ["pending", "running", "succeeded", "failed", "cancelled"] as const
    ).map(
      (status) =>
        buildCommitAnalysisCards({
          jobs: [],
          receipts: [],
          runs: [{ ...localRun, status }],
        })[0]!.status,
    );
    expect(statuses).toEqual([
      "pending",
      "analyzing",
      "completed",
      "failed",
      "failed",
    ]);
  });

  it("still reports pending for a run with neither jobs nor a stored status", () => {
    const cards = buildCommitAnalysisCards({
      jobs: [],
      receipts: [],
      runs: [RUN],
    });
    expect(cards[0]).toMatchObject({ durationMs: null, status: "pending" });
  });

  it("keeps jobs authoritative when a run has them", () => {
    const cards = buildCommitAnalysisCards({
      jobs: [
        job({
          claimedAt: "2026-08-17T09:01:00.000Z",
          completedAt: "2026-08-17T09:01:10.000Z",
          kind: "scan",
          status: "running",
        }),
      ],
      receipts: [],
      // A stale "succeeded" on the run must not override an in-flight job.
      runs: [{ ...RUN, status: "succeeded" }],
    });
    expect(cards[0]!.status).toBe("analyzing");
  });
});

describe("commit card ordering", () => {
  it("lists the newest run first", () => {
    const cards = buildCommitAnalysisCards({
      jobs: [],
      receipts: [],
      runs: [
        { ...RUN, createdAt: "2026-08-16T09:00:00.000Z", id: "run-old" },
        { ...RUN, createdAt: "2026-08-17T09:00:00.000Z", id: "run-new" },
      ],
    });
    expect(cards.map(({ runId }) => runId)).toEqual(["run-new", "run-old"]);
  });
});
