import { Icon } from "./ui-icon";
import {
  NO_STATED_BLOCKER,
  type ProgressAttentionItem,
  type ProgressDashboard,
  type ProgressDigestWindow,
  type ProgressMetric,
  type ProgressTodo,
} from "@alrescha/core";
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  Circle,
  Clock3,
  FileCheck2,
  GitCommitHorizontal,
  Link2,
} from "lucide-react";

import { PROGRESS } from "../../lib/strings";
import { ProductSectionHeader } from "./page-layout";

interface ProgressDashboardViewProps {
  readonly report: ProgressDashboard;
}

const STATUS_COPY = {
  blocked: { icon: AlertOctagon, label: PROGRESS.todoBoard.statuses.blocked },
  done: { icon: CheckCircle2, label: PROGRESS.todoBoard.statuses.done },
  "in-progress": {
    icon: Activity,
    label: PROGRESS.todoBoard.statuses["in-progress"],
  },
  open: { icon: Circle, label: PROGRESS.todoBoard.statuses.open },
} as const;

const STATE_COPY = PROGRESS.states;

/** Refs a digest window lists before it says "and n more". */
const DIGEST_REFS_SHOWN = 6;

function sourceLabel(todo: ProgressTodo): string {
  return todo.source.kind === "document"
    ? `${todo.source.path}:L${todo.source.startLine}`
    : `log_progress · ${todo.source.eventId}`;
}

function sourceHref(todo: ProgressTodo): string {
  return todo.source.kind === "document"
    ? `/findings?source=${encodeURIComponent(todo.source.path)}#L${todo.source.startLine}-L${todo.source.endLine}`
    : `#${todo.source.eventId}`;
}

function dateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * What the card says when there is no percentage: a metric whose link is
 * missing says so, instead of borrowing the empty-state copy (R5 D6).
 */
function metricValue(metric: ProgressMetric): string {
  if (metric.percent !== null) return `${metric.percent}%`;
  return metric.basis === "no-links"
    ? PROGRESS.metrics.noLinks
    : PROGRESS.metrics.notMeasured;
}

function Metric({ metric, title }: { metric: ProgressMetric; title: string }) {
  const value = metricValue(metric);
  return (
    <article className="progress-metric" data-basis={metric.basis}>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
      <progress
        aria-label={`${title}: ${value}`}
        max={metric.total || 1}
        value={metric.completed}
      />
      <footer>
        <span>
          {PROGRESS.metrics.completed(metric.completed, metric.total)}
        </span>
        <small>
          <Icon icon={Link2} size="xs" />
          {metric.sourceLabel}
        </small>
      </footer>
    </article>
  );
}

/**
 * One window of the digest (todo 19 ⑵). `null` is the third window for a
 * viewer who has never opened the screen — a fact of its own, not "nothing
 * new", so it gets its own sentence rather than a zero.
 */
