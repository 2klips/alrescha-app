import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import {
  DASHBOARD_STATES,
  buildDashboardViewModel,
  graphNodeArea,
} from "../../lib/dashboard/graph-model";
import { BRAIN_AREAS } from "@arr/core/artifact-facets";
import { BRAND, DASHBOARD } from "../../lib/strings";
import { DashboardScreen } from "./dashboard-screen";

test.each(DASHBOARD_STATES)(
  "dashboard component renders the %s state",
  (state) => {
    const html = renderToStaticMarkup(
      createElement(DashboardScreen, { model: buildDashboardViewModel(state) }),
    );

    expect(html).toContain(DASHBOARD.ariaMain);
    // Design roadmap step 2: brand, nav and theme toggle moved to the
    // AppShell sidebar — the screen must no longer assemble its own topbar
    // or duplicate the sidebar's harness/library destinations.
    expect(html).not.toContain("arr-topbar");
    expect(html).not.toContain(BRAND.tagline);
    if (state === "loading")
      expect(html).toContain(DASHBOARD.states.loading.title);
    if (state === "empty") expect(html).toContain(DASHBOARD.states.empty.title);
    if (state === "scanning")
      expect(html).toContain(DASHBOARD.states.scanning.title);
    if (state === "failed")
      expect(html).toContain(DASHBOARD.states.failed.title);
    if (state === "permission-error")
      expect(html).toContain(DASHBOARD.states.permissionError.title);
    if (state === "revoked") {
      expect(html).toContain(DASHBOARD.states.revoked.title);
      expect(html).toContain(DASHBOARD.states.revoked.body);
      expect(html).toContain(DASHBOARD.states.revoked.reconnect);
      expect(html).toContain(DASHBOARD.states.revoked.viewStored);
    }
    if (state === "no-ci") expect(html).toContain(DASHBOARD.ci.missing);
    if (state === "large") expect(html).toContain(DASHBOARD.clusterNote(500));
    if (state === "scanned") expect(html).toContain(DASHBOARD.canvasLabel(15));
  },
);

test("dashboard copy is Korean-first with conventional terms kept in English", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardScreen, {
      model: buildDashboardViewModel("scanned"),
    }),
  );

  // Korean-first: the headline, metric labels and inspector are Korean…
  expect(html).toContain(DASHBOARD.title);
  expect(html).toContain(DASHBOARD.metrics.unresolved);
  expect(html).toContain(DASHBOARD.inspector.lead);
  // …while the conventional terms stay English, verbatim.
  expect(DASHBOARD.metrics.unresolved).toContain("Findings");
  expect(html).toContain(DASHBOARD.activity.live);
});

// QW-6: the area chip counts moved from an inline `.filter().length` per
// render into a `useMemo`. This proves the memoized tally still matches a
// plain per-node count, so the perf fix didn't change what's on screen.
test("area chip counts match a plain per-node tally after the useMemo change", () => {
  const model = buildDashboardViewModel("scanned");
  const html = renderToStaticMarkup(createElement(DashboardScreen, { model }));

  const expectedCounts = new Map<string, number>();
  for (const node of model.graph.nodes) {
    const area = graphNodeArea(node);
    expectedCounts.set(area, (expectedCounts.get(area) ?? 0) + 1);
  }

  for (const area of BRAIN_AREAS) {
    const match = new RegExp(
      `data-area="${area}"[\\s\\S]*?<small>(\\d+)</small>`,
    ).exec(html);
    expect(match, `expected an area chip for "${area}"`).not.toBeNull();
    expect(Number(match?.[1])).toBe(expectedCounts.get(area) ?? 0);
  }
});
