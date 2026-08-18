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
  LayoutDashboard,
  LayoutGrid,
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
  graphNodeArea,
  topHubNodes,
  type DashboardViewModel,
  type EvidenceGrade,
  type GraphFilters,
  type GraphNode,
  type GraphNodeType,
} from "../../lib/dashboard/graph-model";
import { BRAIN_AREAS, type BrainArea } from "@arr/core";
import { glowAfterglowNodes, glowFromRealtime } from "../../lib/graph/glow";
import {
  DEMO_REVOKED_TOKEN_ID,
  DEMO_WORKSPACE_ID,
  createDemoAccessEvents,
  createBrowserWorkspaceRealtimeSource,
  createRealtimeGraphState,
  dispatchBrowserAccessEvent,
  reduceAccessEventBatch,
  relativeEventTime,
  subscribeWorkspaceRealtime,
} from "../../lib/realtime/access-events";
import type { LodLevel } from "../../lib/graph/lod";
import { BRAND, DASHBOARD, GRADE, NAV } from "../../lib/strings";
import { BrainMapStage } from "./brain-map-stage";
import { FacetBandView } from "./facet-band-view";
import { GraphForcePanel, useGraphPanelSettings } from "./graph-force-panel";
import { ThemeToggle } from "./theme-toggle";

interface DashboardScreenProps {
  model: DashboardViewModel;
}

type MetricPanel = "implementation" | "tests" | "tokens" | "unresolved";

const TYPE_OPTIONS: readonly { label: string; value: GraphNodeType | "all" }[] =
  [
    { label: DASHBOARD.filters.types.all, value: "all" },
    { label: DASHBOARD.filters.types.requirement, value: "requirement" },
    { label: DASHBOARD.filters.types.document, value: "document" },
    { label: DASHBOARD.filters.types.code, value: "code" },
    { label: DASHBOARD.filters.types.test, value: "test" },
  ];

const GRADE_OPTIONS: readonly {
  label: string;
  value: EvidenceGrade | "all";
}[] = [
  { label: DASHBOARD.filters.grades.all, value: "all" },
  { label: DASHBOARD.filters.grades.verified, value: "verified" },
  { label: DASHBOARD.filters.grades.inferred, value: "inferred" },
  { label: DASHBOARD.filters.grades.broken, value: "broken" },
];

const AREA_OPTIONS: readonly { label: string; value: BrainArea | "all" }[] = [
  { label: DASHBOARD.filters.areas.all, value: "all" },
  ...BRAIN_AREAS.map((area) => ({
    label: DASHBOARD.filters.areas[area],
    value: area,
  })),
];

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: NAV.overview },
  { href: "/map", icon: Network, label: NAV.graph },
  { href: "/findings", icon: AlertTriangle, label: NAV.findings },
  { href: "/lint", icon: Braces, label: NAV.lint },
  { href: "/progress", icon: TrendingUp, label: NAV.progress },
  { href: "/receipts", icon: ReceiptText, label: NAV.receipts },
] as const;

const STATIC_ACTIVITY = DASHBOARD.activity.samples;

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
        <strong>{DASHBOARD.states.loading.title}</strong>
        <span>{DASHBOARD.states.loading.body}</span>
      </div>
    );
  }
  if (model.state === "empty") {
    return (
      <div className="graph-state empty-state" role="status">
        <span className="pre-scan-orbit">
          <CircleDotDashed size={28} />
        </span>
        <strong>{DASHBOARD.states.empty.title}</strong>
        <span>{DASHBOARD.states.empty.body}</span>
      </div>
    );
  }
  if (model.state === "scanning") {
    return (
      <div className="graph-state" role="status">
        <LoaderCircle className="spin" size={24} />
        <strong>{DASHBOARD.states.scanning.title}</strong>
        <span>{DASHBOARD.states.scanning.body}</span>
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
        <h2>{DASHBOARD.states.revoked.title}</h2>
        <span>{DASHBOARD.states.revoked.body}</span>
        <div className="revoked-actions">
          <Link className="compact-button" href="/app/connect/github">
            <RotateCcw size={14} /> {DASHBOARD.states.revoked.reconnect}
          </Link>
          <button className="compact-button" onClick={onRetry} type="button">
            {DASHBOARD.states.revoked.viewStored}
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
            ? DASHBOARD.states.permissionError.title
            : DASHBOARD.states.failed.title}
        </strong>
        <span>
          {model.state === "permission-error"
            ? DASHBOARD.states.permissionError.body
            : DASHBOARD.states.failed.body}
        </span>
        <button className="compact-button" onClick={onRetry} type="button">
          <RotateCcw size={14} />{" "}
          {model.state === "permission-error"
            ? DASHBOARD.states.permissionError.action
            : DASHBOARD.states.failed.action}
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
  const content = DASHBOARD.metricEvidence[panel];
  return (
    <aside
      className="arr-metric-evidence"
      data-testid="metric-evidence"
      aria-label={`${panel} evidence`}
    >
      <button
        aria-label={DASHBOARD.metricEvidenceClose}
        className="arr-icon-button"
        onClick={onClose}
        type="button"
      >
        <X size={15} />
      </button>
      <span className="arr-kicker">{DASHBOARD.metricEvidenceKicker}</span>
      <strong>{content[0]}</strong>
      <p>{content[1]}</p>
      <small>{content[2]}</small>
    </aside>
  );
}

