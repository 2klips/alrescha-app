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
  displaySettingsOf,
  forceConfigOf,
  type GraphPanelSettings,
} from "../../lib/graph/graph-panel-settings";
import type { LodLevel } from "../../lib/graph/lod";
import type { SymbolHalo } from "../../lib/graph/symbol-halo";
import {
  edgeHiddenByLayers,
  hiddenByDisplay,
  nodeHiddenByLayers,
  type GraphLayer,
} from "../../lib/graph/render-frame";
import type { Position } from "../../lib/graph/simulation-protocol";
import { hitTargets } from "../../lib/graph/hit-targets";
import { usePrefersReducedMotion } from "../../lib/motion/reduced-motion";
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
  /** The selected file's symbol layer (todo 26). */
  symbolHalo?: SymbolHalo | null;
  settings?: GraphPanelSettings;
  /** Set false when a surrounding HUD supplies its own controls. */
  showForcePanel?: boolean;
  /**
   * Which nodes the current filters leave visible, or absent for all (todo
   * 13). `data` stays the whole graph so the layout survives a filter.
   */
  visibleNodeIds?: ReadonlySet<string> | undefined;
  /** Layers the viewer switched off (todo 13). */
  hiddenLayers?: ReadonlySet<GraphLayer> | undefined;
  /**
   * A saved layout to start warm from (todo 13 ⓐ). Read once, at mount:
   * the engine is created once and a later value would mean a restart.
   */
  initialPositions?: ReadonlyMap<string, Position> | null | undefined;
  /**
   * Nodes a person pinned (todo 13 ⓒ). A null position means "pin it where
   * it is now"; the engine answers with the resolved point through
   * `onPinsChange`, which also fires when a pinned node is dragged.
   */
  pins?: ReadonlyMap<string, Position | null> | undefined;
  onPinsChange?: (pins: ReadonlyMap<string, Position>) => void;
  /** The layout converged — here is where everything sits, for saving. */
  onLayoutSettled?: (positions: ReadonlyMap<string, Position>) => void;
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
  symbolHalo,
  settings: externalSettings,
  hiddenLayers,
  initialPositions,
  onLayoutSettled,
  onPinsChange,
  pins,
  showForcePanel = true,
  visibleNodeIds,
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
  const reducedMotion = usePrefersReducedMotion();
  const forceConfig = useMemo(() => forceConfigOf(settings), [settings]);
  const display = useMemo(() => displaySettingsOf(settings), [settings]);
  const hitLayerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // The accessibility layer follows visibility (todo 13): a keyboard user
  // must not tab to a node the canvas is not drawing — whether the filter,
  // a layer or the orphan switch hid it — and the edge list a screen reader
  // walks must not name an edge the viewer switched off either.
  const reachable = useMemo(() => {
    const orphans = hiddenByDisplay(data, display);
    const layersOff = hiddenLayers !== undefined && hiddenLayers.size > 0;
    if (!visibleNodeIds && !layersOff && orphans.size === 0) return data;
    const nodes = data.nodes.filter(
      (node) =>
        (!visibleNodeIds || visibleNodeIds.has(node.id)) &&
        !orphans.has(node.id) &&
        !nodeHiddenByLayers(node, hiddenLayers),
    );
    const ids = new Set(nodes.map((node) => node.id));
    return {
      edges: data.edges.filter(
        (edge) =>
          ids.has(edge.source) &&
          ids.has(edge.target) &&
          !edgeHiddenByLayers(edge, hiddenLayers),
      ),
      nodes,
    };
  }, [data, display, hiddenLayers, visibleNodeIds]);
  const targets = useMemo(() => hitTargets(reachable), [reachable]);

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
      aria-label={DASHBOARD.canvasLabel(reachable.nodes.length)}
      className="brain-map-stage"
      // What is drawn. It keeps that meaning now that `data` is the whole
      // graph rather than the filtered one — the count a reader sees on the
      // screen is the count this reports.
      data-canvas-nodes={reachable.nodes.length}
      // …and what the layout holds, which a filter never changes. The two
      // being different is the whole point of todo 13.
      data-layout-nodes={data.nodes.length}
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
      // What the filters currently leave on screen. The layout still holds
      // every node, which is the point: a filter is not a new graph.
      data-hidden-layers={
        hiddenLayers ? [...hiddenLayers].sort().join(" ") : ""
      }
      data-lod={lod.level}
      // Whether the camera glides or jumps: the person's reduced-motion
      // setting, as the canvas reads it (WCAG 2.3.3).
      data-motion={reducedMotion ? "reduced" : "full"}
      data-lod-labels={lod.labels}
      // How many nodes a person has pinned (todo 13 ⓒ).
      data-pinned-count={pins ? pins.size : 0}
      // Whether this mount started from a saved layout (todo 13 ⓐ). A
      // browser test asserts the fact rather than timing the settle.
      data-warm-start={
        initialPositions !== null &&
        initialPositions !== undefined &&
        initialPositions.size > 0
      }
      // "The layout has stopped moving" — the worker has always known it and
      // until todo 9 nobody could see it. A browser test waits on this
      // instead of sleeping and hoping.
      data-settled={settled}
      // The symbol halo's owner and size (todo 26), so a browser test can
      // state that selecting a file loaded its layer without reading WebGL.
      data-symbol-halo={symbolHalo?.ownerId ?? ""}
      data-symbol-count={symbolHalo?.symbols.length ?? 0}
      data-testid="brain-map-stage"
      role="group"
    >
      <div className="brain-map-viewport" ref={viewportRef}>
        <BrainMap
          {...(afterglow ? { afterglow } : {})}
          data={data}
          {...(directionalFocus === undefined ? {} : { directionalFocus })}
          display={display}
          fitRequest={fitRequest}
          {...(focusNodeId === undefined ? {} : { focusNodeId })}
          forceConfig={forceConfig}
          {...(glow ? { glow } : {})}
          hitLayer={hitLayerRef}
          {...(initialPositions === undefined ? {} : { initialPositions })}
          {...(onLayoutSettled ? { onLayoutSettled } : {})}
          {...(onPinsChange ? { onPinsChange } : {})}
          {...(pins ? { pins } : {})}
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
          symbolHalo={symbolHalo ?? null}
          textFadeThreshold={settings.textFadeThreshold}
          viewport={viewportRef}
          {...(visibleNodeIds ? { visibleNodeIds } : {})}
          {...(hiddenLayers ? { hiddenLayers } : {})}
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
              data-node-path={node.path}
              data-pinned={pins?.has(node.id) ? "true" : undefined}
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
        {reachable.edges.map((edge) => (
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
