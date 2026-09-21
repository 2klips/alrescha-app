import { describe, expect, it } from "vitest";

import {
  createFixtureGraph,
  type GraphNode,
} from "../apps/web/lib/dashboard/graph-model";
import { worldToScreen } from "../apps/web/lib/graph/camera";
import { MIN_HIT_RADIUS, buildHitIndex } from "../apps/web/lib/graph/hit-test";
import {
  buildRenderFrame,
  neighborhoodOf,
  type Camera,
  type RenderFrame,
  type RenderNode,
  type Viewport,
} from "../apps/web/lib/graph/render-frame";

/**
 * Phase 4 Wave B todo 10 — the pointer reaches the canvas.
 *
 * The DOM hit layer is capped, and a live scan of this repository produces
 * 1,260 nodes. Past the cap a node was painted and could not be clicked, and
 * nothing looked wrong — those nodes were simply inert. These assert that the
 * canvas answers for every node it paints, at any camera.
 */

const VIEWPORT: Viewport = { height: 600, width: 800 };

function node(id: string, x: number, y: number, radius = 8): RenderNode {
  return {
    afterglow: false,
    alpha: 1,
    badge: null,
    clusterCount: null,
    color: 0,
    glow: 0,
    id,
    radius,
    ring: false,
    riskBand: null,
    selected: false,
    shape: "circle",
    x,
    y,
  };
}

function frameOf(nodes: RenderNode[], camera: Camera): RenderFrame {
  return {
    camera,
    driftColor: 0,
    edges: [],
    geometryRevision: 1,
    halo: null,
    labelColor: 0,
    labels: [],
    lod: "near",
    nodes,
  };
}

const HOME: Camera = { scale: 1, x: 0, y: 0 };

describe("canvas hit testing", () => {
  it("finds the node under the point, and nothing where there is none", () => {
    const nodes = [node("a", -100, -60), node("b", 120, 40)];
    const index = buildHitIndex(frameOf(nodes, HOME), VIEWPORT);

    for (const target of nodes) {
      const screen = worldToScreen(HOME, VIEWPORT, target);
      expect(index.at(screen.x, screen.y)?.id).toBe(target.id);
    }
    expect(index.at(10, 10)).toBeNull();
    expect(index.size).toBe(2);
  });

  it("reaches every node of a graph far larger than the DOM layer's cap", () => {
    // 1,260 is what a live scan of this repository produced. The DOM layer
    // caps at 200; every one of these has to be clickable anyway, which is
    // the whole reason this module exists.
    const nodes = Array.from({ length: 1_260 }, (_, index) =>
      node(
        `n${index}`,
        (index % 60) * 40 - 1_200,
        Math.floor(index / 60) * 40 - 420,
      ),
    );
    const index = buildHitIndex(frameOf(nodes, HOME), VIEWPORT);

    const missed = nodes.filter((target) => {
      const screen = worldToScreen(HOME, VIEWPORT, target);
      return index.at(screen.x, screen.y)?.id !== target.id;
    });
    expect(missed.map((target) => target.id)).toEqual([]);
  });

  it("follows the camera, because the index is world-space and the pointer is not", () => {
    const target = node("a", 250, -180);
    for (const camera of [
      HOME,
      { scale: 2.5, x: -40, y: 90 },
      { scale: 0.2, x: 300, y: -220 },
    ] satisfies Camera[]) {
      const index = buildHitIndex(frameOf([target], camera), VIEWPORT);
      const screen = worldToScreen(camera, VIEWPORT, target);
      expect(index.at(screen.x, screen.y)?.id, `scale ${camera.scale}`).toBe(
        "a",
      );
    }
  });

  it("keeps a node clickable when it is painted smaller than a pointer", () => {
    // At 0.1× a radius-4 node is under a pixel across. Asking anyone to hit
    // that is asking them to fail, so the minimum reach is in screen pixels.
    const camera: Camera = { scale: 0.1, x: 0, y: 0 };
    const index = buildHitIndex(
      frameOf([node("a", 0, 0, 4)], camera),
      VIEWPORT,
    );
    const centre = worldToScreen(camera, VIEWPORT, { x: 0, y: 0 });

    expect(index.at(centre.x + MIN_HIT_RADIUS - 1, centre.y)?.id).toBe("a");
    expect(index.at(centre.x + MIN_HIT_RADIUS + 4, centre.y)).toBeNull();
  });

  it("gives a small node drawn over a hub to the small node", () => {
    // The hub is reachable across the rest of its own area; the small one is
    // reachable nowhere else.
    const index = buildHitIndex(
      frameOf([node("hub", 0, 0, 60), node("leaf", 10, 0, 6)], HOME),
      VIEWPORT,
    );
    const overlap = worldToScreen(HOME, VIEWPORT, { x: 10, y: 0 });

    expect(index.at(overlap.x, overlap.y)?.id).toBe("leaf");
    // …and the hub still answers everywhere the leaf is not.
    const hubOnly = worldToScreen(HOME, VIEWPORT, { x: -40, y: 0 });
    expect(index.at(hubOnly.x, hubOnly.y)?.id).toBe("hub");
  });

  it("still answers for a node a focus mode has faded", () => {
    // It is on the screen. A viewer pointing at it means it — a hit test
    // that skipped faded nodes would make "what I can see" and "what I can
    // click" two different sets.
    const faded = { ...node("dim", 0, 0), alpha: 0.22 };
    const index = buildHitIndex(frameOf([faded], HOME), VIEWPORT);
    const centre = worldToScreen(HOME, VIEWPORT, { x: 0, y: 0 });

    expect(index.at(centre.x, centre.y)?.id).toBe("dim");
  });

  it("answers null for an empty frame rather than throwing", () => {
    const index = buildHitIndex(frameOf([], HOME), VIEWPORT);

    expect(index.at(400, 300)).toBeNull();
    expect(index.size).toBe(0);
  });
});

