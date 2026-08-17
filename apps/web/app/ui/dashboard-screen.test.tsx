import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import {
  DASHBOARD_STATES,
  buildDashboardViewModel,
} from "../../lib/dashboard/graph-model";
import { BRAND, DASHBOARD } from "../../lib/strings";
import { DashboardScreen } from "./dashboard-screen";

test.each(DASHBOARD_STATES)(
  "dashboard component renders the %s state",
  (state) => {
    const html = renderToStaticMarkup(
      createElement(DashboardScreen, { model: buildDashboardViewModel(state) }),
    );

    expect(html).toContain(DASHBOARD.ariaMain);
    expect(html).toContain(BRAND.tagline);
    expect(html).toContain("%2Farr-mark.png");
    expect(html).toContain('href="/app/harness"');
    expect(html).toContain('href="/app/library"');
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
  expect(html).toContain(">Graph<");
  expect(html).toContain(DASHBOARD.activity.live);
});
