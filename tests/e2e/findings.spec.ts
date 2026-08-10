import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("walks a seeded finding through fetched source, evidence, and verified receipt", async ({ page }) => {
  await page.goto("/findings");
  await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
  await expect(page.locator("[data-source-state='fetched']")).toContainText("exact analyzed commit");
  await expect(page.getByRole("heading", { name: "Evidence chain" })).toBeVisible();
  await expect(page.locator(".evidence-chain .grade-badge.inferred")).toBeVisible();

  await page.getByLabel("Finding type").selectOption("missing-test");
  await page.getByLabel("Severity").selectOption("high");
  await expect(page.locator(".finding-row")).toHaveCount(1);

  const evidenceDirectory = path.resolve(".omo/evidence/docshub-product-strategy");
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, "task-13.png");
  await access(evidencePath).catch(async () => page.screenshot({ path: evidencePath, fullPage: true }));

  await page.getByRole("link", { name: "Inspect linked receipt" }).click();
  await expect(page).toHaveURL(/\/receipts\?receipt=receipt-current/);
  await expect(page.getByTestId("receipt-verdict-locked")).toBeVisible();
  await page.getByRole("button", { name: "Verify receipt digest" }).click();
  await expect(page.getByText("Digest verified")).toBeVisible();
  await expect(page.getByTestId("receipt-verdict")).toContainText("3 verified · 1 inferred");
});

test("flags a tampered receipt and never unlocks its verdict", async ({ page }) => {
  await page.goto("/receipts?receipt=receipt-tampered");
  await page.getByRole("button", { name: "Verify receipt digest" }).click();

  await expect(page.getByText("Tamper detected")).toBeVisible();
  await expect(page.getByTestId("receipt-verdict-locked")).toBeVisible();
  await expect(page.getByTestId("receipt-verdict")).toHaveCount(0);
});

test("shows labeled lint cost assumptions and contradiction dual spans", async ({ page }) => {
  await page.goto("/lint");

  await expect(page.getByRole("heading", { name: "Instruction lint" })).toBeVisible();
  await expect(page.getByText(/cl100k_base-compatible tokenizer/)).toBeVisible();
  await expect(page.getByText("AGENTS.md:18-20")).toBeVisible();
  await expect(page.getByText("apps/web/AGENTS.md:7-9")).toBeVisible();
  await expect(page.locator(".contradiction-block .grade-badge.inferred")).toBeVisible();
});
