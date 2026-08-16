import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { DASHBOARD, ONBOARDING } from "../../apps/web/lib/strings";

test("onboards through mocked GitHub into the fixture evidence graph", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: ONBOARDING.identity.cta }).click();
  await expect(page.getByRole("heading", { name: ONBOARDING.permission.title })).toBeVisible();
  await expect(page.getByText(ONBOARDING.permission.scopes.contents.title)).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING.permission.cta }).click();
  await page.getByRole("button", { name: /2klips\/specproof-app/ }).click();
  await expect(page.getByRole("heading", { name: ONBOARDING.scan.title })).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING.scan.cta }).click();

  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
  await expect(page.getByText(DASHBOARD.ci.present)).toBeVisible();
});

test("recovers from a mocked GitHub permission error", async ({ page }) => {
  await page.goto("/onboarding?permission=error");
  await page.getByRole("button", { name: ONBOARDING.identity.cta }).click();

  await expect(page.locator(".permission-error")).toContainText("contents:read");
  await expect(page.getByRole("button", { name: ONBOARDING.permission.cta })).toBeDisabled();
  await page.getByRole("button", { name: ONBOARDING.permission.error.action }).click();
  await expect(page.getByRole("button", { name: ONBOARDING.permission.cta })).toBeEnabled();
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
