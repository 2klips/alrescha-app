import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createClient } from "@supabase/supabase-js";

import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { SETTINGS } from "../../apps/web/lib/strings";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * Phase 3 Wave D todo 11 — the MVP acceptance walk, end to end and live:
 * a real MCP token from the real settings form, a real agent session over
 * HTTP (schema → map → memory → assertion), and the graph screen showing
 * what the agent wrote — the dashed assertion edge and the activity feed.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");

test("an agent orients, records memory, and the map shows it", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createWorkspaceUser("agent-memory");
  const mcp = new Client(
    { name: "wave-d-e2e", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await signIn(context, user);

    // Seed a real scanned graph through the shared persistence function.
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const repository = await service.rpc("ensure_local_repository", {
      target_workspace_id: user.workspaceId,
      target_full_name: "local/agent-memory",
    });
    const { source, commitSha } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    const applied = await service.rpc("apply_repository_scan", {
      target_workspace_id: user.workspaceId,
      target_repository_id: String(repository.data),
      plan,
    });
    expect(applied.error).toBeNull();

    // 1. A token from the real settings form; the installer card is there.
    await page.goto("/app/settings/mcp");
    await expect(page.getByTestId("instruction-blocks")).toBeVisible();
    await expect(page.getByTestId("instruction-snippet")).toContainText(
      "get_graph_schema",
    );
    await page.getByLabel(SETTINGS.mcp.tokens.nameLabel).fill("wave-d agent");
    await page
      .getByRole("checkbox", { name: SETTINGS.mcp.tokens.scopeWriteLabel })
      .check();
    await page.getByRole("button", { name: SETTINGS.mcp.tokens.issue }).click();
    const secret = await page
      .locator(".mcp-secret code")
      .innerText({ timeout: 15_000 });

    // 2. A live agent session over HTTP: orient, then write back.
    await mcp.connect(
      new StreamableHTTPClientTransport(
        new URL("http://127.0.0.1:3000/api/mcp"),
        { authProvider: { token: async () => secret } },
      ),
    );

    const schema = await mcp.callTool({
      arguments: {},
      name: "get_graph_schema",
    });
    expect(schema.isError).not.toBe(true);
    const schemaText = (schema.structuredContent as { text: string }).text;
    expect(schemaText).toContain("local/agent-memory");

    const map = await mcp.callTool({
      arguments: { focus: ["session"] },
      name: "repo_map",
    });
    expect(map.isError).not.toBe(true);
    expect((map.structuredContent as { text: string }).text).toContain(
      "src/session.ts",
    );

    // Node ids for the write-back: the stored artifact rows are the address
    // book (index entries are a later pipeline and stay out of this walk).
    const artifactRows = await service
      .from("artifacts")
      .select("id,path")
      .eq("workspace_id", user.workspaceId)
      .in("path", ["src/session.ts", "src/audit.ts"]);
    const sessionNode = (artifactRows.data ?? []).find(
      (row) => row.path === "src/session.ts",
    );
    const auditNode = (artifactRows.data ?? []).find(
      (row) => row.path === "src/audit.ts",
    );
    expect(sessionNode && auditNode).toBeTruthy();
    if (!sessionNode || !auditNode) return;

    const memory = await mcp.callTool({
      arguments: {
        anchor_node_id: sessionNode.id,
        entry_key: "expiry-boundary",
        name: "gotchas",
        text: "Session expiry is inclusive at exactly 30 minutes — see REQ-AUTH-002.",
      },
      name: "memory_write",
    });
    expect(
      (memory.structuredContent as { entry: { outcome: string } }).entry
        .outcome,
    ).toBe("added");

    const readBack = await mcp.callTool({
      arguments: { name: "gotchas" },
      name: "memory_read",
    });
    expect(
      (readBack.structuredContent as { entries: { entryKey: string }[] })
        .entries,
    ).toHaveLength(1);

    const assertion = await mcp.callTool({
      arguments: {
        reason: "audit records the successful logins the session code produces",
        relation: "uses",
        source_node_id: sessionNode.id,
        target_node_id: auditNode.id,
      },
      name: "assert_link",
    });
    expect(
      (assertion.structuredContent as { assertion: { outcome: string } })
        .assertion.outcome,
    ).toBe("added");

    // 3. The map shows what the agent wrote: the dashed uses-edge exists and
    // the live feed lists the agent's tool calls.
    await page.goto("/app/map");
    const stage = page.getByTestId("brain-map-stage");
    await expect(stage).toBeVisible();
    await expect(
      stage.locator(".sr-only button").filter({ hasText: "uses:" }).first(),
    ).toBeAttached();
    const feed = page.locator(".arr-activity-table");
    await expect(feed).toContainText("assert_link");
    await expect(feed).toContainText("memory_write");
  } finally {
    await mcp.close().catch(() => undefined);
    await deleteWorkspaceUser(user.userId);
  }
});
