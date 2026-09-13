"use client";

import {
  AlertTriangle,
  CircleDotDashed,
  Code2,
  FileText,
  Filter,
  GitCommitHorizontal,
  KeyRound,
  LayoutGrid,
  Lightbulb,
  Link2,
  Network,
  Radio,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  filterGraph,
  focusLocalGraph,
  graphNodeArea,
  topHubNodes,
  type GraphData,
  type GraphFilters,
  type GraphNode,
} from "../../../../lib/dashboard/graph-model";
import { BRAIN_AREAS, type BrainArea } from "@alrescha/core/artifact-facets";
import {
  glowAfterglowNodes,
  glowFromRealtime,
} from "../../../../lib/graph/glow";
import type { LodLevel } from "../../../../lib/graph/lod";
import { useGraphPanelSettings } from "../../../ui/graph-force-panel";
import {
  createBrowserWorkspaceRealtimeSource,
  createRealtimeGraphState,
  reduceAccessEventBatch,
  relativeEventTime,
  subscribeWorkspaceRealtime,
  type AccessPolicy,
  type GraphAccessEvent,
  type RealtimeGraphState,
} from "../../../../lib/realtime/access-events";
import type { WorkspaceRealtimeBridgeStatus } from "../../../../lib/realtime/supabase-bridge";
import { DASHBOARD, GRADE, WORKSPACE_MAP } from "../../../../lib/strings";
import type {
  WorkspaceMapHud,
  WorkspaceMapModel,
} from "../../../../lib/map/workspace-map";
import { BrainMapStage } from "../../../ui/brain-map-stage";
import { FacetBandView } from "../../../ui/facet-band-view";
import { useRealtimeClock } from "../../../ui/realtime-clock";
import { StatusBadge } from "../../../ui/status-badge";
import { useWorkspaceRealtimeBridge } from "../../../ui/workspace-realtime-bridge";

/**
 * The workspace's own knowledge graph (Phase 3 Wave A todo 1).
 *
 * `/map` stays the demo dashboard; this screen renders only stored rows. An
 * empty workspace shows the connect empty state — the demo fixture is never a
 * fallback for missing data. The glow pipeline runs against the *real*
 * workspace policy: events seeded from `access_events` rows and any live
 * events on this workspace's channel, with revoked tokens filtered out.
 *
 * Phase 4 Wave B todo 15 closes D10: the channel is now actually joined
 * (`useWorkspaceRealtimeBridge`, private topic, member-only policy), and the
 * rail's HUD chips read `model.hud` — coverage with its basis, the risk
 * map's top files, the last scan's commit and age — instead of nothing.
 */

const TYPE_OPTIONS = [
  { label: DASHBOARD.filters.types.all, value: "all" },
  { label: DASHBOARD.filters.types.requirement, value: "requirement" },
  { label: DASHBOARD.filters.types.document, value: "document" },
  { label: DASHBOARD.filters.types.code, value: "code" },
  { label: DASHBOARD.filters.types.test, value: "test" },
  { label: DASHBOARD.filters.types.concept, value: "concept" },
] as const;

const GRADE_OPTIONS = [
  { label: DASHBOARD.filters.grades.all, value: "all" },
  { label: DASHBOARD.filters.grades.verified, value: "verified" },
  { label: DASHBOARD.filters.grades.inferred, value: "inferred" },
  { label: DASHBOARD.filters.grades.broken, value: "broken" },
] as const;

const AREA_OPTIONS: readonly { label: string; value: BrainArea | "all" }[] = [
  { label: DASHBOARD.filters.areas.all, value: "all" },
  ...BRAIN_AREAS.map((area) => ({
    label: DASHBOARD.filters.areas[area],
    value: area,
  })),
];

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="arr-metric" data-active={false}>
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </span>
  );
}

/**
 * A real-data chip: the number, its label, one line of detail, and the
 * sentence saying where it came from. `data-basis` carries the coverage
 * basis so a test can tell "measured 0%" from "unmeasured" without reading
 * the copy (the same attribute the progress ledger's card uses).
 */
