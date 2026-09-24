import { describe, expect, it } from "vitest";

import {
  LOCAL_SCAN_SUMMARY,
  NO_STATED_BLOCKER,
  STALE_AFTER_DAYS,
  buildProgressDashboard,
  type BuildProgressDashboardInput,
  type ProgressTodo,
} from "../packages/core/src/index";

/**
 * The digest and the attention list (Phase 4 Wave D todo 19 ⑵).
 *
 * The board answers "where does everything stand". Somebody opening the
 * screen after two days is asking a different question — "what moved" — and
 * before this they had to reconstruct it by reading a timeline that starts at
 * the most recent entry and never says where their last visit was.
 *
 * Two properties are worth more than the counts. The digest's `refs` come
 * from the entries it counted, so it can never point at something the
 * timeline does not mention. And a blocked item always carries a reason,
 * including when the reason is that nobody wrote one — which is the case
 * worth surfacing, not the case worth hiding.
 */

const NOW = "2026-09-06T12:00:00.000Z";
const dayAgo = (days: number): string =>
  new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();

function todo(overrides: Partial<ProgressTodo> = {}): ProgressTodo {
  return {
    id: "todo-1",
    requirementId: null,
    source: { eventId: "event-1", kind: "progress-event" },
    status: "open",
    title: "일감",
    updatedAt: NOW,
    ...overrides,
  };
}

function input(
  overrides: Partial<BuildProgressDashboardInput> = {},
): BuildProgressDashboardInput {
  return {
    commits: [],
    findings: [],
    now: NOW,
    progressEvents: [],
    requirements: { covered: 0, links: 0, total: 0 },
    todos: [],
    ...overrides,
  };
}

describe("the progress digest", () => {
  it("counts today, this week and since the last visit separately", () => {
    const dashboard = buildProgressDashboard(
      input({
        commits: [
          { occurredAt: NOW, sha: "a".repeat(40), summary: "today" },
          { occurredAt: dayAgo(3), sha: "b".repeat(40), summary: "this week" },
          { occurredAt: dayAgo(30), sha: "c".repeat(40), summary: "old" },
        ],
        findings: [{ id: "finding-1", occurredAt: dayAgo(1), title: "해소됨" }],
        lastVisitedAt: dayAgo(2),
        progressEvents: [
          {
            id: "event-1",
            occurredAt: NOW,
            refs: ["node-a"],
            status: "done",
            summary: "끝",
            task: "작업",
            todoId: "todo-1",
          },
        ],
      }),
    );

    expect(dashboard.digest.today).toMatchObject({
      commits: 1,
      findingsResolved: 0,
      progressEvents: 1,
      total: 2,
    });
    // Two days back: today's two entries plus yesterday's resolved finding.
    expect(dashboard.digest.sinceLastVisit).toMatchObject({
      commits: 1,
      findingsResolved: 1,
      progressEvents: 1,
      total: 3,
    });
    // Seven days back adds the three-day-old commit; the 30-day-old one is
    // outside every window, which is the point of having windows.
    expect(dashboard.digest.thisWeek.total).toBe(4);
  });

  /**
   * The acceptance criterion, stated as a property: a digest ref that no
   * timeline entry carries would send a reader to a node the screen never
   * mentioned.
   */
  it("never names a ref no timeline entry carries", () => {
    const dashboard = buildProgressDashboard(
      input({
        commits: [{ occurredAt: NOW, sha: "d".repeat(40), summary: "커밋" }],
        lastVisitedAt: dayAgo(1),
        progressEvents: [
          {
            id: "event-1",
            occurredAt: NOW,
            refs: ["node-a", "node-b"],
            status: "progress",
            summary: "진행",
            task: "작업",
            todoId: "todo-1",
          },
        ],
      }),
    );

    const timelineRefs = new Set(
      dashboard.timeline.flatMap((entry) => entry.refs),
    );
    const windows = [
      dashboard.digest.today,
      dashboard.digest.thisWeek,
      dashboard.digest.sinceLastVisit,
    ];
    for (const window of windows) {
      expect(window).not.toBeNull();
      for (const ref of window?.refs ?? []) {
        expect(timelineRefs.has(ref)).toBe(true);
      }
    }
    // Not vacuous, and exact: the union of what the counted entries named —
    // the event's two nodes and the commit's own sha, which is the ref a
    // commit entry carries.
    expect(dashboard.digest.today.refs).toEqual([
      "d".repeat(40),
      "node-a",
      "node-b",
    ]);
  });

  /**
   * Never visited is not "nothing new". A full-history window presented as
   * news would tell a first-time viewer that everything ever recorded
   * happened since they last looked.
   */
  it("reports no last-visit window when the screen has never been opened", () => {
    const dashboard = buildProgressDashboard(
      input({
        commits: [{ occurredAt: NOW, sha: "e".repeat(40), summary: "커밋" }],
      }),
    );

    expect(dashboard.digest.sinceLastVisit).toBeNull();
    expect(dashboard.digest.today.total).toBe(1);
  });

  it("ignores an unparseable last-visit stamp rather than counting from 1970", () => {
    const dashboard = buildProgressDashboard(
      input({
        commits: [{ occurredAt: NOW, sha: "f".repeat(40), summary: "커밋" }],
        lastVisitedAt: "not a date",
      }),
    );

    expect(dashboard.digest.sinceLastVisit).toBeNull();
  });
});

