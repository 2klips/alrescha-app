import { mkdir } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { HOME } from "../../apps/web/lib/strings/home";
import { SETTINGS } from "../../apps/web/lib/strings/settings";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * Phase 3 Wave E todo 13 — `/app` is the onboarding spine as one thread:
 * 레포 연결 → 지식그래프 생성 → 첫 그래프 뷰 + MCP 토큰 발급. The journey
 * is asserted end to end against stored rows: an empty workspace points at
 * connect, a seeded scan advances to the graph, and issuing a real token
 * from the settings form completes it.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const EVIDENCE = path.resolve(".omo/evidence/phase3/wave-e-todo-13");

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

test("an empty workspace starts the journey at the connect step", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("home-empty");
  try {
    await signIn(context, user);
    await page.goto("/app");
    expect(new URL(page.url()).pathname).toBe("/app");

    const connect = page.getByTestId("journey-connect");
    await expect(connect).toHaveAttribute("data-step-state", "active");
    await expect(
      connect.getByRole("link", { name: HOME.journey.connect.cta }),
    ).toHaveAttribute("href", "/app/connect/github");

    await expect(page.getByTestId("journey-graph")).toHaveAttribute(
      "data-step-state",
      "pending",
    );
    await expect(page.getByTestId("journey-agent")).toHaveAttribute(
      "data-step-state",
      "pending",
    );
    // No graph, no summary card — and never the demo fixture.
    await expect(page.getByTestId("home-graph-card")).toHaveCount(0);

    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "home-empty.png"),
    });
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("connect → graph → token walks the journey to done", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createWorkspaceUser("home-journey");
  try {
    await signIn(context, user);

    // 1. 레포 연결 + 첫 스캔 — seeded through the shared persistence
    // function, exactly what a GitHub push would have stored.
    const service = admin();
    const repository = await service.rpc("ensure_local_repository", {
      target_workspace_id: user.workspaceId,
      target_full_name: "local/home-journey",
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

    // 2. The home now shows the connected repo, a ready graph, and the
    // agent step as the next action.
    await page.goto("/app");
    await expect(page.getByTestId("journey-connect")).toHaveAttribute(
      "data-step-state",
      "done",
    );
    await expect(page.getByTestId("journey-connect")).toContainText(
      "local/home-journey",
    );
    const graphStep = page.getByTestId("journey-graph");
    await expect(graphStep).toHaveAttribute("data-step-state", "done");
    await expect(page.getByTestId("journey-agent")).toHaveAttribute(
      "data-step-state",
      "active",
    );

    // The hero summary counts stored rows.
    const card = page.getByTestId("home-graph-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(HOME.graphCard.counts.nodes);

    // 3. 첫 그래프 뷰 — the step links straight into /app/map and the real
    // stage renders (no empty state).
    await graphStep.getByRole("link", { name: HOME.journey.graph.cta }).click();
    await expect(page).toHaveURL(/\/app\/map$/);
    await expect(page.getByTestId("brain-map-stage")).toBeVisible();

    // 4. MCP 토큰 발급 from the real settings form completes the journey.
    await page.goto("/app");
    await page
      .getByTestId("journey-agent")
      .getByRole("link", { name: HOME.journey.agent.cta })
      .click();
    await expect(page).toHaveURL(/\/app\/settings\/mcp$/);
    await page.getByLabel(SETTINGS.mcp.tokens.nameLabel).fill("home journey");
    await page.getByRole("button", { name: SETTINGS.mcp.tokens.issue }).click();
    await expect(page.locator(".mcp-secret code")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/app");
    await expect(page.getByTestId("journey-agent")).toHaveAttribute(
      "data-step-state",
      "done",
    );
    await expect(page.getByTestId("journey-agent")).toContainText(
      HOME.journey.agent.done(1),
    );

    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "home-journey-done.png"),
    });
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
