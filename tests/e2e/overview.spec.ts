import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { OVERVIEW } from "../../apps/web/lib/strings/overview";

/**
 * Phase 2D Wave 1 — the four-zone overview: every zone renders from the demo
 * view models and links to the screen that owns its data.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2d/wave-1");

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

test("all four zones render with derived data", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: OVERVIEW.title }),
  ).toBeVisible();

  // KPI strip — four cards, numbers present.
  const kpis = page.locator(".overview-kpis article");
  await expect(kpis).toHaveCount(4);

  // Zone headers, each with its lead sentence.
  for (const zone of [
    OVERVIEW.graph.title,
    OVERVIEW.todos.title,
    OVERVIEW.agent.title,
    OVERVIEW.brain.title,
  ]) {
    await expect(
      page.getByRole("heading", { level: 2, name: zone }),
    ).toBeVisible();
  }

  // Graph zone: the miniature is an accessible image with a node/edge summary.
  await expect(page.locator(".overview-minimap")).toBeVisible();

  // Todo zone: entries carry status badges from the progress fixtures.
  await expect(
    page.locator(".overview-todo-list li[data-todo-status]").first(),
  ).toBeVisible();

  // Agent zone: MCP tool names render in the feed.
  await expect(page.locator(".overview-agent-list code").first()).toBeVisible();

  // Brain zone: all four areas render with counts.
  await expect(page.locator(".overview-brain-areas li")).toHaveCount(4);

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "overview-dark.png"),
  });
});

test("each zone links to the screen that owns the data", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: OVERVIEW.todos.open }).click();
  await expect(page).toHaveURL(/\/progress/);

  await page.goto("/");
  await page.getByRole("link", { name: OVERVIEW.brain.open }).click();
  await expect(page).toHaveURL(/\/graph/);

  await page.goto("/");
  await page.getByRole("link", { name: OVERVIEW.graph.open }).click();
  await expect(page).toHaveURL(/\/map$/);
});
