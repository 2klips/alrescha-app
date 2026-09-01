"use client";

import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleDotDashed,
  Code2,
  FileText,
  Filter,
  LayoutGrid,
  List,
  LoaderCircle,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TestTube2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  filterGraph,
  focusLocalGraph,
  graphNodeArea,
  type DashboardViewModel,
  type EvidenceGrade,
  type GraphData,
  type GraphFilters,
  type GraphNode,
  type GraphNodeType,
} from "../../lib/dashboard/graph-model";
import { BRAIN_AREAS, type BrainArea } from "@arr/core/artifact-facets";
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
  type GraphAccessEvent,
  type RealtimeGraphState,
} from "../../lib/realtime/access-events";
import type { LodLevel } from "../../lib/graph/lod";
import { DASHBOARD, GRADE } from "../../lib/strings";
import { BrainMapStage } from "./brain-map-stage";
import { Button } from "./button";
import { FacetBandView } from "./facet-band-view";
import { GraphForcePanel, useGraphPanelSettings } from "./graph-force-panel";
import { useRealtimeClock } from "./realtime-clock";
import { StatusBadge } from "./status-badge";

interface DashboardScreenProps {
  model: DashboardViewModel;
}

type MetricPanel = "implementation" | "tests" | "tokens" | "unresolved";
type GraphView = "canvas" | "table";
type InspectorTab = "activity" | "details" | "relationships";

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
          <Link className="btn btn-secondary btn-sm" href="/app/connect/github">
            <RotateCcw size={14} /> {DASHBOARD.states.revoked.reconnect}
          </Link>
          <Button onClick={onRetry} size="sm" variant="secondary">
            {DASHBOARD.states.revoked.viewStored}
          </Button>
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
        <Button onClick={onRetry} size="sm" variant="secondary">
          <RotateCcw size={14} />{" "}
          {model.state === "permission-error"
            ? DASHBOARD.states.permissionError.action
            : DASHBOARD.states.failed.action}
        </Button>
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

function requirementCode(node: GraphNode): string {
  if (node.id.startsWith("req-"))
    return `${node.id.replace("req-", "REQ-").toUpperCase()}-001`;
  return node.id.toUpperCase();
}

type PanelSettings = ReturnType<typeof useGraphPanelSettings>[0];

interface GraphStageSurfaceProps {
  blocked: boolean;
  focusNodeId: string | null;
  groupByArea: boolean;
  model: DashboardViewModel;
  onLodReport: (level: LodLevel, labels: number) => void;
  onNodeActivate: (node: GraphNode) => void;
  onNodeSelect: (node: GraphNode) => void;
  onRetry: () => void;
  onSettingsChange: (patch: Partial<PanelSettings>) => void;
  realtime: RealtimeGraphState;
  selectedNodeId: string | null;
  settings: PanelSettings;
  visibleGraph: GraphData;
}

/**
 * QW-6: the only piece of the screen that needs the 180ms glow clock. It
 * sits below the filter rail and inspector (both stay in `DashboardScreen`)
 * so a tick here re-renders just this stage, not the whole tree — see
 * `realtime-clock.ts`.
 */
