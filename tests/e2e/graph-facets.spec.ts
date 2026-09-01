import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { DASHBOARD } from "../../apps/web/lib/strings/dashboard";

/**
 * Phase 2D todo 5 — the graph's Data Brain facet controls: area chips filter
 * the map, and group mode swaps the force graph for banded areas.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2d/todo-5");

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

test("area chips filter the map and report their counts", async ({ page }) => {
  await page.goto("/map");

  const chips = page.locator(".arr-area-chip");
  // One chip per area plus "전체 영역".
  await expect(chips).toHaveCount(5);
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");

  const hits = page.locator('[data-testid="brain-map-hits"] [data-node-id]');
  await expect.poll(() => hits.count()).toBeGreaterThan(0);
  const total = await hits.count();

  const frontend = page.locator('.arr-area-chip[data-area="frontend"]');
  await expect(frontend.locator("small")).not.toBeEmpty();
  await frontend.click();

  await expect(frontend).toHaveAttribute("aria-pressed", "true");
  await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => hits.count()).toBeLessThan(total);

  // Back to everything — the chip row is a filter, not a one-way door.
  await chips.first().click();
  await expect.poll(() => hits.count()).toBe(total);
});

test("group mode shows one labelled band per area", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/map");

  const toggle = page.getByTestId("graph-group-mode");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("brain-map-hits")).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // The force graph steps aside; bands take over.
  const bands = page.locator(".facet-band");
  await expect(page.getByTestId("facet-bands")).toBeVisible();
  await expect(page.getByTestId("brain-map-hits")).toHaveCount(0);
  await expect(bands).toHaveCount(4);
  for (const area of ["frontend", "backend", "docs", "tests"] as const) {
    await expect(
      page.locator(`.facet-band[data-area="${area}"]`),
    ).toContainText(DASHBOARD.filters.areas[area]);
  }

  // Every node sits in a band, and cross-area links stay visible.
  await expect(page.locator(".facet-band-node").first()).toBeVisible();
  await expect(
    page.locator('.facet-band-edge[data-cross-area="true"]').first(),
  ).toBeAttached();

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "graph-group-mode.png"),
  });

  // Chips still narrow the banded view.
  await page.locator('.arr-area-chip[data-area="docs"]').click();
  await expect(page.locator(".facet-band")).toHaveCount(1);
});
