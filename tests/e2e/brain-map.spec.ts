import { expect, test, type Page } from "@playwright/test";

import {
  FAR_HUB_LABEL_LIMIT,
  LOD_LEVELS,
  type LodLevel,
} from "../../apps/web/lib/graph/lod";
import { GRAPH_PANEL_STORAGE_KEY } from "../../apps/web/lib/graph/graph-panel-settings";
import { DASHBOARD } from "../../apps/web/lib/strings";

/**
 * Phase 2A todo 7 — the browser half of todos 5 and 6.
 *
 * OQ-005 recorded that the LOD, label, force-panel and glow acceptance criteria
 * could not run in Wave 2 because the Pixi stage was not mounted on a route
 * yet. It is mounted on the dashboard now, so those assertions live here, on
 * the real canvas, against the deterministic vitest suites that already prove
 * the same rules on plain objects.
 */

const STAGE = "[data-testid='brain-map-stage']";

async function lod(page: Page): Promise<LodLevel> {
  return (await page.locator(STAGE).getAttribute("data-lod")) as LodLevel;
}

async function labelCount(page: Page): Promise<number> {
  return Number(await page.locator(STAGE).getAttribute("data-lod-labels"));
}

async function glowActive(page: Page): Promise<number> {
  return Number(await page.locator(STAGE).getAttribute("data-glow-active"));
}

async function openForcePanel(page: Page) {
  await page.getByRole("button", { name: DASHBOARD.forcePanel.open }).click();
  const panel = page.getByTestId("graph-force-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function openActivityTab(page: Page) {
  await page
    .getByRole("tab", { name: DASHBOARD.inspector.tabs.activity })
    .click();
}

/**
 * Wheel over the canvas until the LOD band is reached.
 *
 * The event is dispatched rather than driven through `page.mouse.wheel`: the
 * viewport cancels the wheel to zoom instead of scroll, and Playwright's mouse
 * API waits for a scroll that never happens. This still runs the app's own
 * `wheel` listener, which is the behaviour under test.
 */
async function zoomUntil(page: Page, target: LodLevel, deltaY: number) {
  const viewport = page.locator(".brain-map-viewport");
  for (let step = 0; step < 80; step += 1) {
    if ((await lod(page)) === target) return;
    await viewport.dispatchEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY,
    });
    await page.waitForTimeout(50);
  }
}

test("mounts the WebGL brain map with a reachable node for every fixture node", async ({
  page,
}) => {
  await page.goto("/map");

  const stage = page.locator(STAGE);
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute("data-canvas-nodes", "15");
  await expect(stage).toHaveAccessibleName(DASHBOARD.canvasLabel(15));
  await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
  await expect(
    page.getByTestId("brain-map-hits").locator("[data-node-id]"),
  ).toHaveCount(15);
  expect(LOD_LEVELS).toContain(await lod(page));
});

test("zooming walks the three LOD bands and thins the labels out", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/map");
  await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
  // Wait for the engine's first reported frame; zooming before it lands would
  // measure the pre-simulation default rather than a real band.
  await expect.poll(() => labelCount(page)).toBeGreaterThan(0);

  // Far: hub labels only, capped by the research spec's top-N rule.
  await zoomUntil(page, "far", 240);
  expect(await lod(page)).toBe("far");
  const farLabels = await labelCount(page);
  expect(farLabels).toBeLessThanOrEqual(FAR_HUB_LABEL_LIMIT);

  // Mid: grid-cell selection, which lets more than the hub list through.
  await zoomUntil(page, "mid", -240);
  expect(await lod(page)).toBe("mid");
  // The stage republishes its label count on a throttled tick, so poll rather
  // than read the value that was current at the moment the band flipped.
  await expect.poll(() => labelCount(page)).toBeGreaterThan(farLabels);

  // Near: the band that also turns node status badges on.
  await zoomUntil(page, "near", -240);
  expect(await lod(page)).toBe("near");

  // The settings popover reports the same band as the stage.
  await openForcePanel(page);
  await expect(page.getByTestId("graph-lod-status")).toHaveText(
    DASHBOARD.forcePanel.lodStatus(
      DASHBOARD.forcePanel.lodLevels.near,
      await labelCount(page),
    ),
  );
});

