import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  buildDashboardViewModel,
  topHubNodes,
  type DashboardState,
} from "../../lib/dashboard/graph-model";
import { GraphDetail } from "./graph-detail";

/**
 * Phase 4 Wave B todo 14 — one renderer, and no fixture pinned into the
 * screen. The evidence detail used to build `buildDashboardViewModel("scanned")`
 * and fall back to the literal node id `req-auth`, so the demo shell's state
 * switch reached every screen except this one.
 */

function render(
  props: Partial<{ initialNodeId: string | null; state: DashboardState }> = {},
): string {
  return renderToStaticMarkup(
    createElement(GraphDetail, {
      initialNodeId: null,
      state: "scanned",
      ...props,
    }),
  );
}

/** The `<h2>` the provenance inspector puts the rooted node's label in. */
function rootLabel(state: DashboardState): string {
  const graph = buildDashboardViewModel(state).graph;
  return (topHubNodes(graph, 1)[0]?.node ?? graph.nodes[0])?.label ?? "";
}

describe("the evidence detail roots itself in the graph it was given", () => {
  test("with no node in the route, it starts at the most-connected node", () => {
    // Not `req-auth`, which is what the literal used to hand back. The hub
    // rule is the dashboard's own "start here" ordering, so the two screens
    // agree on where a graph begins.
    expect(rootLabel("scanned")).not.toBe("Tenant-safe auth");
    expect(render()).toContain(rootLabel("scanned"));
  });

  test("an unknown node falls back to the same derived root", () => {
    expect(render({ initialNodeId: "node-that-is-not-here" })).toContain(
      rootLabel("scanned"),
    );
  });

  test("a node the route does name is the one that gets rooted", () => {
    const html = render({ initialNodeId: "req-auth" });
    // Four nodes at depth two, which is what the browser suite asserts too.
    expect(html).toContain('data-canvas-nodes="4"');
  });

  test("the clustered demo state renders instead of coming up empty", () => {
    // The whole point of threading `?state=`: `large` collapses the fixture
    // into supernodes, so `req-auth` does not exist in it at all. Pinned to
    // `scanned` this route could never show it; falling back to a literal id
    // it would have drawn nothing.
    const html = render({ state: "large" });

    expect(html).toContain(rootLabel("large"));
    expect(html).toContain('data-canvas-nodes="5"');
  });
});

describe("the evidence detail draws through the shared stage", () => {
  const html = render({ initialNodeId: "req-auth" });

  test("it mounts the Pixi stage and not the retired SVG renderer", () => {
    expect(html).toContain('data-testid="brain-map-stage"');
    expect(html).not.toContain("evidence-graph-canvas");
    expect(html).not.toContain("graph-canvas-wrap");
    // The canvas has no accessibility tree, so the hit layer answers for it —
    // one reachable control per node of the neighbourhood.
    expect(html).toContain('data-hit-targets="4"');
    expect(html).toContain('data-node-id="req-auth"');
  });

  test("the neighbourhood is what the layout holds, not a filtered copy", () => {
    // `data-layout-nodes` and `data-canvas-nodes` agree here because this
    // screen has no filters — the local graph *is* the whole dataset it was
    // handed (todo 13).
    expect(html).toContain('data-layout-nodes="4"');
  });

  test("the stage keeps its own controls out of this screen", () => {
    // No force panel: the sliders belong to the map's HUD, and this screen
    // shows one node's neighbourhood rather than tuning a whole layout.
    expect(html).not.toContain('data-testid="graph-force-panel"');
  });
});
