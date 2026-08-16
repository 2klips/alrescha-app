import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { DASHBOARD } from "../../apps/web/lib/strings";

test("onboards through mocked GitHub into the fixture evidence graph", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(page.getByRole("heading", { name: "Read only. Evidence only." })).toBeVisible();
  await expect(page.getByText("Contents · read")).toBeVisible();
  await page.getByRole("button", { name: "Install GitHub App" }).click();
  await page.getByRole("button", { name: /2klips\/specproof-app/ }).click();
  await expect(page.getByRole("heading", { name: "Building proof spine" })).toBeVisible();
  await page.getByRole("button", { name: "Open evidence graph" }).click();

  await expect(page.getByTestId("evidence-graph-canvas")).toBeVisible();
  await expect(page.getByText(DASHBOARD.ci.present)).toBeVisible();
});

test("recovers from a mocked GitHub permission error", async ({ page }) => {
  await page.goto("/onboarding?permission=error");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();

  await expect(page.locator(".permission-error")).toContainText("contents:read");
  await expect(page.getByRole("button", { name: "Install GitHub App" })).toBeDisabled();
  await page.getByRole("button", { name: "Review permission" }).click();
  await expect(page.getByRole("button", { name: "Install GitHub App" })).toBeEnabled();
});

test("links every HUD metric to visible provenance and filters graph", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: DASHBOARD.metrics.unresolved }).first().click();
  await expect(page.getByTestId("metric-evidence")).toContainText(DASHBOARD.metricEvidence.unresolved[2]);

  await page.getByLabel(DASHBOARD.filters.gradeLabel).selectOption("broken");
  await expect(page.locator("[data-canvas-nodes='3']")).toBeVisible();
  await page.getByPlaceholder(DASHBOARD.search.placeholder).fill("context");
  await expect(page.locator("[data-canvas-nodes='2']")).toBeVisible();

  await page.getByPlaceholder(DASHBOARD.search.placeholder).fill("");
  await page.getByLabel(DASHBOARD.filters.gradeLabel).selectOption("all");
  await expect(page.locator("[data-canvas-nodes='15']")).toBeVisible();

  const evidenceDirectory = path.resolve(".omo/evidence/docshub-product-strategy");
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, "task-12.png");
  await access(evidencePath).catch(async () => page.screenshot({ path: evidencePath, fullPage: true }));
});
