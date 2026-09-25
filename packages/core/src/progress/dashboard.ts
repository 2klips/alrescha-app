import { byInstant } from "../data/instant-order";
import type { TodoStatus } from "./todos";

export interface ProgressTodo {
  readonly id: string;
  readonly requirementId: string | null;
  readonly source:
    | {
        readonly endLine: number;
        readonly kind: "document";
        readonly path: string;
        readonly startLine: number;
      }
    | { readonly eventId: string; readonly kind: "progress-event" };
  readonly status: TodoStatus;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ProgressEventInput {
  readonly id: string;
  readonly occurredAt: string;
  readonly refs: readonly string[];
  readonly status: "started" | "progress" | "done" | "blocked";
  readonly summary: string;
  readonly task: string;
  readonly todoId: string;
}

export interface ProgressCommitInput {
  readonly occurredAt: string;
  readonly sha: string;
  readonly summary: string;
}

/**
 * A local scan, which produces no receipt (Phase 4 Wave D todo 19 ⑸).
 *
 * `alrescha push` fills the graph and stops there: the server has no bodies,
 * so no analysis runs and no receipt is written (ADR-015 §7). The timeline is
 * built from receipts, so a repository maintained entirely through the CLI
 * showed an empty ledger while its graph was being updated daily — the
 * product looked broken to the users doing the most work.
 *
 * It is a separate timeline kind rather than a commit, because it is not one:
 * calling it a commit would put "graph only" and "analysed" under one label.
 */
export interface ProgressLocalScanInput {
  readonly occurredAt: string;
  readonly sha: string;
}

export interface ProgressFindingInput {
  readonly id: string;
  readonly occurredAt: string;
  readonly title: string;
}

/**
 * What happened inside one window (Phase 4 Wave D todo 19 ⑵).
 *
 * The board answers "where does everything stand"; this answers "what moved",
 * which is the question someone opening the screen after two days actually
 * has. Counts only — the timeline below it is the detail.
 *
 * `refs` are the node ids the window's events named, and they come from
 * those events rather than being re-derived, so a digest can never point at
 * something no entry mentions.
 */
export interface ProgressDigestWindow {
  readonly commits: number;
  readonly findingsResolved: number;
  /** Inclusive lower bound, ISO. Entries at or after it are counted. */
  readonly from: string;
  readonly progressEvents: number;
  readonly refs: string[];
  readonly total: number;
}

export interface ProgressDigest {
  /** Null when this viewer has never opened the screen — not "nothing new". */
  readonly sinceLastVisit: ProgressDigestWindow | null;
  readonly thisWeek: ProgressDigestWindow;
  readonly today: ProgressDigestWindow;
}

/**
 * One item asking to be looked at, and why.
 *
 * `reason` is not optional. A blocked item whose blocker nobody wrote down is
 * the case worth surfacing, not the case worth hiding, so it carries the
 * absence as its reason rather than being dropped from the list.
 */
export interface ProgressAttentionItem {
  readonly id: string;
  readonly reason: string;
  /** When it last moved, ISO — what makes a stale item stale. */
  readonly since: string;
  readonly title: string;
}

export interface ProgressAttention {
  readonly blocked: ProgressAttentionItem[];
  /** In progress and untouched for `STALE_AFTER_DAYS`. */
  readonly stale: ProgressAttentionItem[];
}

/** How long an in-progress item may sit before the board asks about it. */
export const STALE_AFTER_DAYS = 7;

export interface BuildProgressDashboardInput {
  readonly commits: readonly ProgressCommitInput[];
  readonly findings: readonly ProgressFindingInput[];
  /** Scans the CLI applied, which write no receipt. */
  readonly localScans?: readonly ProgressLocalScanInput[];
  /**
   * When this viewer last opened the screen, ISO. Absent or null means never,
   * which produces a null `sinceLastVisit` rather than a full-history window
   * pretending to be news.
   */
  readonly lastVisitedAt?: string | null;
  /** Clock, injectable so a digest is testable. Defaults to now. */
  readonly now?: string;
  readonly progressEvents: readonly ProgressEventInput[];
  readonly requirements: {
    /** Active requirements carrying at least one `implements` edge. */
    readonly covered: number;
    /**
     * `implements` edges stored for this repository, whatever they point at.
     * Zero of them means requirement coverage was never linked, so it cannot
     * be measured — a state `covered / total` alone cannot express, because
     * it reads identically to "linked, and nothing is implemented".
     */
    readonly links: number;
    readonly total: number;
  };
  readonly todos: readonly ProgressTodo[];
}

export interface ProgressDashboard {
  readonly attention: ProgressAttention;
  readonly columns: Array<{ items: ProgressTodo[]; status: TodoStatus }>;
  readonly digest: ProgressDigest;
  readonly metrics: {
    requirements: ProgressMetric;
    todos: ProgressMetric;
  };
  readonly state: "empty" | "partial" | "full";
  readonly timeline: Array<{
    /**
     * Where this entry can be opened, when there is somewhere. A commit has
     * a receipt on `/app/commits`; a progress event has no screen of its own
     * (todo 19 ⑸).
     */
    href?: string;
    id: string;
    kind: "commit" | "finding-resolved" | "local-scan" | "progress";
    occurredAt: string;
    refs: string[];
    status: string;
    summary: string;
    title: string;
  }>;
}

/**
 * Why a metric shows the number it shows.
 *
 * `measured` — the inputs support a percentage.
 * `no-links`  — the inputs exist but the link they would be measured through
 *   does not, so the percentage is unknown rather than zero.
 * `no-data`   — nothing has been recorded for this metric yet.
 *
 * Splitting these apart is what keeps the screen from reporting 0% coverage
 * for a repository whose requirements were simply never linked to code
 * (WORK_SPEC §3-8: no false precision — say "insufficient evidence").
 */
export type ProgressMetricBasis = "measured" | "no-data" | "no-links";

export interface ProgressMetric {
  readonly basis: ProgressMetricBasis;
  readonly completed: number;
  /** Null exactly when `basis` is not `measured`. */
  readonly percent: number | null;
  readonly sourceLabel: string;
  readonly total: number;
}

const TODO_STATUSES: readonly TodoStatus[] = [
  "open",
  "in-progress",
  "done",
  "blocked",
];

function metric(
  completed: number,
  total: number,
  sourceLabel: string,
  basis: ProgressMetricBasis = total === 0 ? "no-data" : "measured",
): ProgressMetric {
  return {
    basis,
    completed,
    percent:
      basis === "measured" ? Math.round((completed / total) * 100) : null,
    sourceLabel,
    total,
  };
}

/**
 * Requirement coverage is measurable only once something links requirements
 * to code. Before that the honest answer is "not measured", not 0% (R5 §2.2
 * D6 — the `implements` writer landed in Phase 4 Wave A todo 1, and every
 * screen read a structural absence as a score until it did).
 */
function requirementBasis(requirements: {
  readonly links: number;
  readonly total: number;
}): ProgressMetricBasis {
  if (requirements.total === 0) return "no-data";
  return requirements.links === 0 ? "no-links" : "measured";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a local scan did, and what it did not. ADR-015 §7: this path says
 * first what it cannot produce, rather than leaving a reader to assume a
 * scan and an analysis are the same thing.
 */
export const LOCAL_SCAN_SUMMARY =
  "scanned locally — graph only, no findings or receipt";

/**
 * Count one window of the timeline, and carry the refs its entries named.
 *
 * The refs are collected from the entries counted rather than gathered
 * separately, which is what makes "the digest never points at something the
 * timeline does not mention" a property of the construction instead of a
 * check somebody has to remember to run.
 */
function digestWindow(
  timeline: ProgressDashboard["timeline"],
  from: Date,
): ProgressDigestWindow {
  const iso = from.toISOString();
  // By instant: entry times are PostgREST text (`+00:00`, fraction trimmed,
  // or another session offset) and `iso` is `Z` text, so a string compare
  // dropped an entry at exactly the window start and misplaced every other
  // offset. `from` is whole milliseconds, which is all `Date.parse` keeps.
  const fromMs = from.getTime();
  const entries = timeline.filter(
    (entry) => Date.parse(entry.occurredAt) >= fromMs,
  );
  const refs = new Set<string>();
  for (const entry of entries) for (const ref of entry.refs) refs.add(ref);
  return {
    commits: entries.filter((entry) => entry.kind === "commit").length,
    findingsResolved: entries.filter(
      (entry) => entry.kind === "finding-resolved",
    ).length,
    from: iso,
    progressEvents: entries.filter((entry) => entry.kind === "progress").length,
    refs: [...refs].sort(),
    total: entries.length,
  };
}

/**
 * Why a blocked todo is blocked, in the words of whoever blocked it.
 *
 * A `log_progress` event with status `blocked` carries a summary; that is the
 * reason. A todo blocked by a document checkbox has nobody's sentence behind
 * it, and saying so is more useful than an empty string that reads as "no
 * problem here".
 */
function blockedReason(
  todo: ProgressTodo,
  events: readonly ProgressEventInput[],
): string {
  const stated = events
    .filter(
      (event) =>
        event.status === "blocked" &&
        event.summary.trim().length > 0 &&
        (event.todoId === todo.id ||
          (todo.source.kind === "progress-event" &&
            event.id === todo.source.eventId)),
    )
    .sort((left, right) => byInstant(right.occurredAt, left.occurredAt))[0];
  return stated?.summary ?? NO_STATED_BLOCKER;
}

/** The reason a blocked item carries when nobody wrote one. */
export const NO_STATED_BLOCKER = "no blocker was recorded";

function attentionFor(
  input: BuildProgressDashboardInput,
  now: Date,
): ProgressAttention {
  // An instant, compared with `Date.parse` below: `updatedAt` is PostgREST
  // text in the session's offset, which a string compare against `Z` text
  // read hours off.
  const staleBeforeMs = now.getTime() - STALE_AFTER_DAYS * DAY_MS;
  // Oldest first in both lists: the thing that has been waiting longest is
  // the thing to look at, and a list sorted by id would bury it.
  const byAge = (
    left: ProgressAttentionItem,
    right: ProgressAttentionItem,
  ): number =>
    byInstant(left.since, right.since) || left.id.localeCompare(right.id);
  return {
    blocked: input.todos
      .filter((todo) => todo.status === "blocked")
      .map((todo) => ({
        id: todo.id,
        reason: blockedReason(todo, input.progressEvents),
        since: todo.updatedAt,
        title: todo.title,
      }))
      .sort(byAge),
    stale: input.todos
      .filter(
        (todo) =>
          todo.status === "in-progress" &&
          Date.parse(todo.updatedAt) < staleBeforeMs,
      )
      .map((todo) => ({
        id: todo.id,
        reason: `in progress since ${todo.updatedAt.slice(0, 10)}`,
        since: todo.updatedAt,
        title: todo.title,
      }))
      .sort(byAge),
  };
}

export function buildProgressDashboard(
  input: BuildProgressDashboardInput,
): ProgressDashboard {
  const completedTodos = input.todos.filter(
    ({ status }) => status === "done",
  ).length;
  const empty =
    input.requirements.total === 0 &&
    input.todos.length === 0 &&
    input.progressEvents.length === 0 &&
    input.commits.length === 0 &&
    input.findings.length === 0;
  const full =
    input.requirements.total > 0 &&
    input.requirements.covered >= input.requirements.total &&
    input.todos.length > 0 &&
    completedTodos === input.todos.length;
  const timeline: ProgressDashboard["timeline"] = [
    ...input.progressEvents.map((event) => ({
      id: event.id,
      kind: "progress" as const,
      occurredAt: event.occurredAt,
      refs: [...event.refs],
      status: event.status,
      summary: event.summary,
      title: event.task,
    })),
    ...input.commits.map((commit) => ({
      // The receipt this entry describes is on the commits screen, and until
      // now the row named a sha with nowhere to take it.
      href: `/app/commits#${commit.sha}`,
      id: `commit:${commit.sha}`,
      kind: "commit" as const,
      occurredAt: commit.occurredAt,
      refs: [commit.sha],
      status: "committed",
      summary: commit.summary,
      title: commit.sha,
    })),
    ...(input.localScans ?? []).map((scan) => ({
      id: `local-scan:${scan.sha}`,
      kind: "local-scan" as const,
      occurredAt: scan.occurredAt,
      refs: [scan.sha],
      // The status is the caveat: the graph moved and nothing was assured.
      status: "graph-only",
      summary: LOCAL_SCAN_SUMMARY,
      title: scan.sha,
    })),
    ...input.findings.map((finding) => ({
      id: `finding:${finding.id}`,
      kind: "finding-resolved" as const,
      occurredAt: finding.occurredAt,
      refs: [finding.id],
      status: "resolved",
      summary: finding.title,
      title: finding.title,
    })),
  ].sort(
    (left, right) =>
      byInstant(right.occurredAt, left.occurredAt) ||
      left.id.localeCompare(right.id),
  );
  const now = input.now ? new Date(input.now) : new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const visited = input.lastVisitedAt ? new Date(input.lastVisitedAt) : null;
  return {
    attention: attentionFor(input, now),
    columns: TODO_STATUSES.map((status) => ({
      items: input.todos
        .filter((todo) => todo.status === status)
        .map((todo) => ({ ...todo, source: { ...todo.source } })),
      status,
    })),
    digest: {
      sinceLastVisit:
        visited && !Number.isNaN(visited.getTime())
          ? digestWindow(timeline, visited)
          : null,
      thisWeek: digestWindow(timeline, new Date(now.getTime() - 7 * DAY_MS)),
      today: digestWindow(timeline, startOfToday),
    },
    metrics: {
      requirements: metric(
        input.requirements.covered,
        input.requirements.total,
        "Evidence graph requirement coverage",
        requirementBasis(input.requirements),
      ),
      todos: metric(
        completedTodos,
        input.todos.length,
        "TODO/progress checkboxes + log_progress events",
      ),
    },
    state: empty ? "empty" : full ? "full" : "partial",
    timeline,
  };
}