/**
 * Top-5 most-connected nodes (REVIEW_EXTERNAL_PROJECTS G2). The brain map's
 * entry points: a click selects the node and flies the camera to it, which is
 * the same gesture the activity feed uses.
 */
function HubChips({
  hubs,
  onFocus,
  selectedNodeId,
}: {
  hubs: readonly { degree: number; node: GraphNode }[];
  onFocus: (node: GraphNode) => void;
  selectedNodeId: string | null;
}) {
  return (
    <div className="arr-hubs" aria-label={DASHBOARD.hubs.aria}>
      <span className="arr-kicker">{DASHBOARD.hubs.kicker}</span>
      {hubs.length === 0 ? (
        <small>{DASHBOARD.hubs.empty}</small>
      ) : (
        <ol>
          {hubs.map(({ degree, node }) => (
            <li key={node.id}>
              <button
                aria-pressed={node.id === selectedNodeId}
                data-hub-node={node.id}
                onClick={() => onFocus(node)}
                type="button"
              >
                <i className={node.type} />
                <span>{node.label}</span>
                <small>{DASHBOARD.hubs.degree(degree)}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function requirementCode(node: GraphNode): string {
  if (node.id.startsWith("req-"))
    return `${node.id.replace("req-", "REQ-").toUpperCase()}-001`;
  return node.id.toUpperCase();
}

export function DashboardScreen({ model }: DashboardScreenProps) {
  const [filters, setFilters] = useState<GraphFilters>({
    area: "all",
    grade: "all",
    query: "",
    type: "all",
  });
  const [localFocus, setLocalFocus] = useState(false);
  const [groupByArea, setGroupByArea] = useState(false);
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
  // OQ-007: the HUD cards live in a workspace-grid channel (a sibling of the
  // rail and inspector), so the dashboard owns the panel settings and LOD.
  const [panelSettings, updatePanelSettings] = useGraphPanelSettings();
  const [hudLod, setHudLod] = useState<{ labels: number; level: LodLevel }>({
    labels: 0,
    level: "near",
  });
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
  const focusedGraph = useMemo(
    () =>
      localFocus && selectedNode
        ? focusLocalGraph(baseGraph, selectedNode.id)
        : baseGraph,
    [baseGraph, localFocus, selectedNode],
  );
  const visibleGraph = focusedGraph;
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
  const hubs = useMemo(() => topHubNodes(model.graph), [model.graph]);
  // The renderer takes continuous intensity, not phases: `glowFromRealtime`
  // inherits the reducer's workspace and revoked-token filtering, so a
  // cross-workspace read still cannot light a node (see lib/graph/glow.ts).
  const glow = useMemo(
    () => glowFromRealtime(realtime, clock),
    [clock, realtime],
  );
  const afterglow = useMemo(
    () => glowAfterglowNodes(realtime.pulses, clock),
    [clock, realtime.pulses],
  );

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
    <main className="arr-home" aria-label={DASHBOARD.ariaMain}>
      <header className="arr-topbar">
        <Link className="arr-brand" href="/" aria-label={BRAND.homeLabel}>
          <Image
            alt=""
            aria-hidden="true"
            className="arr-logo"
            height={46}
            priority
            src="/arr-mark.png"
            width={46}
          />
          <strong>{BRAND.name}</strong>
          <span>{BRAND.tagline}</span>
        </Link>
        <button
          aria-expanded={mobileNavOpen}
          aria-label={NAV.toggle}
          className="arr-menu-button"
          onClick={() => setMobileNavOpen((open) => !open)}
          type="button"
        >
          <Menu size={20} />
        </button>
        <nav
          aria-label={NAV.ariaPrimary}
          className="arr-nav"
          data-open={mobileNavOpen}
        >
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
            <Link
              aria-current={href === "/map" ? "page" : undefined}
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
            {NAV.connectRepo}
          </Link>
        </span>
      </header>

      <div className="arr-workspace">
        <aside className="arr-repo-rail" aria-label={DASHBOARD.ariaRepoRail}>
          <div className="arr-repo-block">
            <span className="arr-kicker">{DASHBOARD.repoKicker}</span>
            <strong>
              <Network size={17} />
              {model.repo}
            </strong>
            <small>
              <GitBranch size={12} />
              {DASHBOARD.repoBranchLine}
            </small>
          </div>
          <div className="arr-metrics" aria-label={DASHBOARD.ariaMetrics}>
            <MetricChip
              active={metricPanel === "unresolved"}
              label={DASHBOARD.metrics.unresolved}
              onClick={() => setMetricPanel("unresolved")}
              value={model.metrics.unresolved}
            />
            <MetricChip
              active={metricPanel === "implementation"}
              label={DASHBOARD.metrics.implementation}
              onClick={() => setMetricPanel("implementation")}
              suffix="%"
              value={model.metrics.implementation}
            />
            <MetricChip
              active={metricPanel === "tests"}
              label={DASHBOARD.metrics.tests}
              onClick={() => setMetricPanel("tests")}
              suffix="%"
              value={model.metrics.tests}
            />
            <MetricChip
              active={metricPanel === "tokens"}
              label={DASHBOARD.metrics.tokens}
              onClick={() => setMetricPanel("tokens")}
              suffix="k"
              value={Number((model.metrics.tokenCost / 1000).toFixed(1))}
            />
          </div>
          <div
            className="arr-area-chips"
            aria-label={DASHBOARD.filters.areaLabel}
            role="group"
          >
            {AREA_OPTIONS.map((option) => (
              <button
                aria-pressed={filters.area === option.value}
                className="arr-area-chip"
                data-area={option.value}
                key={option.value}
                onClick={() =>
                  setFilters((current) => ({ ...current, area: option.value }))
                }
                type="button"
              >
                {option.label}
                {option.value === "all" ? null : (
                  <small>
                    {
                      model.graph.nodes.filter(
                        (node) => graphNodeArea(node) === option.value,
                      ).length
                    }
                  </small>
                )}
              </button>
            ))}
          </div>
          <HubChips
            hubs={hubs}
            onFocus={(node) => {
              setSelectedNode(node);
              setCameraFocusNodeId(node.id);
            }}
            selectedNodeId={selectedNode?.id ?? null}
          />
          <div className="arr-rail-links">
            <Link href="/app/harness">
              <BookmarkPlus size={15} />
              {NAV.harness}
            </Link>
            <Link href="/app/library">
              <Archive size={15} />
              {NAV.library}
            </Link>
          </div>
        </aside>

        <section className="arr-proof-panel" aria-labelledby="proof-map-title">
          <header className="arr-proof-heading">
            <div>
              <span className="arr-kicker">
                {DASHBOARD.commitKicker} · bad0551
              </span>
              {/*
                The heading names the map *and* the repository it proves. Before
                `e0057dc` the h1 was the repo alone; that commit replaced it with
                the map title, which left every workspace with an identical h1
                and no connected-repo identity in the page heading. Both halves
                are here now — the accessible name carries the repo again.
              */}
              <h1 id="proof-map-title">
                {DASHBOARD.title}
                <span className="arr-proof-repo">{model.repo}</span>
              </h1>
            </div>
            <div className="arr-legend" aria-label={DASHBOARD.ariaLegend}>
              <span>
                <i className="requirement" />
                {DASHBOARD.legend.requirement}
              </span>
              <span>
                <i className="code" />
                {DASHBOARD.legend.code}
              </span>
              <span>
                <i className="test" />
                {DASHBOARD.legend.test}
              </span>
            </div>
          </header>
          <div
            className="arr-metrics arr-metrics-mobile"
            aria-label={DASHBOARD.ariaMetricsMobile}
          >
            <MetricChip
              active={metricPanel === "unresolved"}
              label={DASHBOARD.metrics.unresolved}
              onClick={() => setMetricPanel("unresolved")}
              value={model.metrics.unresolved}
            />
            <MetricChip
              active={metricPanel === "implementation"}
              label={DASHBOARD.metrics.implementation}
              onClick={() => setMetricPanel("implementation")}
              suffix="%"
              value={model.metrics.implementation}
            />
            <MetricChip
              active={metricPanel === "tests"}
              label={DASHBOARD.metrics.tests}
              onClick={() => setMetricPanel("tests")}
              suffix="%"
              value={model.metrics.tests}
            />
            <MetricChip
              active={metricPanel === "tokens"}
              label={DASHBOARD.metrics.tokens}
              onClick={() => setMetricPanel("tokens")}
              suffix="k"
              value={Number((model.metrics.tokenCost / 1000).toFixed(1))}
            />
          </div>
          <div
            className="arr-graph-controls"
            aria-label={DASHBOARD.ariaControls}
          >
            <label className="arr-search">
              <Search size={15} />
              <span className="sr-only">{DASHBOARD.search.label}</span>
              <input
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder={DASHBOARD.search.placeholder}
                type="search"
                value={filters.query}
              />
            </label>
            <label className="arr-select">
              <Filter size={14} />
              <span className="sr-only">{DASHBOARD.filters.typeLabel}</span>
              <select
                aria-label={DASHBOARD.filters.typeLabel}
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
              <span className="sr-only">{DASHBOARD.filters.gradeLabel}</span>
              <select
                aria-label={DASHBOARD.filters.gradeLabel}
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
              {DASHBOARD.filters.localFocus}
            </button>
            <button
              aria-label={DASHBOARD.filters.groupModeAria}
              aria-pressed={groupByArea}
              className="arr-focus"
              data-testid="graph-group-mode"
              onClick={() => setGroupByArea((value) => !value)}
              type="button"
            >
              <LayoutGrid size={14} />
              {DASHBOARD.filters.groupMode}
            </button>
          </div>
          <div className="arr-graph-stage">
            <div className="graph-grid" />
            {blocked ? (
              <StatusSurface model={model} onRetry={() => setRecovered(true)} />
            ) : groupByArea ? (
              <FacetBandView
                data={visibleGraph}
                onNodeActivate={(node) =>
                  window.location.assign(
                    `/graph?node=${encodeURIComponent(node.id)}`,
                  )
                }
                onNodeSelect={setSelectedNode}
                selectedNodeId={selectedNode?.id ?? null}
              />
            ) : (
              <BrainMapStage
                afterglow={afterglow}
                data={visibleGraph}
                focusNodeId={cameraFocusNodeId}
                glow={glow}
                onLodReport={(level, labels) => setHudLod({ labels, level })}
                onNodeActivate={(node) =>
                  window.location.assign(
                    `/graph?node=${encodeURIComponent(node.id)}`,
                  )
                }
                onNodeSelect={setSelectedNode}
                onSettingsChange={updatePanelSettings}
                selectedNodeId={selectedNode?.id ?? null}
                settings={panelSettings}
                showForcePanel={false}
              />
            )}
            {model.isClustered ? (
              <div className="arr-cluster-note" role="status">
                <Braces size={14} />
                {DASHBOARD.clusterNote(500)}
              </div>
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

        <aside className="arr-inspector" aria-label={DASHBOARD.ariaInspector}>
          <header>
            <span className="arr-kicker">{DASHBOARD.inspector.kicker}</span>
            <span className={`arr-grade ${selectedNode?.grade ?? "inferred"}`}>
              {selectedNode?.grade ?? GRADE.waiting}
            </span>
          </header>
          {selectedNode ? (
            <>
              <h2>{requirementCode(selectedNode)}</h2>
              <p>{DASHBOARD.inspector.lead}</p>
              <code className="arr-selected-path">{selectedNode.path}</code>
              {selectedNode.findingCount ? (
                <span className="arr-finding">
                  <AlertTriangle size={13} />
                  {DASHBOARD.inspector.findingCount(selectedNode.findingCount)}
                </span>
              ) : null}
              <section
                className="arr-chain"
                aria-labelledby="evidence-chain-title"
              >
                <span className="arr-kicker" id="evidence-chain-title">
                  {DASHBOARD.inspector.chainTitle}
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
            <p>{DASHBOARD.inspector.empty}</p>
          )}
        </aside>

        <section className="arr-activity" aria-labelledby="activity-title">
          <header>
            <div>
              <span className="arr-live">
                <Radio size={12} />
                {DASHBOARD.activity.live}
              </span>
              <h2 id="activity-title">{DASHBOARD.activity.title}</h2>
            </div>
            <button onClick={replayMcpSession} type="button">
              <Play size={13} />
              {DASHBOARD.activity.replay}
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
                    <code>{DASHBOARD.activity.trace}</code>
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

        {/* OQ-007: the HUD channel — a grid SIBLING of the rail and the
            inspector, occupying the middle column. Cards positioned here can
            never collide with the side panels: the grid owns the geometry,
            so the old passage constants (17.5rem/22.5rem) are gone. */}
        <div className="arr-hud-channel">
          {/* No force panel while a status surface owns the stage — the card
              would sit over the recovery controls. */}
          {blocked ? null : (
            <GraphForcePanel
              labelCount={hudLod.labels}
              lod={hudLod.level}
              onChange={updatePanelSettings}
              settings={panelSettings}
            />
          )}
          {metricPanel ? (
            <MetricEvidence
              onClose={() => setMetricPanel(null)}
              panel={metricPanel}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
