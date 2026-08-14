import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("saves a harness skill, dedupes its digest, and browses exact provenance", async ({
  page,
}) => {
  await page.goto("/harness");

  await expect(
    page.getByRole("heading", { name: "Save what already works." }),
  ).toBeVisible();
  await expect(page.getByText("specproof/drifted-demo")).toBeVisible();
  await expect(page.getByText("1".repeat(40))).toBeVisible();

  const save = page.getByRole("button", { name: "Save to library" });
  await save.click();
  await expect(page.getByText("Saved immutable snapshot.")).toBeVisible();
  await save.click();
  await expect(
    page.getByText("Already saved — existing digest reused."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Browse library" }).click();
  await expect(page).toHaveURL(/\/library\?saved=1/);
  await expect(
    page.getByRole("heading", { name: "Personal library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review auth" }),
  ).toBeVisible();
  await expect(
    page.getByText(".agents/skills/review-auth/SKILL.md"),
  ).toBeVisible();
  await expect(page.getByText("1".repeat(40))).toBeVisible();

  await page.getByRole("link", { name: "#auth" }).click();
  await expect(page).toHaveURL(/tag=auth/);
  await expect(
    page.getByRole("heading", { name: "Review auth" }),
  ).toBeVisible();
  await page.getByLabel("Search snapshots").fill("authentication");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/query=authentication/);
  await expect(
    page.getByRole("heading", { name: "Review auth" }),
  ).toBeVisible();

  await expect(page.getByText(/import into project/i)).toHaveCount(0);
  await expect(page.getByText(/pull request/i)).toHaveCount(0);

  const evidenceDirectory = path.resolve(
    ".omo/evidence/docshub-product-strategy",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "task-22.png"),
  });
});
