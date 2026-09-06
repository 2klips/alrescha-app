import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { HARNESS, STATS } from "../../apps/web/lib/strings";
import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * Phase 4 Wave E todo 24 — the two surfaces that print numbers about numbers.
 *
 * The acceptance criterion is a two-theme axe pass, and the reason it is worth
 * a spec of its own is that both screens are mostly *type*: a table of counts
 * and three cards whose whole job is to be read correctly. A contrast failure
 * on either is a failure to communicate the one thing they exist for.
 *
 * The assertions beside the audit are the copy guarantees the view-model tests
 * cannot see once the page is rendered: the tokenizer assumption is on screen,
 * the demo page says it is a demo, and the benchmark caveat travels with the
 * benchmark link.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-24");
const THEMES = ["dark", "light"] as const;

test.use({ colorScheme: "dark" });

async function themeOf(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

async function auditContrast(
  page: Page,
  surface: string,
  route: string,
  theme: (typeof THEMES)[number],
): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  await page.addInitScript(
    ([key, value]: readonly string[]) =>
      window.localStorage.setItem(key as string, value as string),
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.goto(route);
  expect(new URL(page.url()).pathname).toBe(
    new URL(route, "http://127.0.0.1").pathname,
  );
  await expect.poll(() => themeOf(page)).toBe(theme);
  await page.waitForTimeout(500);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2aa", "wcag21aa"])
    .withRules(["color-contrast"])
    .exclude("canvas")
    .analyze();

  await writeFile(
    path.join(EVIDENCE, `axe-contrast-${surface}-${theme}.json`),
    `${JSON.stringify(
      {
        route,
        theme,
        violationCount: results.violations.length,
        violations: results.violations.map(({ nodes }) =>
          nodes.map((node) => node.html.slice(0, 220)),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  expect(results.violations, `${surface} (${theme}) contrast`).toEqual([]);
}

for (const theme of THEMES) {
  test(`the harness cost table passes contrast in ${theme}`, async ({
    context,
    page,
  }) => {
    const user = await createWorkspaceUser("cost");
    try {
      await signIn(context, user);
      await auditContrast(page, "app-harness", "/app/harness", theme);
    } finally {
      await deleteWorkspaceUser(user.userId);
    }
  });

  test(`the stats cards pass contrast in ${theme}`, async ({
    context,
    page,
  }) => {
    const user = await createWorkspaceUser("stats");
    try {
      await signIn(context, user);
      await auditContrast(page, "app-stats", "/app/stats", theme);
    } finally {
      await deleteWorkspaceUser(user.userId);
    }
  });
}

test("the demo harness says it is a demo, above its numbers", async ({
  page,
}) => {
  await page.goto("/harness");

  const badge = page.getByText(HARNESS.demo.badge, { exact: true });
  await expect(badge).toBeVisible();
  await expect(page.getByText(HARNESS.demo.costNote)).toBeVisible();
  // The label is above the table, not a footnote under it: a reader who
  // stops at the first number has already been told what kind it is.
  const table = page.locator(".harness-cost-table");
  await expect(table).toBeVisible();
  const [badgeBox, tableBox] = await Promise.all([
    badge.boundingBox(),
    table.boundingBox(),
  ]);
  expect(badgeBox?.y ?? 0).toBeLessThan(tableBox?.y ?? 0);
});

test("the demo cost table states the tokenizer assumption", async ({
  page,
}) => {
  await page.goto("/harness");

  await expect(page.getByText(HARNESS.cost.assumption(4))).toBeVisible();
  await expect(
    page.getByRole("region", { name: HARNESS.cost.aria }),
  ).toContainText(HARNESS.cost.totals.always);
  // The Cursor rule's frontmatter is unreadable from stored metadata, and
  // the table says so rather than counting it as always-loaded.
  await expect(
    page.getByRole("region", { name: HARNESS.cost.aria }),
  ).toContainText(HARNESS.cost.modes.unknown);
});

test("the stats page carries the benchmark caveat beside the link", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("caveat");
  try {
    await signIn(context, user);
    await page.goto("/app/stats");
    // A fresh workspace has not consented, so the caveat lives one click in.
    await page.getByRole("button", { name: STATS.consent.enable }).click();
    await expect(page.getByLabel(STATS.filter.label)).toBeVisible();
    await page.getByText(STATS.methodology.summary).click();
    await expect(
      page.getByText(STATS.methodology.benchmarkCaveat),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: STATS.methodology.benchmarkLink }),
    ).toBeVisible();
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
