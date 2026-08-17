import {
  buildCommitAnalysisCards,
  type CommitAnalysisCard,
} from "@arr/core";

export type DemoCommitState = "busy" | "empty";

const REPOSITORY = "2klips/arr-app";

/**
 * Demo data covering every card status at once — the shape a workspace shows
 * after a few pushes: one queued, one mid-analysis, one failed (with the
 * worker's stored error verbatim), and two completed commits whose receipts
 * carry the findings delta. Receipt ids reference the existing receipt demo
 * fixtures so the card's receipt link resolves on `/receipts`.
 */
export function buildDemoCommitCards(
  state: DemoCommitState,
): readonly CommitAnalysisCard[] {
  if (state === "empty") {
    return buildCommitAnalysisCards({ jobs: [], receipts: [], runs: [] });
  }

  return buildCommitAnalysisCards({
    jobs: [
      // run-05 — just enqueued, nothing claimed yet.
      {
        claimedAt: null,
        completedAt: null,
        kind: "scan",
        lastError: null,
        runId: "run-05",
        status: "queued",
      },
      {
        claimedAt: null,
        completedAt: null,
        kind: "analyze",
        lastError: null,
        runId: "run-05",
        status: "queued",
      },
      // run-04 — scan done, analysis in flight.
      {
        claimedAt: "2026-08-17T09:41:02.000Z",
        completedAt: "2026-08-17T09:41:14.000Z",
        kind: "scan",
        lastError: null,
        runId: "run-04",
        status: "succeeded",
      },
      {
        claimedAt: "2026-08-17T09:41:15.000Z",
        completedAt: null,
        kind: "analyze",
        lastError: null,
        runId: "run-04",
        status: "running",
      },
      // run-03 — analysis lease expired; the stored error is shown verbatim.
      {
        claimedAt: "2026-08-17T09:12:40.000Z",
        completedAt: "2026-08-17T09:12:52.000Z",
        kind: "scan",
        lastError: null,
        runId: "run-03",
        status: "succeeded",
      },
      {
        claimedAt: "2026-08-17T09:12:53.000Z",
        completedAt: "2026-08-17T09:14:23.000Z",
        kind: "analyze",
        lastError: "worker lease expired",
        runId: "run-03",
        status: "failed",
      },
      // run-02 — completed, current receipt.
      {
        claimedAt: "2026-08-17T08:03:10.000Z",
        completedAt: "2026-08-17T08:03:24.000Z",
        kind: "scan",
        lastError: null,
        runId: "run-02",
        status: "succeeded",
      },
      {
        claimedAt: "2026-08-17T08:03:25.000Z",
        completedAt: "2026-08-17T08:03:52.000Z",
        kind: "analyze",
        lastError: null,
        runId: "run-02",
        status: "succeeded",
      },
      // run-01 — the previous completed analysis.
      {
        claimedAt: "2026-08-16T21:44:00.000Z",
        completedAt: "2026-08-16T21:44:12.000Z",
        kind: "scan",
        lastError: null,
        runId: "run-01",
        status: "succeeded",
      },
      {
        claimedAt: "2026-08-16T21:44:13.000Z",
        completedAt: "2026-08-16T21:44:31.000Z",
        kind: "analyze",
        lastError: null,
        runId: "run-01",
        status: "succeeded",
      },
    ],
    receipts: [
      {
        commitSha: "bad0551f2c9e04a7d1b3a6c8e5f90214d7a8b3c1",
        findings: { opened: 3, openTotal: 7, resolved: 1 },
        id: "receipt-current",
        runId: "run-02",
      },
      {
        commitSha: "e9101b5a7d3f28c4b6e0912f5a8c7d3e1b4f6a20",
        findings: { opened: 2, openTotal: 5, resolved: 0 },
        id: "receipt-previous",
        runId: "run-01",
      },
    ],
    runs: [
      {
        commitSha: "51c0ffee8a4b2d917e3f5c6a0d8b4e2f917a3c5d",
        createdAt: "2026-08-17T09:46:30.000Z",
        id: "run-05",
        repository: REPOSITORY,
        triggerKind: "push",
      },
      {
        commitSha: "202777e4b8d1f6a3c5e9027fb4d8a1c6e3f5b902",
        createdAt: "2026-08-17T09:41:00.000Z",
        id: "run-04",
        repository: REPOSITORY,
        triggerKind: "push",
      },
      {
        commitSha: "dead10cc5b7e3a19f4c6d2e8b0a5f3c7d1e9b4a6",
        createdAt: "2026-08-17T09:12:38.000Z",
        id: "run-03",
        repository: REPOSITORY,
        triggerKind: "push",
      },
      {
        commitSha: "bad0551f2c9e04a7d1b3a6c8e5f90214d7a8b3c1",
        createdAt: "2026-08-17T08:03:08.000Z",
        id: "run-02",
        repository: REPOSITORY,
        triggerKind: "push",
      },
      {
        commitSha: "e9101b5a7d3f28c4b6e0912f5a8c7d3e1b4f6a20",
        createdAt: "2026-08-16T21:43:58.000Z",
        id: "run-01",
        repository: REPOSITORY,
        triggerKind: "check_run",
      },
    ],
  });
}
