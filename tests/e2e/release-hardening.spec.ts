import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { DASHBOARD, ONBOARDING } from "../../apps/web/lib/strings";

test("fresh user completes the seeded demo repository journey", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: ONBOARDING.identity.demoCta }).click();
  await expect(page.getByText("fixtures/drifted-demo")).toBeVisible();
  await page.getByRole("button", { name: /alrescha\/drifted-demo/ }).click();
  await expect(
    page.getByRole("heading", { name: ONBOARDING.scan.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING.scan.cta }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "alrescha/drifted-demo" }),
  ).toBeVisible();
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
});

test("revoked GitHub installation preserves evidence and gives recovery guidance", async ({
  page,
}) => {
  await page.goto("/map?state=revoked");
  await expect(
    page.getByRole("heading", { name: DASHBOARD.states.revoked.title }),
  ).toBeVisible();
  await expect(page.getByText(DASHBOARD.states.revoked.body)).toBeVisible();
  await expect(
    page.getByRole("link", { name: DASHBOARD.states.revoked.reconnect }),
  ).toHaveAttribute("href", "/app/connect/github");

  const evidenceDirectory = path.resolve(
    ".omo/evidence/docshub-product-strategy",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "task-19.png"),
  });
  await page
    .getByRole("button", { name: DASHBOARD.states.revoked.viewStored })
    .click();
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
});
