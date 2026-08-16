import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  buildDashboardViewModel,
  createFixtureGraph,
} from "../../lib/dashboard/graph-model";
import { DASHBOARD } from "../../lib/strings";
import { BrainMapStage, HIT_TARGET_LIMIT, hitTargets } from "./brain-map-stage";

describe("brain map hit targets", () => {
  test("every node of a normal graph gets one", () => {
    const data = createFixtureGraph(40);

    expect(hitTargets(data)).toHaveLength(40);
  });

  test("a huge graph keeps the highest-degree nodes and drops the rest", () => {
    const data = createFixtureGraph(HIT_TARGET_LIMIT + 200);
    const kept = hitTargets(data);
    const degrees = new Map<string, number>();
    for (const edge of data.edges) {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }

    expect(kept).toHaveLength(HIT_TARGET_LIMIT);
    const lowestKept = Math.min(
      ...kept.map((node) => degrees.get(node.id) ?? 0),
    );
    const droppedIds = new Set(kept.map((node) => node.id));
    const highestDropped = Math.max(
      ...data.nodes
        .filter((node) => !droppedIds.has(node.id))
        .map((node) => degrees.get(node.id) ?? 0),
    );
    expect(lowestKept).toBeGreaterThanOrEqual(highestDropped);
  });

  test("the cap is applied deterministically", () => {
    const data = createFixtureGraph(HIT_TARGET_LIMIT + 50);

    expect(hitTargets(data).map((node) => node.id)).toEqual(
      hitTargets(data).map((node) => node.id),
    );
  });
});

describe("brain map stage server rendering", () => {
  const model = buildDashboardViewModel("scanned");
  const html = renderToStaticMarkup(
    createElement(BrainMapStage, { data: model.graph }),
  );

  test("keeps the graph's accessible name without WebGL", () => {
    // `next/dynamic(..., { ssr: false })` must not take the label with it.
    expect(html).toContain(DASHBOARD.canvasLabel(model.graph.nodes.length));
    expect(html).toContain(`data-canvas-nodes="${model.graph.nodes.length}"`);
  });

  test("renders one reachable target per node before the canvas exists", () => {
    for (const node of model.graph.nodes) {
      expect(html).toContain(`data-node-id="${node.id}"`);
    }
    expect(html).not.toContain("<canvas");
  });

  test("names each target with its label, type and grade", () => {
    const node = model.graph.nodes[0] as { grade: string; label: string; type: string };

    expect(html).toContain(
      DASHBOARD.nodeSummary(node.label, node.type, node.grade),
    );
  });
});
