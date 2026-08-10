"use client";

import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleDotDashed,
  Code2,
  FileText,
  Filter,
  GitBranch,
  LoaderCircle,
  Network,
  RotateCcw,
  Search,
  TestTube2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  filterGraph,
  focusLocalGraph,
  type DashboardViewModel,
  type EvidenceGrade,
  type GraphFilters,
  type GraphNode,
  type GraphNodeType,
} from "../../lib/dashboard/graph-model";
import { GraphCanvas } from "./graph-canvas";

interface DashboardScreenProps {
  model: DashboardViewModel;
}

type MetricPanel = "implementation" | "tests" | "tokens" | "unresolved";

const TYPE_OPTIONS: readonly { label: string; value: GraphNodeType | "all" }[] = [
  { label: "All nodes", value: "all" },
  { label: "Requirements", value: "requirement" },
  { label: "Documents", value: "document" },
  { label: "Code", value: "code" },
  { label: "Tests", value: "test" },
];

const GRADE_OPTIONS: readonly { label: string; value: EvidenceGrade | "all" }[] = [
  { label: "All evidence", value: "all" },
  { label: "Verified", value: "verified" },
  { label: "Inferred", value: "inferred" },
  { label: "Broken", value: "broken" },
];

function MetricChip({
  active,
  label,
  onClick,
  suffix,
  value,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  suffix?: string;
  value: number;
}) {
  return (
    <button
      aria-pressed={active}
      className="metric-chip"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <strong>
        {value.toLocaleString()}
        {suffix}
      </strong>
    </button>
  );
}

function StatusSurface({ model, onRetry }: { model: DashboardViewModel; onRetry: () => void }) {
  if (model.state === "loading") {
    return (
      <div className="graph-state" role="status">
        <LoaderCircle className="spin" size={24} />
        <strong>Loading evidence index</strong>
        <span>Resolving graph spans and grades…</span>
      </div>
    );
  }
  if (model.state === "empty") {
    return (
      <div className="graph-state empty-state" role="status">
        <span className="pre-scan-orbit"><CircleDotDashed size={28} /></span>
        <strong>Graph canvas ready</strong>
        <span>First scan will trace docs → requirements → code → tests here.</span>
      </div>
    );
  }
  if (model.state === "scanning") {
    return (
      <div className="graph-state" role="status">
        <LoaderCircle className="spin" size={24} />
        <strong>Building proof spine · 62%</strong>
        <span>15 artifacts indexed · extracting requirements</span>
        <div className="scan-track"><span style={{ width: "62%" }} /></div>
      </div>
    );
  }
  if (model.state === "failed" || model.state === "permission-error") {
    return (
      <div className="graph-state error-state" role="alert">
        <AlertTriangle size={24} />
        <strong>{model.state === "permission-error" ? "GitHub permission changed" : "Scan stopped before analysis"}</strong>
        <span>
          {model.state === "permission-error"
            ? "Contents: read is required. No repository data was stored."
            : "Recorded GitHub response timed out. Existing evidence remains available."}
        </span>
        <button className="compact-button" onClick={onRetry} type="button">
          <RotateCcw size={14} /> {model.state === "permission-error" ? "Review permission" : "Retry scan"}
        </button>
      </div>
    );
  }
  return null;
}

function MetricEvidence({ panel, onClose }: { panel: MetricPanel; onClose: () => void }) {
  const content = {
    unresolved: ["4 open findings", "2 missing-test · 1 stale-doc · 1 unproven-claim", "Source: latest deterministic analysis"],
    implementation: ["84% implementation coverage", "11 of 13 active requirements have implementation evidence", "Source: requirement → code edges"],
    tests: ["71% test coverage", "10 verified links from parsed CI reports", "Source: bad0551 GitHub Actions report"],
    tokens: ["1,840 tokens / turn", "AGENTS.md + nested instructions always loaded", "Assumption: cl100k_base-compatible estimate"],
  }[panel];
  return (
    <aside className="metric-evidence" data-testid="metric-evidence" aria-label={`${panel} evidence`}>
      <button aria-label="Close evidence" className="icon-button" onClick={onClose} type="button"><X size={15} /></button>
      <span className="panel-kicker">Metric provenance</span>
      <strong>{content[0]}</strong>
      <p>{content[1]}</p>
      <small>{content[2]}</small>
    </aside>
  );
}

