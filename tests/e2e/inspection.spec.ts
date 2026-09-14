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
    "inspection-risk",
    "inspection-findings",
    "inspection-dismissed",
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

  // A dismissal stays visible with its reason (todo 19 ⑷), and the stored
  // detail of a finding is on the screen (⑶).
  const dismissed = page.getByTestId("inspection-dismissed");
  await expect(dismissed).toContainText(INSPECTION.dismissed.reasonLabel);
  await expect(dismissed).toContainText(
    "운영 런북은 코드와 링크하지 않기로 했습니다",
  );
  await expect(page.getByTestId("inspection-findings")).toContainText(
    "docs/auth.md:12",
  );

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
    documents.locator(".status-badge.inferred").first(),
  ).toBeVisible();
  await expect(documents).toContainText(INSPECTION.documents.summaryMissing);
  await expect(documents).toContainText(
    INSPECTION.documents.freshness["drift-suspected"],
  );
});

/**
 * The risk widget (Phase 4 Wave D todo 21). The screen could say how many
 * findings were open; it could not answer the question somebody opens it
 * with — what should I look at first.
 */
test("the risk map ranks files, states its reasons, and greys what nobody measured", async ({
  page,
}) => {
  await page.goto("/inspection");
  const risk = page.getByTestId("inspection-risk");
  const entries = risk.locator(".inspection-risk-entry");

  await expect(entries.first()).toBeVisible();
  const scores = await entries.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-score"))),
  );
  expect([...scores].sort((a, b) => b - a)).toEqual(scores);

  // Every entry names at least one reason. A rank with no reasons is an
  // opinion with a decimal point.
  for (let index = 0; index < scores.length; index += 1) {
    await expect(
      entries.nth(index).locator(".inspection-risk-factor"),
    ).not.toHaveCount(0);
  }
  // Never a verdict — none of these signals is execution evidence (ADR-001).
  await expect(risk.locator(".status-badge.inferred").first()).toBeVisible();
  await expect(risk.locator(".status-badge.verified")).toHaveCount(0);
  // Absence is grey, not zero: no coverage report has been read.
  await expect(risk.locator(".inspection-unmeasured")).toContainText(
    INSPECTION.risk.unmeasured.coverage,
  );
  await expect(risk).toContainText(
    INSPECTION.risk.showing(scores.length, scores.length),
  );
});

test("the empty state says 증거 부족 in every widget, fabricating nothing", async ({
  page,
}) => {
  await page.goto("/inspection?state=empty");
  await expect(page.locator(".inspection-insufficient")).toHaveCount(7);
  // Nothing to rank reads as 증거 부족, never as an empty ranked list.
  await expect(
    page.getByTestId("inspection-risk").locator(".inspection-risk-entry"),
  ).toHaveCount(0);
  await expect(page.locator(".inspection-main")).not.toContainText("0%");
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "inspection-empty.png"),
  });
});
