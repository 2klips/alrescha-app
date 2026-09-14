import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { GRAPH_PANEL_STORAGE_KEY } from "../../apps/web/lib/graph/graph-panel-settings";
import {
  LAYOUT_STORE_NAME,
  LAYOUT_STORE_VERSION,
} from "../../apps/web/lib/graph/layout-store";
import { DASHBOARD } from "../../apps/web/lib/strings";
import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * Phase 4 Wave B todo 13, the five items that were left — on the workspace
 * map, over a real scan:
 *
 * - the force panel is on `/app/map` and its values persist;
 * - a filter is visibility here too (the layout does not restart);
 * - the `config` layer switches a scanned config file off, and a layer the
 *   graph has nothing for is offered disabled;
 * - the orphan switch hides exactly the nodes with no edge;
 * - a pin outlives a reload;
 * - the layout is saved to IndexedDB on settle and the next visit mounts warm.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const STAGE = "[data-testid='brain-map-stage']";

// The toolbar's controls and the legend fold away under 80rem (the desktop
// track's narrow breakpoint), and Playwright's default viewport is exactly
// that wide. The workspace map's other specs run at 1440 for the same reason.
test.use({ viewport: { height: 900, width: 1440 } });

async function seedScan(workspaceId: string, fullName: string) {
  const service = serviceRoleClient();
  const repository = await service.rpc("ensure_local_repository", {
    target_workspace_id: workspaceId,
    target_full_name: fullName,
  });
  expect(repository.error?.message ?? null).toBeNull();
  const { commitSha, source } = await createLocalRepositorySource(DRIFTED_DEMO);
  const plan = await scanRepository({ commitSha, source });
  const applied = await service.rpc("apply_repository_scan", {
    target_workspace_id: workspaceId,
    target_repository_id: String(repository.data),
    plan,
  });
  expect(applied.error?.message ?? null).toBeNull();
  return { commitSha };
}

async function openMap(page: Page) {
  await page.goto("/app/map");
  const stage = page.locator(STAGE);
  await expect(stage).toBeVisible();
  return stage;
}

async function settled(page: Page) {
  await expect(page.locator(STAGE)).toHaveAttribute("data-settled", "true", {
    timeout: 20_000,
  });
}

async function openForcePanel(page: Page) {
  await page.getByTestId("graph-force-open").click();
  const panel = page.getByTestId("graph-force-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Node ids and edge endpoints as the stage's accessibility layer reports them. */
async function reachable(page: Page) {
  const ids = await page
    .locator(".brain-map-hit")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.nodeId ?? ""),
    );
  const edges = await page
    .locator(`${STAGE} .sr-only button`)
    .evaluateAll((buttons) =>
      buttons.map((button) => button.textContent ?? ""),
    );
  return { edges, ids };
}

