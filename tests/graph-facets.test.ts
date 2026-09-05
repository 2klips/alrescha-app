import { describe, expect, it } from "vitest";

import { BRAIN_AREAS, deriveBrainArea } from "../packages/core/src/index";
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

/**
 * Phase 4 Wave A todo 4 — six areas, and a node that carries its own.
 *
 * The colour axis grew a `database` band and stopped folding everything it
 * did not recognise into backend. The map derives each node's area once,
 * with the repository's declared layout; every other surface reads that
 * answer rather than re-deriving one from the path.
 */
describe("six-area facet axis", () => {
  it("lays out one band per area that has nodes, in the shared order", () => {
    const nodes = (
      [
        ["frontend", "apps/web/lib/x.ts", "code"],
        ["backend", "packages/core/src/y.ts", "code"],
        ["database", "supabase/migrations/0001.sql", "code"],
        ["docs", "spec/WORK_SPEC.md", "document"],
        ["tests", "tests/x.test.ts", "test"],
        ["other", "vendor/legacy/z.rb", "code"],
      ] as const
    ).map(([area, path, type]) => ({
      domain: area,
      findingCount: 0,
      grade: "inferred" as const,
      id: path,
      label: path,
      path,
      type,
      x: 0,
      y: 0,
    }));

    expect(nodes.map((node) => graphNodeArea(node))).toEqual([
      "frontend",
      "backend",
      "database",
      "docs",
      "tests",
      "other",
    ]);
    const laid = facetLayout({ edges: [], nodes });
    // Six bands, so six distinct vertical positions — the band view reads
    // `BRAIN_AREAS`, which is the same list the filters and the overview do.
    expect(new Set(laid.nodes.map(({ y }) => y)).size).toBe(6);
    expect(BRAIN_AREAS).toHaveLength(6);
  });

  it("prefers the node's own domain over a second path derivation", () => {
    // The loader derives the area once with the repository's declared
    // layout; a screen that re-derived it from the path would disagree with
    // the map about a repository that calls its server `svc/`.
    const declared = {
      domain: "backend" as const,
      findingCount: 0,
      grade: "inferred" as const,
      id: "svc/orders.ts",
      label: "orders.ts",
      path: "svc/orders.ts",
      type: "code" as const,
      x: 0,
      y: 0,
    };

    expect(graphNodeArea(declared)).toBe("backend");
    expect(deriveBrainArea("svc/orders.ts", "code_metadata")).toBe("other");
    const { domain, ...withoutDomain } = declared;
    expect(domain).toBe("backend");
    expect(graphNodeArea(withoutDomain)).toBe("other");
  });
});
