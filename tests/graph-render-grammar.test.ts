import { describe, expect, it } from "vitest";

import {
  NODE_SHAPE,
  createFixtureGraph,
  type GraphData,
  type GraphEdge,
  type GraphNode,
} from "../apps/web/lib/dashboard/graph-model";
import {
  FAR_HUB_LABEL_LIMIT,
  labelFade,
  labelSizeFloor,
  selectLabels,
  type LabelCandidate,
} from "../apps/web/lib/graph/lod";
import {
  RISK_RING_BANDS,
  buildRenderFrame,
  riskRingBand,
  type GraphPalette,
  type Viewport,
} from "../apps/web/lib/graph/render-frame";

/**
 * Phase 4 Wave B todo 12 — the visual grammar half.
 *
 * The performance half is asserted by `tests/graph-perf.test.ts` and by
 * `scripts/bench-graph-browser.ts`; these are the decisions a reader can
 * disagree with, so they are written down as rules rather than left in the
 * renderer.
 */

const VIEWPORT: Viewport = { height: 800, width: 1200 };
const PALETTE: GraphPalette = {
  danger: 0xff0000,
  inferred: 0x00ff00,
  text: 0xffffff,
  verified: 0x0000ff,
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

function edge(overrides: Partial<GraphEdge> & { id: string }): GraphEdge {
  return {
    broken: false,
    grade: "inferred",
    provenance: {
      confidence: 1,
      endLine: 1,
      grade: "inferred",
      relation: "imports",
      sourcePath: "src/a.ts",
      startLine: 1,
    },
    source: "a",
    target: "b",
    ...overrides,
  };
}

function frameOf(data: GraphData, scale: number, extra = {}) {
  return buildRenderFrame({
    camera: { scale, x: 0, y: 0 },
    data,
    palette: PALETTE,
    positions: new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    viewport: VIEWPORT,
    ...extra,
  });
}

describe("the four-shape grammar reaches the renderer", () => {
  it("gives every node type the shape the model assigns it", () => {
    const data: GraphData = {
      edges: [],
      nodes: Object.keys(NODE_SHAPE).map((type, index) =>
        node({ id: type, type: type as GraphNode["type"], x: index * 40 }),
      ),
    };

    const frame = frameOf(data, 1);
    for (const rendered of frame.nodes) {
      expect(rendered.shape, rendered.id).toBe(
        NODE_SHAPE[rendered.id as GraphNode["type"]],
      );
    }
    // All four are actually in play — a grammar where every node is a circle
    // would satisfy the loop above and mean nothing.
    expect(new Set(frame.nodes.map((n) => n.shape)).size).toBe(4);
  });
});

describe("the risk ring", () => {
  it("has three bands, and low is not one of them", () => {
    expect([...RISK_RING_BANDS]).toEqual(["moderate", "elevated", "high"]);
    // A ring on every node is a texture, not a warning.
    expect(riskRingBand("low")).toBeNull();
    expect(riskRingBand(undefined)).toBeNull();
    expect(riskRingBand("high")).toBe("high");
  });

  it("rings code and nothing else", () => {
    // Todo 21 ranks files. A requirement has no untested-ness or fan-in of
    // its own, and ringing one puts a judgement on a node it was never about.
    const data: GraphData = {
      edges: [],
      nodes: [
        node({ id: "code", risk: "high", type: "code" }),
        node({ id: "req", risk: "high", type: "requirement" }),
        node({ id: "quiet", risk: "low", type: "code" }),
        node({ id: "unranked", type: "code" }),
      ],
    };

    const bands = new Map(
      frameOf(data, 1).nodes.map((n) => [n.id, n.riskBand]),
    );
    expect(bands.get("code")).toBe("high");
    expect(bands.get("req")).toBeNull();
    expect(bands.get("quiet")).toBeNull();
    expect(bands.get("unranked")).toBeNull();
  });
});

describe("the Far draw policy", () => {
  const data: GraphData = {
    edges: [
      edge({ family: "structure", id: "import" }),
      edge({ family: "hierarchy", id: "contains", layoutOnly: true }),
      edge({ family: "semantic", id: "meaning" }),
      edge({
        family: "structure",
        id: "cochange",
        provenance: {
          confidence: 1,
          endLine: 1,
          grade: "inferred",
          relation: "co_changed",
          sourcePath: "src/a.ts",
          startLine: 1,
        },
      }),
      edge({ family: "doc", id: "cites", source: "heading", target: "a" }),
    ],
    nodes: [
      node({ id: "a" }),
      node({ id: "b", x: 30 }),
      node({ id: "heading", type: "section", x: 60 }),
    ],
  };

  const drawnAt = (scale: number) =>
    new Set(frameOf(data, scale).edges.map((e) => e.id));

  it("keeps the wires that shape the constellation and drops the wash", () => {
    // Far: the map is a constellation. Containment, co-change, meaning-links
    // and section haze drawn together at that zoom are a grey wash over the
    // structure they were supposed to sit behind.
    const far = drawnAt(0.05);
    expect([...far]).toEqual(["import"]);
  });

  it("draws all of them again once the zoom can tell them apart", () => {
    const near = drawnAt(3);
    expect(near).toEqual(
      new Set(["import", "contains", "meaning", "cochange", "cites"]),
    );
  });

  it("draws containment faintly rather than at full strength", () => {
    // A folder pulling its files together is what makes a directory read as
    // a cluster; 885 of those lines at full strength bury the imports they
    // exist to make legible (OQ-037).
    const near = frameOf(data, 3);
    const contains = near.edges.find((e) => e.id === "contains");
    const imports = near.edges.find((e) => e.id === "import");
    expect(contains?.alpha).toBeLessThanOrEqual(0.08);
    expect(imports?.alpha).toBeGreaterThan(contains?.alpha as number);
  });

  it("carries the family through, so the renderer can batch by it", () => {
    const families = new Map(
      frameOf(data, 3).edges.map((e) => [e.id, e.family]),
    );
    expect(families.get("meaning")).toBe("semantic");
    // A demo edge states no family and reads as `structure`, the baseline.
    expect(
      frameOf(
        {
          edges: [edge({ id: "plain" })],
          nodes: [node({ id: "a" }), node({ id: "b" })],
        },
        3,
      ).edges[0]?.family,
    ).toBe("structure");
  });
});

describe("Far labels are landmarks, not the busiest nodes", () => {
  const candidate = (
    id: string,
    degree: number,
    kind?: string,
  ): LabelCandidate => ({
    degree,
    id,
    ...(kind ? { kind } : {}),
    label: id,
    pixelSize: 4,
    screenX: 600,
    screenY: 400,
  });

  it("puts a package ahead of a file with far more edges", () => {
    // Degree alone answers "what is busiest", which at Far is usually a
    // barrel file. The question a viewer is asking is "where am I".
    const chosen = selectLabels(
      [
        candidate("barrel", 400),
        candidate("core", 2, "package"),
        candidate("route", 3, "route"),
        candidate("folder", 5, "directory"),
      ],
      { farHubLimit: 2, lod: "far", viewport: VIEWPORT },
    );
    expect(chosen).toEqual(["core", "route"]);
  });

  it("falls back to degree inside a kind, and for kinds with no weight", () => {
    const chosen = selectLabels([candidate("small", 1), candidate("big", 90)], {
      farHubLimit: 1,
      lod: "far",
      viewport: VIEWPORT,
    });
    expect(chosen).toEqual(["big"]);
  });

  it("keeps twelve landmarks, not six", () => {
    // A constellation with six names is a constellation nobody can navigate.
    expect(FAR_HUB_LABEL_LIMIT).toBe(12);
    const many = Array.from({ length: 40 }, (_, index) =>
      candidate(`n${index}`, index),
    );
    expect(selectLabels(many, { lod: "far", viewport: VIEWPORT })).toHaveLength(
      FAR_HUB_LABEL_LIMIT,
    );
  });
});

describe("labels", () => {
  it("fade in over a band instead of switching on at the floor", () => {
    const floor = labelSizeFloor("near");
    // At the floor a label is invisible, and it reaches full opacity above
    // it — what a viewer sees while zooming is a label arriving, not one
    // frame with no label and the next with one.
    expect(labelFade(floor, floor)).toBe(0);
    expect(labelFade(floor * 1.2, floor)).toBeGreaterThan(0);
    expect(labelFade(floor * 1.2, floor)).toBeLessThan(1);
    expect(labelFade(floor * 5, floor)).toBe(1);
    expect(labelFade(0, floor)).toBe(0);
  });

  it("are positioned in screen space, so text does not scale with the zoom", () => {
    // A label used to live inside the camera's container: at Near a filename
    // was the width of the screen and at Far it was a smear.
    const data: GraphData = {
      edges: [],
      nodes: [node({ id: "a", x: 100, y: -50 })],
    };
    const near = frameOf(data, 3).labels[0];
    const far = frameOf(data, 0.5).labels[0];
    expect(near).toBeDefined();
    // Screen coordinates put the node near the viewport centre at both
    // zooms; world coordinates would have kept x at 100 regardless.
    expect(near?.x).toBeGreaterThan(VIEWPORT.width / 2);
    expect(far?.x ?? 0).not.toBe(near?.x);
    expect(Math.abs((near?.y ?? 0) - VIEWPORT.height / 2)).toBeLessThan(
      VIEWPORT.height / 2,
    );
  });
});

describe("the geometry revision", () => {
  it("is carried on the frame so the renderer can skip a camera-only change", () => {
    const data = createFixtureGraph(15);
    expect(frameOf(data, 1, { geometryRevision: 7 }).geometryRevision).toBe(7);
    // Absent means zero rather than undefined: a renderer comparing it must
    // never see NaN.
    expect(frameOf(data, 1).geometryRevision).toBe(0);
  });
});
