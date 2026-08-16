import { buildProgressDashboard } from "@arr/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PROGRESS } from "../../lib/strings";
import { ProgressDashboardView } from "./progress-dashboard";

function render(state: "empty" | "partial" | "full"): string {
  const todo = {
    id: "todo-1",
    requirementId: "REQ-PROGRESS-01",
    source: {
      endLine: 4,
      kind: "document" as const,
      path: "TODO.md",
      startLine: 4,
    },
    status: state === "full" ? ("done" as const) : ("in-progress" as const),
    title: "Build progress dashboard",
    updatedAt: "2026-08-13T10:00:00.000Z",
  };
  const report = buildProgressDashboard({
    commits:
      state === "empty"
        ? []
        : [
            {
              occurredAt: "2026-08-13T10:01:00.000Z",
              sha: "abc1234",
              summary: "feat: progress",
            },
          ],
    findings: [],
    progressEvents: [],
    requirements:
      state === "empty"
        ? { covered: 0, total: 0 }
        : state === "full"
          ? { covered: 1, total: 1 }
          : { covered: 0, total: 1 },
    todos: state === "empty" ? [] : [todo],
  });
  return renderToStaticMarkup(createElement(ProgressDashboardView, { report }));
}

describe("progress dashboard view", () => {
  it("renders an actionable empty state without invented percentages", () => {
    const html = render("empty");

    expect(html).toContain(PROGRESS.states.empty.label);
    expect(html).toContain(PROGRESS.metrics.notMeasured);
    expect(html).not.toContain("0%");
  });

  it("renders partial metrics, all status columns, and source labels", () => {
    const html = render("partial");

    expect(html).toContain(PROGRESS.states.partial.label);
    expect(html).toContain("Evidence graph requirement coverage");
    expect(html).toContain("TODO/progress checkboxes + log_progress events");
    for (const status of Object.values(PROGRESS.todoBoard.statuses))
      expect(html, status).toContain(status);
    expect(html).toContain("TODO.md:L4");
    expect(html).toContain("feat: progress");
  });

  it("renders the full state only from complete report data", () => {
    const html = render("full");

    expect(html).toContain(PROGRESS.states.full.label);
    expect(html.match(/<strong>100%<\/strong>/g)).toHaveLength(2);
  });
});