describe("the hovered neighbourhood", () => {
  const data = {
    edges: [
      { source: "a", target: "b" },
      { source: "c", target: "a" },
      { source: "b", target: "d" },
    ],
  };

  it("is the node and everything one edge away, in either direction", () => {
    expect([...neighborhoodOf(data, "a")].sort()).toEqual(["a", "b", "c"]);
  });

  it("is just the node when nothing joins it", () => {
    // The caller reads this as "nothing to relate it to" and declines to dim
    // the map: highlighting one dot by fading everything else says "nothing
    // here is connected" far louder than it says "this is the node".
    expect([...neighborhoodOf(data, "lonely")]).toEqual(["lonely"]);
  });

  it("is empty when nothing is hovered, so a caller can ask unconditionally", () => {
    expect(neighborhoodOf(data, null).size).toBe(0);
  });
});

describe("hover dims what the node is not joined to", () => {
  const data = createFixtureGraph(15);
  const hub = data.edges[0]?.source as string;
  const near = neighborhoodOf(data, hub);

  function frameWith(hoveredNodeId: string | null) {
    return buildRenderFrame({
      data,
      hoveredNodeId,
      palette: { text: 0xffffff },
      positions: new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
      viewport: VIEWPORT,
    });
  }

  it("lights the neighbourhood and fades the rest", () => {
    const hovered = frameWith(hub);
    for (const rendered of hovered.nodes) {
      expect(rendered.alpha, rendered.id).toBe(
        near.has(rendered.id) ? 1 : 0.22,
      );
    }
    // Something is actually faded — a neighbourhood that covered the graph
    // would pass the loop above and mean nothing.
    expect(hovered.nodes.some((rendered) => rendered.alpha === 0.22)).toBe(
      true,
    );
  });

  it("lights every edge that touches the node and dims every edge that does not", () => {
    const plain = frameWith(null);
    const hovered = frameWith(hub);
    const touching = new Set(
      data.edges
        .filter((edge) => edge.source === hub || edge.target === hub)
        .map((edge) => edge.id),
    );
    expect(touching.size).toBeGreaterThan(0);

    const before = new Map(plain.edges.map((edge) => [edge.id, edge.alpha]));
    for (const edge of hovered.edges) {
      if (touching.has(edge.id)) {
        expect(edge.alpha, edge.id).toBeGreaterThanOrEqual(0.9);
      } else {
        expect(edge.alpha, edge.id).toBeLessThan(before.get(edge.id) as number);
      }
    }
  });

  it("leaves the graph alone when the hovered node has no neighbours", () => {
    const lonely = {
      edges: data.edges,
      nodes: [...data.nodes, { ...(data.nodes[0] as GraphNode), id: "island" }],
    };
    const frame = buildRenderFrame({
      data: lonely,
      hoveredNodeId: "island",
      palette: { text: 0xffffff },
      positions: new Map(lonely.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
      viewport: VIEWPORT,
    });

    // Fading everything to highlight one unconnected dot would make the map
    // vanish, which is most of a sparsely-linked scan.
    expect(frame.nodes.every((rendered) => rendered.alpha === 1)).toBe(true);
  });
});
