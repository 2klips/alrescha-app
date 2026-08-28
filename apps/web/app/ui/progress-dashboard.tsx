import { Icon } from "./ui-icon";
import type { ProgressDashboard, ProgressTodo } from "@arr/core";
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

function Metric({
  metric,
  title,
}: {
  metric: ProgressDashboard["metrics"]["todos"];
  title: string;
}) {
  return (
    <article className="progress-metric">
      <div>
        <span>{title}</span>
        <strong>
          {metric.percent === null
            ? PROGRESS.metrics.notMeasured
            : `${metric.percent}%`}
        </strong>
      </div>
      <progress
        aria-label={`${title}: ${metric.percent === null ? PROGRESS.metrics.notMeasured : `${metric.percent}%`}`}
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

export function ProgressDashboardView({ report }: ProgressDashboardViewProps) {
  const state = STATE_COPY[report.state];
  return (
    <main className="progress-main" data-progress-state={report.state}>
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

      <section className="progress-section" aria-labelledby="todo-board-title">
        <header className="progress-section-heading">
          <div>
            <span>{PROGRESS.todoBoard.kicker}</span>
            <h2 id="todo-board-title">{PROGRESS.todoBoard.title}</h2>
          </div>
          <small>
            {report.columns.reduce(
              (count, column) => count + column.items.length,
              0,
            )}
            {PROGRESS.todoBoard.itemsSuffix}
          </small>
        </header>
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
        <header className="progress-section-heading">
          <div>
            <span>{PROGRESS.timeline.kicker}</span>
            <h2 id="timeline-title">{PROGRESS.timeline.title}</h2>
          </div>
          <small>{PROGRESS.timeline.eventCount(report.timeline.length)}</small>
        </header>
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