describe("the attention list", () => {
  it("holds an in-progress item that has not moved for a week", () => {
    const dashboard = buildProgressDashboard(
      input({
        todos: [
          todo({
            id: "fresh",
            status: "in-progress",
            updatedAt: dayAgo(STALE_AFTER_DAYS - 1),
          }),
          todo({
            id: "stale",
            status: "in-progress",
            updatedAt: dayAgo(STALE_AFTER_DAYS + 1),
          }),
          todo({ id: "open", status: "open", updatedAt: dayAgo(90) }),
        ],
      }),
    );

    // An open todo is not stale — nobody claimed to be working on it.
    expect(dashboard.attention.stale.map(({ id }) => id)).toEqual(["stale"]);
    expect(dashboard.attention.stale[0]?.reason).toMatch(/in progress since/);
  });

  it("orders both lists oldest first", () => {
    const dashboard = buildProgressDashboard(
      input({
        todos: [
          todo({ id: "b", status: "blocked", updatedAt: dayAgo(1) }),
          todo({ id: "a", status: "blocked", updatedAt: dayAgo(9) }),
          todo({ id: "d", status: "in-progress", updatedAt: dayAgo(8) }),
          todo({ id: "c", status: "in-progress", updatedAt: dayAgo(40) }),
        ],
      }),
    );

    // The thing that has been waiting longest is the thing to look at, and
    // an id-sorted list buries it.
    expect(dashboard.attention.blocked.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(dashboard.attention.stale.map(({ id }) => id)).toEqual(["c", "d"]);
  });

  it("takes a blocked item's reason from whoever blocked it", () => {
    const dashboard = buildProgressDashboard(
      input({
        progressEvents: [
          {
            id: "event-old",
            occurredAt: dayAgo(5),
            refs: [],
            status: "blocked",
            summary: "옛 사유",
            task: "작업",
            todoId: "todo-1",
          },
          {
            id: "event-new",
            occurredAt: dayAgo(1),
            refs: [],
            status: "blocked",
            summary: "스테이징 자격 증명 대기",
            task: "작업",
            todoId: "todo-1",
          },
        ],
        todos: [todo({ status: "blocked" })],
      }),
    );

    // The newest stated blocker, not the first one anybody wrote.
    expect(dashboard.attention.blocked[0]?.reason).toBe(
      "스테이징 자격 증명 대기",
    );
  });

  it("takes the newest blocker by instant, not by collation", () => {
    // A collating compare read PostgREST's `…:56+00:00` (zero microseconds,
    // no fraction written) as later than `…:56.5+00:00`, and text order reads
    // the fall-back hour's two offsets backwards. Both read orders.
    const blocker = (id: string, occurredAt: string, summary: string) => ({
      id,
      occurredAt,
      refs: [],
      status: "blocked" as const,
      summary,
      task: "작업",
      todoId: "todo-1",
    });
    const reasons = (earlier: string, later: string) => {
      const events = [
        blocker("event-a", earlier, "옛 사유"),
        blocker("event-b", later, "새 사유"),
      ];
      return [events, [...events].reverse()].map(
        (progressEvents) =>
          buildProgressDashboard(
            input({ progressEvents, todos: [todo({ status: "blocked" })] }),
          ).attention.blocked[0]?.reason,
      );
    };

    expect(
      reasons("2026-09-06T03:12:56+00:00", "2026-09-06T03:12:56.5+00:00"),
    ).toEqual(["새 사유", "새 사유"]);
    expect(
      reasons("2026-11-01T01:30:00-04:00", "2026-11-01T01:10:00-05:00"),
    ).toEqual(["새 사유", "새 사유"]);
  });

  it("orders both lists oldest first by instant, not by collation", () => {
    // `updated_at` arrives as PostgREST text: `…:56+00:00` at zero
    // microseconds is the older of the pair, and so is the fall-back hour's
    // `-04:00` reading. The older todo's id sorts last, both read orders.
    const lists = (earlier: string, later: string) => {
      const todos = [
        todo({ id: "blocked-b", status: "blocked", updatedAt: earlier }),
        todo({ id: "stale-b", status: "in-progress", updatedAt: earlier }),
        todo({ id: "blocked-a", status: "blocked", updatedAt: later }),
        todo({ id: "stale-a", status: "in-progress", updatedAt: later }),
      ];
      return [todos, [...todos].reverse()].map((read) => {
        const { attention } = buildProgressDashboard(
          input({ now: "2026-11-20T12:00:00.000Z", todos: read }),
        );
        return [attention.blocked, attention.stale].map((items) =>
          items.map(({ id }) => id),
        );
      });
    };
    const oldestFirst = [
      ["blocked-b", "blocked-a"],
      ["stale-b", "stale-a"],
    ];

    expect(
      lists("2026-11-01T03:12:56+00:00", "2026-11-01T03:12:56.5+00:00"),
    ).toEqual([oldestFirst, oldestFirst]);
    expect(
      lists("2026-11-01T01:30:00-04:00", "2026-11-01T01:10:00-05:00"),
    ).toEqual([oldestFirst, oldestFirst]);
  });

  /**
   * A blocked item nobody explained is the one worth showing. Dropping it
   * from the list, or giving it an empty reason that renders as a blank, is
   * how a board stops being a record of what is stuck.
   */
  it("says so when a blocked item has no stated blocker", () => {
    const dashboard = buildProgressDashboard(
      input({ todos: [todo({ id: "silent", status: "blocked" })] }),
    );

    expect(dashboard.attention.blocked).toHaveLength(1);
    expect(dashboard.attention.blocked[0]?.reason).toBe(NO_STATED_BLOCKER);
    expect(
      dashboard.attention.blocked[0]?.reason.trim().length,
    ).toBeGreaterThan(0);
  });

  it("is empty when nothing is stuck", () => {
    const dashboard = buildProgressDashboard(
      input({ todos: [todo({ status: "done" })] }),
    );

    expect(dashboard.attention).toEqual({ blocked: [], stale: [] });
  });
});

/**
 * The timeline's two blind spots (Phase 4 Wave D todo 19 ⑸).
 *
 * A commit row named a sha with nowhere to take it, and a local scan showed
 * nothing at all: `alrescha push` writes no receipt, and the timeline was
 * built from receipts. A repository maintained entirely through the CLI had
 * an empty ledger while its graph was updated daily.
 */
describe("the timeline", () => {
  it("points a commit entry at the receipt it describes", () => {
    const sha = "a".repeat(40);
    const dashboard = buildProgressDashboard(
      input({ commits: [{ occurredAt: NOW, sha, summary: "요구사항 3" }] }),
    );

    expect(dashboard.timeline[0]).toMatchObject({
      href: `/app/commits#${sha}`,
      kind: "commit",
    });
  });

  it("shows a local scan, and says what it did not produce", () => {
    const sha = "b".repeat(40);
    const dashboard = buildProgressDashboard(
      input({ localScans: [{ occurredAt: NOW, sha }] }),
    );

    expect(dashboard.timeline).toHaveLength(1);
    expect(dashboard.timeline[0]).toMatchObject({
      kind: "local-scan",
      status: "graph-only",
      summary: LOCAL_SCAN_SUMMARY,
    });
    // Not a commit: calling it one would put "graph only" and "analysed"
    // under a single label (ADR-015 §7).
    expect(dashboard.timeline[0]?.href).toBeUndefined();
    expect(LOCAL_SCAN_SUMMARY).toMatch(/no findings or receipt/);
  });

  it("counts a local scan in the digest like any other entry", () => {
    const dashboard = buildProgressDashboard(
      input({
        localScans: [{ occurredAt: NOW, sha: "c".repeat(40) }],
      }),
    );

    expect(dashboard.digest.today.total).toBe(1);
    // A scan is not a commit, so the commit count stays honest.
    expect(dashboard.digest.today.commits).toBe(0);
  });

  it("puts the newest entry first by instant, not by collation", () => {
    // Every entry's time is PostgREST text: `…:56+00:00` at zero microseconds
    // is half a second before `…:56.5+00:00`, which a collating compare read
    // the other way round, and text order reads the fall-back hour's two
    // offsets backwards. The newer entry's id sorts last, both read orders.
    const event = (id: string, occurredAt: string) => ({
      id,
      occurredAt,
      refs: [],
      status: "progress" as const,
      summary: "진행",
      task: "작업",
      todoId: "todo-1",
    });
    const newestFirst = (earlier: string, later: string) => {
      const events = [event("event-a", earlier), event("event-b", later)];
      return [events, [...events].reverse()].map((progressEvents) =>
        buildProgressDashboard(input({ progressEvents })).timeline.map(
          ({ id }) => id,
        ),
      );
    };

    expect(
      newestFirst("2026-09-06T03:12:56+00:00", "2026-09-06T03:12:56.5+00:00"),
    ).toEqual([
      ["event-b", "event-a"],
      ["event-b", "event-a"],
    ]);
    expect(
      newestFirst("2026-11-01T01:30:00-04:00", "2026-11-01T01:10:00-05:00"),
    ).toEqual([
      ["event-b", "event-a"],
      ["event-b", "event-a"],
    ]);
  });
});
