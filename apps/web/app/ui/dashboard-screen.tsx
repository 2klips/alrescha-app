"use client";

import {
  AlertTriangle,
  Archive,
  BookmarkPlus,
  Braces,
  CheckCircle2,
  CircleDotDashed,
  Code2,
  FileText,
  Filter,
  GitBranch,
  Link2,
  LoaderCircle,
  Menu,
  Network,
  Play,
  Radio,
  ReceiptText,
  RotateCcw,
  Search,
  TestTube2,
  TrendingUp,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  filterGraph,
  focusLocalGraph,
  type DashboardViewModel,
  type EvidenceGrade,
  type GraphFilters,
  type GraphNode,
  type GraphNodeType,
} from "../../lib/dashboard/graph-model";
import {
  DEMO_REVOKED_TOKEN_ID,
  DEMO_WORKSPACE_ID,
  createDemoAccessEvents,
  createBrowserWorkspaceRealtimeSource,
  createRealtimeGraphState,
  dispatchBrowserAccessEvent,
  pulsePhaseAt,
  reduceAccessEventBatch,
  relativeEventTime,
  subscribeWorkspaceRealtime,
  type PulsePhase,
} from "../../lib/realtime/access-events";
import { GraphCanvas } from "./graph-canvas";
import { ThemeToggle } from "./theme-toggle";

interface DashboardScreenProps {
  model: DashboardViewModel;
}

type MetricPanel = "implementation" | "tests" | "tokens" | "unresolved";

const TYPE_OPTIONS: readonly { label: string; value: GraphNodeType | "all" }[] =
  [
    { label: "All nodes", value: "all" },
    { label: "Requirements", value: "requirement" },
    { label: "Documents", value: "document" },
    { label: "Code", value: "code" },
    { label: "Tests", value: "test" },
  ];

const GRADE_OPTIONS: readonly {
  label: string;
  value: EvidenceGrade | "all";
}[] = [
  { label: "All evidence", value: "all" },
  { label: "Verified", value: "verified" },
  { label: "Inferred", value: "inferred" },
  { label: "Broken", value: "broken" },
];

const NAV_ITEMS = [
  { href: "/", icon: Network, label: "Graph" },
  { href: "/findings", icon: AlertTriangle, label: "Findings" },
  { href: "/lint", icon: Braces, label: "Instruction lint" },
  { href: "/progress", icon: TrendingUp, label: "Progress" },
  { href: "/receipts", icon: ReceiptText, label: "Receipts" },
] as const;

const STATIC_ACTIVITY = [
  {
    detail: "Indexed 42 files",
    meta: "git: bad0551",
    time: "10:24:31",
    tool: "search_index",
  },
  {
    detail: "Fetched test results (#8721)",
    meta: "cache: hit",
    time: "10:24:28",
    tool: "get_artifact",
  },
  {
    detail: "Building bounded context pack",
    meta: "worker: 3",
    time: "10:24:27",
    tool: "request_context_pack",
  },
] as const;

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
      className="arr-metric"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      <strong>
        {value.toLocaleString()}
        {suffix}
      </strong>
      <span>{label}</span>
    </button>
  );
}

function StatusSurface({
  model,
  onRetry,
}: {
  model: DashboardViewModel;
  onRetry: () => void;
}) {
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
        <span className="pre-scan-orbit">
          <CircleDotDashed size={28} />
        </span>
        <strong>Graph canvas ready</strong>
        <span>
          First scan will trace docs → requirements → code → tests here.
        </span>
      </div>
    );
  }
  if (model.state === "scanning") {
    return (
      <div className="graph-state" role="status">
        <LoaderCircle className="spin" size={24} />
        <strong>Building proof spine · 62%</strong>
        <span>15 artifacts indexed · extracting requirements</span>
        <div className="scan-track">
          <span style={{ width: "62%" }} />
        </div>
      </div>
    );
  }
  if (model.state === "revoked") {
    return (
      <div className="graph-state error-state" role="alert">
        <AlertTriangle size={24} />
        <h2>GitHub App disconnected</h2>
        <span>
          Automatic scans are paused. Stored evidence remains read-only, and no
          credits are used while disconnected.
        </span>
        <div className="revoked-actions">
          <Link className="compact-button" href="/app/connect/github">
            <RotateCcw size={14} /> Reconnect GitHub App
          </Link>
          <button className="compact-button" onClick={onRetry} type="button">
            View stored evidence
          </button>
        </div>
      </div>
    );
  }
  if (model.state === "failed" || model.state === "permission-error") {
    return (
      <div className="graph-state error-state" role="alert">
        <AlertTriangle size={24} />
        <strong>
          {model.state === "permission-error"
            ? "GitHub permission changed"
            : "Scan stopped before analysis"}
        </strong>
        <span>
          {model.state === "permission-error"
            ? "Contents: read is required. No repository data was stored."
            : "Recorded GitHub response timed out. Existing evidence remains available."}
        </span>
        <button className="compact-button" onClick={onRetry} type="button">
          <RotateCcw size={14} />{" "}
          {model.state === "permission-error"
            ? "Review permission"
            : "Retry scan"}
        </button>
      </div>
    );
  }
  return null;
}

