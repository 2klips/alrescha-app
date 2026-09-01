import { describe, expect, it } from "vitest";

import {
  buildWorkspaceCommitCards,
  receiptFindings,
} from "./commit-cards-report";

describe("receiptFindings", () => {
  it("reads the WORK_SPEC §13 findings snapshot", () => {
    expect(
      receiptFindings({
        findings: { open_total: 7, opened: ["a", "b", "c"], resolved: ["d"] },
      }),
    ).toEqual({ opened: 3, openTotal: 7, resolved: 1 });
  });

  it.each([
    ["null", null],
    ["no findings key", {}],
    [
      "opened is not a list",
      { findings: { open_total: 1, opened: 3, resolved: [] } },
    ],
    [
      "open_total is not a number",
      { findings: { open_total: "7", opened: [], resolved: [] } },
    ],
  ])("yields null for a malformed summary (%s)", (_label, summary) => {
    expect(receiptFindings(summary)).toBeNull();
  });
});

describe("buildWorkspaceCommitCards", () => {
  it("maps snake_case rows into ordered cards", () => {
    const cards = buildWorkspaceCommitCards({
      jobs: [
        {
          claimed_at: "2026-08-17T08:00:01.000Z",
          completed_at: "2026-08-17T08:00:11.000Z",
          kind: "scan",
          last_error: null,
          run_id: "run-1",
          status: "succeeded",
        },
        {
          claimed_at: "2026-08-17T08:00:12.000Z",
          completed_at: "2026-08-17T08:00:31.000Z",
          kind: "analyze",
          last_error: "vitest report artifact was unreadable",
          run_id: "run-1",
          status: "failed",
        },
        // A judge job of another run and a row with an unknown kind are both
        // tolerated without corrupting the cards.
        {
          claimed_at: null,
          completed_at: null,
          kind: "mystery",
          last_error: null,
          run_id: "run-1",
          status: "queued",
        },
      ],
      receipts: [
        {
          commit_sha: "b".repeat(40),
          id: "receipt-9",
          run_id: "run-2",
          summary: {
            findings: { open_total: 4, opened: ["f1"], resolved: [] },
          },
        },
      ],
      repositories: [{ full_name: "2klips/alrescha-app", id: "repo-1" }],
      runs: [
        {
          commit_sha: "a".repeat(40),
          created_at: "2026-08-17T08:00:00.000Z",
          id: "run-1",
          repository_id: "repo-1",
          trigger_kind: "push",
        },
        {
          commit_sha: "b".repeat(40),
          created_at: "2026-08-17T09:00:00.000Z",
          id: "run-2",
          repository_id: "repo-1",
          trigger_kind: "check_run",
        },
      ],
    });

    expect(cards.map(({ runId }) => runId)).toEqual(["run-2", "run-1"]);
    expect(cards[0]).toMatchObject({
      findingsDelta: { opened: 1, openTotal: 4, resolved: 0 },
      receiptId: "receipt-9",
      repository: "2klips/alrescha-app",
      status: "pending",
    });
    expect(cards[1]).toMatchObject({
      durationMs: 30_000,
      failureReason: "vitest report artifact was unreadable",
      status: "failed",
    });
    expect(cards[1]!.jobs.map(({ kind }) => kind)).toEqual(["scan", "analyze"]);
  });

  it("keeps the repository id visible when the repository row is missing", () => {
    const cards = buildWorkspaceCommitCards({
      jobs: [],
      receipts: [],
      repositories: [],
      runs: [
        {
          commit_sha: "c".repeat(40),
          created_at: "2026-08-17T08:00:00.000Z",
          id: "run-1",
          repository_id: "repo-unknown",
          trigger_kind: "manual",
        },
      ],
    });
    expect(cards[0]!.repository).toBe("repo-unknown");
  });
});
