import { describe, expect, test } from "vitest";

import { CHARS_PER_TOKEN } from "../packages/core/src/index";
import {
  DEMO_INSTRUCTION_ARTIFACTS,
  demoAlwaysLoadedTokens,
} from "../apps/web/lib/dashboard/demo-harness";
import {
  buildDashboardViewModel,
  createFixtureGraph,
  deriveDashboardMetrics,
} from "../apps/web/lib/dashboard/graph-model";
import { DASHBOARD } from "../apps/web/lib/strings";

/**
 * Phase 4 Wave B todo 15 — the demo HUD's numbers come from the fixture.
 *
 * Until now the four chips were literals (4 · 84% · 71% · 1,840) that no
 * fixture produced. These tests pin the derivation to the graph the demo
 * actually draws, so the demo says what its own data says.
 */
describe("demo dashboard metrics", () => {
  const source = createFixtureGraph();

  test("unresolved is the sum of every node's finding badge", () => {
    const metrics = deriveDashboardMetrics(source, "scanned", 80);
    const badges = source.nodes.reduce(
      (sum, node) => sum + node.findingCount,
      0,
    );
    expect(badges).toBeGreaterThan(0);
    expect(metrics.unresolved).toBe(badges);
    expect(metrics.unresolvedNodes).toBe(
      source.nodes.filter((node) => node.findingCount > 0).length,
    );
  });

  test("implementation counts requirements with an unbroken implements edge", () => {
    const metrics = deriveDashboardMetrics(source, "scanned", 80);
    // The base fixture: four requirements, three of them implemented by an
    // edge whose evidence still holds; the context-pack requirement's edge
    // is broken and does not count.
    expect(metrics.requirements).toEqual({ covered: 3, total: 4 });
    expect(metrics.implementation).toBe(75);
  });

  test("tests counts code with a verified tests edge, and is unmeasured without CI", () => {
    const withCi = deriveDashboardMetrics(source, "scanned", 80);
    expect(withCi.testsCovered).toEqual({ covered: 2, total: 4 });
    expect(withCi.tests).toBe(50);

    const noCi = deriveDashboardMetrics(source, "no-ci", 80);
    expect(noCi.tests).toBeNull();
    expect(noCi.testsCovered).toEqual(withCi.testsCovered);
  });

  test("the always-loaded chip is the demo harness table's own total", () => {
    const tokens = demoAlwaysLoadedTokens();
    // Only the root AGENTS.md loads unprompted in the fixture harness; the
    // nested one is conditional, the skill on demand, the Cursor rule unknown.
    const root = DEMO_INSTRUCTION_ARTIFACTS.find(
      ({ path }) => path === "AGENTS.md",
    );
    expect(root).toBeDefined();
    expect(tokens).toBe(Math.ceil(root!.sizeBytes / CHARS_PER_TOKEN));
    expect(buildDashboardViewModel("scanned").metrics.tokenCost).toBe(tokens);
  });

  test("the view model carries derived metrics, never typed-in ones", () => {
    const scanned = buildDashboardViewModel("scanned").metrics;
    expect(scanned).toEqual(
      deriveDashboardMetrics(source, "scanned", demoAlwaysLoadedTokens()),
    );
    // The large state clusters the drawn graph; the metrics still come from
    // the unclustered source it was built from.
    const large = buildDashboardViewModel("large");
    expect(large.isClustered).toBe(true);
    expect(large.metrics).toEqual(
      deriveDashboardMetrics(
        createFixtureGraph(500),
        "large",
        demoAlwaysLoadedTokens(),
      ),
    );
  });

  test("the evidence lines repeat the chip's number and name a source", () => {
    const metrics = buildDashboardViewModel("scanned").metrics;
    expect(DASHBOARD.metricEvidence.unresolved(metrics)[0]).toContain(
      `${metrics.unresolved}건`,
    );
    expect(DASHBOARD.metricEvidence.implementation(metrics)[0]).toContain(
      `${metrics.implementation}%`,
    );
    expect(DASHBOARD.metricEvidence.tests(metrics)[0]).toContain(
      `${metrics.tests}%`,
    );
    expect(DASHBOARD.metricEvidence.tokens(metrics)[0]).toContain(
      String(metrics.tokenCost),
    );
    for (const key of [
      "unresolved",
      "implementation",
      "tests",
      "tokens",
    ] as const) {
      expect(DASHBOARD.metricEvidence[key](metrics)[2]).toMatch(
        /^(출처|가정): /,
      );
    }
    const noCi = buildDashboardViewModel("no-ci").metrics;
    expect(DASHBOARD.metricEvidence.tests(noCi)[0]).toBe(
      "테스트 커버리지 측정 안 됨",
    );
  });
});
