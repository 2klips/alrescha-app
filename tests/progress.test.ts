import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildProgressDashboard,
  parseTodoDocument,
} from "../packages/core/src/index";

describe("progress dashboard domain", () => {
  it("maps fixture TODO checkboxes to sourced todo items", async () => {
    const path = "TODO.md";
    const source = await readFile(
      resolve(import.meta.dirname, "../fixtures/drifted-demo/TODO.md"),
      "utf8",
    );

    const todos = parseTodoDocument({ path, source });

    expect(todos).toHaveLength(4);
    expect(todos.map(({ status, title }) => ({ status, title }))).toEqual([
      {
        status: "done",
        title: "REQ-AUTH-002: enforce the 30-minute session timeout.",
      },
      {
        status: "open",
        title: "REQ-AUTH-001: implement GitHub OAuth login.",
      },
      {
        status: "open",
        title: "REQ-AUTH-003: add an audit-event CI test.",
      },
      {
        status: "open",
        title: "Remove the stale legacy billing reference.",
      },
    ]);
    expect(todos.map(({ source }) => source)).toEqual([
      expect.objectContaining({
        kind: "document",
        path,
        span: expect.objectContaining({ startLine: 3, endLine: 3 }),
      }),
      expect.objectContaining({
        kind: "document",
        path,
        span: expect.objectContaining({ startLine: 4, endLine: 4 }),
      }),
      expect.objectContaining({
        kind: "document",
        path,
        span: expect.objectContaining({ startLine: 5, endLine: 5 }),
      }),
      expect.objectContaining({
        kind: "document",
        path,
        span: expect.objectContaining({ startLine: 6, endLine: 6 }),
      }),
    ]);
    expect(new Set(todos.map(({ sourceKey }) => sourceKey)).size).toBe(4);
  });

  it("returns a source-labeled empty dashboard without invented percentages", () => {
    const dashboard = buildProgressDashboard({
      commits: [],
      findings: [],
      progressEvents: [],
      requirements: { covered: 0, total: 0 },
      todos: [],
    });

    expect(dashboard.state).toBe("empty");
    expect(dashboard.metrics).toEqual({
      requirements: {
        completed: 0,
        percent: null,
        sourceLabel: "Evidence graph requirement coverage",
        total: 0,
      },
      todos: {
        completed: 0,
        percent: null,
        sourceLabel: "TODO/progress checkboxes + log_progress events",
        total: 0,
      },
    });
    expect(dashboard.columns.every(({ items }) => items.length === 0)).toBe(
      true,
    );
    expect(dashboard.timeline).toEqual([]);
  });

  it("builds a partial board and merges recent work newest-first", () => {
    const dashboard = buildProgressDashboard({
      commits: [
        {
          occurredAt: "2026-08-13T10:02:00.000Z",
          sha: "abc1234",
          summary: "feat: connect todo board",
        },
      ],
      findings: [
        {
          id: "finding-1",
          occurredAt: "2026-08-13T10:03:00.000Z",
          title: "Missing progress test resolved",
        },
      ],
      progressEvents: [
        {
          id: "event-1",
          occurredAt: "2026-08-13T10:01:00.000Z",
          refs: ["TODO.md#L4"],
          status: "progress",
          summary: "Parser connected.",
          task: "Todo parser",
          todoId: "todo-event",
        },
      ],
      requirements: { covered: 3, total: 4 },
      todos: [
        {
          id: "todo-doc",
          requirementId: "REQ-AUTH-002",
          source: {
            endLine: 3,
            kind: "document",
            path: "TODO.md",
            startLine: 3,
          },
          status: "done",
          title: "Session timeout",
          updatedAt: "2026-08-13T10:00:00.000Z",
        },
        {
          id: "todo-event",
          requirementId: null,
          source: { eventId: "event-1", kind: "progress-event" },
          status: "in-progress",
          title: "Todo parser",
          updatedAt: "2026-08-13T10:01:00.000Z",
        },
      ],
    });

    expect(dashboard.state).toBe("partial");
    expect(dashboard.metrics.requirements).toMatchObject({
      percent: 75,
      sourceLabel: expect.any(String),
    });
    expect(dashboard.metrics.todos).toMatchObject({
      percent: 50,
      sourceLabel: expect.any(String),
    });
    expect(
      dashboard.columns.map(({ items, status }) => ({
        count: items.length,
        status,
      })),
    ).toEqual([
      { count: 0, status: "open" },
      { count: 1, status: "in-progress" },
      { count: 1, status: "done" },
      { count: 0, status: "blocked" },
    ]);
    expect(dashboard.columns[2]?.items[0]?.source).toMatchObject({
      kind: "document",
      path: "TODO.md",
      startLine: 3,
    });
    expect(dashboard.timeline.map(({ kind }) => kind)).toEqual([
      "finding-resolved",
      "commit",
      "progress",
    ]);
    expect(dashboard.timeline[2]).toMatchObject({
      id: "event-1",
      refs: ["TODO.md#L4"],
      status: "progress",
    });
  });

  it("marks progress full only when requirements and todos are complete", () => {
    const todo = {
      id: "todo-done",
      requirementId: null,
      source: { eventId: "event-done", kind: "progress-event" as const },
      status: "done" as const,
      title: "Ship progress dashboard",
      updatedAt: "2026-08-13T11:00:00.000Z",
    };
    const complete = buildProgressDashboard({
      commits: [],
      findings: [],
      progressEvents: [],
      requirements: { covered: 4, total: 4 },
      todos: [todo],
    });
    const blocked = buildProgressDashboard({
      commits: [],
      findings: [],
      progressEvents: [],
      requirements: { covered: 4, total: 4 },
      todos: [{ ...todo, status: "blocked" }],
    });

    expect(complete.state).toBe("full");
    expect(complete.metrics.requirements.percent).toBe(100);
    expect(complete.metrics.todos.percent).toBe(100);
    expect(blocked.state).toBe("partial");
  });
});
