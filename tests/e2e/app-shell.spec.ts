import { expect, test } from "@playwright/test";

import { BRAND, DASHBOARD } from "../../apps/web/lib/strings";

test("opens the Arr app shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("2klips/specproof-app").first()).toBeVisible();
  await expect(page.getByRole("link", { name: BRAND.homeLabel })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: DASHBOARD.title }),
  ).toBeVisible();
  await expect(page.getByTestId("evidence-graph-canvas")).toBeVisible();
});

test("shows the not-found surface for an unknown route", async ({ page }) => {
  const response = await page.goto("/route-that-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nothing here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to app shell" }),
  ).toBeVisible();
});
