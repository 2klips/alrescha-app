import { describe, expect, it } from "vitest";

import type {
  GraphData,
  GraphEdge,
  GraphNode,
} from "../apps/web/lib/dashboard/graph-model";
import {
  buildRenderFrame,
  edgeStroke,
  type GraphPalette,
} from "../apps/web/lib/graph/render-frame";

/**
 * Phase 3 Wave A todo 2 — confidence-tier stroke grammar and directional
 * focus. Every visual decision is asserted on the render plan, never on
 * pixels: the Pixi adapter only copies these numbers.
 */

function node(id: string, x: number): GraphNode {
  return {
    findingCount: 0,
    grade: "inferred",
    id,
    label: id,
    path: `src/${id}.ts`,
    type: "code",
    x,
    y: 0,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  tier?: GraphEdge["tier"],
): GraphEdge {
  return {
    broken: false,
    grade: "inferred",
    id,
    provenance: {
      confidence: 1,
      endLine: 2,
      grade: "inferred",
      relation: "references",
      sourcePath: `src/${source}.ts`,
      startLine: 1,
    },
    source,
    target,
    ...(tier ? { tier } : {}),
  };
}

/** Distinct sentinel colours so a wrong token read is unmistakable. */
const PALETTE: GraphPalette = {
  accent: 0x0a0a0a,
  danger: 0xd00000,
  "focus-in": 0x00f0f0,
  "focus-out": 0xf0a000,
  inferred: 0x333333,
  "node-code": 0x444444,
  text: 0x555555,
  verified: 0x00d000,
};

describe("edge stroke grammar (todo 2)", () => {
  it("renders each confidence tier as its own line style", () => {
    expect(edgeStroke({ broken: false, tier: "resolved" })).toEqual({
      alpha: 0.5,
      colorToken: null,
      dashed: false,
      width: 1.25,
    });
    expect(edgeStroke({ broken: false, tier: "reference" })).toEqual({
      alpha: 0.3,
      colorToken: null,
      dashed: false,
      width: 0.7,
    });
    expect(edgeStroke({ broken: false, tier: "inferred" })).toEqual({
      alpha: 0.42,
      colorToken: null,
      dashed: true,
      width: 1,
    });
    expect(edgeStroke({ broken: false, tier: "agent_asserted" })).toEqual({
      alpha: 0.6,
      colorToken: "accent",
      dashed: true,
      width: 1.2,
    });
  });

  it("keeps the legacy stroke for tierless demo edges", () => {
    expect(edgeStroke({ broken: false })).toEqual({
      alpha: 0.42,
      colorToken: null,
      dashed: false,
      width: 1,
    });
  });

  it("drift outranks derivation: broken stays the red dash on any tier", () => {
    expect(edgeStroke({ broken: true, tier: "resolved" })).toEqual({
      alpha: 0.85,
      colorToken: null,
      dashed: true,
      width: 1.6,
    });
  });

  it("an agent-asserted edge paints the accent colour in the frame", () => {
    const data: GraphData = {
      edges: [edge("e1", "a", "b", "agent_asserted")],
      nodes: [node("a", 0), node("b", 50)],
    };
    const frame = buildRenderFrame({
      data,
      palette: PALETTE,
      positions: new Map(),
    });
    expect(frame.edges[0]?.color).toBe(PALETTE.accent);
    expect(frame.edges[0]?.dashed).toBe(true);
  });
});

describe("directional focus (todo 2)", () => {
  const data: GraphData = {
    edges: [
      edge("out", "sel", "dep", "resolved"),
      edge("in", "user", "sel", "resolved"),
      edge("far", "other-a", "other-b", "resolved"),
    ],
    nodes: [
      node("sel", 0),
      node("dep", 60),
      node("user", -60),
      node("other-a", 120),
      node("other-b", 180),
    ],
  };

  function focusFrame() {
    return buildRenderFrame({
      data,
      directionalFocus: true,
      palette: PALETTE,
      positions: new Map(),
      selectedNodeId: "sel",
    });
  }

  it("tints edges by dependency direction and fades the rest", () => {
    const frame = focusFrame();
    const byId = new Map(frame.edges.map((entry) => [entry.id, entry]));

    expect(byId.get("out")?.color).toBe(PALETTE["focus-out"]);
    expect(byId.get("out")?.alpha).toBe(0.9);
    expect(byId.get("in")?.color).toBe(PALETTE["focus-in"]);
    expect(byId.get("in")?.alpha).toBe(0.9);
    // Unconnected edges keep their colour but drop to a fraction of their alpha.
    expect(byId.get("far")?.color).toBe(PALETTE.inferred);
    expect(byId.get("far")?.alpha).toBeCloseTo(0.5 * 0.15, 5);
  });

  it("fades nodes outside the neighborhood and keeps it labeled only", () => {
    const frame = focusFrame();
    const byId = new Map(frame.nodes.map((entry) => [entry.id, entry]));

    expect(byId.get("sel")?.alpha).toBe(1);
    expect(byId.get("dep")?.alpha).toBe(1);
    expect(byId.get("user")?.alpha).toBe(1);
    expect(byId.get("other-a")?.alpha).toBe(0.22);

    const labeled = new Set(frame.labels.map((label) => label.id));
    expect(labeled.has("other-a")).toBe(false);
    expect(labeled.has("other-b")).toBe(false);
  });

  it("does not engage on an isolated node — the map must not vanish", () => {
    const withIsolated: GraphData = {
      edges: data.edges,
      nodes: [...data.nodes, node("island", 240)],
    };
    const frame = buildRenderFrame({
      data: withIsolated,
      directionalFocus: true,
      palette: PALETTE,
      positions: new Map(),
      selectedNodeId: "island",
    });
    expect(frame.nodes.every((entry) => entry.alpha === 1)).toBe(true);
    expect(frame.edges.every((entry) => entry.alpha === 0.5)).toBe(true);
  });

  it("does nothing without the flag or without a selection", () => {
    const plain = buildRenderFrame({
      data,
      palette: PALETTE,
      positions: new Map(),
      selectedNodeId: "sel",
    });
    expect(plain.nodes.every((entry) => entry.alpha === 1)).toBe(true);
    expect(plain.edges.every((entry) => entry.color === PALETTE.inferred)).toBe(
      true,
    );

    const unselected = buildRenderFrame({
      data,
      directionalFocus: true,
      palette: PALETTE,
      positions: new Map(),
    });
    expect(unselected.nodes.every((entry) => entry.alpha === 1)).toBe(true);
  });
});
