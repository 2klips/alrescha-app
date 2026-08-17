import { describe, expect, test } from "vitest";

import {
  buildDashboardViewModel,
  clusterGraph,
  createFixtureGraph,
  filterGraph,
  focusLocalGraph,
  parseDashboardState,
  planCanvasFrame,
  topHubNodes,
  type GraphData,
} from "../apps/web/lib/dashboard/graph-model";

const PROVENANCE = {
  confidence: 1,
  endLine: 2,
  grade: "verified",
  relation: "implements",
  sourcePath: "src/a.ts",
  startLine: 1,
} as const;

describe("graph-centered dashboard", () => {
  test("parses route states without accepting unknown values", () => {
    expect(parseDashboardState("permission-error")).toBe("permission-error");
    expect(parseDashboardState(["large", "scanned"])).toBe("large");
    expect(parseDashboardState("invented")).toBe("scanned");
  });

  test("searches and filters graph nodes", () => {
    const graph = buildDashboardViewModel("scanned").graph;
    const result = filterGraph(graph, {
      grade: "verified",
      query: "auth",
      type: "all",
    });

    expect(result.nodes.map((node) => node.id)).toEqual([
      "req-auth",
      "code-auth",
      "test-auth",
    ]);
    expect(result.nodes.every((node) => node.grade === "verified")).toBe(true);
  });

  test("focuses a selected node to its local evidence neighborhood", () => {
    const graph = buildDashboardViewModel("scanned").graph;
    const focused = focusLocalGraph(graph, "req-auth", 1);

    expect(focused.nodes.map((node) => node.id).sort()).toEqual([
      "code-auth",
      "doc-guide",
      "req-auth",
    ]);
    expect(focused.edges).toHaveLength(2);
  });

  test("clusters a large repository by type and honest evidence grade", () => {
    const graph = clusterGraph(createFixtureGraph(500));

    expect(graph.nodes.length).toBeLessThanOrEqual(12);
    expect(
      graph.nodes.reduce((total, node) => total + (node.clusterCount ?? 1), 0),
    ).toBe(500);
    expect(
      graph.nodes.some(
        (node) => node.grade === "broken" && node.findingCount > 0,
      ),
    ).toBe(true);
  });

  test("prepares a 500-node canvas frame within one 60fps budget", () => {
    const graph = createFixtureGraph(500);
    const startedAt = performance.now();
    const frame = planCanvasFrame(graph);
    const duration = performance.now() - startedAt;

    expect(frame.nodePoints).toHaveLength(500);
    expect(frame.edgeSegments.length).toBeGreaterThan(480);
    expect(duration).toBeLessThan(16.7);
  });
});

describe("hub nodes (Phase 2A todo 7)", () => {
  test("ranks the most-connected nodes and stops at the requested count", () => {
    const graph = buildDashboardViewModel("scanned").graph;
    const hubs = topHubNodes(graph, 5);
    const degrees = hubs.map((hub) => hub.degree);

    expect(hubs).toHaveLength(5);
    expect(degrees).toEqual([...degrees].sort((left, right) => right - left));
    expect(hubs.every((hub) => hub.degree > 0)).toBe(true);
  });

  test("breaks ties on node id so the chip order is reproducible", () => {
    const graph: GraphData = {
      edges: [
        {
          broken: false,
          grade: "verified",
          id: "e1",
          provenance: PROVENANCE,
          source: "b",
          target: "a",
        },
        {
          broken: false,
          grade: "verified",
          id: "e2",
          provenance: PROVENANCE,
          source: "c",
          target: "a",
        },
      ],
      nodes: ["c", "b", "a"].map((id) => ({
        findingCount: 0,
        grade: "verified" as const,
        id,
        label: id,
        path: `${id}.ts`,
        type: "code" as const,
        x: 0,
        y: 0,
      })),
    };

    expect(topHubNodes(graph, 3).map((hub) => hub.node.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("omits isolated nodes — a chip must lead somewhere", () => {
    const graph = buildDashboardViewModel("scanned").graph;
    const connected = new Set(
      graph.edges.flatMap((edge) => [edge.source, edge.target]),
    );

    for (const hub of topHubNodes(graph, 15)) {
      expect(connected.has(hub.node.id)).toBe(true);
    }
  });
});
