"use client";

/**
 * SSR-safe host for the brain map (Phase 2A todos 4–5).
 *
 * The WebGL renderer is `dynamic(..., { ssr: false })`; the surrounding markup
 * is plain DOM so the graph keeps a keyboard- and screen-reader-reachable
 * representation of every node and edge even before (or without) WebGL. The
 * force panel lives here because it owns the persisted settings that the
 * renderer consumes.
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import type {
  GraphData,
  GraphEdge,
  GraphNode,
} from "../../lib/dashboard/graph-model";
import { forceConfigOf } from "../../lib/graph/graph-panel-settings";
import type { LodLevel } from "../../lib/graph/lod";
import { DASHBOARD } from "../../lib/strings";
import { GraphForcePanel, useGraphPanelSettings } from "./graph-force-panel";

const BrainMap = dynamic(
  () => import("./brain-map").then((module_) => module_.BrainMap),
  { ssr: false },
);

export interface BrainMapStageProps {
  data: GraphData;
  onEdgeSelect?: (edge: GraphEdge) => void;
  onNodeSelect?: (node: GraphNode) => void;
  seed?: number;
  selectedNodeId?: string | null;
  /** Set false when a surrounding HUD supplies its own controls. */
  showForcePanel?: boolean;
}

export function BrainMapStage({
  data,
  onEdgeSelect,
  onNodeSelect,
  seed,
  selectedNodeId,
  showForcePanel = true,
}: BrainMapStageProps) {
  const [settings, updateSettings] = useGraphPanelSettings();
  const [lod, setLod] = useState<{ labels: number; level: LodLevel }>({
    labels: 0,
    level: "near",
  });
  const forceConfig = useMemo(() => forceConfigOf(settings), [settings]);

  return (
    <div
      aria-label={DASHBOARD.canvasLabel(data.nodes.length)}
      className="brain-map-stage"
      data-canvas-nodes={data.nodes.length}
      data-lod={lod.level}
      data-testid="brain-map-stage"
      role="img"
    >
      <BrainMap
        data={data}
        forceConfig={forceConfig}
        onLodChange={(level, labels) =>
          setLod({ labels, level: level as LodLevel })
        }
        {...(seed === undefined ? {} : { seed })}
        selectedNodeId={selectedNodeId ?? null}
        textFadeThreshold={settings.textFadeThreshold}
      />
      {showForcePanel ? (
        <GraphForcePanel
          labelCount={lod.labels}
          lod={lod.level}
          onChange={updateSettings}
          settings={settings}
        />
      ) : null}
      <div aria-live="polite" className="sr-only">
        {data.nodes.map((node) => (
          <button key={node.id} onClick={() => onNodeSelect?.(node)} type="button">
            {node.label}, {node.type}, {node.grade}
          </button>
        ))}
        {data.edges.map((edge) => (
          <button key={edge.id} onClick={() => onEdgeSelect?.(edge)} type="button">
            {edge.provenance.relation}: {edge.source} to {edge.target},{" "}
            {edge.provenance.grade}
          </button>
        ))}
      </div>
    </div>
  );
}