function HudChip({
  basis,
  detail,
  label,
  source,
  testId,
  value,
}: {
  basis?: string;
  detail: string;
  label: string;
  source: string;
  testId: string;
  value: string;
}) {
  return (
    <span
      className="arr-metric arr-hud-chip"
      data-active={false}
      data-basis={basis}
      data-testid={testId}
    >
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
      <small className="arr-hud-source">{source}</small>
    </span>
  );
}

function coverageChip(hud: WorkspaceMapHud) {
  const { coverage } = hud;
  const copy = WORKSPACE_MAP.hud.coverage;
  if (coverage.basis === "measured" && coverage.percent !== null) {
    return {
      detail: copy.measured(coverage.covered, coverage.total),
      value: `${coverage.percent}%`,
    };
  }
  return {
    detail: coverage.basis === "no-links" ? copy.noLinks : copy.noData,
    value: "—",
  };
}

function lastScanChip(hud: WorkspaceMapHud) {
  const { lastScan } = hud;
  const copy = WORKSPACE_MAP.hud.lastScan;
  if (lastScan.commitSha === null) {
    return { detail: copy.never, value: "—" };
  }
  return {
    detail:
      lastScan.ageMinutes === null
        ? copy.unknownAge
        : copy.age(lastScan.ageMinutes),
    value: lastScan.commitSha.slice(0, 7),
  };
}

/**
 * The risk map's top files (todo 21), as a list a reader can act on: each
 * row focuses its node the way a hub row does. A workspace the map ranked
 * nothing in says so — an empty list under a kicker is a chart with no
 * axis.
 */
