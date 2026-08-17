import { describe, expect, test } from "vitest";

import { buildDashboardViewModel } from "../apps/web/lib/dashboard/graph-model";
import {
  buildLocalEvidenceGraph,
  graphEdgesWithDisplayableProvenance,
  inspectEdgeProvenance,
} from "../apps/web/lib/dashboard/local-graph";

describe("local evidence detail graph", () => {
  const complete = buildDashboardViewModel("scanned").graph;

  test("computes an exact depth-two neighborhood", () => {
    const local = buildLocalEvidenceGraph(complete, "req-auth", { depth: 2 });

    expect(local.nodes.map((node) => node.id).sort()).toEqual([
      "code-auth",
      "doc-guide",
      "req-auth",
      "test-auth",
    ]);
    expect(local.edges).toHaveLength(3);
  });

  test("adds orphan nodes only when toggled and never invents an edge", () => {
    const hidden = buildLocalEvidenceGraph(complete, "req-auth", {
      includeOrphans: false,
    });
    const shown = buildLocalEvidenceGraph(complete, "req-auth", {
      includeOrphans: true,
    });

    expect(hidden.nodes.some((node) => node.id === "doc-orphan")).toBe(false);
    expect(shown.nodes.some((node) => node.id === "doc-orphan")).toBe(true);
    expect(shown.edges).toEqual(hidden.edges);
  });

  test("exposes span, confidence, and honest grade for every displayed edge", () => {
    const local = buildLocalEvidenceGraph(complete, "req-auth", { depth: 2 });
    const edges = graphEdgesWithDisplayableProvenance(local);

    expect(edges).toHaveLength(local.edges.length);
    for (const edge of edges) {
      const provenance = inspectEdgeProvenance(edge);
      expect(provenance.sourcePath).not.toBe("");
      expect(provenance.endLine).toBeGreaterThanOrEqual(provenance.startLine);
      expect(provenance.confidence).toBeGreaterThan(0);
      expect(["verified", "inferred", "broken"]).toContain(provenance.grade);
    }
  });
});
