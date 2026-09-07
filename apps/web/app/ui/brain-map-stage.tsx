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
 * A canvas has no accessibility tree, so the stage also renders a transparent
 * **hit layer** — one button per node, parked over its painted position by
 * `BrainMap` — for the keyboard, assistive technology and the e2e suite.
 *
 * It is no longer the pointer's route (Phase 4 Wave B todo 10). It is capped,
 * and a real repository exceeds the cap, so serving the pointer from here
 * left most of a scanned graph painted and inert. The canvas hit-tests
 * itself; this layer answers for the things a canvas cannot.
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
import { hitTargets } from "../../lib/graph/hit-targets";
import { DASHBOARD } from "../../lib/strings";
import { GraphForcePanel, useGraphPanelSettings } from "./graph-force-panel";

const BrainMap = dynamic(
  () => import("./brain-map").then((module_) => module_.BrainMap),
  { ssr: false },
);

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
  // A counter, not a boolean: pressing the button a second time has to reach
  // the camera, and "true" twice is one value.
  const [fitRequest, setFitRequest] = useState(0);
  const [settled, setSettled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
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
      // What the canvas hit test currently has under the pointer. Empty is a
      // state, not an absence: a test that waited for the attribute to appear
      // could not tell "nothing hovered" from "hover is broken".
      data-hovered={hovered ?? ""}
      // How many nodes the DOM layer speaks for, so a browser test can state
      // the relationship between the accessibility budget and what is painted
      // rather than restating the cap.
      data-hit-targets={targets.length}
      data-lod={lod.level}
      data-lod-labels={lod.labels}
      // "The layout has stopped moving" — the worker has always known it and
      // until todo 9 nobody could see it. A browser test waits on this
      // instead of sleeping and hoping.
      data-settled={settled}
      data-testid="brain-map-stage"
      role="group"
    >
      <div className="brain-map-viewport" ref={viewportRef}>
        <BrainMap
          {...(afterglow ? { afterglow } : {})}
          data={data}
          {...(directionalFocus === undefined ? {} : { directionalFocus })}
          fitRequest={fitRequest}
          {...(focusNodeId === undefined ? {} : { focusNodeId })}
          forceConfig={forceConfig}
          {...(glow ? { glow } : {})}
          hitLayer={hitLayerRef}
          onLodChange={(level, labels) => {
            setLod({ labels, level: level as LodLevel });
            onLodReport?.(level as LodLevel, labels);
          }}
          onNodeActivate={(nodeId) => {
            const node = data.nodes.find((entry) => entry.id === nodeId);
            if (node) onNodeActivate?.(node);
          }}
          onNodeSelect={(nodeId) => {
            const node = data.nodes.find((entry) => entry.id === nodeId);
            if (node) onNodeSelect?.(node);
          }}
          onHoverChange={setHovered}
          onSettledChange={setSettled}
          {...(seed === undefined ? {} : { seed })}
          selectedNodeId={selectedNodeId ?? null}
          textFadeThreshold={settings.textFadeThreshold}
          viewport={viewportRef}
        />
        <button
          className="brain-map-fit"
          data-testid="brain-map-fit"
          onClick={() => setFitRequest((count) => count + 1)}
          title={DASHBOARD.fitToView}
          type="button"
        >
          <span className="sr-only">{DASHBOARD.fitToView}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path
              d="M1.5 5.5v-4h4M14.5 5.5v-4h-4M1.5 10.5v4h4M14.5 10.5v4h-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
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