function RiskTopList({
  hud,
  nodes,
  onFocusNode,
  selectedNodeId,
}: {
  hud: WorkspaceMapHud;
  nodes: readonly GraphNode[];
  onFocusNode: (node: GraphNode) => void;
  selectedNodeId: string | null;
}) {
  const copy = WORKSPACE_MAP.hud.risk;
  const risk = hud.risk;
  return (
    <div
      aria-label={copy.aria}
      className="arr-hubs arr-hud-risk"
      data-risk-ranked={risk?.ranked ?? ""}
      data-testid="hud-risk"
    >
      <span className="arr-kicker">
        <ShieldAlert size={12} />
        {copy.kicker}
        {risk ? <small>{copy.count(risk.ranked)}</small> : null}
      </span>
      {!risk || risk.top.length === 0 ? (
        <small>{copy.empty}</small>
      ) : (
        <ol>
          {risk.top.map((entry) => {
            const node = nodes.find(
              (candidate) => candidate.id === entry.nodeId,
            );
            return (
              <li key={entry.nodeId}>
                <button
                  aria-pressed={entry.nodeId === selectedNodeId}
                  data-risk-level={entry.level}
                  data-risk-node={entry.nodeId}
                  disabled={!node}
                  onClick={() => {
                    if (node) onFocusNode(node);
                  }}
                  type="button"
                >
                  <i className={`risk-ring ${entry.level}`} />
                  <span>{entry.path}</span>
                  <small>{copy.levels[entry.level]}</small>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {risk?.unmeasured.includes("coverage") ? (
        <small className="arr-hud-unmeasured">{copy.unmeasuredCoverage}</small>
      ) : null}
      <small className="arr-hud-source">{copy.source}</small>
    </div>
  );
}

/**
 * No nodes yet. Two honest reasons (Phase 4 Wave C todo 16): nothing is
 * connected, or something is and its first scan has not landed — the
 * screen opens the moment the structure is ready, so the second state points
 * at the progress rather than at connect.
 */
function EmptyMap({ repoFullName }: { repoFullName: string | null }) {
  const scanning = repoFullName !== null;
  return (
    <div
      className="graph-state empty-state"
      data-map-empty={scanning ? "scanning" : "connect"}
      data-testid="workspace-map-empty"
      role="status"
    >
      <span className="pre-scan-orbit">
        <CircleDotDashed size={28} />
      </span>
      <strong>
        {scanning
          ? WORKSPACE_MAP.empty.scanningTitle(repoFullName)
          : WORKSPACE_MAP.empty.title}
      </strong>
      <span>
        {scanning ? WORKSPACE_MAP.empty.scanningBody : WORKSPACE_MAP.empty.body}
      </span>
      <div className="revoked-actions">
        {scanning ? (
          <Link className="btn btn-secondary btn-sm" href="/app">
            <CircleDotDashed size={14} /> {WORKSPACE_MAP.empty.progress}
          </Link>
        ) : (
          <Link className="btn btn-secondary btn-sm" href="/app/connect/github">
            <Link2 size={14} /> {WORKSPACE_MAP.empty.connect}
          </Link>
        )}
      </div>
    </div>
  );
}

type PanelSettings = ReturnType<typeof useGraphPanelSettings>[0];

interface GraphStageSurfaceProps {
  focusNodeId: string | null;
  groupByArea: boolean;
  isClustered: boolean;
  isEmpty: boolean;
  nodeCount: number;
  onLodReport: (level: LodLevel, labels: number) => void;
  onNodeSelect: (node: GraphNode) => void;
  onSettingsChange: (patch: Partial<PanelSettings>) => void;
  realtime: RealtimeGraphState;
  /** The connected repository, for the empty state's "scanning" reading. */
  repoFullName: string | null;
  selectedNodeId: string | null;
  settings: PanelSettings;
  visibleGraph: GraphData;
}

/**
 * QW-6: the only piece of the screen that needs the 180ms glow clock. It
 * sits below the filter rail and inspector (both stay in
 * `WorkspaceMapScreen`) so a tick here re-renders just this stage, not the
 * whole tree — see `ui/realtime-clock.ts`.
 */
function GraphStageSurface({
  focusNodeId,
  groupByArea,
  isClustered,
  isEmpty,
  nodeCount,
  onLodReport,
  onNodeSelect,
  onSettingsChange,
  realtime,
  repoFullName,
  selectedNodeId,
  settings,
  visibleGraph,
}: GraphStageSurfaceProps) {
  const clock = useRealtimeClock(realtime.feed.length, realtime.renderBatches);
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
      {isEmpty ? (
        <EmptyMap repoFullName={repoFullName} />
      ) : groupByArea ? (
        <FacetBandView
          data={visibleGraph}
          onNodeActivate={onNodeSelect}
          onNodeSelect={onNodeSelect}
          selectedNodeId={selectedNodeId}
        />
      ) : (
        <BrainMapStage
          afterglow={afterglow}
          data={visibleGraph}
          directionalFocus
          focusNodeId={focusNodeId}
          glow={glow}
          onLodReport={onLodReport}
          onNodeActivate={onNodeSelect}
          onNodeSelect={onNodeSelect}
          onSettingsChange={onSettingsChange}
          selectedNodeId={selectedNodeId}
          settings={settings}
          showForcePanel={false}
        />
      )}
      {isClustered ? (
        <div className="arr-cluster-note" role="status">
          {DASHBOARD.clusterNote(nodeCount)}
        </div>
      ) : null}
    </div>
  );
}

interface LiveActivityFeedProps {
  channel: WorkspaceRealtimeBridgeStatus;
  feed: readonly GraphAccessEvent[];
  nodes: readonly GraphNode[];
  onFocusNode: (node: GraphNode) => void;
  renderBatches: number;
}

/**
 * QW-6: owns its own copy of the animation clock so the "Ns ago" labels
 * keep updating live without the rail/inspector re-rendering alongside it
 * — see `ui/realtime-clock.ts`.
 */
function LiveActivityFeed({
  channel,
  feed,
  nodes,
  onFocusNode,
  renderBatches,
}: LiveActivityFeedProps) {
  const clock = useRealtimeClock(feed.length, renderBatches);

  return (
    <section className="arr-activity" aria-labelledby="map-activity-title">
      <header>
        <div>
          <span className="arr-live" data-live-channel={channel}>
            <Radio size={12} />
            {WORKSPACE_MAP.activity.live}
            {/* The channel's actual state beside the word: "Live" while the
                join is still pending would be a claim the page cannot back. */}
            <small aria-label={WORKSPACE_MAP.activity.channel.aria}>
              {WORKSPACE_MAP.activity.channel[channel]}
            </small>
          </span>
          <h2 id="map-activity-title">{WORKSPACE_MAP.activity.title}</h2>
        </div>
      </header>
      <div
        aria-label={WORKSPACE_MAP.activity.aria}
        className="arr-activity-table"
        role="feed"
      >
        {feed.length > 0 ? (
          feed.map((event) => (
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
            </button>
          ))
        ) : (
          <div className="arr-activity-row">
            <span>{WORKSPACE_MAP.activity.empty}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function WorkspaceMapScreen({ model }: { model: WorkspaceMapModel }) {
  const [filters, setFilters] = useState<GraphFilters>({
    area: "all",
    grade: "all",
    query: "",
    type: "all",
  });
  const [localFocus, setLocalFocus] = useState(false);
  const [groupByArea, setGroupByArea] = useState(false);
  const [showCoChanges, setShowCoChanges] = useState(true);
  const [showConcepts, setShowConcepts] = useState(true);
  const [cameraFocusNodeId, setCameraFocusNodeId] = useState<string | null>(
    null,
  );
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [panelSettings, updatePanelSettings] = useGraphPanelSettings();
  const [, setHudLod] = useState<{ labels: number; level: LodLevel }>({
    labels: 0,
    level: "near",
  });

  const policy = useMemo<AccessPolicy>(
    () => ({
      revokedTokenIds: new Set(model.revokedTokenIds),
      workspaceId: model.workspaceId,
    }),
    [model.revokedTokenIds, model.workspaceId],
  );
  const [realtime, setRealtime] = useState(() =>
    reduceAccessEventBatch(
      createRealtimeGraphState(model.workspaceId),
      model.feed,
      policy,
    ),
  );

  const baseGraph = useMemo(
    () => filterGraph(model.graph, filters),
    [filters, model.graph],
  );
  const familyGraph = useMemo(() => {
    let graph = baseGraph;
    if (!showCoChanges) {
      graph = {
        edges: graph.edges.filter(
          (edge) => edge.provenance.relation !== "co_changed",
        ),
        nodes: graph.nodes,
      };
    }
    // Concept layer toggle (Wave C todo 7): off hides the AI-synthesized
    // concept nodes and every edge touching them — the structural layer
    // underneath is untouched.
    if (!showConcepts) {
      const conceptIds = new Set(
        graph.nodes
          .filter((node) => node.type === "concept")
          .map((node) => node.id),
      );
      graph = {
        edges: graph.edges.filter(
          (edge) =>
            !conceptIds.has(edge.source) && !conceptIds.has(edge.target),
        ),
        nodes: graph.nodes.filter((node) => !conceptIds.has(node.id)),
      };
    }
    return graph;
  }, [baseGraph, showCoChanges, showConcepts]);
  const visibleGraph = useMemo(
    () =>
      localFocus && selectedNode
        ? focusLocalGraph(familyGraph, selectedNode.id)
        : familyGraph,
    [familyGraph, localFocus, selectedNode],
  );
  const hubs = useMemo(() => topHubNodes(model.graph), [model.graph]);
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
  const neighbors = useMemo(() => {
    if (!selectedNode) return [];
    const connected = new Set<string>();
    for (const edge of model.graph.edges) {
      if (edge.source === selectedNode.id) connected.add(edge.target);
      if (edge.target === selectedNode.id) connected.add(edge.source);
    }
    return model.graph.nodes
      .filter((node) => connected.has(node.id))
      .slice(0, 5);
  }, [model.graph.edges, model.graph.nodes, selectedNode]);

  useEffect(() => {
    return subscribeWorkspaceRealtime(
      createBrowserWorkspaceRealtimeSource(window),
      policy,
      (events) =>
        setRealtime((current) =>
          reduceAccessEventBatch(current, events, policy),
        ),
      (flush) => window.requestAnimationFrame(flush),
    );
  }, [policy]);

  // The server's channel, re-emitted onto the window bus the effect above
  // listens to (todo 15). Node id → path is the feed row's label, derived
  // once so the hook's subscription does not churn with every render.
  const pathOf = useMemo(() => {
    const byId = new Map(model.graph.nodes.map((node) => [node.id, node.path]));
    return (nodeId: string) => byId.get(nodeId);
  }, [model.graph.nodes]);
  const channel = useWorkspaceRealtimeBridge(policy, pathOf);

  const isEmpty = model.graph.nodes.length === 0;
  const coverage = coverageChip(model.hud);
  const lastScan = lastScanChip(model.hud);
  const focusNode = (node: GraphNode) => {
    setSelectedNode(node);
    setCameraFocusNodeId(node.id);
  };

  return (
    <main
      className="arr-home"
      aria-label={WORKSPACE_MAP.ariaMain}
      data-live-channel={channel}
    >
      <div className="arr-workspace">
        <aside className="arr-repo-rail" aria-label={DASHBOARD.ariaRepoRail}>
          <div className="arr-repo-block">
            <span className="arr-kicker">{WORKSPACE_MAP.repoKicker}</span>
            <strong>
              <Network size={17} />
              {model.repoFullName ?? WORKSPACE_MAP.noRepo}
            </strong>
            <small>
              <GitCommitHorizontal size={12} />
              {WORKSPACE_MAP.commitKicker} ·{" "}
              {model.lastScannedCommitSha
                ? model.lastScannedCommitSha.slice(0, 7)
                : WORKSPACE_MAP.noScanYet}
            </small>
          </div>
          <div className="arr-metrics" aria-label={WORKSPACE_MAP.counts.aria}>
            <CountChip
              label={WORKSPACE_MAP.counts.artifacts}
              value={model.counts.artifacts}
            />
            <CountChip
              label={WORKSPACE_MAP.counts.rationales}
              value={model.counts.rationales}
            />
            <CountChip
              label={WORKSPACE_MAP.counts.requirements}
              value={model.counts.requirements}
            />
            <CountChip
              label={WORKSPACE_MAP.counts.edges}
              value={model.counts.edges}
            />
            <CountChip
              label={WORKSPACE_MAP.counts.concepts}
              value={model.counts.concepts}
            />
          </div>
          <div
            className="arr-metrics arr-hud"
            aria-label={WORKSPACE_MAP.hud.aria}
            data-testid="map-hud"
          >
            <HudChip
              detail={WORKSPACE_MAP.hud.findings.detail}
              label={WORKSPACE_MAP.counts.openFindings}
              source={WORKSPACE_MAP.hud.findings.source}
              testId="hud-open-findings"
              value={model.hud.openFindings.toLocaleString()}
            />
            <HudChip
              basis={model.hud.coverage.basis}
              detail={coverage.detail}
              label={WORKSPACE_MAP.hud.coverage.label}
              source={WORKSPACE_MAP.hud.coverage.source}
              testId="hud-coverage"
              value={coverage.value}
            />
            <HudChip
              detail={lastScan.detail}
              label={WORKSPACE_MAP.hud.lastScan.label}
              source={WORKSPACE_MAP.hud.lastScan.source}
              testId="hud-last-scan"
              value={lastScan.value}
            />
          </div>
          <RiskTopList
            hud={model.hud}
            nodes={model.graph.nodes}
            onFocusNode={focusNode}
            selectedNodeId={selectedNode?.id ?? null}
          />
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
                  <small>{areaCounts.get(option.value) ?? 0}</small>
                )}
              </button>
            ))}
          </div>
          <div className="arr-hubs" aria-label={DASHBOARD.hubs.aria}>
            <span className="arr-kicker">{DASHBOARD.hubs.kicker}</span>
            {hubs.length === 0 ? (
              <small>{DASHBOARD.hubs.empty}</small>
            ) : (
              <ol>
                {hubs.map(({ degree, node }) => (
                  <li key={node.id}>
                    <button
                      aria-pressed={node.id === selectedNode?.id}
                      data-hub-node={node.id}
                      onClick={() => focusNode(node)}
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
          <div className="arr-rail-links">
            <Link href="/app/settings/mcp">
              <KeyRound size={15} />
              {WORKSPACE_MAP.activity.manageTokens}
            </Link>
          </div>
        </aside>

        <section
          className="arr-proof-panel"
          aria-labelledby="workspace-map-title"
        >
          <header className="arr-proof-heading">
            <div>
              <span className="arr-kicker">
                {WORKSPACE_MAP.commitKicker} ·{" "}
                {model.lastScannedCommitSha
                  ? model.lastScannedCommitSha.slice(0, 7)
                  : WORKSPACE_MAP.noScanYet}
              </span>
              <h1 id="workspace-map-title">
                {WORKSPACE_MAP.title}
                <span className="arr-proof-repo">
                  {model.repoFullName ?? WORKSPACE_MAP.noRepo}
                </span>
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
              <span>
                <i className="database" />
                {DASHBOARD.legend.database}
              </span>
              {selectedNode ? (
                <>
                  <span
                    aria-label={WORKSPACE_MAP.focus.aria}
                    data-testid="focus-legend-out"
                  >
                    <i className="focus-out" />
                    {WORKSPACE_MAP.focus.out}
                  </span>
                  <span data-testid="focus-legend-in">
                    <i className="focus-in" />
                    {WORKSPACE_MAP.focus.in}
                  </span>
                </>
              ) : null}
            </div>
          </header>
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
            <button
              aria-label={WORKSPACE_MAP.coChange.toggleAria}
              aria-pressed={showCoChanges}
              className="arr-focus"
              data-testid="graph-co-change-toggle"
              onClick={() => setShowCoChanges((value) => !value)}
              type="button"
            >
              <GitCommitHorizontal size={14} />
              {WORKSPACE_MAP.coChange.toggle}
            </button>
            <button
              aria-label={WORKSPACE_MAP.conceptLayer.toggleAria}
              aria-pressed={showConcepts}
              className="arr-focus"
              data-testid="graph-concept-toggle"
              onClick={() => setShowConcepts((value) => !value)}
              type="button"
            >
              <Lightbulb size={14} />
              {WORKSPACE_MAP.conceptLayer.toggle}
            </button>
          </div>
          <GraphStageSurface
            focusNodeId={cameraFocusNodeId}
            groupByArea={groupByArea}
            isClustered={model.isClustered}
            isEmpty={isEmpty}
            nodeCount={model.graph.nodes.length}
            onLodReport={(level, labels) => setHudLod({ labels, level })}
            onNodeSelect={setSelectedNode}
            onSettingsChange={updatePanelSettings}
            realtime={realtime}
            repoFullName={model.repoFullName}
            selectedNodeId={selectedNode?.id ?? null}
            settings={panelSettings}
            visibleGraph={visibleGraph}
          />
        </section>

        <aside
          className="arr-inspector"
          aria-label={WORKSPACE_MAP.inspector.aria}
        >
          <header>
            <span className="arr-kicker">{WORKSPACE_MAP.inspector.kicker}</span>
            <StatusBadge grade={selectedNode?.grade ?? "inferred"}>
              {selectedNode?.grade ?? GRADE.waiting}
            </StatusBadge>
          </header>
          {selectedNode ? (
            <>
              <h2>{selectedNode.label}</h2>
              <code className="arr-selected-path">{selectedNode.path}</code>
              {selectedNode.findingCount ? (
                <span className="arr-finding">
                  <AlertTriangle size={13} />
                  {WORKSPACE_MAP.inspector.findingCount(
                    selectedNode.findingCount,
                  )}
                </span>
              ) : null}
              <section
                className="arr-chain"
                aria-labelledby="map-neighbors-title"
              >
                <span className="arr-kicker" id="map-neighbors-title">
                  {WORKSPACE_MAP.inspector.neighborsTitle}
                </span>
                {neighbors.length === 0 ? (
                  <p>{WORKSPACE_MAP.inspector.neighborsEmpty}</p>
                ) : (
                  <ol>
                    {neighbors.map((node) => (
                      <li className={node.grade} key={node.id}>
                        <span className="arr-chain-icon">
                          {node.type === "code" ? (
                            <Code2 size={16} />
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
                )}
              </section>
            </>
          ) : (
            <p>{WORKSPACE_MAP.inspector.empty}</p>
          )}
        </aside>

        <LiveActivityFeed
          channel={channel}
          feed={realtime.feed}
          nodes={model.graph.nodes}
          onFocusNode={focusNode}
          renderBatches={realtime.renderBatches}
        />
      </div>
    </main>
  );
}
