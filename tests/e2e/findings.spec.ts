import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { ASSURANCE } from "../../apps/web/lib/strings";

test("walks a seeded finding through fetched source, evidence, and verified receipt", async ({ page }) => {
  await page.goto("/findings");
  await expect(page.getByRole("heading", { name: ASSURANCE.findings.title })).toBeVisible();
  await expect(page.locator("[data-source-state='fetched']")).toContainText("exact analyzed commit");
  await expect(page.getByRole("heading", { name: ASSURANCE.findings.chain.title })).toBeVisible();
  await expect(page.locator(".evidence-chain .grade-badge.inferred")).toBeVisible();

  await page.getByLabel(ASSURANCE.findings.typeLabel).selectOption("missing-test");
  await page.getByLabel(ASSURANCE.findings.severityLabel).selectOption("high");
  await expect(page.locator(".finding-row")).toHaveCount(1);

  const evidenceDirectory = path.resolve(".omo/evidence/docshub-product-strategy");
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, "task-13.png");
  await access(evidencePath).catch(async () => page.screenshot({ path: evidencePath, fullPage: true }));

  await page.getByRole("link", { name: ASSURANCE.findings.action.link }).click();
  await expect(page).toHaveURL(/\/receipts\?receipt=receipt-current/);
  await expect(page.getByTestId("receipt-verdict-locked")).toBeVisible();
  await page.getByRole("button", { name: ASSURANCE.receipts.verifyAction }).click();
  await expect(page.getByText(ASSURANCE.receipts.verification.verified)).toBeVisible();
  await expect(page.getByTestId("receipt-verdict")).toContainText(ASSURANCE.receipts.verdict.counts(3, 1));
});

test("flags a tampered receipt and never unlocks its verdict", async ({ page }) => {
  await page.goto("/receipts?receipt=receipt-tampered");
  await page.getByRole("button", { name: ASSURANCE.receipts.verifyAction }).click();

  await expect(page.getByText(ASSURANCE.receipts.verification.tampered)).toBeVisible();
  await expect(page.getByTestId("receipt-verdict-locked")).toBeVisible();
  await expect(page.getByTestId("receipt-verdict")).toHaveCount(0);
});

test("shows labeled lint cost assumptions and contradiction dual spans", async ({ page }) => {
  await page.goto("/lint");

  await expect(page.getByRole("heading", { name: ASSURANCE.lint.title })).toBeVisible();
  await expect(page.getByText(/cl100k_base-compatible tokenizer/)).toBeVisible();
  await expect(page.getByText("AGENTS.md:18-20")).toBeVisible();
  await expect(page.getByText("apps/web/AGENTS.md:7-9")).toBeVisible();
  await expect(page.locator(".contradiction-block .grade-badge.inferred")).toBeVisible();
});
