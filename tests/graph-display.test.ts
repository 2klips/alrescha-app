import { describe, expect, it } from "vitest";

import { BRAIN_AREAS } from "../packages/core/src/ingest/artifact-facets";
import {
  createFixtureGraph,
  graphNodeArea,
  type GraphData,
  type GraphNode,
} from "../apps/web/lib/dashboard/graph-model";
import {
  DOMAIN_ANCHOR_RADIUS,
  domainAnchorPoint,
  domainAnchorsFor,
} from "../apps/web/lib/graph/domain-anchors";
import {
  createGraphEngine,
  type GraphBackend,
  type SimulationWorkerLike,
} from "../apps/web/lib/graph/engine";
import {
  WARM_START_ALPHA,
  createForceLayout,
} from "../apps/web/lib/graph/force-simulation";
import {
  DEFAULT_DISPLAY_SETTINGS,
  GROUP_COLOR_TOKENS,
  buildRenderFrame,
  groupColorTokenFor,
  hiddenByDisplay,
  type GraphPalette,
  type Viewport,
} from "../apps/web/lib/graph/render-frame";
import {
  createStartMessage,
  decodePositions,
  encodeInitialPositions,
  parseHostMessage,
  type Position,
} from "../apps/web/lib/graph/simulation-protocol";

/**
 * Phase 4 Wave B todo 13 — the five items that were left: the warm start,
 * the display options, the domain anchors, the style/config layers (in
 * `graph-visibility.test.ts`) and persistent pins. Every one is a rule a
 * reader could disagree with, so each is written down as an assertion.
 */

const VIEWPORT: Viewport = { height: 800, width: 1200 };
const PALETTE: GraphPalette = {
  "accent-fg": 0x111111,
  "danger-fg": 0x222222,
  "node-code": 0x333333,
  "node-doc": 0x444444,
  "node-requirement": 0x555555,
  "node-test": 0x666666,
  text: 0x777777,
};

function node(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    findingCount: 0,
    grade: "inferred",
    label: overrides.id,
    path: `src/${overrides.id}.ts`,
    type: "code",
    x: 0,
    y: 0,
    ...overrides,
  };
}

function edge(source: string, target: string, relation = "imports") {
  return {
    broken: false,
    grade: "inferred" as const,
    id: `${source}->${target}`,
    provenance: {
      confidence: 0.9,
      endLine: 1,
      grade: "inferred" as const,
      relation: relation as "imports",
      sourcePath: source,
      startLine: 1,
    },
    source,
    target,
  };
}

