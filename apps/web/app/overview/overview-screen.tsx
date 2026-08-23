import {
  Activity,
  ArrowUpRight,
  Brain,
  GitCommitHorizontal,
  ListTodo,
  Network,
} from "lucide-react";
import Link from "next/link";

import type {
  OverviewViewModel,
  OverviewTodo,
} from "../../lib/overview/view-model";
import { GRADE } from "../../lib/strings/common";
import { SideNav } from "../ui/side-nav";
import { OVERVIEW } from "../../lib/strings/overview";

/**
 * Four-zone overview (Phase 2D Wave 1) — the calm entry point. Every zone is
 * a summary of a full screen and links to it; nothing here is interactive
 * beyond navigation, so the page stays instantly legible.
 */

const NODE_TYPE_CLASS = {
  code: "code",
  document: "doc",
  requirement: "req",
  test: "test",
} as const;

function ZoneHeader({
  href,
  icon: Icon,
  id,
  lead,
  openLabel,
  title,
}: {
  href: string;
  icon: typeof Network;
  id: string;
  lead: string;
  openLabel: string;
  title: string;
}) {
  return (
    <header className="overview-zone-head">
      <div>
        <h2 id={id}>
          <Icon size={15} aria-hidden />
          {title}
        </h2>
        <p>{lead}</p>
      </div>
      <Link className="overview-zone-open" href={href}>
        {openLabel}
        <ArrowUpRight size={12} aria-hidden />
      </Link>
    </header>
  );
}

function GraphZone({ model }: { model: OverviewViewModel }) {
  // A static miniature: node positions come from the same layout the full
  // dashboard computes, projected into a fixed viewBox. No renderer, no
  // interaction — the zone is a preview, the link is the feature.
  const nodes = model.graph.nodes;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1);
  const spanY = Math.max(Math.max(...ys) - minY, 1);

  return (
    <section
      className="overview-zone overview-zone--graph"
      aria-labelledby="overview-graph-title"
    >
      <ZoneHeader
        href="/map"
        icon={Network}
        id="overview-graph-title"
        lead={OVERVIEW.graph.lead}
        openLabel={OVERVIEW.graph.open}
        title={OVERVIEW.graph.title}
      />
      <svg
        className="overview-minimap"
        role="img"
        aria-label={OVERVIEW.graph.summary(
          model.graph.nodeCount,
          model.graph.edgeCount,
        )}
        viewBox="0 0 320 150"
      >
        {nodes.map((node) => (
          <circle
            key={node.id}
            className={`overview-mini-node ${NODE_TYPE_CLASS[node.type]}`}
            cx={16 + ((node.x - minX) / spanX) * 288}
            cy={14 + ((node.y - minY) / spanY) * 122}
            r={node.type === "requirement" ? 5 : 3.5}
          />
        ))}
      </svg>
      <footer className="overview-graph-foot">
        <span>
          {OVERVIEW.graph.summary(model.graph.nodeCount, model.graph.edgeCount)}
        </span>
        <ul className="overview-legend">
          {model.graph.typeCounts.map(({ count, type }) => (
            <li key={type} data-node-type={NODE_TYPE_CLASS[type]}>
              <i aria-hidden />
              {OVERVIEW.graph.legend[type]} {count}
            </li>
          ))}
        </ul>
      </footer>
    </section>
  );
}

