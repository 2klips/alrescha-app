import { RECEIPT_TOOL, type InTotoStatement } from "@alrescha/core/receipts";
import { describe, expect, it } from "vitest";

import { PROGRESS } from "../strings";
import { buildWorkspaceProgressReport } from "./progress-report";

const COMMIT = "a".repeat(40);

const statement: InTotoStatement = {
  _type: "https://in-toto.io/Statement/v1",
  predicate: {
    analyzedAt: "2026-09-04T14:00:00.000Z",
    commitSha: COMMIT,
    coverage: { implVerified: 9, requirements: 12, testVerified: 6 },
    evidence: { inferred: 14, verified: 0 },
    previousReceiptDigest: null,
    repository: "2klips/alrescha-app",
    runId: "run-1",
    tool: RECEIPT_TOOL,
  },
  predicateType: "https://arr-app-web.vercel.app/receipt/v1",
  subject: [{ digest: { sha1: COMMIT }, name: "git:commit" }],
};

describe("workspace progress report rows", () => {
  it("counts implemented active requirements and preserves source links", () => {
    const report = buildWorkspaceProgressReport({
      edges: [{ relation: "implements", source_node_id: "req-1" }],
      findings: [
        {
          id: "finding-1",
          resolved_at: "2026-08-13T10:03:00Z",
          title: "Resolved gap",
        },
      ],
      progressEvents: [
        {
          id: "event-1",
          occurred_at: "2026-08-13T10:02:00Z",
          refs: ["TODO.md"],
          status: "done",
          summary: "Finished.",
          task: "Task 21",
          todo_id: "todo-1",
        },
      ],
      receipts: [
        {
          commit_sha: "a".repeat(40),
          created_at: "2026-08-13T10:01:00Z",
          summary: { title: "feat: progress" },
        },
      ],
      requirements: [
        { id: "req-1", status: "active" },
        { id: "req-2", status: "active" },
        { id: "req-old", status: "superseded" },
      ],
      todos: [
        {
          id: "todo-1",
          requirement_id: "req-1",
          source_event_id: "event-1",
          source_kind: "progress_event",
          source_path: null,
          source_span: null,
          status: "done",
          title: "Task 21",
          updated_at: "2026-08-13T10:02:00Z",
        },
      ],
    });

    expect(report.metrics.requirements).toMatchObject({
      completed: 1,
      total: 2,
      percent: 50,
    });
    expect(report.columns[2]?.items[0]?.source).toEqual({
      eventId: "event-1",
      kind: "progress-event",
    });
    expect(report.timeline.map(({ kind }) => kind)).toEqual([
      "finding-resolved",
      "progress",
      "commit",
    ]);
  });

  it("titles a commit entry from the receipt's own coverage", () => {
    const report = buildWorkspaceProgressReport({
      edges: [{ relation: "implements", source_node_id: "req-1" }],
      findings: [],
      progressEvents: [],
      receipts: [
        {
          commit_sha: COMMIT,
          created_at: "2026-09-04T14:01:00Z",
          summary: {
            findings: { open_total: 3, opened: [], resolved: [] },
            statement,
          },
        },
      ],
      requirements: [{ id: "req-1", status: "active" }],
      todos: [],
    });

    // Every commit read `Receipt recorded for <sha7>` before this: the
    // deterministic coverage was already in the statement, unread (R5 §4.2).
    expect(report.timeline[0]?.summary).toBe(
      PROGRESS.timeline.receiptCoverage(12, 9, 6),
    );
    expect(report.timeline[0]?.summary).not.toContain("verified");
  });

  it("reports coverage as unmeasured when the workspace has no implements edge", () => {
    const report = buildWorkspaceProgressReport({
      edges: [],
      findings: [],
      progressEvents: [],
      receipts: [],
      requirements: [
        { id: "req-1", status: "active" },
        { id: "req-2", status: "active" },
      ],
      todos: [],
    });

    expect(report.metrics.requirements).toMatchObject({
      basis: "no-links",
      percent: null,
      total: 2,
    });
  });

  it("measures a real zero once implements edges exist elsewhere", () => {
    const report = buildWorkspaceProgressReport({
      edges: [{ relation: "implements", source_node_id: "req-old" }],
      findings: [],
      progressEvents: [],
      receipts: [],
      requirements: [
        { id: "req-1", status: "active" },
        { id: "req-old", status: "superseded" },
      ],
      todos: [],
    });

    expect(report.metrics.requirements).toMatchObject({
      basis: "measured",
      percent: 0,
      total: 1,
    });
  });
});
