"use client";

import {
  facetLayout,
  graphNodeArea,
  type GraphData,
  type GraphNode,
} from "../../lib/dashboard/graph-model";
import { BRAIN_AREAS, type BrainArea } from "@arr/core/artifact-facets";
import { DASHBOARD } from "../../lib/strings";

/**
 * Group mode (Phase 2D todo 5).
 *
 * The force graph answers "what connects to what"; it cannot also answer
 * "what belongs where", because the simulation owns node positions and would
 * pull any banding apart. So group mode is its own deterministic view: one
 * band per Data Brain area, the same `graphNodeArea` axis the overview counts
 * by, with the cross-area edges kept visible — those are exactly the links a
 * reader is looking for when they ask how the areas are wired together.
 */

interface FacetBandViewProps {
  data: GraphData;
  onNodeActivate?: (node: GraphNode) => void;
  onNodeSelect?: (node: GraphNode) => void;
  selectedNodeId: string | null;
}

const NODE_TYPE_CLASS = {
  code: "code",
  concept: "concept",
  document: "doc",
  requirement: "req",
  test: "test",
} as const;

export function FacetBandView({
  data,
  onNodeActivate,
  onNodeSelect,
  selectedNodeId,
}: FacetBandViewProps) {
  const present = BRAIN_AREAS.filter((area) =>
    data.nodes.some((node) => graphNodeArea(node) === area),
  );
  // Positions come from the model's `facetLayout` — the same function the unit
  // tests pin — so what is proven there is what renders here.
  const placed = new Map<string, { area: BrainArea; x: number; y: number }>(
    facetLayout(data).nodes.map((node) => [
      node.id,
      { area: graphNodeArea(node), x: node.x, y: node.y },
    ]),
  );

  if (present.length === 0) {
    return (
      <div className="facet-bands facet-bands-empty" role="status">
        {DASHBOARD.filters.areas.all}
      </div>
    );
  }

  return (
    <div className="facet-bands" data-testid="facet-bands">
      <svg
        aria-hidden
        className="facet-band-edges"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {data.edges.map((edge) => {
          const from = placed.get(edge.source);
          const to = placed.get(edge.target);
          if (!from || !to) return null;
          return (
            <line
              className="facet-band-edge"
              data-cross-area={from.area !== to.area}
              key={edge.id}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}
      </svg>
      {present.map((area, band) => (
        <section
          className="facet-band"
          data-area={area}
          key={area}
          style={{
            height: `${100 / present.length}%`,
            top: `${(band / present.length) * 100}%`,
          }}
        >
          <h3>{DASHBOARD.filters.areas[area]}</h3>
        </section>
      ))}
      {data.nodes.map((node) => {
        const spot = placed.get(node.id);
        if (!spot) return null;
        return (
          <button
            aria-label={DASHBOARD.nodeSummary(
              node.label,
              node.type,
              node.grade,
            )}
            aria-pressed={node.id === selectedNodeId}
            className={`facet-band-node ${NODE_TYPE_CLASS[node.type]}`}
            data-grade={node.grade}
            data-node-id={node.id}
            key={node.id}
            onClick={() => onNodeSelect?.(node)}
            onDoubleClick={() => onNodeActivate?.(node)}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            type="button"
          >
            <span>{node.label}</span>
          </button>
        );
      })}
    </div>
  );
}