function TodoZone({ todos }: { todos: readonly OverviewTodo[] }) {
  return (
    <section className="overview-zone" aria-labelledby="overview-todo-title">
      <ZoneHeader
        href="/progress"
        icon={ListTodo}
        id="overview-todo-title"
        lead={OVERVIEW.todos.lead}
        openLabel={OVERVIEW.todos.open}
        title={OVERVIEW.todos.title}
      />
      {todos.length === 0 ? (
        <p className="overview-empty">{OVERVIEW.todos.empty}</p>
      ) : (
        <ul className="overview-todo-list">
          {todos.map((todo) => (
            <li key={todo.id} data-todo-status={todo.status}>
              <span className="overview-todo-status">
                {OVERVIEW.todos.statuses[todo.status]}
              </span>
              <span className="overview-todo-title">{todo.title}</span>
              {todo.sourcePath ? <code>{todo.sourcePath}</code> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentZone({ model }: { model: OverviewViewModel }) {
  return (
    <section className="overview-zone" aria-labelledby="overview-agent-title">
      <ZoneHeader
        href="/map"
        icon={Activity}
        id="overview-agent-title"
        lead={OVERVIEW.agent.lead}
        openLabel={OVERVIEW.agent.open}
        title={OVERVIEW.agent.title}
      />
      {model.agentRecords.length === 0 ? (
        <p className="overview-empty">{OVERVIEW.agent.empty}</p>
      ) : (
        <ol className="overview-agent-list">
          {model.agentRecords.map((record) => (
            <li key={`${record.time}-${record.tool}`}>
              <code>{record.tool}</code>
              <span>{record.detail}</span>
              <time>{record.time}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BrainZone({ model }: { model: OverviewViewModel }) {
  const maxArea = Math.max(...model.brainAreas.map(({ count }) => count), 1);
  return (
    <section className="overview-zone" aria-labelledby="overview-brain-title">
      <ZoneHeader
        href="/graph"
        icon={Brain}
        id="overview-brain-title"
        lead={OVERVIEW.brain.lead}
        openLabel={OVERVIEW.brain.open}
        title={OVERVIEW.brain.title}
      />
      <ul className="overview-brain-areas">
        {model.brainAreas.map(({ area, count }) => (
          <li key={area} data-brain-area={area}>
            <span className="overview-brain-label">
              {OVERVIEW.brain.areas[area]}
            </span>
            <span className="overview-brain-bar" aria-hidden>
              <i style={{ width: `${(count / maxArea) * 100}%` }} />
            </span>
            <span className="overview-brain-count">
              {OVERVIEW.brain.count(count)}
            </span>
          </li>
        ))}
      </ul>
      <footer className="overview-brain-grades">
        <span>{OVERVIEW.brain.gradeTitle}</span>
        <ul>
          {model.brainGrades.map(({ count, grade }) => (
            <li key={grade} data-grade={grade}>
              {GRADE[grade]} {count}
            </li>
          ))}
        </ul>
      </footer>
    </section>
  );
}

export function OverviewScreen({ model }: { model: OverviewViewModel }) {
  return (
    <div className="overview-shell">
      <SideNav />
      <main className="overview-main">
        <header className="overview-head">
          <div>
            <p className="panel-kicker">{OVERVIEW.kicker}</p>
            <h1>{OVERVIEW.title}</h1>
            <p className="overview-lead">{OVERVIEW.lead}</p>
          </div>
          <span className="overview-repo">
            <GitCommitHorizontal size={13} aria-hidden />
            {model.repo}
          </span>
        </header>
        <section className="overview-kpis" aria-label={OVERVIEW.kpi.ariaLabel}>
          <article>
            <strong>{model.kpi.unresolved}</strong>
            <span>{OVERVIEW.kpi.unresolved}</span>
          </article>
          <article>
            <strong>{model.kpi.implementation}%</strong>
            <span>{OVERVIEW.kpi.implementation}</span>
          </article>
          <article>
            <strong>{model.kpi.tests}%</strong>
            <span>{OVERVIEW.kpi.tests}</span>
          </article>
          <article>
            {model.kpi.lastAnalysis ? (
              <>
                <strong>
                  <code>{model.kpi.lastAnalysis.commitSha}</code>
                </strong>
                <span>{OVERVIEW.kpi.lastAnalysis}</span>
              </>
            ) : (
              <>
                <strong className="overview-empty">
                  {OVERVIEW.kpi.lastAnalysisNone}
                </strong>
                <span>{OVERVIEW.kpi.lastAnalysis}</span>
              </>
            )}
          </article>
        </section>
        <div className="overview-zones">
          <GraphZone model={model} />
          <TodoZone todos={model.todos} />
          <AgentZone model={model} />
          <BrainZone model={model} />
        </div>{" "}
      </main>
    </div>
  );
}