function MetricEvidence({
  panel,
  onClose,
}: {
  panel: MetricPanel;
  onClose: () => void;
}) {
  const content = {
    unresolved: [
      "4 open findings",
      "2 missing-test · 1 stale-doc · 1 unproven-claim",
      "Source: latest deterministic analysis",
    ],
    implementation: [
      "84% implementation coverage",
      "11 of 13 active requirements have implementation evidence",
      "Source: requirement → code edges",
    ],
    tests: [
      "71% test coverage",
      "10 verified links from parsed CI reports",
      "Source: bad0551 GitHub Actions report",
    ],
    tokens: [
      "1,840 tokens / turn",
      "AGENTS.md + nested instructions always loaded",
      "Assumption: cl100k_base-compatible estimate",
    ],
  }[panel];
  return (
    <aside
      className="arr-metric-evidence"
      data-testid="metric-evidence"
      aria-label={`${panel} evidence`}
    >
      <button
        aria-label="Close evidence"
        className="arr-icon-button"
        onClick={onClose}
        type="button"
      >
        <X size={15} />
      </button>
      <span className="arr-kicker">Metric provenance</span>
      <strong>{content[0]}</strong>
      <p>{content[1]}</p>
      <small>{content[2]}</small>
    </aside>
  );
}

function requirementCode(node: GraphNode): string {
  if (node.id.startsWith("req-"))
    return `${node.id.replace("req-", "REQ-").toUpperCase()}-001`;
  return node.id.toUpperCase();
}

