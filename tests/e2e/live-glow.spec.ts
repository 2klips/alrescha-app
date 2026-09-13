import { resolve } from "node:path";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  loadWorkspaceMap,
  type WorkspaceMapModel,
} from "../../apps/web/lib/map/workspace-map";
import { workspaceAccessChannel } from "../../apps/web/lib/realtime/access-events";
import { SETTINGS, WORKSPACE_MAP } from "../../apps/web/lib/strings";
import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { createUlid } from "../../packages/mcp/src/index";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  optionalEnv,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * Phase 4 Wave B todo 15 — the live glow bridge and the real-data HUD, over
 * the local Supabase Realtime server.
 *
 * Three acceptance criteria, three tests:
 *
 * 1. a real `search_index` call, made with a token the settings form issued,
 *    lights nodes on an open `/app/map` **without a reload**;
 * 2. the access-event channel refuses a join from another workspace's
 *    member, and that member's own map never sees the event;
 * 3. the HUD chips equal what the loader computes from the stored rows.
 *
 * Everything below runs against `apply_repository_scan`, the same persistence
 * path a push would use, and the MCP endpoint the product serves.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");

/** Terminal join states, for a subscribe() that must end one way or another. */
const JOIN_OUTCOMES = new Set([
  "CHANNEL_ERROR",
  "CLOSED",
  "SUBSCRIBED",
  "TIMED_OUT",
]);

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
  expect(Number(applied.data)).toBeGreaterThan(0);
  return { commitSha, repositoryId: String(repository.data) };
}

/** A token from the real settings form — the only way the product issues one. */
async function issueToken(page: Page, name: string): Promise<string> {
  await page.goto("/app/settings/mcp");
  await page.getByLabel(SETTINGS.mcp.tokens.nameLabel).fill(name);
  await page.getByRole("button", { name: SETTINGS.mcp.tokens.issue }).click();
  return page.locator(".mcp-secret code").innerText({ timeout: 15_000 });
}

async function connectAgent(page: Page, secret: string): Promise<Client> {
  const mcp = new Client(
    { name: "todo-15-e2e", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", page.url()), {
      authProvider: { token: async () => secret },
    }),
  );
  return mcp;
}

async function glowActive(page: Page): Promise<number> {
  return Number(
    await page.getByTestId("brain-map-stage").getAttribute("data-glow-active"),
  );
}

