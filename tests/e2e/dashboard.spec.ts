import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

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
  await expect(page.getByText("CI evidence · 78 tests verified at bad0551")).toBeVisible();
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
  await page.getByRole("button", { name: /Unresolved/ }).click();
  await expect(page.getByTestId("metric-evidence")).toContainText("Source: latest deterministic analysis");

  await page.getByLabel("Evidence grade").selectOption("broken");
  await expect(page.locator("[data-canvas-nodes='3']")).toBeVisible();
  await page.getByPlaceholder("Search nodes, paths…").fill("context");
  await expect(page.locator("[data-canvas-nodes='2']")).toBeVisible();

  await page.getByPlaceholder("Search nodes, paths…").fill("");
  await page.getByLabel("Evidence grade").selectOption("all");
  await expect(page.locator("[data-canvas-nodes='15']")).toBeVisible();

  const evidenceDirectory = path.resolve(".omo/evidence/docshub-product-strategy");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDirectory, "task-12.png"), fullPage: true });
});