function GraphStageSurface({
  blocked,
  focusNodeId,
  groupByArea,
  model,
  onLodReport,
  onNodeActivate,
  onNodeSelect,
  onRetry,
  onSettingsChange,
  realtime,
  selectedNodeId,
  settings,
  visibleGraph,
}: GraphStageSurfaceProps) {
  const clock = useRealtimeClock(realtime.feed.length, realtime.renderBatches);
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

  return (
    <div className="arr-graph-stage">
      <div className="graph-grid" />
      {blocked ? (
        <StatusSurface model={model} onRetry={onRetry} />
      ) : groupByArea ? (
        <FacetBandView
          data={visibleGraph}
          onNodeActivate={onNodeActivate}
          onNodeSelect={onNodeSelect}
          selectedNodeId={selectedNodeId}
        />
      ) : (
        <BrainMapStage
          afterglow={afterglow}
          data={visibleGraph}
          focusNodeId={focusNodeId}
          glow={glow}
          onLodReport={onLodReport}
          onNodeActivate={onNodeActivate}
          onNodeSelect={onNodeSelect}
          onSettingsChange={onSettingsChange}
          selectedNodeId={selectedNodeId}
          settings={settings}
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
  );
}

export function GraphTableView({
  data,
  onNodeActivate,
  onNodeSelect,
  selectedNodeId,
}: {
  data: GraphData;
  onNodeActivate: (node: GraphNode) => void;
  onNodeSelect: (node: GraphNode) => void;
  selectedNodeId: string | null;
}) {
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const relationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of data.edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [data.edges]);

  function moveRowFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const delta =
      event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : event.key === "Home"
            ? Number.NEGATIVE_INFINITY
            : event.key === "End"
              ? Number.POSITIVE_INFINITY
              : null;
    if (delta === null || data.nodes.length === 0) return;
    event.preventDefault();
    const next =
      delta === Number.NEGATIVE_INFINITY
        ? 0
        : delta === Number.POSITIVE_INFINITY
          ? data.nodes.length - 1
          : (index + delta + data.nodes.length) % data.nodes.length;
    rowRefs.current[next]?.focus();
  }

  if (data.nodes.length === 0) {
    return (
      <div className="graph-table-empty" role="status">
        <List aria-hidden size={24} />
        <strong>{DASHBOARD.table.emptyTitle}</strong>
        <span>{DASHBOARD.table.emptyBody}</span>
      </div>
    );
  }

  return (
    <div className="graph-table-scroll" data-testid="graph-table-view">
      <table className="graph-table">
        <caption className="sr-only">{DASHBOARD.table.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{DASHBOARD.table.node}</th>
            <th scope="col">{DASHBOARD.table.type}</th>
            <th scope="col">{DASHBOARD.table.grade}</th>
            <th scope="col">{DASHBOARD.table.relations}</th>
            <th scope="col">{DASHBOARD.table.source}</th>
          </tr>
        </thead>
        <tbody>
          {data.nodes.map((node, index) => (
            <tr data-selected={node.id === selectedNodeId} key={node.id}>
              <th scope="row">
                <button
                  aria-pressed={node.id === selectedNodeId}
                  onClick={() => onNodeSelect(node)}
                  onDoubleClick={() => onNodeActivate(node)}
                  onKeyDown={(event) => moveRowFocus(event, index)}
                  ref={(element) => {
                    rowRefs.current[index] = element;
                  }}
                  type="button"
                >
                  {node.label}
                </button>
              </th>
              <td>{DASHBOARD.filters.types[node.type]}</td>
              <td>
                <StatusBadge grade={node.grade}>{node.grade}</StatusBadge>
              </td>
              <td>{relationCounts.get(node.id) ?? 0}</td>
              <td>
                <code>{node.path}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LiveActivityFeedProps {
  feed: readonly GraphAccessEvent[];
  nodes: readonly GraphNode[];
  onFocusNode: (node: GraphNode) => void;
  onReplay: () => void;
  renderBatches: number;
}

/**
 * QW-6: owns its own copy of the animation clock so the "Ns ago" labels
 * keep updating live without the rail/inspector re-rendering alongside it
 * — see `realtime-clock.ts`.
 */
function LiveActivityFeed({
  feed,
  nodes,
  onFocusNode,
  onReplay,
  renderBatches,
}: LiveActivityFeedProps) {
  const clock = useRealtimeClock(feed.length, renderBatches);

  return (
    <section className="arr-activity" aria-labelledby="activity-title">
      <header>
        <div>
          <span className="arr-live">
            <Radio size={12} />
            {DASHBOARD.activity.live}
          </span>
          <h2 id="activity-title">{DASHBOARD.activity.title}</h2>
        </div>
        <button onClick={onReplay} type="button">
          <Play size={13} />
          {DASHBOARD.activity.replay}
        </button>
      </header>
      <div className="arr-activity-table" role="feed">
        {feed.length > 0
          ? feed.map((event) => (
              <button
                aria-label={`${event.tool} ${event.targetPath}`}
                key={event.id}
                onClick={() => {
                  const node = nodes.find((candidate) =>
                    event.targetNodeIds.includes(candidate.id),
                  );
                  if (node) onFocusNode(node);
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
  );
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
  const [graphView, setGraphView] = useState<GraphView>("canvas");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const [forceOpen, setForceOpen] = useState(false);
  const forceButtonRef = useRef<HTMLButtonElement | null>(null);
  const forcePopoverRef = useRef<HTMLDivElement | null>(null);
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
  const [recovered, setRecovered] = useState(false);
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
      concept: 4,
    };
    return model.graph.nodes
      .filter((node) => connected.has(node.id))
      .sort((left, right) => order[left.type] - order[right.type])
      .slice(0, 3);
  }, [model.graph.edges, model.graph.nodes, selectedNode]);
  const selectedRelationships = useMemo(() => {
    if (!selectedNode) return [];
    return model.graph.edges.flatMap((edge) => {
      if (edge.source !== selectedNode.id && edge.target !== selectedNode.id)
        return [];
      const otherId =
        edge.source === selectedNode.id ? edge.target : edge.source;
      const other = model.graph.nodes.find((node) => node.id === otherId);
      return other ? [{ edge, node: other }] : [];
    });
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
  // QW-6: one pass over the nodes instead of one `.filter().length` per area
  // chip on every render — recomputed only when the node list itself changes.
  const areaCounts = useMemo(() => {
    const counts = new Map<BrainArea, number>();
    for (const node of model.graph.nodes) {
      const area = graphNodeArea(node);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return counts;
  }, [model.graph.nodes]);

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

  useEffect(() => {
    if (!forceOpen) return;
    forcePopoverRef.current
      ?.querySelector<HTMLButtonElement>("[data-force-close]")
      ?.focus();
  }, [forceOpen]);

  useEffect(() => {
    function onWorkspaceKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (!typing && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setGraphView((current) => (current === "canvas" ? "table" : "canvas"));
        return;
      }
      if (event.key !== "Escape") return;
      if (forceOpen) {
        setForceOpen(false);
        forceButtonRef.current?.focus();
      } else if (inspectorTab !== "details") {
        setInspectorTab("details");
      } else if (selectedNode) {
        setSelectedNode(null);
      }
    }
    window.addEventListener("keydown", onWorkspaceKeyDown);
    return () => window.removeEventListener("keydown", onWorkspaceKeyDown);
  }, [forceOpen, inspectorTab, selectedNode]);

  function replayMcpSession() {
    const now = Date.now();
    for (const event of createDemoAccessEvents(now - 720))
      dispatchBrowserAccessEvent(window, event);
  }

  return (
    <main className="graph-workspace" aria-label={DASHBOARD.ariaMain}>
      <header className="graph-workspace-summary">
        <div className="graph-workspace-title">
          <span className="arr-kicker">{DASHBOARD.commitKicker} · bad0551</span>
          <h1>
            {DASHBOARD.title}
            <span>{model.repo}</span>
          </h1>
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
        {metricPanel ? (
          <MetricEvidence
            onClose={() => setMetricPanel(null)}
            panel={metricPanel}
          />
        ) : null}
      </header>

      <section
        aria-label={DASHBOARD.ariaControls}
        className="graph-workspace-toolbar"
      >
        <label className="arr-search">
          <Search aria-hidden size={15} />
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
          <Filter aria-hidden size={14} />
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
          <CircleDotDashed aria-hidden size={14} />
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
        <div aria-label={DASHBOARD.views.aria} className="graph-view-toggle">
          <button
            aria-pressed={graphView === "canvas"}
            onClick={() => setGraphView("canvas")}
            type="button"
          >
            <Network aria-hidden size={14} />
            {DASHBOARD.views.canvas}
          </button>
          <button
            aria-pressed={graphView === "table"}
            onClick={() => setGraphView("table")}
            type="button"
          >
            <List aria-hidden size={14} />
            {DASHBOARD.views.table}
            <kbd aria-hidden>L</kbd>
          </button>
        </div>
        <button
          aria-pressed={localFocus}
          className="arr-focus"
          disabled={!selectedNode || graphView === "table"}
          onClick={() => setLocalFocus((value) => !value)}
          type="button"
        >
          <Network aria-hidden size={14} />
          {DASHBOARD.filters.localFocus}
        </button>
        <button
          aria-label={DASHBOARD.filters.groupModeAria}
          aria-pressed={groupByArea}
          className="arr-focus"
          data-testid="graph-group-mode"
          disabled={graphView === "table"}
          onClick={() => setGroupByArea((value) => !value)}
          type="button"
        >
          <LayoutGrid aria-hidden size={14} />
          {DASHBOARD.filters.groupMode}
        </button>
        <div className="graph-toolbar-spacer" />
        <div className="graph-toolbar-popover-anchor">
          <button
            aria-expanded={forceOpen}
            aria-haspopup="dialog"
            className="arr-focus"
            disabled={blocked || graphView === "table"}
            onClick={() => setForceOpen((value) => !value)}
            ref={forceButtonRef}
            type="button"
          >
            <SlidersHorizontal aria-hidden size={14} />
            {DASHBOARD.forcePanel.open}
          </button>
          {forceOpen ? (
            <div
              aria-label={DASHBOARD.forcePanel.aria}
              className="graph-force-popover"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                setForceOpen(false);
                forceButtonRef.current?.focus();
              }}
              ref={forcePopoverRef}
              role="dialog"
            >
              <GraphForcePanel
                labelCount={hudLod.labels}
                lod={hudLod.level}
                onChange={updatePanelSettings}
                onClose={() => {
                  setForceOpen(false);
                  forceButtonRef.current?.focus();
                }}
                settings={panelSettings}
              />
            </div>
          ) : null}
        </div>
        <button
          aria-label={
            inspectorOpen ? DASHBOARD.inspector.close : DASHBOARD.inspector.open
          }
          aria-pressed={inspectorOpen}
          className="arr-focus graph-inspector-toggle"
          onClick={() => setInspectorOpen((value) => !value)}
          type="button"
        >
          {inspectorOpen ? (
            <PanelRightClose aria-hidden size={15} />
          ) : (
            <PanelRightOpen aria-hidden size={15} />
          )}
        </button>
      </section>

      <div className="graph-facet-bar">
        <div
          aria-label={DASHBOARD.filters.areaLabel}
          className="arr-area-chips"
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
                <small>{areaCounts.get(option.value) ?? 0}</small>
              )}
            </button>
          ))}
        </div>
        <div className="arr-legend" aria-label={DASHBOARD.ariaLegend}>
          <span>
            <i className="requirement" />
            {DASHBOARD.legend.requirement}
          </span>
          <span>
            <i className="document" />
            {DASHBOARD.legend.document}
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
        <span className="graph-visible-count">
          {DASHBOARD.visibleCount(visibleGraph.nodes.length)}
        </span>
      </div>

      <section
        className="graph-workspace-body"
        data-inspector={inspectorOpen ? "open" : "closed"}
      >
        <section className="graph-plot-column" aria-label={DASHBOARD.plotAria}>
          <div className="graph-plot-surface">
            {blocked || graphView === "canvas" ? (
              <GraphStageSurface
                blocked={blocked}
                focusNodeId={cameraFocusNodeId}
                groupByArea={groupByArea}
                model={model}
                onLodReport={(level, labels) => setHudLod({ labels, level })}
                onNodeActivate={(node) =>
                  window.location.assign(
                    `/graph?node=${encodeURIComponent(node.id)}`,
                  )
                }
                onNodeSelect={setSelectedNode}
                onRetry={() => setRecovered(true)}
                onSettingsChange={updatePanelSettings}
                realtime={realtime}
                selectedNodeId={selectedNode?.id ?? null}
                settings={panelSettings}
                visibleGraph={visibleGraph}
              />
            ) : (
              <GraphTableView
                data={visibleGraph}
                onNodeActivate={(node) =>
                  window.location.assign(
                    `/graph?node=${encodeURIComponent(node.id)}`,
                  )
                }
                onNodeSelect={setSelectedNode}
                selectedNodeId={selectedNode?.id ?? null}
              />
            )}
          </div>
          <footer
            className={`arr-ci-note ${model.state === "no-ci" ? "warning" : ""}`}
            role="status"
          >
            {model.state === "no-ci" ? (
              <AlertTriangle aria-hidden size={15} />
            ) : (
              <CheckCircle2 aria-hidden size={15} />
            )}
            {model.ciMessage}
          </footer>
        </section>

        {inspectorOpen ? (
          <aside
            aria-label={DASHBOARD.ariaInspector}
            className="graph-inspector"
          >
            <header className="graph-inspector-head">
              <div>
                <span className="arr-kicker">{DASHBOARD.inspector.kicker}</span>
                <strong>
                  {selectedNode?.label ?? DASHBOARD.inspector.noSelection}
                </strong>
              </div>
              <StatusBadge grade={selectedNode?.grade ?? "inferred"}>
                {selectedNode?.grade ?? GRADE.waiting}
              </StatusBadge>
            </header>
            <div
              aria-label={DASHBOARD.inspector.tabsAria}
              className="graph-inspector-tabs"
              role="tablist"
            >
              {(["details", "relationships", "activity"] as const).map(
                (tab) => (
                  <button
                    aria-controls={`graph-inspector-${tab}`}
                    aria-selected={inspectorTab === tab}
                    id={`graph-inspector-tab-${tab}`}
                    key={tab}
                    onClick={() => setInspectorTab(tab)}
                    role="tab"
                    type="button"
                  >
                    {tab === "activity" ? (
                      <Activity aria-hidden size={14} />
                    ) : null}
                    {DASHBOARD.inspector.tabs[tab]}
                    {tab === "relationships" &&
                    selectedRelationships.length > 0 ? (
                      <small>{selectedRelationships.length}</small>
                    ) : null}
                  </button>
                ),
              )}
            </div>

            <div
              aria-labelledby={`graph-inspector-tab-${inspectorTab}`}
              className="graph-inspector-panel"
              id={`graph-inspector-${inspectorTab}`}
              role="tabpanel"
            >
              {inspectorTab === "details" ? (
                selectedNode ? (
                  <div className="graph-node-details">
                    <h2>{requirementCode(selectedNode)}</h2>
                    <p>{DASHBOARD.inspector.lead}</p>
                    <code className="arr-selected-path">
                      {selectedNode.path}
                    </code>
                    {selectedNode.findingCount ? (
                      <span className="arr-finding">
                        <AlertTriangle aria-hidden size={13} />
                        {DASHBOARD.inspector.findingCount(
                          selectedNode.findingCount,
                        )}
                      </span>
                    ) : null}
                    <section
                      aria-labelledby="evidence-chain-title"
                      className="arr-chain"
                    >
                      <span className="arr-kicker" id="evidence-chain-title">
                        {DASHBOARD.inspector.chainTitle}
                      </span>
                      <ol>
                        {evidenceChain.map((node) => (
                          <li className={node.grade} key={node.id}>
                            <span className="arr-chain-icon">
                              {node.type === "code" ? (
                                <Code2 aria-hidden size={16} />
                              ) : node.type === "test" ? (
                                <TestTube2 aria-hidden size={16} />
                              ) : (
                                <FileText aria-hidden size={16} />
                              )}
                            </span>
                            <div>
                              <small>
                                {DASHBOARD.filters.types[node.type]}
                              </small>
                              <strong>{node.label}</strong>
                              <code>{node.path}</code>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </div>
                ) : (
                  <div className="graph-inspector-empty">
                    <Network aria-hidden size={24} />
                    <p>{DASHBOARD.inspector.empty}</p>
                  </div>
                )
              ) : null}

              {inspectorTab === "relationships" ? (
                selectedNode && selectedRelationships.length > 0 ? (
                  <ul className="graph-relationships">
                    {selectedRelationships.map(({ edge, node }) => (
                      <li key={edge.id}>
                        <button
                          onClick={() => {
                            setSelectedNode(node);
                            setCameraFocusNodeId(node.id);
                          }}
                          type="button"
                        >
                          <span>
                            <strong>{edge.provenance.relation}</strong>
                            <StatusBadge grade={edge.provenance.grade} />
                          </span>
                          <b>{node.label}</b>
                          <code>
                            {edge.provenance.sourcePath}:
                            {edge.provenance.startLine}
                          </code>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="graph-inspector-empty">
                    <List aria-hidden size={24} />
                    <p>{DASHBOARD.inspector.noRelationships}</p>
                  </div>
                )
              ) : null}

              {inspectorTab === "activity" ? (
                <LiveActivityFeed
                  feed={realtime.feed}
                  nodes={model.graph.nodes}
                  onFocusNode={(node) => {
                    setSelectedNode(node);
                    setCameraFocusNodeId(node.id);
                    setInspectorTab("details");
                  }}
                  onReplay={replayMcpSession}
                  renderBatches={realtime.renderBatches}
                />
              ) : null}
            </div>
          </aside>
        ) : null}
      </section>
      <div aria-live="polite" className="sr-only">
        {selectedNode
          ? DASHBOARD.selectionAnnouncement(
              selectedNode.label,
              selectedRelationships.length,
            )
          : DASHBOARD.inspector.noSelection}
      </div>
    </main>
  );
}
