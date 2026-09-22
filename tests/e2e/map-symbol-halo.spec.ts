import { mkdir } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";

import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * The symbol halo on `/app/map`, over a real scan (Phase 4 Wave F todo 26).
 *
 * The map's model carries no symbol. Selecting a file asks
 * `/api/map/symbols` for that file's layer — one request — and the stage
 * says whose halo it holds and how many symbols. The answer is cached by
 * commit, so a second visit at the same commit selects the file and draws
 * the halo without asking the network again.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const STAGE = "[data-testid='brain-map-stage']";
const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-26");

test.use({ viewport: { height: 900, width: 1440 } });

async function seedScan(workspaceId: string): Promise<void> {
  const service = serviceRoleClient();
  const repository = await service.rpc("ensure_local_repository", {
    target_full_name: "local/symbol-halo",
    target_workspace_id: workspaceId,
  });
  expect(repository.error?.message ?? null).toBeNull();
  const { commitSha, source } = await createLocalRepositorySource(DRIFTED_DEMO);
  const plan = await scanRepository({ commitSha, source });
  const applied = await service.rpc("apply_repository_scan", {
    plan,
    target_repository_id: repository.data,
    target_workspace_id: workspaceId,
  });
  expect(applied.error?.message ?? null).toBeNull();
}

/**
 * Wheel in over the selected file until the frame reports Near — the LOD the
 * halo is drawn at. Zoom is about the pointer, so the file stays under it.
 */
async function zoomToNear(
  page: Page,
  stage: Locator,
  nodeId: string,
): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if ((await stage.getAttribute("data-lod")) === "near") break;
    const box = await page
      .locator(`.brain-map-hit[data-node-id='${nodeId}']`)
      .first()
      .boundingBox();
    await page.mouse.move(
      box ? box.x + box.width / 2 : 720,
      box ? box.y + box.height / 2 : 450,
    );
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(120);
  }
  await expect(stage).toHaveAttribute("data-lod", "near");
}

async function withTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.evaluate(
    ([key, value]: readonly string[]) =>
      window.localStorage.setItem(key as string, value as string),
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    )
    .toBe(theme);
}

test("selecting a file loads its symbol layer once and the stage says so", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  const user = await createWorkspaceUser("map-symbol-halo");
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId);

    const requests: string[] = [];
    await page.route("**/api/map/symbols**", async (route) => {
      requests.push(new URL(route.request().url()).search);
      await route.continue();
    });

    await page.goto("/app/map");
    const stage = page.locator(STAGE);
    await expect(stage).toHaveAttribute("data-settled", "true", {
      timeout: 20_000,
    });
    // Nothing selected, nothing loaded: the default map carries no symbol.
    await expect(stage).toHaveAttribute("data-symbol-halo", "");
    await expect(stage).toHaveAttribute("data-symbol-count", "0");

    const file = page.locator(
      ".brain-map-hit[data-node-path='src/session.ts']",
    );
    const fileId = await file.first().getAttribute("data-node-id");
    expect(fileId).toBeTruthy();
    await file.first().click();

    // The layer arrives for the selected file — its exports, never a body.
    await expect(stage).toHaveAttribute("data-symbol-halo", fileId ?? "");
    await expect
      .poll(async () => Number(await stage.getAttribute("data-symbol-count")))
      .toBeGreaterThan(0);
    expect(requests).toEqual([`?files=${fileId}`]);

    // The same answer through the API, as the signed-in member: symbols of
    // that file only, each with a kind and a span, and no `edges` into
    // anything the payload does not name.
    const response = await page.request.get(`/api/map/symbols?files=${fileId}`);
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      edges: { relation: string; source: string; target: string }[];
      files: string[];
      symbols: {
        fileId: string;
        kind: string;
        name: string;
        startLine: number;
      }[];
    };
    expect(payload.files).toEqual([fileId]);
    expect(payload.symbols.length).toBeGreaterThan(0);
    expect(payload.symbols.every((symbol) => symbol.fileId === fileId)).toBe(
      true,
    );
    expect(payload.symbols.map(({ name }) => name)).toContain(
      "SESSION_TIMEOUT_MS",
    );
    const known = new Set(payload.symbols.map(({ name }) => name));
    expect(known.size).toBeGreaterThan(0);
    for (const edge of payload.edges.filter((e) => e.relation === "declares")) {
      expect(edge.source).toBe(fileId);
    }

    // A second visit at the same commit: the halo is drawn from the cache
    // and the network is not asked again.
    await page.reload();
    await expect(stage).toHaveAttribute("data-settled", "true", {
      timeout: 20_000,
    });
    await page
      .locator(".brain-map-hit[data-node-path='src/session.ts']")
      .first()
      .click();
    await expect(stage).toHaveAttribute("data-symbol-halo", fileId ?? "");
    await expect
      .poll(async () => Number(await stage.getAttribute("data-symbol-count")))
      .toBeGreaterThan(0);
    expect(requests).toEqual([`?files=${fileId}`]);

    // The halo itself, at Near, in both themes: the file opened a little,
    // its exports around it. Drawn from the cache — the request count above
    // does not move.
    await mkdir(EVIDENCE, { recursive: true });
    for (const theme of ["light", "dark"] as const) {
      await withTheme(page, theme);
      await expect(stage).toHaveAttribute("data-settled", "true", {
        timeout: 20_000,
      });
      await page
        .locator(".brain-map-hit[data-node-path='src/session.ts']")
        .first()
        .click();
      await expect(stage).toHaveAttribute("data-symbol-halo", fileId ?? "");
      await zoomToNear(page, stage, fileId ?? "");
      await expect
        .poll(async () => Number(await stage.getAttribute("data-symbol-count")))
        .toBeGreaterThan(0);
      await stage.screenshot({
        path: path.join(EVIDENCE, `halo-${theme}.png`),
      });
    }
    expect(requests).toEqual([`?files=${fileId}`]);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
