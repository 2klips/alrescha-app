import { describe, expect, it } from "vitest";

import { deriveBrainArea } from "../packages/core/src/index";
import {
  buildDashboardViewModel,
  facetLayout,
  filterGraph,
  graphNodeArea,
  type GraphFilters,
} from "../apps/web/lib/dashboard/graph-model";

/**
 * Phase 2D todo 5 — the graph's facet mode. The load-bearing property is that
 * the map and the overview's Data Brain zone group by the *same* axis, so both
 * read it from `deriveBrainArea` rather than each keeping a copy.
 */

const ALL: GraphFilters = {
  area: "all",
  grade: "all",
  query: "",
  type: "all",
};

describe("graph facet filter and group mode", () => {
  const { graph } = buildDashboardViewModel("scanned");

  it("reads the area from the shared core derivation", () => {
    for (const node of graph.nodes) {
      const area = graphNodeArea(node);
      expect(area).toBe(
        deriveBrainArea(
          node.path,
          node.type === "code" || node.type === "test"
            ? "code_metadata"
            : "spec",
        ),
      );
    }
  });

  it("filters to one area and drops the edges that leave it", () => {
    const frontend = filterGraph(graph, { ...ALL, area: "frontend" });
    expect(frontend.nodes.length).toBeGreaterThan(0);
    expect(frontend.nodes.length).toBeLessThan(graph.nodes.length);
    expect(
      frontend.nodes.every((node) => graphNodeArea(node) === "frontend"),
    ).toBe(true);
    const ids = new Set(frontend.nodes.map(({ id }) => id));
    expect(
      frontend.edges.every(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    ).toBe(true);
  });

  it("composes with the other filters instead of replacing them", () => {
    const both = filterGraph(graph, {
      ...ALL,
      area: "docs",
      grade: "verified",
    });
    expect(
      both.nodes.every(
        (node) => graphNodeArea(node) === "docs" && node.grade === "verified",
      ),
    ).toBe(true);
  });

  it("lays every area out in its own band, keeping node identity", () => {
    const grouped = facetLayout(graph);
    expect(grouped.nodes.map(({ id }) => id).sort()).toEqual(
      graph.nodes.map(({ id }) => id).sort(),
    );
    expect(grouped.edges).toEqual(graph.edges);

    // One distinct band per present area, and every node of an area shares it.
    const bandOf = new Map<string, Set<number>>();
    for (const node of grouped.nodes) {
      const area = graphNodeArea(node);
      bandOf.set(area, (bandOf.get(area) ?? new Set()).add(node.y));
    }
    for (const [, ys] of bandOf) expect(ys.size).toBe(1);
    const bands = [...bandOf.values()].map((ys) => [...ys][0]!);
    expect(new Set(bands).size).toBe(bandOf.size);
  });

  it("is deterministic — the same graph lays out identically", () => {
    expect(facetLayout(graph)).toEqual(facetLayout(graph));
  });

  it("leaves an empty graph alone rather than dividing by zero", () => {
    expect(facetLayout({ edges: [], nodes: [] })).toEqual({
      edges: [],
      nodes: [],
    });
  });
});
