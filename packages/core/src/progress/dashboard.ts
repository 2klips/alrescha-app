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

export interface ProgressFindingInput {
  readonly id: string;
  readonly occurredAt: string;
  readonly title: string;
}

export interface BuildProgressDashboardInput {
  readonly commits: readonly ProgressCommitInput[];
  readonly findings: readonly ProgressFindingInput[];
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
  readonly columns: Array<{ items: ProgressTodo[]; status: TodoStatus }>;
  readonly metrics: {
    requirements: ProgressMetric;
    todos: ProgressMetric;
  };
  readonly state: "empty" | "partial" | "full";
  readonly timeline: Array<{
    id: string;
    kind: "commit" | "finding-resolved" | "progress";
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
      id: `commit:${commit.sha}`,
      kind: "commit" as const,
      occurredAt: commit.occurredAt,
      refs: [commit.sha],
      status: "committed",
      summary: commit.summary,
      title: commit.sha,
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
      right.occurredAt.localeCompare(left.occurredAt) ||
      left.id.localeCompare(right.id),
  );
  return {
    columns: TODO_STATUSES.map((status) => ({
      items: input.todos
        .filter((todo) => todo.status === status)
        .map((todo) => ({ ...todo, source: { ...todo.source } })),
      status,
    })),
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