export function DashboardScreen({ model }: DashboardScreenProps) {
  const [filters, setFilters] = useState<GraphFilters>({ grade: "all", query: "", type: "all" });
  const [localFocus, setLocalFocus] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [metricPanel, setMetricPanel] = useState<MetricPanel | null>(null);
  const [recovered, setRecovered] = useState(false);
  const baseGraph = useMemo(() => filterGraph(model.graph, filters), [filters, model.graph]);
  const visibleGraph = useMemo(
    () => (localFocus && selectedNode ? focusLocalGraph(baseGraph, selectedNode.id) : baseGraph),
    [baseGraph, localFocus, selectedNode],
  );
  const blocked =
    !recovered && ["loading", "empty", "scanning", "failed", "permission-error"].includes(model.state);

  return (
    <main className="dashboard-shell">
      <section className="graph-stage" aria-label="SpecProof project assurance dashboard">
        <div className="graph-grid" />
        {blocked ? <StatusSurface model={model} onRetry={() => setRecovered(true)} /> : (
          <GraphCanvas
            data={visibleGraph}
            focusNodeId={selectedNode?.id ?? null}
            onNodeDoubleClick={(node) => window.location.assign(`/graph?node=${encodeURIComponent(node.id)}`)}
            onNodeSelect={setSelectedNode}
          />
        )}

        <header className="repo-hud hud-panel">
          <div className="repo-mark" aria-hidden="true"><Network size={20} /></div>
          <div>
            <span className="product-name">SpecProof</span>
            <h1>{model.repo}</h1>
            <span className="repo-meta"><GitBranch size={12} /> main · bad0551 · scanned 2m ago</span>
          </div>
          <div className="metrics-grid">
            <MetricChip active={metricPanel === "unresolved"} label="Unresolved" onClick={() => setMetricPanel("unresolved")} value={model.metrics.unresolved} />
            <MetricChip active={metricPanel === "implementation"} label="Impl coverage" onClick={() => setMetricPanel("implementation")} suffix="%" value={model.metrics.implementation} />
            <MetricChip active={metricPanel === "tests"} label="Test coverage" onClick={() => setMetricPanel("tests")} suffix="%" value={model.metrics.tests} />
            <MetricChip active={metricPanel === "tokens"} label="Always loaded" onClick={() => setMetricPanel("tokens")} suffix=" t" value={model.metrics.tokenCost} />
          </div>
        </header>

        <div className="graph-tools hud-panel" aria-label="Graph controls">
          <label className="search-control">
            <Search size={15} />
            <span className="sr-only">Search graph</span>
            <input
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Search nodes, paths…"
              type="search"
              value={filters.query}
            />
            <kbd>⌘ K</kbd>
          </label>
          <label className="select-control">
            <Filter size={14} />
            <span className="sr-only">Node type</span>
            <select
              aria-label="Node type"
              onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value as GraphFilters["type"] }))}
              value={filters.type}
            >
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="select-control">
            <CircleDotDashed size={14} />
            <span className="sr-only">Evidence grade</span>
            <select
              aria-label="Evidence grade"
              onChange={(event) => setFilters((current) => ({ ...current, grade: event.target.value as GraphFilters["grade"] }))}
              value={filters.grade}
            >
              {GRADE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button
            aria-pressed={localFocus}
            className="tool-button"
            disabled={!selectedNode}
            onClick={() => setLocalFocus((value) => !value)}
            type="button"
          >
            <Network size={14} /> Local focus
          </button>
        </div>

        {model.isClustered ? (
          <div className="cluster-note hud-panel" role="status">
            <Braces size={14} /> 500 nodes grouped by type + grade · expand via filters
          </div>
        ) : null}

        {metricPanel ? <MetricEvidence onClose={() => setMetricPanel(null)} panel={metricPanel} /> : null}

        {selectedNode ? (
          <aside className="node-inspector hud-panel" aria-label="Selected node">
            <span className={`grade-label ${selectedNode.grade}`}>{selectedNode.grade}</span>
            <strong>{selectedNode.label}</strong>
            <code>{selectedNode.path}</code>
            {selectedNode.findingCount ? <span className="finding-flag"><AlertTriangle size={13} /> {selectedNode.findingCount} open finding</span> : null}
          </aside>
        ) : null}

        <footer className="graph-footer">
          <div className="legend hud-panel" aria-label="Graph legend">
            <span><FileText size={13} /> Doc</span>
            <span><Code2 size={13} /> Code</span>
            <span><TestTube2 size={13} /> Test</span>
            <span><i className="legend-line verified" /> Verified</span>
            <span><i className="legend-line inferred" /> Inferred</span>
            <span><i className="legend-line broken" /> Broken</span>
          </div>
          <div className={`ci-banner hud-panel ${model.state === "no-ci" ? "warning" : ""}`} role="status">
            {model.state === "no-ci" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {model.ciMessage}
          </div>
        </footer>
      </section>
    </main>
  );
}
