import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("scripted MCP reads pulse the graph and feed focus follows the newest call", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Replay MCP session" }).click();

  const feed = page.getByRole("feed");
  await expect(feed.getByRole("button")).toHaveCount(5);
  await expect(feed.getByText("private-other-repo.ts")).toHaveCount(0);
  await expect(feed.getByText("revoked-secret.md")).toHaveCount(0);
  await expect(page.locator(".graph-node.pulse, .graph-node.decay").first()).toBeVisible();

  await feed.getByRole("button").first().click();
  await expect(page.getByRole("complementary", { name: "Selected node" })).toContainText("Idempotent webhooks");

  const evidenceDirectory = path.resolve(".omo/evidence/docshub-product-strategy");
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, "task-14.png");
  await access(evidencePath).catch(async () => page.screenshot({ path: evidencePath, fullPage: true }));
});

test("enters a depth-two graph by node double-click and inspects grounded edges", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-node-id='req-auth'] .node-core").dblclick();

  await expect(page).toHaveURL(/\/graph\?node=req-auth/);
  await expect(page.getByRole("region", { name: "Depth-two evidence detail graph" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence neighborhood" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /declares|implements|tests|references/ })).toBeVisible();
  await expect(page.getByText(/Confidence/)).toBeVisible();
  await expect(page.locator(".provenance-card .grade-badge")).toBeVisible();

  await expect(page.locator("[data-canvas-nodes='4']")).toBeVisible();
  await page.getByRole("checkbox", { name: "Show orphan artifacts" }).check();
  await expect(page.locator("[data-canvas-nodes='5']")).toBeVisible();
  await expect(page.getByRole("link", { name: "Related findings" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Source record/ })).toBeVisible();
});

test("renders nonblank local graph pixels at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/graph?node=req-auth");
  const desktopGraph = page.locator(".local-graph-canvas");
  await expect(desktopGraph.getByTestId("evidence-graph-canvas")).toBeVisible();
  const desktopPixels = await desktopGraph.screenshot();
  expect(desktopPixels.byteLength).toBeGreaterThan(20_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileGraph = page.locator(".local-graph-canvas");
  await expect(mobileGraph.getByTestId("evidence-graph-canvas")).toBeVisible();
  const mobilePixels = await mobileGraph.screenshot();
  expect(mobilePixels.byteLength).toBeGreaterThan(8_000);
});
