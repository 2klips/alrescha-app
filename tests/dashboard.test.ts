import { describe, expect, test } from "vitest";

import {
  buildDashboardViewModel,
  clusterGraph,
  createFixtureGraph,
  filterGraph,
  focusLocalGraph,
  parseDashboardState,
  planCanvasFrame,
} from "../apps/web/lib/dashboard/graph-model";

describe("graph-centered dashboard", () => {
  test("parses route states without accepting unknown values", () => {
    expect(parseDashboardState("permission-error")).toBe("permission-error");
    expect(parseDashboardState(["large", "scanned"])).toBe("large");
    expect(parseDashboardState("invented")).toBe("scanned");
  });

  test("searches and filters graph nodes", () => {
    const graph = buildDashboardViewModel("scanned").graph;
    const result = filterGraph(graph, { grade: "verified", query: "auth", type: "all" });

    expect(result.nodes.map((node) => node.id)).toEqual(["req-auth", "code-auth", "test-auth"]);
    expect(result.nodes.every((node) => node.grade === "verified")).toBe(true);
  });

  test("focuses a selected node to its local evidence neighborhood", () => {
    const graph = buildDashboardViewModel("scanned").graph;
    const focused = focusLocalGraph(graph, "req-auth", 1);

    expect(focused.nodes.map((node) => node.id).sort()).toEqual(["code-auth", "doc-guide", "req-auth"]);
    expect(focused.edges).toHaveLength(2);
  });

  test("clusters a large repository by type and honest evidence grade", () => {
    const graph = clusterGraph(createFixtureGraph(500));

    expect(graph.nodes.length).toBeLessThanOrEqual(12);
    expect(graph.nodes.reduce((total, node) => total + (node.clusterCount ?? 1), 0)).toBe(500);
    expect(graph.nodes.some((node) => node.grade === "broken" && node.findingCount > 0)).toBe(true);
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
