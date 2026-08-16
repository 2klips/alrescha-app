import { expect, test } from "@playwright/test";

import { BRAND, DASHBOARD, NOT_FOUND } from "../../apps/web/lib/strings";

test("opens the Arr app shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("2klips/arr-app").first()).toBeVisible();
  await expect(page.getByRole("link", { name: BRAND.homeLabel })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: DASHBOARD.title }),
  ).toBeVisible();
  // The dashboard renders the WebGL brain map (Phase 2A todo 7); the SVG
  // `evidence-graph-canvas` now exists only on the evidence-detail route.
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
});

test("shows the not-found surface for an unknown route", async ({ page }) => {
  const response = await page.goto("/route-that-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: NOT_FOUND.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: NOT_FOUND.cta }),
  ).toBeVisible();
});