function positionsOf(data: GraphData): Map<string, Position> {
  return new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

describe("display options are applied in the frame, never in the layout", () => {
  const data: GraphData = {
    edges: [edge("a", "b"), edge("b", "c", "co_changed")],
    nodes: [
      node({ id: "a", label: "auth-session" }),
      node({ id: "b" }),
      node({ id: "c" }),
      node({ id: "lonely" }),
    ],
  };
  const frameWith = (display: Partial<typeof DEFAULT_DISPLAY_SETTINGS>) =>
    buildRenderFrame({
      data,
      display: { ...DEFAULT_DISPLAY_SETTINGS, ...display },
      palette: PALETTE,
      positions: positionsOf(data),
      viewport: VIEWPORT,
    });

  it("hides orphans when asked, and judges them on the whole graph", () => {
    expect(frameWith({}).nodes.map((n) => n.id)).toContain("lonely");
    const without = frameWith({ showOrphans: false });
    expect(without.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect([
      ...hiddenByDisplay(data, {
        ...DEFAULT_DISPLAY_SETTINGS,
        showOrphans: false,
      }),
    ]).toEqual(["lonely"]);
    // A node whose only neighbour is filtered out is out of view, not an
    // orphan: the orphan test reads the whole graph's degrees.
    const filtered = buildRenderFrame({
      data,
      display: { ...DEFAULT_DISPLAY_SETTINGS, showOrphans: false },
      palette: PALETTE,
      positions: positionsOf(data),
      viewport: VIEWPORT,
      visible: new Set(["a"]),
    });
    expect(filtered.nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("scales node radius and link width without moving anything", () => {
    const base = frameWith({});
    const bigger = frameWith({ linkThickness: 2, nodeSize: 1.5 });
    for (const [index, drawn] of bigger.nodes.entries()) {
      const before = base.nodes[index]!;
      expect(drawn.radius).toBeCloseTo(before.radius * 1.5, 6);
      expect(drawn.x).toBe(before.x);
      expect(drawn.y).toBe(before.y);
    }
    for (const [index, drawn] of bigger.edges.entries()) {
      expect(drawn.width).toBeCloseTo(base.edges[index]!.width * 2, 6);
    }
  });

  it("puts an arrowhead on directed edges only, stopping at the target's rim", () => {
    const plain = frameWith({});
    expect(plain.edges.every((e) => e.arrow === false)).toBe(true);
    const arrows = frameWith({ showArrows: true });
    const byId = new Map(arrows.edges.map((e) => [e.id, e]));
    expect(byId.get("a->b")?.arrow).toBe(true);
    // A co-change is a correlation with no direction worth asserting.
    expect(byId.get("b->c")?.arrow).toBe(false);
    const target = arrows.nodes.find((n) => n.id === "b");
    expect(byId.get("a->b")?.targetRadius).toBe(target?.radius);
  });

  it("paints a matching group's colour over the type colour", () => {
    const grouped = frameWith({
      groups: [{ color: "danger-fg", query: "AUTH" }],
    });
    const byId = new Map(grouped.nodes.map((n) => [n.id, n]));
    expect(byId.get("a")?.color).toBe(PALETTE["danger-fg"]);
    expect(byId.get("b")?.color).toBe(PALETTE["node-code"]);
    // First match wins, matching is case-insensitive on label and path.
    expect(
      groupColorTokenFor({ label: "x", path: "apps/web/auth.ts" }, [
        { color: "accent-fg", query: "apps/WEB" },
        { color: "danger-fg", query: "auth" },
      ]),
    ).toBe("accent-fg");
    expect(
      groupColorTokenFor({ label: "x", path: "y" }, [
        { color: "accent-fg", query: "   " },
      ]),
    ).toBeNull();
    expect(GROUP_COLOR_TOKENS.length).toBeGreaterThanOrEqual(4);
  });
});

describe("domain anchors", () => {
  it("place each area on a circle in BRAIN_AREAS order", () => {
    const points = BRAIN_AREAS.map((area) => domainAnchorPoint(area));
    const distinct = new Set(points.map(([x, y]) => `${x},${y}`));
    expect(distinct.size).toBe(BRAIN_AREAS.length);
    for (const [x, y] of points) {
      expect(Math.hypot(x, y)).toBeCloseTo(DOMAIN_ANCHOR_RADIUS, -1);
    }
  });

  it("give every node its own area's anchor, in slot order", () => {
    const data = createFixtureGraph();
    const anchors = domainAnchorsFor(data);
    expect(anchors).toHaveLength(data.nodes.length);
    data.nodes.forEach((n, index) => {
      expect(anchors[index]).toEqual(domainAnchorPoint(graphNodeArea(n)));
    });
  });

  it("do nothing at strength 0 and pull toward the anchor above it", () => {
    // Two unlinked nodes, anchored far apart: without the pull they sit
    // where the spiral put them; with it each moves toward its anchor.
    const anchors = [
      [DOMAIN_ANCHOR_RADIUS, 0],
      [-DOMAIN_ANCHOR_RADIUS, 0],
    ] as const;
    const off = createForceLayout({
      anchors,
      config: { centerStrength: 0, domainAnchorStrength: 0, repelStrength: 0 },
      links: [],
      nodeCount: 2,
    });
    const plain = createForceLayout({
      config: { centerStrength: 0, repelStrength: 0 },
      links: [],
      nodeCount: 2,
    });
    off.tick(60);
    plain.tick(60);
    // Byte-identical to a layout with no anchor forces at all.
    expect([...off.positions()]).toEqual([...plain.positions()]);

    const on = createForceLayout({
      anchors,
      config: {
        centerStrength: 0,
        domainAnchorStrength: 0.05,
        repelStrength: 0,
      },
      links: [],
      nodeCount: 2,
    });
    const before = decodePositions(["n0", "n1"], on.positions());
    on.tick(120);
    const after = decodePositions(["n0", "n1"], on.positions());
    expect(after.get("n0")!.x).toBeGreaterThan(before.get("n0")!.x);
    expect(after.get("n1")!.x).toBeLessThan(before.get("n1")!.x);
    // Turning the slider up later reaches the physics too.
    plain.setConfig({ domainAnchorStrength: 0.05 });
    expect(plain.config().domainAnchorStrength).toBe(0.05);
  });

  it("travel with the start message and are dropped whole when they do not line up", () => {
    const data = createFixtureGraph();
    const message = createStartMessage(data, undefined, 1, {
      anchors: domainAnchorsFor(data),
    });
    expect(message.anchors).toHaveLength(data.nodes.length);
    const parsed = parseHostMessage(message);
    expect(parsed?.type === "start" && parsed.anchors).toHaveLength(
      data.nodes.length,
    );
    const short = parseHostMessage({
      ...message,
      anchors: message.anchors!.slice(1),
    });
    expect(short?.type === "start" && short.anchors).toBeUndefined();
    const bad = parseHostMessage({
      ...message,
      anchors: message.anchors!.map(() => [Number.NaN, 0]),
    });
    expect(bad?.type === "start" && bad.anchors).toBeUndefined();
  });
});

describe("a warm start", () => {
  it("encodes known positions and NaN for the rest, in slot order", () => {
    const buffer = encodeInitialPositions(
      ["a", "b", "c"],
      new Map([
        ["a", { x: 1, y: 2 }],
        ["c", { x: 5, y: Number.NaN }],
      ]),
    );
    expect(buffer && [...buffer]).toEqual([1, 2, NaN, NaN, NaN, NaN]);
    expect(encodeInitialPositions(["a"], new Map())).toBeNull();
    expect(encodeInitialPositions(["a"], null)).toBeNull();
  });

  it("starts from the saved positions, at the reheat temperature, and falls back per node", () => {
    const saved = new Float32Array([100, -50, NaN, NaN]);
    const layout = createForceLayout({
      initialPositions: saved,
      links: [],
      nodeCount: 2,
    });
    const at = decodePositions(["n0", "n1"], layout.positions());
    expect(at.get("n0")).toEqual({ x: 100, y: -50 });
    // The second slot was unknown to the saved layout: the spiral seeds it.
    const cold = createForceLayout({ links: [], nodeCount: 2 });
    expect(at.get("n1")).toEqual(
      decodePositions(["n0", "n1"], cold.positions()).get("n1"),
    );
    expect(layout.alpha()).toBe(WARM_START_ALPHA);
    expect(cold.alpha()).toBe(1);
  });

  it("is refused by the worker when the buffer is too short for the graph", () => {
    const data = createFixtureGraph();
    const message = createStartMessage(data, undefined, 1, {
      initialPositions: new Map(data.nodes.map((n) => [n.id, { x: 1, y: 1 }])),
    });
    expect(message.initialPositions?.length).toBe(data.nodes.length * 2);
    const parsed = parseHostMessage({
      ...message,
      initialPositions: new Float32Array(2),
    });
    expect(parsed?.type === "start" && parsed.initialPositions).toBeUndefined();
  });
});

describe("the engine", () => {
  function harness() {
    const posted: unknown[] = [];
    let handler: ((data: unknown) => void) | null = null;
    const backend: GraphBackend = {
      destroy() {},
      render() {},
      resize() {},
      setPalette() {},
    };
    const worker: SimulationWorkerLike = {
      postMessage: (message) => posted.push(message),
      setMessageHandler: (next) => {
        handler = next;
      },
      terminate: () => undefined,
    };
    return { backend, emit: (m: unknown) => handler?.(m), posted, worker };
  }

  it("sends anchors and a warm start with the first start message, then re-pins", async () => {
    const { backend, posted, worker } = harness();
    const data = createFixtureGraph();
    const first = data.nodes[0]!.id;
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data,
      initialPositions: new Map([[first, { x: 7, y: 9 }]]),
      palette: PALETTE,
      pins: new Map([[first, { x: 7, y: 9 }]]),
    });
    const start = posted[0] as {
      anchors?: unknown[];
      initialPositions?: Float32Array;
      type: string;
    };
    expect(start.type).toBe("start");
    expect(start.anchors).toHaveLength(data.nodes.length);
    expect(start.initialPositions?.[0]).toBe(7);
    expect(posted[1]).toEqual({ slot: 0, type: "pin", x: 7, y: 9 });
    expect(engine.pinnedNodes().get(first)).toEqual({ x: 7, y: 9 });
    engine.dispose();
  });

  it("applies display options without restarting the layout", async () => {
    const { backend, worker } = harness();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data: createFixtureGraph(),
      palette: PALETTE,
    });
    const restarts = engine.layoutRestarts();
    engine.setDisplay({
      ...DEFAULT_DISPLAY_SETTINGS,
      nodeSize: 2,
      showArrows: true,
    });
    expect(engine.layoutRestarts()).toBe(restarts);
    expect(engine.display().nodeSize).toBe(2);
    expect(engine.frame().edges.some((e) => e.arrow)).toBe(true);
    engine.dispose();
  });

  it("keeps a persistent pin through a drag and drops it on unpin", async () => {
    const { backend, posted, worker } = harness();
    const data = createFixtureGraph();
    const id = data.nodes[2]!.id;
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data,
      palette: PALETTE,
    });
    expect(engine.pinNodeAt(id, { x: 10, y: 20 })).toBe(true);
    expect(engine.pinnedNodes().get(id)).toEqual({ x: 10, y: 20 });
    // A pointer drags it somewhere else and lets go: still pinned, there.
    engine.pinNode(id, 30, 40);
    engine.releaseNode(id);
    expect(engine.pinnedNodes().get(id)).toEqual({ x: 30, y: 40 });
    expect(posted.at(-1)).toEqual({ slot: 2, type: "pin", x: 30, y: 40 });
    engine.unpinNode(id);
    expect(engine.pinnedNodes().has(id)).toBe(false);
    expect(posted.at(-1)).toEqual({ slot: 2, type: "unpin" });
    // An unknown node cannot be pinned, and pinning where it is works.
    expect(engine.pinNodeAt("nope")).toBe(false);
    expect(engine.pinNodeAt(data.nodes[0]!.id)).toBe(true);
    engine.dispose();
  });
});
