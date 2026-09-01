import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DASHBOARD, SHELL } from "../../apps/web/lib/strings";

/**
 * Phase 2A todo 7 — the Ink & Seal HUD over the full-bleed brain map.
 *
 * Two obligations from the plan: every HUD number still reaches its evidence,
 * and the whole surface is themed from tokens in both themes. The screenshots
 * are the todo's evidence artefact; the assertions around them are what makes
 * this a test rather than a screenshot script.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2a/task-7");

// Pin the OS hint so these cases exercise the product default, not first-visit.
test.use({ colorScheme: "dark" });

const METRICS = [
  ["unresolved", DASHBOARD.metrics.unresolved],
  ["implementation", DASHBOARD.metrics.implementation],
  ["tests", DASHBOARD.metrics.tests],
  ["tokens", DASHBOARD.metrics.tokens],
] as const;

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (property) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(property)
        .trim(),
    name,
  );
}

test("every HUD metric opens its own provenance", async ({ page }) => {
  await page.goto("/map");

  for (const [key, label] of METRICS) {
    await page.getByRole("button", { name: label }).first().click();
    const panel = page.getByTestId("metric-evidence");
    // Each metric names its source; a number that cannot be traced to evidence
    // must not be on the HUD at all (WORK_SPEC §5.2-①).
    await expect(panel).toContainText(DASHBOARD.metricEvidence[key][0]);
    await expect(panel).toContainText(DASHBOARD.metricEvidence[key][2]);
    await page
      .getByRole("button", { name: DASHBOARD.metricEvidenceClose })
      .click();
    await expect(panel).toHaveCount(0);
  }
});

test("the tabs and command palette reach product surfaces", async ({
  page,
}) => {
  await page.goto("/map");

  // F2 keeps primary repository surfaces visible as tabs. Less-frequent
  // routes remain keyboard-reachable through the dependency-free palette.
  await expect(page.getByRole("link", { name: "저장된 증거" })).toHaveAttribute(
    "href",
    "/library",
  );
  await page.getByRole("button", { name: SHELL.global.search }).click();
  await expect(
    page.getByRole("option", { name: /에이전트 지시문/ }),
  ).toBeVisible();
});

test("the HUD is token-themed in dark and light, and captures evidence", async ({
  page,
}) => {
  await mkdir(EVIDENCE, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/map");
  await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
  await page.waitForTimeout(2_000);

  const workspaceBackground = () =>
    page
      .locator(".graph-workspace")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

  const darkBackground = await token(page, "--bg-default");
  const darkWorkspace = await workspaceBackground();
  await page.screenshot({ path: path.join(EVIDENCE, "dashboard-dark.png") });

  await page
    .getByRole("tab", { name: DASHBOARD.inspector.tabs.activity })
    .click();
  await page.getByRole("button", { name: DASHBOARD.activity.replay }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("brain-map-stage")
          .getAttribute("data-glow-active"),
      ),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "dashboard-dark-glow.png"),
  });

  await page.locator("[data-theme-toggle]").first().click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    )
    .toBe("light");
  await page.waitForTimeout(800);

  const lightBackground = await token(page, "--bg-default");
  expect(lightBackground).not.toBe(darkBackground);
  expect(await workspaceBackground()).not.toBe(darkWorkspace);
  await page.screenshot({
    path: path.join(EVIDENCE, "dashboard-light-glow.png"),
  });

  await page.reload();
  await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: path.join(EVIDENCE, "dashboard-light.png") });

  // Blocked states are HUD surfaces too and must be themed, not bare.
  await page.goto("/map?state=scanning");
  await expect(page.getByText(DASHBOARD.states.scanning.title)).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "dashboard-light-scanning.png"),
  });
});

test("narrow viewports stack the HUD instead of floating it", async ({
  page,
}) => {
  test.skip(true, "Alrescha F6는 데스크톱 전용이며 모바일 UI는 후속 범위다.");
  await mkdir(EVIDENCE, { recursive: true });
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/map");
  await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
  await page.waitForTimeout(1_200);

  // The force HUD is hidden where there is no room to float it.
  await expect(page.getByTestId("graph-force-panel")).toBeHidden();
  await expect(page.locator(".arr-metrics-mobile")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "dashboard-dark-mobile.png"),
  });
});
