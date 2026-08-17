import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DASHBOARD, GRAPH } from "../../apps/web/lib/strings";

/**
 * Block until React has hydrated the element behind `selector`.
 *
 * These screens are server-rendered, so their controls are visible, enabled and
 * clickable before any listener is attached. A click landing in that window is
 * accepted by the DOM and then thrown away when React commits its own state —
 * which is how the orphan toggle below could report "checked" while the graph
 * never changed. React tags every hydrated host node with a `__reactFiber$…`
 * property, so its presence is the exact signal, rather than a sleep.
 */
async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target: string) => {
    const element = document.querySelector(target);
    return (
      element !== null &&
      Object.keys(element).some((key) => key.startsWith("__reactFiber$"))
    );
  }, selector);
}

test("scripted MCP reads pulse the graph and feed focus follows the newest call", async ({
  page,
}) => {
  await page.goto("/map");
  await hydrated(page, "[data-testid='brain-map-stage']");
  await page.getByRole("button", { name: DASHBOARD.activity.replay }).click();

  const feed = page.getByRole("feed");
  await expect(feed.getByRole("button")).toHaveCount(5);
  await expect(feed.getByText("private-other-repo.ts")).toHaveCount(0);
  await expect(feed.getByText("revoked-secret.md")).toHaveCount(0);
  // WebGL leaves no per-node DOM to assert on, so the stage publishes how many
  // nodes are currently lit (Phase 2A todo 7 replaces `.graph-node.pulse`).
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("brain-map-stage")
          .getAttribute("data-glow-active"),
      ),
    )
    .toBeGreaterThan(0);

  await feed.getByRole("button").first().click();
  await expect(
    page.getByRole("complementary", { name: DASHBOARD.ariaInspector }),
  ).toContainText("Idempotent webhooks");

  const evidenceDirectory = path.resolve(
    ".omo/evidence/docshub-product-strategy",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, "task-14.png");
  await access(evidencePath).catch(async () =>
    page.screenshot({ path: evidencePath, fullPage: true }),
  );
});

test("enters a depth-two graph by node double-click and inspects grounded edges", async ({
  page,
}) => {
  await page.goto("/map");
  // The brain map's DOM hit layer is the node affordance over the canvas.
  await hydrated(page, "[data-testid='brain-map-hits']");
  await page
    .getByTestId("brain-map-hits")
    .locator("[data-node-id='req-auth']")
    .dblclick();

  await expect(page).toHaveURL(/\/graph\?node=req-auth/);
  await expect(
    page.getByRole("region", { name: GRAPH.regionLabel }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: GRAPH.heading }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /declares|implements|tests|references/ }),
  ).toBeVisible();
  await expect(page.getByText(GRAPH.provenance.confidence)).toBeVisible();
  await expect(page.locator(".provenance-card .grade-badge")).toBeVisible();

  await expect(page.locator("[data-canvas-nodes='4']")).toBeVisible();
  await hydrated(page, "[data-canvas-nodes]");
  await page
    .getByRole("checkbox", { name: GRAPH.inspector.orphanToggleLabel })
    .check();
  await expect(page.locator("[data-canvas-nodes='5']")).toBeVisible();
  await expect(
    page.getByRole("link", { name: GRAPH.footer.relatedFindings }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(GRAPH.footer.sourceRecord) }),
  ).toBeVisible();
});

test("renders nonblank local graph pixels at desktop and mobile sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/graph?node=req-auth");
  const desktopGraph = page.locator(".local-graph-canvas");
  await expect(desktopGraph.getByTestId("evidence-graph-canvas")).toBeVisible();
  const desktopPixels = await desktopGraph.screenshot();
  expect(desktopPixels.byteLength).toBeGreaterThan(20_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileGraph = page.locator(".local-graph-canvas");
  await expect(mobileGraph.getByTestId("evidence-graph-canvas")).toBeVisible();
  const mobilePixels = await mobileGraph.screenshot();
  expect(mobilePixels.byteLength).toBeGreaterThan(8_000);
});
