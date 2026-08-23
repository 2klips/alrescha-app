"use client";

/**
 * SSR-safe host for the brain map (Phase 2A todos 4–5, mounted by todo 7).
 *
 * The WebGL renderer is `dynamic(..., { ssr: false })`; the surrounding markup
 * is plain DOM so the graph keeps a keyboard- and screen-reader-reachable
 * representation of every node and edge even before (or without) WebGL. The
 * force panel lives here because it owns the persisted settings that the
 * renderer consumes.
 *
 * A canvas has no accessibility tree and no click targets, so the stage also
 * renders a transparent **hit layer** — one button per node, parked over its
 * painted position by `BrainMap`. That single layer serves the pointer, the
 * keyboard, assistive technology and the e2e suite, which is why the node
 * affordance is DOM rather than canvas hit-testing.
 */

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";

import type {
  GraphData,
  GraphEdge,
  GraphNode,
} from "../../lib/dashboard/graph-model";
import {
  forceConfigOf,
  type GraphPanelSettings,
} from "../../lib/graph/graph-panel-settings";
import type { LodLevel } from "../../lib/graph/lod";
import { DASHBOARD } from "../../lib/strings";
import { GraphForcePanel, useGraphPanelSettings } from "./graph-force-panel";

const BrainMap = dynamic(
  () => import("./brain-map").then((module_) => module_.BrainMap),
  { ssr: false },
);

/**
 * Upper bound on DOM hit targets. Past this the graph is a constellation to
 * navigate by camera, not a list to tab through, and the highest-degree nodes
 * are the ones worth reaching; the renderer still paints every node.
 */
export const HIT_TARGET_LIMIT = 600;

export interface BrainMapStageProps {
  /** Nodes carrying the residual afterglow tint. */
  afterglow?: ReadonlySet<string>;
  data: GraphData;
  /** Directional focus (todo 2): selection tints edges by dependency direction. */
  directionalFocus?: boolean;
  /** Camera target — the activity feed's "fly to this node" gesture. */
  focusNodeId?: string | null;
  /** Node id → 0…1 neuron-glow intensity (see `lib/graph/glow.ts`). */
  glow?: ReadonlyMap<string, number>;
  onEdgeSelect?: (edge: GraphEdge) => void;
  /** Double-click / Enter on a node — the drill-down to evidence detail. */
  onNodeActivate?: (node: GraphNode) => void;
  onNodeSelect?: (node: GraphNode) => void;
  /**
   * OQ-007: when the surrounding HUD hosts the force panel itself (as a
   * workspace-grid sibling), it owns the settings and receives LOD updates
   * through these props instead of the stage's internal state.
   */
  onLodReport?: (lod: LodLevel, labels: number) => void;
  onSettingsChange?: (patch: Partial<GraphPanelSettings>) => void;
  seed?: number;
  selectedNodeId?: string | null;
  settings?: GraphPanelSettings;
  /** Set false when a surrounding HUD supplies its own controls. */
  showForcePanel?: boolean;
}

