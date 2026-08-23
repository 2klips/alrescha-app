import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * Phase 3 Wave A todo 1 — `/app/map` renders the stored graph, not the demo.
 *
 * The seeded path goes through `apply_repository_scan` (the single shared
 * persistence function), so what the screen shows is exactly what a GitHub
 * push would have stored. The empty path asserts the connect empty state —
 * an empty workspace must never fall back to fixture data.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

test("an empty workspace shows the connect empty state", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("map-empty");
  try {
    await signIn(context, user);
    await page.goto("/app/map");
    expect(new URL(page.url()).pathname).toBe("/app/map");

    const empty = page.getByTestId("workspace-map-empty");
    await expect(empty).toBeVisible();
    await expect(
      empty.getByRole("link", { name: "GitHub 레포 연결" }),
    ).toHaveAttribute("href", "/app/connect/github");
    // No stage, no demo nodes.
    await expect(page.getByTestId("brain-map-stage")).toHaveCount(0);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("a scanned workspace renders its own nodes on the map", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("map-scan");
  try {
    await signIn(context, user);

    const service = admin();
    const repository = await service.rpc("ensure_local_repository", {
      target_workspace_id: user.workspaceId,
      target_full_name: "local/map-e2e",
    });
    expect(repository.error).toBeNull();

    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    const applied = await service.rpc("apply_repository_scan", {
      target_workspace_id: user.workspaceId,
      target_repository_id: String(repository.data),
      plan,
    });
    expect(applied.error).toBeNull();
    expect(Number(applied.data)).toBeGreaterThan(0);

    await page.goto("/app/map");
    expect(new URL(page.url()).pathname).toBe("/app/map");

    // The stage renders the stored nodes — no empty state, no demo fixture.
    const stage = page.getByTestId("brain-map-stage");
    await expect(stage).toBeVisible();
    const nodeCount = Number(await stage.getAttribute("data-canvas-nodes"));
    expect(nodeCount).toBeGreaterThan(5);
    await expect(page.getByTestId("workspace-map-empty")).toHaveCount(0);

    // The header names the connected repository and the scanned commit.
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toContainText("local/map-e2e");
    await expect(page.locator(".arr-proof-heading .arr-kicker")).toContainText(
      commitSha.slice(0, 7),
    );

    // Selecting a hit target fills the inspector with the stored node.
    const firstHit = page.locator(".brain-map-hit").first();
    await firstHit.click();
    const inspector = page.getByRole("complementary", {
      name: "선택한 노드 상세",
    });
    await expect(inspector.locator("h2")).not.toBeEmpty();
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
