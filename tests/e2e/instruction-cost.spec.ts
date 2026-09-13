import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { HARNESS, STATS } from "../../apps/web/lib/strings";
import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { CHARS_PER_TOKEN, scanRepository } from "../../packages/core/src/index";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  optionalEnv,
  serviceRoleClient,
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

/**
 * Enough served calls for the "measured" card to have a headline.
 *
 * A brand-new workspace has none, and the screen is right to show its empty
 * state — which is why the first version of this test found the empty state
 * instead of the caveat. Seeded through the service role because no UI
 * creates access events; the rows are the ones the MCP server writes.
 */
async function seedServedCalls(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const admin = serviceRoleClient();
  const tokenId = "01K900000000000000000000E2";
  // Crockford base32: no I, L, O or U, which is why this is not `toString(36)`.
  const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const token = await admin.from("mcp_tokens").insert({
    created_by: userId,
    id: tokenId,
    token_hash: `e2e-${workspaceId}`,
    token_prefix: "sp_e2e0",
    workspace_id: workspaceId,
  });
  expect(token.error?.message ?? null).toBeNull();
  const events = await admin.from("access_events").insert(
    Array.from({ length: 24 }, (_unused, index) => ({
      id: `01K9000000000000000000000${CROCKFORD[index]}`,
      response_chars: 400 + index,
      token_id: tokenId,
      tool: "search_index",
      workspace_id: workspaceId,
    })),
  );
  expect(events.error?.message ?? null).toBeNull();
}

test("the stats page carries the benchmark caveat beside the link", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("caveat");
  try {
    await signIn(context, user);
    await page.goto("/app/stats");
    // Consent first: nothing is collected or shown before it (ADR-011).
    await page.getByRole("button", { name: STATS.consent.enable }).click();
    // The button submits a server action, and the click resolves as soon as it
    // is dispatched. Wait for the gate to be gone before reloading: a reload
    // that races the write re-renders `consent-required`, and none of the
    // measured screen below it ever appears.
    await expect(
      page.getByRole("button", { name: STATS.consent.enable }),
    ).toBeHidden();
    await seedServedCalls(user.workspaceId, user.userId);
    await page.reload();

    await expect(
      page.getByLabel(STATS.filter.label, { exact: true }),
    ).toBeVisible();
    // The measured card has a headline; the two without evidence say so
    // instead of showing a thin number.
    await expect(page.getByText(STATS.served.label)).toBeVisible();
    await expect(page.getByText(STATS.cards.insufficient(0, 5))).toBeVisible();

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

/**
 * The live table against this repository's own scan (todo 24's second
 * acceptance criterion: "실레포 표 합계가 size_bytes와 ±10% 정합").
 *
 * The repository root is scanned through the CLI's local source and stored
 * through `apply_repository_scan` — the same rows a push would leave — and
 * the screen's table is read back cell by cell. Two agreements are
 * asserted: the byte column is the stored `size_bytes`, row for row, and
 * the token column is those bytes at the stated ratio within ±10%.
 *
 * The scan is applied over a direct Postgres connection, as the worker
 * applies one: this repository is ~1,260 nodes and ~4,000 edges, and one
 * call of that size through PostgREST runs into the API's statement
 * timeout under a parallel suite. The rows are the same either way — the
 * function is the single persistence path (ADR-013).
 */
test("the live cost table agrees with the stored bytes of this repository's scan (±10%)", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const user = await createWorkspaceUser("cost-live");
  try {
    await signIn(context, user);
    const admin = serviceRoleClient();
    const repository = await admin.rpc("ensure_local_repository", {
      target_workspace_id: user.workspaceId,
      target_full_name: "local/alrescha-app",
    });
    expect(repository.error?.message ?? null).toBeNull();
    const plan = await test.step("scan this checkout", async () => {
      const { commitSha, source } = await createLocalRepositorySource(
        path.resolve("."),
      );
      return scanRepository({ commitSha, source });
    });
    await test.step("apply the scan over a direct connection", async () => {
      const databaseUrl = optionalEnv("DATABASE_URL");
      expect(databaseUrl, "DATABASE_URL in apps/web/.env.local").toBeTruthy();
      const sql = postgres(databaseUrl!, { max: 1, prepare: false });
      try {
        const applied = await sql<{ touched: number }[]>`
          select public.apply_repository_scan(
            ${user.workspaceId},
            ${String(repository.data)},
            ${sql.json(plan as unknown as postgres.JSONValue)}::jsonb
          ) as touched
        `;
        expect(Number(applied[0]?.touched ?? 0)).toBeGreaterThan(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });

    const stored = await admin
      .from("artifacts")
      .select("path,size_bytes")
      .eq("workspace_id", user.workspaceId)
      .eq("kind", "instruction")
      .order("path");
    expect(stored.error?.message ?? null).toBeNull();
    const storedRows = (stored.data ?? []) as {
      path: string;
      size_bytes: number;
    }[];
    expect(storedRows.length).toBeGreaterThan(0);
    expect(storedRows.map(({ path: file }) => file)).toContain("AGENTS.md");

    await page.goto("/app/harness");
    const table = page.locator(".harness-cost-table");
    await expect(table).toBeVisible();
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(storedRows.length);

    const number = (text: string) => Number(text.replaceAll(",", ""));
    const shown = new Map<string, { bytes: number; tokens: number }>();
    for (const row of await rows.all()) {
      const file = await row.locator("th code").innerText();
      const cells = row.locator("td");
      shown.set(file, {
        bytes: number(await cells.nth(2).innerText()),
        tokens: number(await cells.nth(3).innerText()),
      });
    }
    // Row for row: the byte cell is the stored size, nothing rounded.
    for (const { path: file, size_bytes } of storedRows) {
      expect(shown.get(file)?.bytes, file).toBe(size_bytes);
    }
    const bytes = storedRows.reduce((sum, row) => sum + row.size_bytes, 0);
    const tokens = [...shown.values()].reduce(
      (sum, row) => sum + row.tokens,
      0,
    );
    expect(
      Math.abs(tokens - bytes / CHARS_PER_TOKEN) / (bytes / CHARS_PER_TOKEN),
    ).toBeLessThanOrEqual(0.1);

    // The always-loaded footer: its own bytes and tokens, the same ratio.
    const always = table.locator("tfoot tr").first().locator("td");
    const alwaysBytes = number(await always.nth(1).innerText());
    const alwaysTokens = number(await always.nth(2).innerText());
    expect(alwaysTokens).toBeGreaterThan(0);
    expect(
      Math.abs(alwaysTokens - alwaysBytes / CHARS_PER_TOKEN) /
        (alwaysBytes / CHARS_PER_TOKEN),
    ).toBeLessThanOrEqual(0.1);

    await writeFile(
      path.join(EVIDENCE, "live-cost-table.json"),
      `${JSON.stringify(
        {
          alwaysBytes,
          alwaysTokens,
          charsPerToken: CHARS_PER_TOKEN,
          drift:
            Math.abs(tokens - bytes / CHARS_PER_TOKEN) /
            (bytes / CHARS_PER_TOKEN),
          files: storedRows.length,
          repository: "2klips/alrescha-app (local scan of the checkout)",
          storedBytes: bytes,
          tableTokens: tokens,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
