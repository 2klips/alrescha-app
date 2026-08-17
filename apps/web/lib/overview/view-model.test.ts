import { describe, expect, it } from "vitest";

import { buildDashboardViewModel } from "../dashboard/graph-model";
import { areaOfPath, buildOverviewViewModel } from "./view-model";

describe("overview view model (Phase 2D Wave 1)", () => {
  const model = buildOverviewViewModel();

  it("derives every number from the dashboard model it links to", () => {
    const dashboard = buildDashboardViewModel("scanned");
    expect(model.kpi.unresolved).toBe(dashboard.metrics.unresolved);
    expect(model.kpi.implementation).toBe(dashboard.metrics.implementation);
    expect(model.kpi.tests).toBe(dashboard.metrics.tests);
    expect(model.graph.nodeCount).toBe(dashboard.graph.nodes.length);
    expect(model.graph.edgeCount).toBe(dashboard.graph.edges.length);
  });

  it("partitions every node into exactly one brain area", () => {
    const total = model.brainAreas.reduce((sum, { count }) => sum + count, 0);
    expect(total).toBe(model.graph.nodeCount);
    // Deterministic derivation: same input, same partition.
    expect(buildOverviewViewModel().brainAreas).toEqual(model.brainAreas);
  });

  it("classifies paths by the monorepo convention", () => {
    expect(areaOfPath("apps/web/lib/auth/repository-access.ts", "code")).toBe(
      "frontend",
    );
    expect(areaOfPath("packages/core/src/github/webhook.ts", "code")).toBe(
      "backend",
    );
    expect(areaOfPath("spec/WORK_SPEC.md:118", "requirement")).toBe("docs");
    expect(areaOfPath("tests/auth-tenancy.test.ts", "test")).toBe("tests");
  });

  it("caps the todo zone and keeps source provenance", () => {
    expect(model.todos.length).toBeGreaterThan(0);
    expect(model.todos.length).toBeLessThanOrEqual(6);
    const documentTodo = model.todos.find((todo) => todo.sourcePath !== null);
    expect(documentTodo?.sourcePath).toMatch(/\.md$/);
  });

  it("shows the mid-work board — statuses are mixed, not all done", () => {
    const statuses = new Set(model.todos.map(({ status }) => status));
    expect(statuses.size).toBeGreaterThan(1);
  });

  it("grade totals cover the whole graph", () => {
    const total = model.brainGrades.reduce((sum, { count }) => sum + count, 0);
    expect(total).toBe(model.graph.nodeCount);
  });
});
