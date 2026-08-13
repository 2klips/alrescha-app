import { describe, expect, it } from "vitest";

import { buildWorkspaceProgressReport } from "./progress-report";

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
});
