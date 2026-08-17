import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { INSPECTION } from "../../apps/web/lib/strings/inspection";

/**
 * Phase 2B todo 8 — the inspection dashboard journey against the demo
 * fixtures. The screenshots are the todo's evidence artefact.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2b/todo-8");

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

test("every widget carries its source label and the audit stays a collector", async ({
  page,
}) => {
  await page.goto("/inspection");

  for (const testId of [
    "inspection-progress",
    "inspection-findings",
    "inspection-documents",
    "inspection-drift",
    "inspection-audit",
    "inspection-ruled-out",
  ]) {
    const widget = page.getByTestId(testId);
    await expect(widget).toBeVisible();
    await expect(widget.locator(".inspection-source")).toContainText(
      INSPECTION.sourcePrefix.trim(),
    );
  }

  const audit = page.getByTestId("inspection-audit");
  await expect(audit).toContainText(INSPECTION.dependencyAudit.note);
  await expect(audit).toContainText(INSPECTION.dependencyAudit.total(2));

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "inspection-busy.png"),
  });
});

test("document summaries render only under the inferred badge", async ({
  page,
}) => {
  await page.goto("/inspection");
  const documents = page.getByTestId("inspection-documents");
  await expect(
    documents.locator(".grade-badge.inferred").first(),
  ).toBeVisible();
  await expect(documents).toContainText(INSPECTION.documents.summaryMissing);
  await expect(documents).toContainText(
    INSPECTION.documents.freshness["drift-suspected"],
  );
});

test("the empty state says 증거 부족 in every widget, fabricating nothing", async ({
  page,
}) => {
  await page.goto("/inspection?state=empty");
  await expect(page.locator(".inspection-insufficient")).toHaveCount(6);
  await expect(page.locator(".inspection-main")).not.toContainText("0%");
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "inspection-empty.png"),
  });
});