test("force panel values survive a reload", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/map");
  // The panel is server-rendered, so it is visible and fillable *before* React
  // attaches its listeners; an input made in that window is silently discarded
  // when hydration resets the control to its rendered value. Waiting for the
  // Pixi canvas — which only the `dynamic(ssr:false)` renderer can create —
  // proves the client bundle has run before the slider is touched.
  await expect(page.locator(`${STAGE} canvas`)).toBeVisible();
  const panel = await openForcePanel(page);

  const linkDistance = panel.locator("[data-force-key='linkDistance']");
  await linkDistance.fill("140");
  await expect(linkDistance).toHaveValue("140");

  const stored = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    GRAPH_PANEL_STORAGE_KEY,
  );
  expect(stored).toContain("140");

  await page.reload();
  const reloadedPanel = await openForcePanel(page);
  await expect(
    reloadedPanel.locator("[data-force-key='linkDistance']"),
  ).toHaveValue("140");
});

/**
 * F3 replaces floating HUD cards with a grid workspace. Prove the plot and
 * inspector stay in separate columns at every supported desktop width.
 */
for (const viewport of [
  { height: 720, width: 1280 },
  { height: 900, width: 1440 },
  { height: 1080, width: 1920 },
]) {
  test(`workspace panels stay clear at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/map");
    await expect(page.locator(".graph-inspector")).toBeVisible();

    const geometry = await page.evaluate(() => {
      const plot = document
        .querySelector(".graph-plot-column")
        ?.getBoundingClientRect();
      const inspector = document
        .querySelector(".graph-inspector")
        ?.getBoundingClientRect();
      const toolbar = document
        .querySelector(".graph-workspace-toolbar")
        ?.getBoundingClientRect();
      const body = document
        .querySelector(".graph-workspace-body")
        ?.getBoundingClientRect();
      if (!plot || !inspector || !toolbar || !body) return null;
      return {
        bodyTop: body.top,
        inspectorLeft: inspector.left,
        inspectorRight: inspector.right,
        plotLeft: plot.left,
        plotRight: plot.right,
        toolbarBottom: toolbar.bottom,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.plotLeft).toBeGreaterThanOrEqual(0);
    expect(geometry?.plotRight).toBeLessThanOrEqual(geometry!.inspectorLeft);
    expect(geometry?.inspectorRight).toBeLessThanOrEqual(
      geometry!.viewportWidth,
    );
    expect(geometry?.toolbarBottom).toBeLessThanOrEqual(geometry!.bodyTop);
  });
}

test("a scripted MCP burst lights nodes and then fades them out", async ({
  page,
}) => {
  await page.goto("/map");
  await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
  expect(await glowActive(page)).toBe(0);

  await openActivityTab(page);
  await page.getByRole("button", { name: DASHBOARD.activity.replay }).click();
  await expect.poll(() => glowActive(page)).toBeGreaterThan(0);

  // Pulse → decay → afterglow → idle: the lit set empties on its own, with no
  // further input and without the layout being touched.
  await expect.poll(() => glowActive(page), { timeout: 20_000 }).toBe(0);
});

test("a relationship row focuses its connected node", async ({ page }) => {
  await page.goto("/map");

  await page
    .getByRole("tab", { name: DASHBOARD.inspector.tabs.relationships })
    .click();
  const relationship = page.locator(".graph-relationships button").first();
  const targetLabel = await relationship.locator("b").innerText();
  await relationship.click();
  await expect(page.locator(".graph-inspector-head strong")).toHaveText(
    targetLabel,
  );
});

test("remounting the stage ten times leaks no WebGL context", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  page.on("pageerror", (error) => failures.push(error.message));

  for (let round = 0; round < 10; round += 1) {
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(page.locator("canvas.brain-map-canvas")).toBeVisible();
    await page.goto("/findings", { waitUntil: "domcontentloaded" });
    await expect(page.locator("canvas.brain-map-canvas")).toHaveCount(0);
  }

  // Chromium caps live WebGL contexts; a mount that kept its context would
  // start dropping the oldest ones and Pixi would report a lost context.
  expect(
    failures.filter((text) => /webgl|context lost|shader|worker/i.test(text)),
  ).toEqual([]);
});
