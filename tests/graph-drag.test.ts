import { describe, expect, it } from "vitest";

import {
  createFixtureGraph,
  type GraphData,
} from "../apps/web/lib/dashboard/graph-model";
import { createForceLayout } from "../apps/web/lib/graph/force-simulation";
import { nodeRadius } from "../apps/web/lib/graph/node-size";
import { createPositionBuffer } from "../apps/web/lib/graph/position-buffer";
import {
  createStartMessage,
  decodePositions,
  encodePositions,
  linkFamilyCode,
  parseHostMessage,
  type LinkPair,
} from "../apps/web/lib/graph/simulation-protocol";
import { createSimulationRuntime } from "../apps/web/lib/graph/worker-runtime";

/**
 * Phase 4 Wave B todo 11 — dragging a node, and the forces that make the
 * result worth looking at.
 */

const chain = (count: number, family = "structure"): LinkPair[] =>
  Array.from(
    { length: count - 1 },
    (_, index) => [index, index + 1, linkFamilyCode(family)] as LinkPair,
  );

function positionsOf(
  layout: ReturnType<typeof createForceLayout>,
  count: number,
) {
  return decodePositions(
    Array.from({ length: count }, (_, index) => `n${index}`),
    layout.positions(),
  );
}

describe("pin and release", () => {
  it("holds a node where it was put while the rest keeps moving", () => {
    const layout = createForceLayout({ links: chain(6), nodeCount: 6 });
    layout.tick(60);
    const before = positionsOf(layout, 6);

    layout.pin(0, 900, -700);
    layout.tick(30);
    const during = positionsOf(layout, 6);

    expect(during.get("n0")).toEqual({ x: 900, y: -700 });
    // …and the graph followed it. A pin that froze everything would be a
    // screenshot with one node stuck to the cursor.
    const moved = [...during].filter(
      ([id, position]) =>
        id !== "n0" &&
        (position.x !== before.get(id)?.x || position.y !== before.get(id)?.y),
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it("lets go, and the node rejoins the physics from where it was left", () => {
    const layout = createForceLayout({ links: chain(6), nodeCount: 6 });
    layout.tick(60);
    layout.pin(0, 900, -700);
    layout.tick(30);

    layout.unpin(0);
    layout.tick(1);
    const first = positionsOf(layout, 6).get("n0") as { x: number };
    layout.tick(40);
    const later = positionsOf(layout, 6).get("n0") as { x: number };

    // One tick after release it is still out where the drag left it — the
    // node did not teleport home — and it is already moving, so it is not
    // still pinned either.
    expect(first.x).toBeGreaterThan(800);
    expect(first.x).toBeLessThan(900);
    // Forty ticks later the graph has reclaimed more than half the distance.
    expect(later.x).toBeLessThan(first.x / 2);
  });

  it("ignores a slot that is not a node instead of corrupting the layout", () => {
    const layout = createForceLayout({ links: chain(4), nodeCount: 4 });
    layout.tick(20);
    const before = positionsOf(layout, 4);

    layout.pin(99, 10, 10);
    layout.unpin(99);

    expect(positionsOf(layout, 4)).toEqual(before);
  });

  it("wakes a settled layout, because a drag nothing responds to is a picture", () => {
    const layout = createForceLayout({ links: chain(5), nodeCount: 5 });
    layout.tick(600);
    expect(layout.alpha()).toBeLessThan(0.01);

    layout.pin(0, 200, 200);
    expect(layout.alpha()).toBeGreaterThan(0.2);
  });
});

describe("the drag protocol", () => {
  it("carries a point, and refuses a pin that names nowhere", () => {
    expect(parseHostMessage({ slot: 2, type: "pin", x: 10, y: -4 })).toEqual({
      slot: 2,
      type: "pin",
      x: 10,
      y: -4,
    });
    expect(parseHostMessage({ slot: 2, type: "unpin" })).toEqual({
      slot: 2,
      type: "unpin",
    });
    expect(parseHostMessage({ type: "reheat" })).toEqual({ type: "reheat" });
    // A NaN fx fixes a node at nowhere and takes the rest of the layout with
    // it, so a pin without a finite point is not a pin.
    expect(
      parseHostMessage({ slot: 0, type: "pin", x: Number.NaN, y: 0 }),
    ).toBeNull();
    expect(parseHostMessage({ slot: -1, type: "pin", x: 0, y: 0 })).toBeNull();
    expect(parseHostMessage({ type: "pin", x: 0, y: 0 })).toBeNull();
  });

  it("requires a family on every link, and reads an unknown code as the baseline", () => {
    const start = {
      config: {},
      links: [
        [0, 1, linkFamilyCode("doc")],
        [1, 2, 99],
      ],
      nodeIds: ["a", "b", "c"],
      seed: 1,
      type: "start",
    };
    const parsed = parseHostMessage(start);

    expect(parsed?.type).toBe("start");
    // A link the layout cannot classify is still a link; dropping it would
    // change the shape of the graph over a vocabulary mismatch.
    expect((parsed as unknown as { links: LinkPair[] }).links).toEqual([
      [0, 1, linkFamilyCode("doc")],
      [1, 2, linkFamilyCode("structure")],
    ]);
    // A two-element pair is the old wire format and is refused outright.
    expect(parseHostMessage({ ...start, links: [[0, 1]] })).toBeNull();
  });

  it("wakes the runtime on a pin, an unpin and a reheat", () => {
    const posted: unknown[] = [];
    const runtime = createSimulationRuntime({ post: (m) => posted.push(m) });
    runtime.handle(createStartMessage(createFixtureGraph(15)));
    for (let step = 0; step < 400 && runtime.running(); step += 1)
      runtime.step();
    expect(runtime.running()).toBe(false);

    runtime.handle({ slot: 0, type: "pin", x: 100, y: 100 });
    expect(runtime.running()).toBe(true);
    for (let step = 0; step < 400 && runtime.running(); step += 1)
      runtime.step();

    runtime.handle({ slot: 0, type: "unpin" });
    expect(runtime.running()).toBe(true);
    for (let step = 0; step < 400 && runtime.running(); step += 1)
      runtime.step();

    runtime.handle({ type: "reheat" });
    expect(runtime.running()).toBe(true);
  });
});

describe("family-aware springs", () => {
  /** How far apart a two-node graph settles when its one link is `family`. */
  const restLength = (family: string): number => {
    const layout = createForceLayout({
      links: [[0, 1, linkFamilyCode(family)]],
      nodeCount: 2,
    });
    layout.tick(400);
    const positions = positionsOf(layout, 2);
    const a = positions.get("n0") as { x: number; y: number };
    const b = positions.get("n1") as { x: number; y: number };
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  it("settles a correlation further apart than a dependency", () => {
    // Co-change is a hint, not a wire. A layout that placed them equally
    // would be asserting a relationship nobody measured.
    expect(restLength("statistical")).toBeGreaterThan(restLength("structure"));
    // And containment sits closest of all: a file belongs *in* its folder.
    expect(restLength("hierarchy")).toBeLessThan(restLength("structure"));
  });

  it("lays a graph with no family data out exactly as it always did", () => {
    // Every demo fixture is in this state, and `structure` is the baseline,
    // so adding families must not have moved a single existing pixel.
    const data: GraphData = createFixtureGraph(15);
    const withFamilies: GraphData = {
      edges: data.edges.map((edge) => ({
        ...edge,
        family: "structure" as const,
      })),
      nodes: data.nodes,
    };
    const run = (graph: GraphData) => {
      const message = createStartMessage(graph);
      const layout = createForceLayout({
        links: message.links,
        nodeCount: message.nodeIds.length,
        seed: message.seed,
      });
      layout.tick(200);
      return [...layout.positions()];
    };

    expect(run(data)).toEqual(run(withFamilies));
  });
});

describe("collision", () => {
  it("stops two nodes overlapping the way they are painted", () => {
    // The radius is the renderer's own curve, so "not overlapping" in the
    // physics means "not overlapping" on the screen.
    const layout = createForceLayout({
      config: { linkDistance: 10, linkStrength: 1 },
      links: [[0, 1, linkFamilyCode("structure")]],
      nodeCount: 2,
    });
    layout.tick(400);
    const positions = positionsOf(layout, 2);
    const a = positions.get("n0") as { x: number; y: number };
    const b = positions.get("n1") as { x: number; y: number };

    // Degree 1 each, so both are the same size.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
      nodeRadius(1) * 2,
    );
  });
});

describe("the dragged node is under the pointer now", () => {
  it("shows a held position immediately, over whatever the worker last said", () => {
    const buffer = createPositionBuffer();
    buffer.push(
      ["a", "b"],
      encodePositions([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
      0,
    );

    buffer.hold("a", { x: 500, y: -500 });
    expect(buffer.at(0).get("a")).toEqual({ x: 500, y: -500 });
    // The rest of the graph is untouched.
    expect(buffer.at(0).get("b")).toEqual({ x: 10, y: 10 });

    buffer.release("a");
    expect(buffer.at(0).get("a")).toEqual({ x: 0, y: 0 });
  });

  it("hands back a different map while holding, so a settled frame still repaints", () => {
    // `at` is compared by identity to decide whether anything moved. Writing
    // the held position into the stored map would make a settled graph look
    // unchanged while a node is being dragged across it.
    const buffer = createPositionBuffer();
    buffer.push(["a"], encodePositions([{ x: 0, y: 0 }]), 0);
    expect(buffer.at(99)).toBe(buffer.at(99));

    buffer.hold("a", { x: 1, y: 1 });
    expect(buffer.at(99)).not.toBe(buffer.at(99));
  });
});
