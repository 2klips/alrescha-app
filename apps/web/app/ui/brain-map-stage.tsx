"use client";

/**
 * SSR-safe host for the brain map (Phase 2A todo 4).
 *
 * The WebGL renderer is `dynamic(..., { ssr: false })`; the surrounding markup
 * is plain DOM so the graph keeps a keyboard- and screen-reader-reachable
 * representation of every node and edge even before (or without) WebGL.
 */

import dynamic from "next/dynamic";

import type {
  GraphData,
  GraphEdge,
  GraphNode,
} from "../../lib/dashboard/graph-model";
import type { ForceConfig } from "../../lib/graph/simulation-protocol";
import { DASHBOARD } from "../../lib/strings";

const BrainMap = dynamic(
  () => import("./brain-map").then((module_) => module_.BrainMap),
  { ssr: false },
);

export interface BrainMapStageProps {
  data: GraphData;
  forceConfig?: Partial<ForceConfig>;
  onEdgeSelect?: (edge: GraphEdge) => void;
  onNodeSelect?: (node: GraphNode) => void;
  seed?: number;
  selectedNodeId?: string | null;
}

export function BrainMapStage({
  data,
  forceConfig,
  onEdgeSelect,
  onNodeSelect,
  seed,
  selectedNodeId,
}: BrainMapStageProps) {
  return (
    <div
      aria-label={DASHBOARD.canvasLabel(data.nodes.length)}
      className="brain-map-stage"
      data-canvas-nodes={data.nodes.length}
      data-testid="brain-map-stage"
      role="img"
    >
      <BrainMap
        data={data}
        {...(forceConfig ? { forceConfig } : {})}
        {...(seed === undefined ? {} : { seed })}
        selectedNodeId={selectedNodeId ?? null}
      />
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