/** Open the map and wait for the channel to have actually joined. */
async function openLiveMap(page: Page): Promise<void> {
  await page.goto("/app/map");
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
  // The bridge reports the join; asserting a glow before it would be a race
  // dressed as a test.
  await expect(page.locator("main[data-live-channel='live']")).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Join a private access-events topic from Node as a signed-in user, and
 * report how the join ended. The realtime client sends the JWT with the
 * join; the server answers with the policy's verdict.
 */
async function joinAs(
  accessToken: string,
  workspaceId: string,
): Promise<string> {
  const client = createClient(
    optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? "",
    optionalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? "",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
  await client.realtime.setAuth(accessToken);
  try {
    return await new Promise<string>((resolveStatus) => {
      const timer = setTimeout(() => resolveStatus("TIMED_OUT"), 15_000);
      client
        .channel(workspaceAccessChannel(workspaceId), {
          config: { private: true },
        })
        .subscribe((status) => {
          if (!JOIN_OUTCOMES.has(status)) return;
          clearTimeout(timer);
          resolveStatus(status);
        });
    });
  } finally {
    await client.removeAllChannels();
    client.realtime.disconnect();
  }
}

test("a real search_index call lights the open map without a reload", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createWorkspaceUser("glow");
  let mcp: Client | null = null;
  try {
    await signIn(context, user);
    await seedScan(user.workspaceId, "local/glow");
    const secret = await issueToken(page, "todo 15 glow");

    await openLiveMap(page);
    expect(await glowActive(page)).toBe(0);
    // A marker a reload would erase: the glow below must arrive on *this*
    // document, over the channel, not on a re-rendered one.
    await page.evaluate(() => {
      (window as unknown as { __alreschaLive: number }).__alreschaLive = 1;
    });

    mcp = await connectAgent(page, secret);
    const search = await mcp.callTool({
      arguments: { include_excerpt: false, query: "session" },
      name: "search_index",
    });
    expect(search.isError).not.toBe(true);

    await expect
      .poll(() => glowActive(page), { timeout: 15_000 })
      .toBeGreaterThan(0);
    const feed = page.locator(".arr-activity-table");
    await expect(feed).toContainText("search_index");
    // The row is labelled by the node the call touched, resolved in the
    // browser from the broadcast's node ids — no path travels on the wire.
    await expect(feed).toContainText("src/session.ts");
    expect(
      await page.evaluate(
        () => (window as unknown as { __alreschaLive?: number }).__alreschaLive,
      ),
    ).toBe(1);

    // Pulse → decay → afterglow → idle: the lit set empties on its own.
    await expect.poll(() => glowActive(page), { timeout: 20_000 }).toBe(0);
  } finally {
    await mcp?.close().catch(() => undefined);
    await deleteWorkspaceUser(user.userId);
  }
});

test("another workspace's member cannot join the channel, and their map stays dark", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(150_000);
  const owner = await createWorkspaceUser("glow-owner");
  const other = await createWorkspaceUser("glow-other");
  let ownerContext: BrowserContext | null = null;
  let mcp: Client | null = null;
  try {
    // Both workspaces have a graph, so both maps render a stage.
    await seedScan(owner.workspaceId, "local/glow-owner");
    await seedScan(other.workspaceId, "local/glow-other");
    const otherSession = await signIn(context, other);
    ownerContext = await browser.newContext();
    const ownerSession = await signIn(ownerContext, owner);

    // 1. The policy over the real server: the member joins, the outsider
    //    is refused. Knowing the workspace id is not membership.
    expect(await joinAs(ownerSession.accessToken, owner.workspaceId)).toBe(
      "SUBSCRIBED",
    );
    expect(await joinAs(otherSession.accessToken, owner.workspaceId)).toBe(
      "CHANNEL_ERROR",
    );

    // 2. The product: the owner's agent reads; the other tenant's open map,
    //    live on its *own* channel, never lights and never lists the call.
    const ownerPage = await ownerContext.newPage();
    const secret = await issueToken(ownerPage, "todo 15 tenant");
    await openLiveMap(page);
    expect(await glowActive(page)).toBe(0);

    mcp = await connectAgent(ownerPage, secret);
    const search = await mcp.callTool({
      arguments: { include_excerpt: false, query: "session" },
      name: "search_index",
    });
    expect(search.isError).not.toBe(true);

    // The event has been written and broadcast by the time the row exists.
    const service = serviceRoleClient();
    await expect
      .poll(
        async () => {
          const rows = await service
            .from("access_events")
            .select("id")
            .eq("workspace_id", owner.workspaceId)
            .eq("tool", "search_index");
          return (rows.data ?? []).length;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(2_000);
    expect(await glowActive(page)).toBe(0);
    await expect(page.locator(".arr-activity-table")).not.toContainText(
      "search_index",
    );
    await expect(page.locator(".arr-activity-table")).toContainText(
      WORKSPACE_MAP.activity.empty,
    );
  } finally {
    await mcp?.close().catch(() => undefined);
    await ownerContext?.close();
    await deleteWorkspaceUser(owner.userId);
    await deleteWorkspaceUser(other.userId);
  }
});

test("the HUD chips equal the loader's reading of the stored rows", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createWorkspaceUser("glow-hud");
  try {
    await signIn(context, user);
    const { commitSha, repositoryId } = await seedScan(
      user.workspaceId,
      "local/glow-hud",
    );
    const service = serviceRoleClient();

    // Rows that give every chip something to say: a local push's completed
    // run 90 minutes ago (the hour boundary is far on both sides), two open
    // findings and one resolved, and an `implements` edge for one of the
    // fixture's requirements.
    const completedAt = new Date(Date.now() - 90 * 60_000).toISOString();
    const run = await service.from("runs").insert({
      commit_sha: commitSha,
      completed_at: completedAt,
      repository_id: repositoryId,
      started_at: completedAt,
      status: "succeeded",
      trigger_key: `local:${commitSha}`,
      trigger_kind: "manual",
      workspace_id: user.workspaceId,
    });
    expect(run.error?.message ?? null).toBeNull();

    const artifacts = await service
      .from("artifacts")
      .select("id,path")
      .eq("workspace_id", user.workspaceId)
      .in("path", ["src/session.ts", "src/audit.ts"]);
    const session = (artifacts.data ?? []).find(
      (row) => row.path === "src/session.ts",
    );
    const audit = (artifacts.data ?? []).find(
      (row) => row.path === "src/audit.ts",
    );
    expect(session && audit).toBeTruthy();
    if (!session || !audit) return;

    const findings = await service.from("findings").insert([
      {
        confidence: 0.8,
        kind: "missing-test",
        provenance: { reason: "todo 15 e2e: open finding" },
        repository_id: repositoryId,
        severity: "high",
        source_node_id: session.id,
        status: "open",
        title: "e2e open finding A",
        workspace_id: user.workspaceId,
      },
      {
        confidence: 0.8,
        kind: "stale-doc",
        provenance: { reason: "todo 15 e2e: open finding" },
        repository_id: repositoryId,
        severity: "medium",
        source_node_id: audit.id,
        status: "open",
        title: "e2e open finding B",
        workspace_id: user.workspaceId,
      },
      {
        confidence: 0.8,
        kind: "orphan-doc",
        provenance: { reason: "todo 15 e2e: resolved finding" },
        repository_id: repositoryId,
        severity: "low",
        source_node_id: audit.id,
        status: "resolved",
        title: "e2e resolved finding",
        workspace_id: user.workspaceId,
      },
    ]);
    expect(findings.error?.message ?? null).toBeNull();

    // A scan stores no requirements — the analysis pass reconciles them —
    // so seed one the way that writer does: a requirement node, then the
    // row that cites its source span, then an `implements` edge to code.
    const spec = await service
      .from("artifacts")
      .select("id,path")
      .eq("workspace_id", user.workspaceId)
      .eq("path", "spec.md")
      .maybeSingle();
    expect(spec.data?.id, "the fixture's spec.md artifact").toBeTruthy();
    if (!spec.data) return;
    const requirementId = createUlid(new Date());
    const node = await service.from("graph_nodes").insert({
      id: requirementId,
      kind: "requirement",
      label: "REQ-E2E-001",
      repository_id: repositoryId,
      workspace_id: user.workspaceId,
    });
    expect(node.error?.message ?? null).toBeNull();
    const requirement = await service.from("requirements").insert({
      id: requirementId,
      repository_id: repositoryId,
      source_artifact_id: spec.data.id,
      source_span: { endLine: 1, path: "spec.md", startLine: 1 },
      statement: "todo 15 e2e: a requirement the session code implements",
      status: "active",
      workspace_id: user.workspaceId,
    });
    expect(requirement.error?.message ?? null).toBeNull();
    const edge = await service.from("edges").insert({
      confidence: 0.9,
      provenance: { reason: "todo 15 e2e: implements edge" },
      relation: "implements",
      repository_id: repositoryId,
      source_node_id: requirementId,
      target_node_id: session.id,
      workspace_id: user.workspaceId,
    });
    expect(edge.error?.message ?? null).toBeNull();

    // What the loader says, from the same rows, through the same code.
    const expected: WorkspaceMapModel = await loadWorkspaceMap(
      service,
      user.userId,
    );
    expect(expected.hud.openFindings).toBe(2);
    expect(expected.hud.coverage.basis).toBe("measured");
    expect(expected.hud.coverage.covered).toBe(1);
    expect(expected.hud.lastScan.commitSha).toBe(commitSha);
    expect(expected.hud.lastScan.ageMinutes).toBe(90);
    expect(expected.hud.risk).not.toBeNull();
    expect(expected.hud.risk!.ranked).toBeGreaterThan(0);

    await page.goto("/app/map");
    await expect(page.getByTestId("brain-map-stage")).toBeVisible();

    const hud = page.getByTestId("map-hud");
    await expect(
      hud.getByTestId("hud-open-findings").locator("strong"),
    ).toHaveText(String(expected.hud.openFindings));
    const coverage = hud.getByTestId("hud-coverage");
    await expect(coverage).toHaveAttribute(
      "data-basis",
      expected.hud.coverage.basis,
    );
    await expect(coverage.locator("strong")).toHaveText(
      `${expected.hud.coverage.percent}%`,
    );
    await expect(coverage).toContainText(
      WORKSPACE_MAP.hud.coverage.measured(
        expected.hud.coverage.covered,
        expected.hud.coverage.total,
      ),
    );
    const lastScan = hud.getByTestId("hud-last-scan");
    await expect(lastScan.locator("strong")).toHaveText(commitSha.slice(0, 7));
    await expect(lastScan).toContainText(
      WORKSPACE_MAP.hud.lastScan.age(expected.hud.lastScan.ageMinutes!),
    );

    const risk = page.getByTestId("hud-risk");
    await expect(risk).toHaveAttribute(
      "data-risk-ranked",
      String(expected.hud.risk!.ranked),
    );
    await expect(risk.locator("ol button span")).toHaveText(
      expected.hud.risk!.top.map((entry) => entry.path),
    );
    // A ranked row focuses its node, like a hub row does.
    await risk.locator("ol button").first().click();
    await expect(page.getByTestId("brain-map-stage")).toHaveAttribute(
      "data-focus-node",
      expected.hud.risk!.top[0]!.nodeId,
    );
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
