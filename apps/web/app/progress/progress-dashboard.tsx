import type { ProgressDashboard, ProgressTodo } from "@specproof/core";
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

interface ProgressDashboardViewProps {
  readonly report: ProgressDashboard;
}

const STATUS_COPY = {
  blocked: { icon: AlertOctagon, label: "Blocked" },
  done: { icon: CheckCircle2, label: "Done" },
  "in-progress": { icon: Activity, label: "In progress" },
  open: { icon: Circle, label: "Open" },
} as const;

const STATE_COPY = {
  empty: {
    description:
      "Scan a TODO/progress document or send one compact log_progress event.",
    label: "No tracked progress yet",
  },
  full: {
    description:
      "Every tracked requirement and todo has source-backed completion evidence.",
    label: "Fully traced",
  },
  partial: {
    description:
      "Completion remains open or blocked. Counts below come only from stored sources.",
    label: "Partial evidence",
  },
} as const;

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
          {metric.percent === null ? "Not measured" : `${metric.percent}%`}
        </strong>
      </div>
      <progress
        aria-label={`${title}: ${metric.percent === null ? "not measured" : `${metric.percent}%`}`}
        max={metric.total || 1}
        value={metric.completed}
      />
      <footer>
        <span>
          {metric.completed} / {metric.total} complete
        </span>
        <small>
          <Link2 size={11} />
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
          <FileCheck2 size={22} />
        </div>
        <div>
          <p className="progress-kicker">Repository progress ledger</p>
          <h1 id="progress-title">{state.label}</h1>
          <p>{state.description}</p>
        </div>
        <span className="source-contract">
          <span />
          source-backed only
        </span>
      </section>

      <section className="progress-metrics" aria-label="Coverage metrics">
        <Metric
          metric={report.metrics.requirements}
          title="Requirement coverage"
        />
        <Metric metric={report.metrics.todos} title="Todo completion" />
      </section>

      <section className="progress-section" aria-labelledby="todo-board-title">
        <header className="progress-section-heading">
          <div>
            <span>Current state</span>
            <h2 id="todo-board-title">Todo board</h2>
          </div>
          <small>
            {report.columns.reduce(
              (count, column) => count + column.items.length,
              0,
            )}{" "}
            sourced items
          </small>
        </header>
        <div className="todo-board">
          {report.columns.map((column) => {
            const status = STATUS_COPY[column.status];
            const Icon = status.icon;
            return (
              <section
                className={`todo-column ${column.status}`}
                key={column.status}
              >
                <header>
                  <Icon size={15} />
                  <h3>{status.label}</h3>
                  <span>{column.items.length}</span>
                </header>
                <div className="todo-stack">
                  {column.items.length === 0 ? (
                    <p className="todo-empty">No sourced items</p>
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
                        <Link2 size={11} />
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
            <span>Newest first</span>
            <h2 id="timeline-title">Recent work</h2>
          </div>
          <small>{report.timeline.length} verified events</small>
        </header>
        {report.timeline.length === 0 ? (
          <div className="timeline-empty">
            <Clock3 size={18} />
            <span>No progress events, commits, or resolved findings.</span>
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
                    <GitCommitHorizontal size={14} />
                  ) : event.kind === "finding-resolved" ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Activity size={14} />
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