function DigestWindow({
  label,
  window,
  windowKey,
}: {
  readonly label: string;
  readonly window: ProgressDigestWindow | null;
  readonly windowKey: "sinceLastVisit" | "thisWeek" | "today";
}) {
  const shownRefs = window?.refs.slice(0, DIGEST_REFS_SHOWN) ?? [];
  const hiddenRefs = (window?.refs.length ?? 0) - shownRefs.length;
  return (
    <div
      className="digest-window"
      data-total={window === null ? "never-visited" : window.total}
      data-window={windowKey}
    >
      <dt>{label}</dt>
      <dd>
        {window === null ? (
          <span className="digest-never">{PROGRESS.digest.neverVisited}</span>
        ) : window.total === 0 ? (
          <span className="digest-empty">{PROGRESS.digest.empty}</span>
        ) : (
          <>
            <strong>{PROGRESS.digest.total(window.total)}</strong>
            <span>
              {PROGRESS.digest.counts(
                window.progressEvents,
                window.commits,
                window.findingsResolved,
              )}
            </span>
          </>
        )}
        {shownRefs.length > 0 ? (
          <p className="digest-refs">
            {shownRefs.map((ref) => (
              <code key={ref}>{ref}</code>
            ))}
            {hiddenRefs > 0 ? (
              <small>{PROGRESS.digest.moreRefs(hiddenRefs)}</small>
            ) : null}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * The items asking to be looked at (todo 19 ⑵), oldest first as the model
 * orders them. A stale item's reason is the label itself; a blocked item's
 * is whoever blocked it, or the model's marker for "nobody wrote one" —
 * shown as that sentence, never hidden.
 */
function AttentionList({
  items,
  kind,
  label,
}: {
  readonly items: readonly ProgressAttentionItem[];
  readonly kind: "blocked" | "stale";
  readonly label: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className={`attention-list ${kind}`} data-kind={kind}>
      <h3>
        {label}
        <span>{items.length}</span>
      </h3>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            {kind === "blocked" ? (
              <p
                className="attention-reason"
                data-stated={item.reason !== NO_STATED_BLOCKER}
              >
                {item.reason === NO_STATED_BLOCKER
                  ? PROGRESS.attention.noBlocker
                  : item.reason}
              </p>
            ) : null}
            <time dateTime={item.since}>
              {PROGRESS.attention.sinceLabel} {dateOnly(item.since)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ProgressDashboardView({ report }: ProgressDashboardViewProps) {
  const state = STATE_COPY[report.state];
  const attentionCount =
    report.attention.stale.length + report.attention.blocked.length;
  return (
    <main
      className="progress-main product-page"
      data-progress-state={report.state}
    >
      <section
        className={`progress-state ${report.state}`}
        aria-labelledby="progress-title"
      >
        <div className="progress-state-mark">
          <Icon icon={FileCheck2} size="md" />
        </div>
        <div>
          <p className="progress-kicker">{PROGRESS.kicker}</p>
          <h1 id="progress-title">{state.label}</h1>
          <p>{state.description}</p>
        </div>
        <span className="source-contract">
          <span />
          {PROGRESS.sourceContract}
        </span>
      </section>

      <section className="progress-metrics" aria-label={PROGRESS.ariaMetrics}>
        <Metric
          metric={report.metrics.requirements}
          title={PROGRESS.metrics.requirements}
        />
        <Metric metric={report.metrics.todos} title={PROGRESS.metrics.todos} />
      </section>

      <section
        className="progress-section progress-digest"
        aria-labelledby="digest-title"
        data-testid="progress-digest"
      >
        <ProductSectionHeader
          kicker={PROGRESS.digest.kicker}
          title={PROGRESS.digest.title}
          titleId="digest-title"
        />
        <dl className="digest-windows">
          <DigestWindow
            label={PROGRESS.digest.today}
            window={report.digest.today}
            windowKey="today"
          />
          <DigestWindow
            label={PROGRESS.digest.thisWeek}
            window={report.digest.thisWeek}
            windowKey="thisWeek"
          />
          <DigestWindow
            label={PROGRESS.digest.sinceLastVisit}
            window={report.digest.sinceLastVisit}
            windowKey="sinceLastVisit"
          />
        </dl>
      </section>

      <section
        className="progress-section progress-attention"
        aria-labelledby="attention-title"
        data-blocked={report.attention.blocked.length}
        data-stale={report.attention.stale.length}
        data-testid="progress-attention"
      >
        <ProductSectionHeader
          count={`${attentionCount}${PROGRESS.attention.countSuffix}`}
          kicker={PROGRESS.attention.kicker}
          title={PROGRESS.attention.title}
          titleId="attention-title"
        />
        {attentionCount === 0 ? (
          <p className="attention-empty">{PROGRESS.attention.empty}</p>
        ) : (
          <div className="attention-lists">
            <AttentionList
              items={report.attention.stale}
              kind="stale"
              label={PROGRESS.attention.staleLabel}
            />
            <AttentionList
              items={report.attention.blocked}
              kind="blocked"
              label={PROGRESS.attention.blockedLabel}
            />
          </div>
        )}
      </section>

      <section className="progress-section" aria-labelledby="todo-board-title">
        <ProductSectionHeader
          count={`${report.columns.reduce(
            (count, column) => count + column.items.length,
            0,
          )}${PROGRESS.todoBoard.itemsSuffix}`}
          kicker={PROGRESS.todoBoard.kicker}
          title={PROGRESS.todoBoard.title}
          titleId="todo-board-title"
        />
        <div className="todo-board">
          {report.columns.map((column) => {
            const status = STATUS_COPY[column.status];
            const ColumnIcon = status.icon;
            return (
              <section
                className={`todo-column ${column.status}`}
                key={column.status}
              >
                <header>
                  <Icon icon={ColumnIcon} size="sm" />
                  <h3>{status.label}</h3>
                  <span>{column.items.length}</span>
                </header>
                <div className="todo-stack">
                  {column.items.length === 0 ? (
                    <p className="todo-empty">{PROGRESS.todoBoard.empty}</p>
                  ) : null}
                  {column.items.map((todo) => (
                    <article className="todo-card" key={todo.id}>
                      {todo.requirementId ? (
                        <small className="todo-requirement">
                          {todo.requirementId}
                        </small>
                      ) : null}
                      <h4>{todo.title}</h4>
                      <a className="todo-source" href={sourceHref(todo)}>
                        <Icon icon={Link2} size="xs" />
                        {sourceLabel(todo)}
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section
        className="progress-section timeline-section"
        aria-labelledby="timeline-title"
      >
        <ProductSectionHeader
          count={PROGRESS.timeline.eventCount(report.timeline.length)}
          kicker={PROGRESS.timeline.kicker}
          title={PROGRESS.timeline.title}
          titleId="timeline-title"
        />
        {report.timeline.length === 0 ? (
          <div className="timeline-empty">
            <Icon icon={Clock3} size="md" />
            <span>{PROGRESS.timeline.empty}</span>
          </div>
        ) : (
          <ol className="progress-timeline">
            {report.timeline.map((event) => (
              <li
                id={event.kind === "progress" ? event.id : undefined}
                key={event.id}
              >
                <span className={`timeline-glyph ${event.kind}`}>
                  {event.kind === "commit" ? (
                    <Icon icon={GitCommitHorizontal} size="xs" />
                  ) : event.kind === "finding-resolved" ? (
                    <Icon icon={CheckCircle2} size="xs" />
                  ) : (
                    <Icon icon={Activity} size="xs" />
                  )}
                </span>
                <article>
                  <header>
                    <strong>{event.title}</strong>
                    <time dateTime={event.occurredAt}>
                      {new Date(event.occurredAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " · ")}
                      Z
                    </time>
                  </header>
                  <p>{event.summary}</p>
                  <footer>
                    <span>
                      {event.kind.replace("-", " ")} · {event.status}
                    </span>
                    {event.refs.map((ref) => (
                      <code key={ref}>{ref}</code>
                    ))}
                  </footer>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
