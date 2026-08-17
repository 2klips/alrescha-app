import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { COMMITS } from "../../apps/web/lib/strings/commits";

/**
 * Phase 2B todo 2 — the per-commit analysis card journey (list → detail),
 * running against the demo fixtures like every other public screen.
 * The screenshots are the todo's evidence artefact.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2b/todo-2");

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

test("the card list shows every status and opens each detail", async ({
  page,
}) => {
  await page.goto("/commits");

  const list = page.getByRole("list").filter({ has: page.locator(".commit-card") });
  await expect(page.locator(".commit-card")).toHaveCount(5);
  for (const status of ["pending", "analyzing", "failed", "completed"]) {
    await expect(
      page.locator(`.commit-card[data-card-status="${status}"]`).first(),
    ).toBeVisible();
  }
  await expect(list.first()).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "commit-cards-list.png"),
  });

  // Failed commit → the stored worker error is shown verbatim.
  await page.locator('.commit-card[data-card-status="failed"]').click();
  const failure = page.getByTestId("commit-failure");
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(COMMITS.detail.failureLabel);
  await expect(failure.locator("code")).toHaveText("worker lease expired");
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "commit-cards-failed-detail.png"),
  });

  // Completed commit → duration, findings delta, and a resolving receipt link.
  await page
    .locator('.commit-card[data-card-status="completed"]')
    .first()
    .click();
  const detail = page.locator(".commit-detail");
  await expect(detail).toContainText(COMMITS.card.delta(3, 1));
  await expect(detail).toContainText(COMMITS.card.openTotal(7));
  const receiptLink = detail.locator(".commit-receipt-link");
  await expect(receiptLink).toHaveAttribute(
    "href",
    "/receipts?receipt=receipt-current",
  );
  await receiptLink.click();
  await expect(page).toHaveURL(/\/receipts\?receipt=receipt-current/);
});

test("a pending commit shows absence, not fabricated numbers", async ({
  page,
}) => {
  await page.goto("/commits?run=run-05");
  const detail = page.locator(".commit-detail");
  await expect(detail).toContainText(COMMITS.statuses.pending);
  await expect(detail).toContainText(COMMITS.card.durationNotMeasured);
  await expect(detail).toContainText(COMMITS.card.deltaPending);
});

test("the empty state explains how the first card appears", async ({
  page,
}) => {
  await page.goto("/commits?state=empty");
  await expect(page.locator(".empty-list")).toContainText(
    COMMITS.list.empty.title,
  );
  await expect(page.locator(".commit-card")).toHaveCount(0);
});
