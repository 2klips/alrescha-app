import {
  availableLayers,
  GRAPH_LAYERS,
  type GraphLayer,
} from "../../lib/graph/render-frame";
import type { GraphData } from "../../lib/dashboard/graph-model";
import { DASHBOARD } from "../../lib/strings";

/**
 * Layer toggles (Phase 4 Wave B todo 13), shared by the demo dashboard and
 * the workspace map. Beside the filters and not among them: a filter says
 * what to look for, a layer says what kind of thing not to look at, and
 * neither should clear the other.
 *
 * All seven layers are always offered so the vocabulary is the same on
 * every graph; the ones this graph has nothing for are disabled and say so,
 * which is the honest version of "a control that silently does nothing".
 */

/**
 * Test ids the workspace map's earlier ad-hoc toggles carried. Kept so the
 * browser spec that clicks them keeps clicking the same thing.
 */
const LEGACY_TEST_IDS: Readonly<Partial<Record<GraphLayer, string>>> = {
  co_changed: "graph-co-change-toggle",
  concept: "graph-concept-toggle",
};

export function GraphLayerToggles({
  data,
  hiddenLayers,
  onToggle,
}: {
  data: GraphData;
  hiddenLayers: ReadonlySet<GraphLayer>;
  onToggle: (layer: GraphLayer) => void;
}) {
  const available = availableLayers(data);
  return (
    <div
      aria-label={DASHBOARD.layers.label}
      className="arr-legend arr-layer-toggles"
      data-testid="graph-layer-toggles"
      title={DASHBOARD.layers.note}
    >
      {GRAPH_LAYERS.map((layer) => {
        const offered = available.has(layer);
        return (
          <button
            aria-pressed={!hiddenLayers.has(layer)}
            data-layer={layer}
            data-layer-available={offered}
            data-testid={LEGACY_TEST_IDS[layer] ?? `graph-layer-${layer}`}
            disabled={!offered}
            key={layer}
            onClick={() => onToggle(layer)}
            title={offered ? undefined : DASHBOARD.layers.unavailable}
            type="button"
          >
            {DASHBOARD.layers.names[layer]}
          </button>
        );
      })}
    </div>
  );
}
