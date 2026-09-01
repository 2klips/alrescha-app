import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { ACTION } from "../../apps/web/lib/strings/common";
import { HARNESS } from "../../apps/web/lib/strings/harness";
import { LIBRARY } from "../../apps/web/lib/strings/library";

test("saves a harness skill, dedupes its digest, and browses exact provenance", async ({
  page,
}) => {
  await page.goto("/harness");

  await expect(
    page.getByRole("heading", { name: HARNESS.title }),
  ).toBeVisible();
  await expect(page.getByText("arr/drifted-demo")).toBeVisible();
  await expect(page.getByText("1".repeat(40))).toBeVisible();

  const save = page.getByRole("button", { name: HARNESS.card.save });
  await save.click();
  await expect(page.getByText(HARNESS.notices.saved)).toBeVisible();
  await save.click();
  await expect(page.getByText(HARNESS.notices.duplicate)).toBeVisible();

  await page.getByRole("link", { name: HARNESS.card.browseLibrary }).click();
  await expect(page).toHaveURL(/\/library\?saved=1/);
  await expect(
    page.getByRole("heading", { name: LIBRARY.hero.title }),
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
  await page.getByLabel(LIBRARY.filters.searchLabel).fill("authentication");
  // Scoped to the filter form: the global shell palette trigger is also
  // named "검색", so the bare role query is ambiguous since the AppShell pass.
  await page
    .getByLabel(LIBRARY.filters.aria)
    .getByRole("button", { name: ACTION.search })
    .click();
  await expect(page).toHaveURL(/query=authentication/);
  await expect(
    page.getByRole("heading", { name: "Review auth" }),
  ).toBeVisible();

  await expect(
    page.getByText(/import into project|프로젝트로 가져오기|프로젝트에 추가/i),
  ).toHaveCount(0);
  await expect(page.getByText(/pull request|풀 리퀘스트/i)).toHaveCount(0);

  const evidenceDirectory = path.resolve(
    ".omo/evidence/docshub-product-strategy",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "task-22.png"),
  });
});