/** The nodes that get a DOM hit target: highest degree first, capped. */
export function hitTargets(
  data: GraphData,
  limit = HIT_TARGET_LIMIT,
): GraphNode[] {
  if (data.nodes.length <= limit) return [...data.nodes];
  const degrees = new Map<string, number>();
  for (const edge of data.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return [...data.nodes]
    .sort((left, right) => {
      const delta = (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0);
      return delta === 0 ? left.id.localeCompare(right.id) : delta;
    })
    .slice(0, limit);
}

export function BrainMapStage({
  afterglow,
  data,
  directionalFocus,
  focusNodeId,
  glow,
  onEdgeSelect,
  onLodReport,
  onNodeActivate,
  onNodeSelect,
  onSettingsChange,
  seed,
  selectedNodeId,
  settings: externalSettings,
  showForcePanel = true,
}: BrainMapStageProps) {
  const [internalSettings, updateInternalSettings] = useGraphPanelSettings();
  const settings = externalSettings ?? internalSettings;
  const updateSettings = onSettingsChange ?? updateInternalSettings;
  const [lod, setLod] = useState<{ labels: number; level: LodLevel }>({
    labels: 0,
    level: "near",
  });
  const forceConfig = useMemo(() => forceConfigOf(settings), [settings]);
  const hitLayerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const targets = useMemo(() => hitTargets(data), [data]);

  // OQ-006: roving tabindex. 600 buttons were 600 tab stops — unusable for a
  // keyboard or screen-reader user. The layer is now ONE stop: Tab enters on
  // the active node, arrow keys walk the nodes, Tab leaves.
  const [activeHitIndex, setActiveHitIndex] = useState(0);
  const boundedActiveIndex = Math.min(
    activeHitIndex,
    Math.max(targets.length - 1, 0),
  );
  const moveHitFocus = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : event.key === "Home"
              ? Number.NEGATIVE_INFINITY
              : event.key === "End"
                ? Number.POSITIVE_INFINITY
                : null;
      if (step === null || targets.length === 0) return;
      event.preventDefault();
      const next =
        step === Number.NEGATIVE_INFINITY
          ? 0
          : step === Number.POSITIVE_INFINITY
            ? targets.length - 1
            : (boundedActiveIndex + step + targets.length) % targets.length;
      setActiveHitIndex(next);
      const buttons =
        hitLayerRef.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[next]?.focus();
    },
    [boundedActiveIndex, targets.length],
  );

  return (
    <div
      aria-label={DASHBOARD.canvasLabel(data.nodes.length)}
      className="brain-map-stage"
      data-canvas-nodes={data.nodes.length}
      data-focus-node={
        directionalFocus && selectedNodeId ? selectedNodeId : undefined
      }
      data-glow-active={glow ? glow.size : 0}
      data-lod={lod.level}
      data-lod-labels={lod.labels}
      data-testid="brain-map-stage"
      role="group"
    >
      <div className="brain-map-viewport" ref={viewportRef}>
        <BrainMap
          {...(afterglow ? { afterglow } : {})}
          data={data}
          {...(directionalFocus === undefined ? {} : { directionalFocus })}
          {...(focusNodeId === undefined ? {} : { focusNodeId })}
          forceConfig={forceConfig}
          {...(glow ? { glow } : {})}
          hitLayer={hitLayerRef}
          onLodChange={(level, labels) => {
            setLod({ labels, level: level as LodLevel });
            onLodReport?.(level as LodLevel, labels);
          }}
          {...(seed === undefined ? {} : { seed })}
          selectedNodeId={selectedNodeId ?? null}
          textFadeThreshold={settings.textFadeThreshold}
          viewport={viewportRef}
        />
        {/* Positions below are the pre-simulation fixture layout; `BrainMap`
            takes over as soon as the renderer produces its first frame. */}
        <div
          aria-label={DASHBOARD.hitLayerLabel}
          className="brain-map-hits"
          data-testid="brain-map-hits"
          onKeyDown={moveHitFocus}
          ref={hitLayerRef}
          role="toolbar"
        >
          {targets.map((node, index) => (
            <button
              aria-label={DASHBOARD.nodeSummary(
                node.label,
                node.type,
                node.grade,
              )}
              aria-pressed={node.id === selectedNodeId}
              className="brain-map-hit"
              data-grade={node.grade}
              data-node-id={node.id}
              key={node.id}
              onClick={() => onNodeSelect?.(node)}
              onDoubleClick={() => onNodeActivate?.(node)}
              onFocus={() => setActiveHitIndex(index)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onNodeActivate?.(node);
              }}
              style={{
                left: `calc(50% + ${node.x}px)`,
                top: `calc(50% + ${node.y}px)`,
              }}
              tabIndex={index === boundedActiveIndex ? 0 : -1}
              type="button"
            />
          ))}
        </div>
      </div>
      {showForcePanel ? (
        <GraphForcePanel
          labelCount={lod.labels}
          lod={lod.level}
          onChange={updateSettings}
          settings={settings}
        />
      ) : null}
      <div aria-live="polite" className="sr-only">
        {data.edges.map((edge) => (
          <button
            key={edge.id}
            onClick={() => onEdgeSelect?.(edge)}
            type="button"
          >
            {edge.provenance.relation}: {edge.source} to {edge.target},{" "}
            {edge.provenance.grade}
          </button>
        ))}
      </div>
    </div>
  );
}
