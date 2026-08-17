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

  const list = page
    .getByRole("list")
    .filter({ has: page.locator(".commit-card") });
  await expect(page.locator(".commit-card")).toHaveCount(6);
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

  // Completed *analyzed* commit → duration, findings delta, and a resolving
  // receipt link. A graph-only ingest also completes, so the selector names
  // the assurance scope rather than relying on list order (ADR-015).
  await page
    .locator(
      '.commit-card[data-card-status="completed"][data-assurance="full"]',
    )
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

test("a graph-only ingest says why it has no receipt (ADR-015)", async ({
  page,
}) => {
  await page.goto("/commits?run=run-local-01");

  const card = page.locator('.commit-card[data-assurance="graph-only"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".commit-assurance-badge")).toHaveText(
    COMMITS.card.graphOnlyBadge,
  );

  // The detail states the scope, the absent receipt, and the way to open it.
  const detail = page.locator(".commit-detail");
  await expect(detail).toContainText(
    COMMITS.detail.assuranceScopes["graph-only"],
  );
  await expect(detail).toContainText(COMMITS.detail.graphOnlyReceipt);
  await expect(detail.locator(".commit-receipt-link")).toHaveCount(0);
  await expect(detail.locator(".commit-assurance-upgrade")).toHaveAttribute(
    "href",
    "/onboarding",
  );

  // Every other card keeps full assurance — the badge is not decoration.
  await page.goto("/commits");
  await expect(page.locator('.commit-card[data-assurance="full"]')).toHaveCount(
    5,
  );
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
