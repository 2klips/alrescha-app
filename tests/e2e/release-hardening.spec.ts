import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("fresh user completes the seeded demo repository journey", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Try seeded demo" }).click();
  await expect(page.getByText("fixtures/drifted-demo")).toBeVisible();
  await page.getByRole("button", { name: /specproof\/drifted-demo/ }).click();
  await expect(page.getByRole("heading", { name: "Building proof spine" })).toBeVisible();
  await page.getByRole("button", { name: "Open evidence graph" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "specproof/drifted-demo" })).toBeVisible();
  await expect(page.getByTestId("evidence-graph-canvas")).toBeVisible();
});

test("revoked GitHub installation preserves evidence and gives recovery guidance", async ({ page }) => {
  await page.goto("/?state=revoked");
  await expect(page.getByRole("heading", { name: "GitHub App disconnected" })).toBeVisible();
  await expect(page.getByText("Stored evidence remains read-only")).toBeVisible();
  await expect(page.getByRole("link", { name: "Reconnect GitHub App" })).toHaveAttribute(
    "href",
    "/app/connect/github",
  );

  const evidenceDirectory = path.resolve(".omo/evidence/docshub-product-strategy");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "task-19.png"),
  });
  await page.getByRole("button", { name: "View stored evidence" }).click();
  await expect(page.getByTestId("evidence-graph-canvas")).toBeVisible();
});
