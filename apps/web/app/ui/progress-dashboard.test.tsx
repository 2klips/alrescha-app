import { buildProgressDashboard } from "@alrescha/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PROGRESS } from "../../lib/strings";
import { ProgressDashboardView } from "./progress-dashboard";

type RenderState = "empty" | "measured" | "no-links" | "full";

function render(state: RenderState): string {
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
        ? { covered: 0, links: 0, total: 0 }
        : state === "full"
          ? { covered: 1, links: 1, total: 1 }
          : state === "measured"
            ? // One requirement, two implements edges in the repository, one of
              // them on this requirement: a percentage here is a measurement.
              { covered: 1, links: 2, total: 1 }
            : // Requirements exist and no implements edge does anywhere — the
              // coverage of this repository is unknown, not zero (R5 D6).
              { covered: 0, links: 0, total: 1 },
    todos: state === "empty" ? [] : [todo],
  });
  return renderToStaticMarkup(createElement(ProgressDashboardView, { report }));
}

/** The value the named metric card actually renders. */
function metricValue(html: string, title: string): string {
  const match = html.match(
    new RegExp(`<span>${title}</span><strong>([^<]*)</strong>`),
  );
  if (!match) throw new Error(`no metric card for ${title}`);
  return match[1] ?? "";
}

describe("progress dashboard view", () => {
  it("renders an actionable empty state without invented percentages", () => {
    const html = render("empty");

    expect(html).toContain(PROGRESS.states.empty.label);
    expect(html).toContain(PROGRESS.metrics.notMeasured);
    expect(html).not.toContain("0%");
  });

  it("renders measured metrics, all status columns, and source labels", () => {
    const html = render("measured");

    expect(html).toContain(PROGRESS.states.partial.label);
    expect(html).toContain("Evidence graph requirement coverage");
    expect(html).toContain("TODO/progress checkboxes + log_progress events");
    for (const status of Object.values(PROGRESS.todoBoard.statuses))
      expect(html, status).toContain(status);
    expect(html).toContain("TODO.md:L4");
    expect(html).toContain("feat: progress");
    expect(metricValue(html, PROGRESS.metrics.requirements)).toBe("100%");
    expect(html).not.toContain(PROGRESS.metrics.noLinks);
  });

  it("reports coverage as unmeasured, not 0%, when no implements edge exists", () => {
    const html = render("no-links");

    // This card rendered `0%` until Phase 4 Wave A todo 1, which reads as
    // "nothing is implemented" when the truth is "nothing is linked" (D6).
    expect(metricValue(html, PROGRESS.metrics.requirements)).toBe(
      PROGRESS.metrics.noLinks,
    );
    // The todo metric beside it stays measured at a real 0% — the basis is
    // per metric, not per screen.
    expect(metricValue(html, PROGRESS.metrics.todos)).toBe("0%");
    expect(html).toContain(PROGRESS.metrics.completed(0, 1));
  });

  it("renders the full state only from complete report data", () => {
    const html = render("full");

    expect(html).toContain(PROGRESS.states.full.label);
    expect(html.match(/<strong>100%<\/strong>/g)).toHaveLength(2);
  });
});

describe("progress dashboard view — digest and attention (todo 19 ⑵)", () => {
  const NOW = "2026-09-14T12:00:00.000Z";
  const stale = {
    id: "todo-stale",
    requirementId: null,
    source: { eventId: "event-stale", kind: "progress-event" as const },
    status: "in-progress" as const,
    title: "Wire the CI evidence",
    updatedAt: "2026-09-01T09:00:00.000Z",
  };
  const blocked = {
    id: "todo-blocked",
    requirementId: null,
    source: {
      endLine: 9,
      kind: "document" as const,
      path: "TODO.md",
      startLine: 9,
    },
    status: "blocked" as const,
    title: "Ship the worker",
    updatedAt: "2026-09-10T09:00:00.000Z",
  };
  const report = (lastVisitedAt: string | null | undefined) =>
    renderToStaticMarkup(
      createElement(ProgressDashboardView, {
        report: buildProgressDashboard({
          commits: [
            {
              occurredAt: "2026-09-14T08:00:00.000Z",
              sha: "abc1234",
              summary: "feat: today",
            },
            {
              occurredAt: "2026-09-10T08:00:00.000Z",
              sha: "def5678",
              summary: "feat: this week",
            },
          ],
          findings: [],
          ...(lastVisitedAt === undefined ? {} : { lastVisitedAt }),
          now: NOW,
          progressEvents: [
            {
              id: "event-stale",
              occurredAt: "2026-09-01T09:00:00.000Z",
              refs: ["apps/worker/src/ci-evidence.ts"],
              status: "started",
              summary: "Started.",
              task: "Wire the CI evidence",
              todoId: "todo-stale",
            },
          ],
          requirements: { covered: 0, links: 0, total: 0 },
          todos: [stale, blocked],
        }),
      }),
    );

  it("renders the three windows with counts, and a never-visited third window as its own sentence", () => {
    const html = report(undefined);
    expect(html).toContain(PROGRESS.digest.title);
    expect(html).toContain('data-total="1" data-window="today"');
    expect(html).toContain(PROGRESS.digest.counts(0, 1, 0));
    expect(html).toContain('data-total="2" data-window="thisWeek"');
    expect(html).toContain(
      'data-total="never-visited" data-window="sinceLastVisit"',
    );
    expect(html).toContain(PROGRESS.digest.neverVisited);
  });

  it("counts since the last visit when one is recorded", () => {
    const html = report("2026-09-12T00:00:00.000Z");
    expect(html).toContain('data-total="1" data-window="sinceLastVisit"');
    expect(html).not.toContain(PROGRESS.digest.neverVisited);
  });

  it("lists stale and blocked items, oldest first, and says when a blocker was never written", () => {
    const html = report(null);
    expect(html).toContain('data-stale="1"');
    expect(html).toContain('data-blocked="1"');
    expect(html).toContain(PROGRESS.attention.staleLabel);
    expect(html).toContain("Wire the CI evidence");
    expect(html).toContain(PROGRESS.attention.blockedLabel);
    expect(html).toContain("Ship the worker");
    // A document checkbox has nobody's sentence behind it: the screen says
    // so instead of an empty line, and marks it as unstated.
    expect(html).toContain('data-stated="false"');
    expect(html).toContain(PROGRESS.attention.noBlocker);
    expect(html).not.toContain("no blocker was recorded");
  });

  it("says 멈춰 있는 항목 없음 when nothing is stale or blocked", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressDashboardView, {
        report: buildProgressDashboard({
          commits: [],
          findings: [],
          now: NOW,
          progressEvents: [],
          requirements: { covered: 0, links: 0, total: 0 },
          todos: [],
        }),
      }),
    );
    expect(html).toContain(PROGRESS.attention.empty);
    expect(html).toContain('data-stale="0"');
  });
});
