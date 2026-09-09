import { expect, test } from "@playwright/test";

import { BRAND, DASHBOARD, NOT_FOUND } from "../../apps/web/lib/strings";

test("opens the Alrescha repository shell", async ({ page }) => {
  await page.goto("/map");

  await expect(page.getByText("2klips/alrescha-app").first()).toBeVisible();
  await expect(page.getByRole("link", { name: BRAND.homeLabel })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: DASHBOARD.title }),
  ).toBeVisible();
  // The dashboard renders the WebGL brain map (Phase 2A todo 7). So does the
  // evidence-detail route now — Phase 4 Wave B todo 14 retired the SVG
  // renderer that used to own it, so this is the product's one stage.
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
});

test("shows the not-found surface for an unknown route", async ({ page }) => {
  const response = await page.goto("/route-that-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: NOT_FOUND.title }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: NOT_FOUND.cta })).toBeVisible();
});
