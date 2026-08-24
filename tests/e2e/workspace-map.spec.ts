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
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "local/map-e2e",
    );
    await expect(page.locator(".arr-proof-heading .arr-kicker")).toContainText(
      commitSha.slice(0, 7),
    );

    // Selecting a hit target fills the inspector with the stored node.
    const firstHit = page.locator(".brain-map-hit").first();
    const selectedNodeId = await firstHit.getAttribute("data-node-id");
    await firstHit.click();
    const inspector = page.getByRole("complementary", {
      name: "선택한 노드 상세",
    });
    await expect(inspector.locator("h2")).not.toBeEmpty();

    // Directional focus (todo 2): selection arms the focus mode and surfaces
    // the direction legend (outgoing 의존한다 / incoming 의존받는다).
    await expect(stage).toHaveAttribute(
      "data-focus-node",
      selectedNodeId ?? "",
    );
    await expect(page.getByTestId("focus-legend-out")).toBeVisible();
    await expect(page.getByTestId("focus-legend-in")).toBeVisible();

    // Structure edges (Wave B todo 3): the fixture's test file imports and
    // calls into src/session.ts, and the sr-only edge list names both.
    const edgeList = stage.locator(".sr-only button");
    await expect(
      edgeList.filter({ hasText: "imports:" }).first(),
    ).toBeAttached();
    await expect(edgeList.filter({ hasText: "calls:" }).first()).toBeAttached();

    // Co-change edges (Wave B todo 4): three pushes touching the same pair
    // cross the threshold; the family is toggleable.
    for (const sha of ["4".repeat(40), "5".repeat(40), "6".repeat(40)]) {
      const recorded = await service.rpc("record_push_co_changes", {
        commits: [{ paths: ["src/audit.ts", "src/session.ts"], sha }],
        target_repository_id: String(repository.data),
        target_workspace_id: user.workspaceId,
      });
      expect(recorded.error).toBeNull();
    }
    await page.reload();
    await expect(
      stage
        .locator(".sr-only button")
        .filter({ hasText: "co_changed:" })
        .first(),
    ).toBeAttached();
    await page.getByTestId("graph-co-change-toggle").click();
    await expect(
      stage.locator(".sr-only button").filter({ hasText: "co_changed:" }),
    ).toHaveCount(0);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("the concept layer renders as inferred nodes and toggles off", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("map-concepts");
  try {
    await signIn(context, user);

    const service = admin();
    const repository = await service.rpc("ensure_local_repository", {
      target_workspace_id: user.workspaceId,
      target_full_name: "local/map-concepts",
    });
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    const applied = await service.rpc("apply_repository_scan", {
      target_workspace_id: user.workspaceId,
      target_repository_id: String(repository.data),
      plan,
    });
    expect(applied.error).toBeNull();

    // The concept pass output, persisted through the single write path.
    const concepts = await service.rpc("apply_concept_graph", {
      target_workspace_id: user.workspaceId,
      target_repository_id: String(repository.data),
      concept_items: [
        {
          kind: "concept",
          links: [{ relation: "uses", target: { path: "src/session.ts" } }],
          memberPaths: ["src/session.ts"],
          name: "Session Lifecycle",
          slug: "session-lifecycle",
          summary: "How sessions are issued and expired, in prose.",
        },
      ],
      synthesis_digest: "e2e-digest",
    });
    expect(concepts.error).toBeNull();

    await page.goto("/app/map");
    const stage = page.getByTestId("brain-map-stage");
    await expect(stage).toBeVisible();
    const withConcepts = Number(await stage.getAttribute("data-canvas-nodes"));

    // The concept edge renders in the inferred (dashed) family and the HUD
    // counts the concept layer.
    await expect(
      stage.locator(".sr-only button").filter({ hasText: "uses:" }).first(),
    ).toBeAttached();

    // Toggling the layer removes the concept node and its edges — the
    // structural layer stays.
    await page.getByTestId("graph-concept-toggle").click();
    await expect
      .poll(async () => Number(await stage.getAttribute("data-canvas-nodes")))
      .toBe(withConcepts - 1);
    await expect(
      stage.locator(".sr-only button").filter({ hasText: "uses:" }),
    ).toHaveCount(0);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
