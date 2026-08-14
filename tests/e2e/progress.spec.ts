import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("shows sourced metrics, four todo states, and newest-first work", async ({
  page,
}) => {
  await page.goto("/progress");

  await expect(
    page.getByRole("heading", { name: "Partial evidence" }),
  ).toBeVisible();
  await expect(
    page.getByText("Evidence graph requirement coverage"),
  ).toBeVisible();
  await expect(
    page.getByText("TODO/progress checkboxes + log_progress events"),
  ).toBeVisible();
  for (const heading of ["Open", "In progress", "Done", "Blocked"]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  const timelineItems = page.locator(".progress-timeline > li");
  await expect(timelineItems).toHaveCount(5);
  await expect(timelineItems.first()).toContainText(
    "Unlabeled progress metric resolved",
  );

  const evidenceDirectory = path.resolve(
    ".omo/evidence/docshub-product-strategy",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "task-21.png"),
  });
});

test("switches between empty, partial, and fully traced source states", async ({
  page,
}) => {
  await page.goto("/progress");
  await page.getByRole("link", { name: "full", exact: true }).click();
  await expect(page).toHaveURL(/state=full/);
  await expect(
    page.getByRole("heading", { name: "Fully traced" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "empty", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No tracked progress yet" }),
  ).toBeVisible();
  await expect(page.getByText("Not measured")).toHaveCount(2);

  await page.getByRole("link", { name: "partial", exact: true }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(
    page.getByRole("heading", { name: "Partial evidence" }),
  ).toBeVisible();
});