export function DashboardScreen({ model }: DashboardScreenProps) {
  const [filters, setFilters] = useState<GraphFilters>({
    grade: "all",
    query: "",
    type: "all",
  });
  const [localFocus, setLocalFocus] = useState(false);
  const [cameraFocusNodeId, setCameraFocusNodeId] = useState<string | null>(
    null,
  );
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(
    () =>
      model.graph.nodes.find((node) => node.id === "req-auth") ??
      model.graph.nodes[0] ??
      null,
  );
  const [metricPanel, setMetricPanel] = useState<MetricPanel | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [clock, setClock] = useState(0);
  const [realtime, setRealtime] = useState(() =>
    createRealtimeGraphState(DEMO_WORKSPACE_ID),
  );
  const baseGraph = useMemo(
    () => filterGraph(model.graph, filters),
    [filters, model.graph],
  );
  const visibleGraph = useMemo(
    () =>
      localFocus && selectedNode
        ? focusLocalGraph(baseGraph, selectedNode.id)
        : baseGraph,
    [baseGraph, localFocus, selectedNode],
  );
  const evidenceChain = useMemo(() => {
    if (!selectedNode) return [];
    const connected = new Set([selectedNode.id]);
    for (const edge of model.graph.edges) {
      if (edge.source === selectedNode.id || connected.has(edge.source))
        connected.add(edge.target);
      if (edge.target === selectedNode.id) connected.add(edge.source);
    }
    const order: Record<GraphNodeType, number> = {
      requirement: 0,
      code: 1,
      test: 2,
      document: 3,
    };
    return model.graph.nodes
      .filter((node) => connected.has(node.id))
      .sort((left, right) => order[left.type] - order[right.type])
      .slice(0, 3);
  }, [model.graph.edges, model.graph.nodes, selectedNode]);
  const blocked =
    !recovered &&
    [
      "loading",
      "empty",
      "scanning",
      "failed",
      "permission-error",
      "revoked",
    ].includes(model.state);
  const pulseStates = useMemo(() => {
    const phases: Record<string, PulsePhase> = {};
    for (const [nodeId, pulse] of Object.entries(realtime.pulses))
      phases[nodeId] = pulsePhaseAt(pulse, clock);
    return phases;
  }, [clock, realtime.pulses]);

  useEffect(() => {
    if (realtime.feed.length === 0) return;
    const timer = window.setInterval(() => setClock(Date.now()), 180);
    const stop = window.setTimeout(() => window.clearInterval(timer), 12_500);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [realtime.renderBatches, realtime.feed.length]);

  useEffect(() => {
    const policy = {
      revokedTokenIds: new Set([DEMO_REVOKED_TOKEN_ID]),
      workspaceId: DEMO_WORKSPACE_ID,
    };
    return subscribeWorkspaceRealtime(
      createBrowserWorkspaceRealtimeSource(window),
      policy,
      (events) =>
        setRealtime((current) =>
          reduceAccessEventBatch(current, events, policy),
        ),
      (flush) => window.requestAnimationFrame(flush),
    );
  }, []);

  function replayMcpSession() {
    const now = Date.now();
    setClock(now);
    for (const event of createDemoAccessEvents(now - 720))
      dispatchBrowserAccessEvent(window, event);
  }

  return (
    <main className="arr-home" aria-label="Arr project assurance dashboard">
      <header className="arr-topbar">
        <Link className="arr-brand" href="/" aria-label="Arr home">
          <Image
            alt=""
            aria-hidden="true"
            className="arr-logo"
            height={46}
            priority
            src="/arr-mark.png"
            width={46}
          />
          <strong>Arr</strong>
          <span>Proof, before merge.</span>
        </Link>
        <button
          aria-expanded={mobileNavOpen}
          aria-label="Toggle navigation"
          className="arr-menu-button"
          onClick={() => setMobileNavOpen((open) => !open)}
          type="button"
        >
          <Menu size={20} />
        </button>
        <nav
          aria-label="Primary navigation"
          className="arr-nav"
          data-open={mobileNavOpen}
        >
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
            <Link
              aria-current={href === "/" ? "page" : undefined}
              href={href}
              key={href}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <span className="header-actions">
          <ThemeToggle />
          <Link className="arr-connect" href="/app/connect/github">
            <Link2 size={17} />
            Connect repo
          </Link>
        </span>
      </header>

      <div className="arr-workspace">
        <aside className="arr-repo-rail" aria-label="Repository summary">
          <div className="arr-repo-block">
            <span className="arr-kicker">Repository</span>
            <strong>
              <Network size={17} />
              {model.repo}
            </strong>
            <small>
              <GitBranch size={12} />
              main · bad0551
            </small>
          </div>
          <div className="arr-metrics" aria-label="Assurance metrics">
            <MetricChip
              active={metricPanel === "unresolved"}
              label="open findings"
              onClick={() => setMetricPanel("unresolved")}
              value={model.metrics.unresolved}
            />
            <MetricChip
              active={metricPanel === "implementation"}
              label="implementation"
              onClick={() => setMetricPanel("implementation")}
              suffix="%"
              value={model.metrics.implementation}
            />
            <MetricChip
              active={metricPanel === "tests"}
              label="tests"
              onClick={() => setMetricPanel("tests")}
              suffix="%"
              value={model.metrics.tests}
            />
            <MetricChip
              active={metricPanel === "tokens"}
              label="context"
              onClick={() => setMetricPanel("tokens")}
              suffix="k"
              value={Number((model.metrics.tokenCost / 1000).toFixed(1))}
            />
          </div>
          <div className="arr-rail-links">
            <Link href="/app/harness">
              <BookmarkPlus size={15} />
              Harness assets
            </Link>
            <Link href="/app/library">
              <Archive size={15} />
              Evidence library
            </Link>
          </div>
        </aside>

        <section className="arr-proof-panel" aria-labelledby="proof-map-title">
          <header className="arr-proof-heading">
            <div>
              <span className="arr-kicker">Current commit · bad0551</span>
              <h1 id="proof-map-title">Project proof map</h1>
            </div>
            <div className="arr-legend" aria-label="Graph legend">
              <span>
                <i className="requirement" />
                Requirement
              </span>
              <span>
                <i className="code" />
                Code
              </span>
              <span>
                <i className="test" />
                Verified test
              </span>
            </div>
          </header>
          <div
            className="arr-metrics arr-metrics-mobile"
            aria-label="Mobile assurance metrics"
          >
            <MetricChip
              active={metricPanel === "unresolved"}
              label="open findings"
              onClick={() => setMetricPanel("unresolved")}
              value={model.metrics.unresolved}
            />
            <MetricChip
              active={metricPanel === "implementation"}
              label="implementation"
              onClick={() => setMetricPanel("implementation")}
              suffix="%"
              value={model.metrics.implementation}
            />
            <MetricChip
              active={metricPanel === "tests"}
              label="tests"
              onClick={() => setMetricPanel("tests")}
              suffix="%"
              value={model.metrics.tests}
            />
            <MetricChip
              active={metricPanel === "tokens"}
              label="context"
              onClick={() => setMetricPanel("tokens")}
              suffix="k"
              value={Number((model.metrics.tokenCost / 1000).toFixed(1))}
            />
          </div>
          <div className="arr-graph-controls" aria-label="Graph controls">
            <label className="arr-search">
              <Search size={15} />
              <span className="sr-only">Search graph</span>
              <input
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder="Search proof map"
                type="search"
                value={filters.query}
              />
            </label>
            <label className="arr-select">
              <Filter size={14} />
              <span className="sr-only">Node type</span>
              <select
                aria-label="Node type"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    type: event.target.value as GraphFilters["type"],
                  }))
                }
                value={filters.type}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="arr-select">
              <CircleDotDashed size={14} />
              <span className="sr-only">Evidence grade</span>
              <select
                aria-label="Evidence grade"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    grade: event.target.value as GraphFilters["grade"],
                  }))
                }
                value={filters.grade}
              >
                {GRADE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-pressed={localFocus}
              className="arr-focus"
              disabled={!selectedNode}
              onClick={() => setLocalFocus((value) => !value)}
              type="button"
            >
              <Network size={14} />
              Local focus
            </button>
          </div>
          <div className="arr-graph-stage">
            <div className="graph-grid" />
            {blocked ? (
              <StatusSurface model={model} onRetry={() => setRecovered(true)} />
            ) : (
              <GraphCanvas
                data={visibleGraph}
                focusNodeId={cameraFocusNodeId}
                onNodeDoubleClick={(node) =>
                  window.location.assign(
                    `/graph?node=${encodeURIComponent(node.id)}`,
                  )
                }
                onNodeSelect={setSelectedNode}
                pulseStates={pulseStates}
              />
            )}
            {model.isClustered ? (
              <div className="arr-cluster-note" role="status">
                <Braces size={14} />
                500 nodes grouped by type + grade
              </div>
            ) : null}
            {metricPanel ? (
              <MetricEvidence
                onClose={() => setMetricPanel(null)}
                panel={metricPanel}
              />
            ) : null}
          </div>
          <footer
            className={`arr-ci-note ${model.state === "no-ci" ? "warning" : ""}`}
            role="status"
          >
            {model.state === "no-ci" ? (
              <AlertTriangle size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            {model.ciMessage}
          </footer>
        </section>

        <aside className="arr-inspector" aria-label="Selected node">
          <header>
            <span className="arr-kicker">Inspector</span>
            <span className={`arr-grade ${selectedNode?.grade ?? "inferred"}`}>
              {selectedNode?.grade ?? "waiting"}
            </span>
          </header>
          {selectedNode ? (
            <>
              <h2>{requirementCode(selectedNode)}</h2>
              <p>
                Trace this claim from requirement to implementation and test
                evidence.
              </p>
              <code className="arr-selected-path">{selectedNode.path}</code>
              {selectedNode.findingCount ? (
                <span className="arr-finding">
                  <AlertTriangle size={13} />
                  {selectedNode.findingCount} open{" "}
                  {selectedNode.findingCount === 1 ? "finding" : "findings"}
                </span>
              ) : null}
              <section
                className="arr-chain"
                aria-labelledby="evidence-chain-title"
              >
                <span className="arr-kicker" id="evidence-chain-title">
                  Evidence chain
                </span>
                <ol>
                  {evidenceChain.map((node) => (
                    <li className={node.grade} key={node.id}>
                      <span className="arr-chain-icon">
                        {node.type === "code" ? (
                          <Code2 size={16} />
                        ) : node.type === "test" ? (
                          <TestTube2 size={16} />
                        ) : (
                          <FileText size={16} />
                        )}
                      </span>
                      <div>
                        <small>{node.type}</small>
                        <strong>{node.label}</strong>
                        <code>{node.path}</code>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          ) : (
            <p>Select a node to inspect its proof chain.</p>
          )}
        </aside>

        <section className="arr-activity" aria-labelledby="activity-title">
          <header>
            <div>
              <span className="arr-live">
                <Radio size={12} />
                Live
              </span>
              <h2 id="activity-title">Agent activity</h2>
            </div>
            <button onClick={replayMcpSession} type="button">
              <Play size={13} />
              Replay MCP session
            </button>
          </header>
          <div className="arr-activity-table" role="feed">
            {realtime.feed.length > 0
              ? realtime.feed.map((event) => (
                  <button
                    aria-label={`${event.tool} ${event.targetPath}`}
                    key={event.id}
                    onClick={() => {
                      const node = model.graph.nodes.find((candidate) =>
                        event.targetNodeIds.includes(candidate.id),
                      );
                      if (node) {
                        setSelectedNode(node);
                        setCameraFocusNodeId(node.id);
                      }
                    }}
                    type="button"
                  >
                    <time>{relativeEventTime(event.occurredAt, clock)}</time>
                    <span className="arr-activity-dot" />
                    <strong>{event.tool}</strong>
                    <span>{event.targetPath}</span>
                    <code>live trace</code>
                  </button>
                ))
              : STATIC_ACTIVITY.map((event) => (
                  <div className="arr-activity-row" key={event.tool}>
                    <time>{event.time}</time>
                    <span className="arr-activity-dot" />
                    <strong>{event.tool}</strong>
                    <span>{event.detail}</span>
                    <code>{event.meta}</code>
                  </div>
                ))}
          </div>
        </section>
      </div>
    </main>
  );
}
