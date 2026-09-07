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

/**
 * Phase 4 Wave B todo 9 — the camera, in a real browser.
 *
 * The unit suite proves the arithmetic; these prove it is wired to the
 * gestures. The invariant a viewer actually feels is the one asserted: what
 * you point at stays where it is.
 */

/** The page-space centre of a node's hit target, or null when it has none. */
async function nodeCentre(page: Page, index: number) {
  const box = await page
    .locator(".brain-map-hit:not([hidden])")
    .nth(index)
    .boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}

/** Wait until the hit layer stops moving, so a glide is not measured mid-flight. */
async function cameraStill(page: Page) {
  let previous = "";
  await expect
    .poll(
      async () => {
        const current = JSON.stringify([
          await nodeCentre(page, 0),
          await nodeCentre(page, 1),
        ]);
        const stable = current === previous;
        previous = current;
        return stable;
      },
      { intervals: [150, 150, 150, 150, 150, 150, 150, 150], timeout: 8_000 },
    )
    .toBe(true);
}

test("the layout announces that it has settled", async ({ page }) => {
  await page.goto("/map");
  // The worker has always known this and nothing downstream could read it.
  // A browser test waiting on it is the point: no sleeping and hoping.
  await expect(page.locator(STAGE)).toHaveAttribute("data-settled", "true", {
    timeout: 15_000,
  });
});

test("zooming keeps what is under the pointer under the pointer", async ({
  page,
}) => {
  await page.goto("/map");
  await expect(page.locator(STAGE)).toHaveAttribute("data-settled", "true", {
    timeout: 15_000,
  });
  await cameraStill(page);

  const anchor = await nodeCentre(page, 0);
  const other = await nodeCentre(page, 1);
  expect(anchor).not.toBeNull();
  expect(other).not.toBeNull();
  const gapBefore = Math.hypot(
    (other as { x: number }).x - (anchor as { x: number }).x,
    (other as { y: number }).y - (anchor as { y: number }).y,
  );

  for (let step = 0; step < 4; step += 1) {
    await page.locator(".brain-map-viewport").dispatchEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: (anchor as { x: number }).x,
      clientY: (anchor as { y: number }).y,
      deltaY: -120,
    });
  }
  await cameraStill(page);

  const anchorAfter = await nodeCentre(page, 0);
  const otherAfter = await nodeCentre(page, 1);
  // The graph grew — so this is a zoom, not a no-op…
  const gapAfter = Math.hypot(
    (otherAfter as { x: number }).x - (anchorAfter as { x: number }).x,
    (otherAfter as { y: number }).y - (anchorAfter as { y: number }).y,
  );
  expect(gapAfter).toBeGreaterThan(gapBefore * 1.3);
  // …and the node under the pointer did not move. Before todo 9 the camera
  // scaled about the origin, so this node slid away from the cursor by more
  // than its own width on every notch. The tolerance is the hit layer's
  // whole-pixel rounding plus its 10Hz sync, not a fudge factor.
  expect((anchorAfter as { x: number }).x).toBeCloseTo(
    (anchor as { x: number }).x,
    -0.7,
  );
  expect((anchorAfter as { y: number }).y).toBeCloseTo(
    (anchor as { y: number }).y,
    -0.7,
  );
});

test("fit-to-view brings a graph that was panned away back on screen", async ({
  page,
}) => {
  await page.goto("/map");
  await expect(page.locator(STAGE)).toHaveAttribute("data-settled", "true", {
    timeout: 15_000,
  });
  await cameraStill(page);

  const viewport = page.locator(".brain-map-viewport");
  const stage = await viewport.boundingBox();
  expect(stage).not.toBeNull();
  const frame = stage as {
    height: number;
    width: number;
    x: number;
    y: number;
  };

  // Drag the graph most of the way off the screen.
  await page.mouse.move(frame.x + frame.width - 20, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + 20, frame.y + frame.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await cameraStill(page);

  await page.getByTestId("brain-map-fit").click();
  await cameraStill(page);

  // Every reachable node is back inside the viewport, with room to spare.
  const boxes = await page.locator(".brain-map-hit:not([hidden])").all();
  expect(boxes.length).toBeGreaterThan(0);
  for (const target of boxes) {
    const box = await target.boundingBox();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }
});
