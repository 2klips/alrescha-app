import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { DASHBOARD_STATES, buildDashboardViewModel } from "../../lib/dashboard/graph-model";
import { DashboardScreen } from "./dashboard-screen";

test.each(DASHBOARD_STATES)("dashboard component renders the %s state", (state) => {
  const html = renderToStaticMarkup(createElement(DashboardScreen, { model: buildDashboardViewModel(state) }));

  expect(html).toContain("SpecProof project assurance dashboard");
  expect(html).toContain('href="/app/harness"');
  expect(html).toContain('href="/app/library"');
  if (state === "loading") expect(html).toContain("Loading evidence index");
  if (state === "empty") expect(html).toContain("Graph canvas ready");
  if (state === "scanning") expect(html).toContain("Building proof spine · 62%");
  if (state === "failed") expect(html).toContain("Scan stopped before analysis");
  if (state === "permission-error") expect(html).toContain("GitHub permission changed");
  if (state === "revoked") {
    expect(html).toContain("GitHub App disconnected");
    expect(html).toContain("Stored evidence remains read-only");
    expect(html).toContain("Reconnect GitHub App");
    expect(html).toContain("View stored evidence");
  }
  if (state === "no-ci") expect(html).toContain("No CI report for this commit");
  if (state === "large") expect(html).toContain("500 nodes grouped by type + grade");
  if (state === "scanned") expect(html).toContain("Evidence graph with 15 visible nodes");
});