test("the force panel is on the workspace map and its values persist", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("panel-map");
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId, "local/panel-map");
    await openMap(page);
    await expect(page.locator(`${STAGE} canvas`)).toBeVisible();

    const panel = await openForcePanel(page);
    const linkDistance = panel.locator("[data-force-key='linkDistance']");
    await linkDistance.fill("140");
    await expect(linkDistance).toHaveValue("140");
    // The new sliders and switches are there too.
    await expect(
      panel.locator("[data-force-key='domainAnchorStrength']"),
    ).toBeVisible();
    await expect(
      panel.locator("[data-display-key='showArrows']"),
    ).toBeVisible();
    await panel.locator("[data-display-key='showArrows']").check();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      GRAPH_PANEL_STORAGE_KEY,
    );
    expect(stored).toContain("140");
    expect(stored).toContain('"showArrows":true');

    await page.reload();
    await expect(page.locator(STAGE)).toBeVisible();
    const reopened = await openForcePanel(page);
    await expect(
      reopened.locator("[data-force-key='linkDistance']"),
    ).toHaveValue("140");
    await expect(
      reopened.locator("[data-display-key='showArrows']"),
    ).toBeChecked();
    // Escape closes it and hands focus back to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("graph-force-panel")).toHaveCount(0);
    await expect(page.getByTestId("graph-force-open")).toBeFocused();
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("filtering the workspace map hides nodes without restarting the layout", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("panel-filter");
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId, "local/panel-filter");
    const stage = await openMap(page);
    await settled(page);

    const inLayout = Number(await stage.getAttribute("data-layout-nodes"));
    expect(inLayout).toBeGreaterThan(3);
    await page
      .getByRole("searchbox", { name: DASHBOARD.search.label })
      .fill("session");
    await expect(stage).not.toHaveAttribute(
      "data-canvas-nodes",
      String(inLayout),
    );
    const visible = Number(await stage.getAttribute("data-canvas-nodes"));
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(inLayout);
    // The layout still holds every node, and never went back to "moving".
    expect(Number(await stage.getAttribute("data-layout-nodes"))).toBe(
      inLayout,
    );
    await expect(stage).toHaveAttribute("data-settled", "true");
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("layers: a scanned config file switches off, and an absent layer is offered disabled", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("panel-layers");
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId, "local/panel-layers");
    const stage = await openMap(page);
    await settled(page);

    const toggles = page.getByTestId("graph-layer-toggles");
    // The fixture has a package.json (config) and no stylesheet.
    const config = toggles.locator("[data-layer='config']");
    const style = toggles.locator("[data-layer='style']");
    await expect(config).toHaveAttribute("data-layer-available", "true");
    await expect(config).toBeEnabled();
    await expect(style).toHaveAttribute("data-layer-available", "false");
    await expect(style).toBeDisabled();
    await expect(style).toHaveAttribute("title", DASHBOARD.layers.unavailable);

    const before = Number(await stage.getAttribute("data-canvas-nodes"));
    const { ids: idsBefore } = await reachable(page);
    await config.click();
    await expect(config).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => Number(await stage.getAttribute("data-canvas-nodes")))
      .toBeLessThan(before);
    // Off means off for the keyboard too: the hidden nodes left the hit layer,
    // and nothing else did.
    const { ids: idsAfter } = await reachable(page);
    expect(idsAfter.length).toBeLessThan(idsBefore.length);
    expect(idsBefore).toEqual(expect.arrayContaining(idsAfter));
    // The layout was never restarted by any of it.
    await expect(stage).toHaveAttribute("data-settled", "true");
    await config.click();
    await expect(stage).toHaveAttribute("data-canvas-nodes", String(before));
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("the orphan switch hides exactly the nodes with no edge", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("panel-orphans");
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId, "local/panel-orphans");
    const stage = await openMap(page);
    await settled(page);

    const { edges, ids } = await reachable(page);
    const linked = new Set<string>();
    for (const line of edges) {
      // "relation: <source> to <target>, <grade>" — the stage's own wording.
      const match = /^[^:]+: (\S+) to (\S+),/.exec(line);
      if (match) {
        linked.add(match[1]!);
        linked.add(match[2]!);
      }
    }
    const orphans = ids.filter((id) => !linked.has(id));
    const before = Number(await stage.getAttribute("data-canvas-nodes"));

    const panel = await openForcePanel(page);
    await panel.locator("[data-display-key='showOrphans']").uncheck();
    await expect(stage).toHaveAttribute(
      "data-canvas-nodes",
      String(before - orphans.length),
    );
    const { ids: after } = await reachable(page);
    expect(after.some((id) => orphans.includes(id))).toBe(false);
    await expect(stage).toHaveAttribute("data-settled", "true");

    await panel.locator("[data-display-key='showOrphans']").check();
    await expect(stage).toHaveAttribute("data-canvas-nodes", String(before));
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("a pinned node stays pinned across a reload", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("panel-pins");
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId, "local/panel-pins");
    const stage = await openMap(page);
    await settled(page);
    await expect(stage).toHaveAttribute("data-pinned-count", "0");

    const target = page.locator(".brain-map-hit").first();
    const nodeId = await target.getAttribute("data-node-id");
    await target.click();
    const pin = page.getByTestId("pin-toggle");
    await expect(pin).toHaveText(DASHBOARD.pin.pin);
    await pin.click();
    await expect(pin).toHaveText(DASHBOARD.pin.unpin);
    await expect(stage).toHaveAttribute("data-pinned-count", "1");
    await expect(
      page.locator(`.brain-map-hit[data-node-id='${nodeId}']`),
    ).toHaveAttribute("data-pinned", "true");

    await page.reload();
    const again = await openMap(page);
    // The pin came back from storage with the mount, before any click.
    await expect(again).toHaveAttribute("data-pinned-count", "1");
    await expect(
      page.locator(`.brain-map-hit[data-node-id='${nodeId}']`),
    ).toHaveAttribute("data-pinned", "true");

    await page.locator(`.brain-map-hit[data-node-id='${nodeId}']`).click();
    await page.getByTestId("pin-toggle").click();
    await expect(again).toHaveAttribute("data-pinned-count", "0");
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("the settled layout is saved and the next visit mounts warm", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("panel-warm");
  try {
    await signIn(context, user);
    const { commitSha } = await seedScan(user.workspaceId, "local/panel-warm");
    const stage = await openMap(page);
    // First visit: nothing saved yet, so the mount is cold.
    await expect(stage).toHaveAttribute("data-warm-start", "false");
    await settled(page);
    const inLayout = Number(await stage.getAttribute("data-layout-nodes"));

    // The settle wrote the layout, keyed by workspace and commit, with a
    // position for every node in the layout.
    const saved = await page.evaluate(
      async ({ key, name, version }) => {
        const database = await new Promise<IDBDatabase>((resolveDb, reject) => {
          const request = indexedDB.open(name, version);
          request.onsuccess = () => resolveDb(request.result);
          request.onerror = () => reject(request.error);
        });
        return new Promise<{ nodeIds?: string[]; positions?: number[] } | null>(
          (resolveRecord, reject) => {
            const request = database
              .transaction("layouts", "readonly")
              .objectStore("layouts")
              .get(key);
            request.onsuccess = () => resolveRecord(request.result ?? null);
            request.onerror = () => reject(request.error);
          },
        );
      },
      {
        key: `layout:${user.workspaceId}:${commitSha}`,
        name: LAYOUT_STORE_NAME,
        version: LAYOUT_STORE_VERSION,
      },
    );
    expect(saved?.nodeIds?.length).toBe(inLayout);
    expect(saved?.positions?.length).toBe(inLayout * 2);

    await page.reload();
    const again = await openMap(page);
    await expect(again).toHaveAttribute("data-warm-start", "true");
    await expect(again).toHaveAttribute("data-layout-nodes", String(inLayout));
    await settled(page);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
