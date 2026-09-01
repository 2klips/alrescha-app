import {
  buildProgressDashboard,
  type ProgressDashboard,
  type ProgressTodo,
} from "@alrescha/core";

export type DemoProgressState = "empty" | "partial" | "full";

const TODOS: readonly ProgressTodo[] = [
  {
    id: "todo-parser",
    requirementId: "REQ-PROGRESS-01",
    source: { endLine: 4, kind: "document", path: "TODO.md", startLine: 4 },
    status: "done",
    title: "Parse TODO and progress checkboxes",
    updatedAt: "2026-08-13T10:02:00.000Z",
  },
  {
    id: "todo-logging",
    requirementId: "REQ-PROGRESS-02",
    source: { eventId: "event-progress", kind: "progress-event" },
    status: "in-progress",
    title: "Link compact progress logs to the board",
    updatedAt: "2026-08-13T10:06:00.000Z",
  },
  {
    id: "todo-review",
    requirementId: null,
    source: {
      endLine: 8,
      kind: "document",
      path: "spec/BUILD_PLAN.md",
      startLine: 8,
    },
    status: "open",
    title: "Review dashboard evidence labels",
    updatedAt: "2026-08-13T10:00:00.000Z",
  },
  {
    id: "todo-provider",
    requirementId: null,
    source: { eventId: "event-blocked", kind: "progress-event" },
    status: "blocked",
    title: "Verify provider-backed deployment",
    updatedAt: "2026-08-13T10:04:00.000Z",
  },
];

export function buildDemoProgressReport(
  state: DemoProgressState,
): ProgressDashboard {
  if (state === "empty") {
    return buildProgressDashboard({
      commits: [],
      findings: [],
      progressEvents: [],
      requirements: { covered: 0, total: 0 },
      todos: [],
    });
  }

  const todos =
    state === "full"
      ? TODOS.map((todo) => ({ ...todo, status: "done" as const }))
      : TODOS;
  return buildProgressDashboard({
    commits: [
      {
        occurredAt: "2026-08-13T10:07:00.000Z",
        sha: "202777e",
        summary: "feat(bench): prove data brain accuracy and token gains",
      },
    ],
    findings: [
      {
        id: "finding-progress-source",
        occurredAt: "2026-08-13T10:08:00.000Z",
        title: "Unlabeled progress metric resolved",
      },
    ],
    progressEvents: [
      {
        id: "event-started",
        occurredAt: "2026-08-13T10:03:00.000Z",
        refs: ["spec/BUILD_PLAN.md"],
        status: "started",
        summary: "Started progress dashboard.",
        task: "Task 21",
        todoId: "todo-logging",
      },
      {
        id: "event-blocked",
        occurredAt: "2026-08-13T10:04:00.000Z",
        refs: ["OPENAI_API_KEY"],
        status: "blocked",
        summary: "Provider verification needs configured deployment.",
        task: "Provider deployment",
        todoId: "todo-provider",
      },
      {
        id: "event-progress",
        occurredAt: "2026-08-13T10:06:00.000Z",
        refs: ["packages/core/src/progress/dashboard.ts"],
        status: "progress",
        summary: "Todo parser and atomic logging are passing.",
        task: "Task 21",
        todoId: "todo-logging",
      },
    ],
    requirements:
      state === "full" ? { covered: 5, total: 5 } : { covered: 3, total: 5 },
    todos,
  });
}
