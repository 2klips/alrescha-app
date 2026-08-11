import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  REPOSITORY_SCAN_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;
const TOKEN_A = fixedUlid("M");

describe("hosted MCP persistence", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
      WORKER_CREDIT_MIGRATION,
      REPOSITORY_SCAN_MIGRATION,
      HOSTED_MCP_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'mcp-a@example.test'), ($2, 'mcp-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    workspaceB =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)
        ?.id ?? "";
  });

  afterAll(async () => {
    await database.close();
  });

  it("lets an owner issue only their own scoped token and keeps hashes private", async () => {
    await asAuthenticatedUser(database, USER_A, (transaction) =>
      transaction.query(
        `insert into public.mcp_tokens
          (id, workspace_id, created_by, name, token_hash, token_prefix, scopes)
         values ($1, $2, $3, 'Codex', $4, 'sp_mcp_demo', array['mcp:read', 'mcp:write'])`,
        [TOKEN_A, workspaceA, USER_A, "a".repeat(64)],
      ),
    );

    const ownTokens = await asAuthenticatedUser(
      database,
      USER_A,
      (transaction) =>
        transaction.query<{
          created_by: string;
          scopes: string[];
          token_prefix: string;
        }>("select created_by, scopes, token_prefix from public.mcp_tokens"),
    );
    const otherTokens = await asAuthenticatedUser(
      database,
      USER_B,
      (transaction) => transaction.query("select id from public.mcp_tokens"),
    );
    const columns = await database.query<{
      column_name: string;
      table_name: string;
    }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'mcp_tokens' and column_name in ('secret', 'token'))
           or (table_name = 'index_entries' and column_name in ('body', 'content', 'excerpt', 'raw_code')))`,
    );

    expect(ownTokens.rows).toEqual([
      {
        created_by: USER_A,
        scopes: ["mcp:read", "mcp:write"],
        token_prefix: "sp_mcp_demo",
      },
    ]);
    expect(otherTokens.rows).toEqual([]);
    expect(columns.rows).toEqual([]);
    await expect(
      asAuthenticatedUser(database, USER_A, (transaction) =>
        transaction.query(
          `insert into public.mcp_tokens
            (workspace_id, created_by, name, token_hash, token_prefix, scopes)
           values ($1, $2, 'Spoofed', $3, 'sp_mcp_bad1', array['mcp:read'])`,
          [workspaceA, USER_B, "b".repeat(64)],
        ),
      ),
    ).rejects.toThrow(/row-level security policy/);
  });

  it("stores structured progress, notes, and minimal access events under tenant foreign keys", async () => {
    await database.query(
      `insert into public.progress_events
        (id, workspace_id, user_id, token_id, task, status, summary, refs)
       values ($1, $2, $3, $4, 'task-15', 'done', 'Hosted MCP ready', array['spec/BUILD_PLAN.md'])`,
      [fixedUlid("N"), workspaceA, USER_A, TOKEN_A],
    );
    await database.query(
      `insert into public.mcp_notes
        (id, workspace_id, user_id, token_id, text, target)
       values ($1, $2, $3, $4, 'Review finding', 'finding:demo')`,
      [fixedUlid("P"), workspaceA, USER_A, TOKEN_A],
    );
    await database.query(
      `insert into public.access_events
        (id, workspace_id, token_id, tool, target_node_ids)
       values ($1, $2, $3, 'get_findings', array['finding:demo'])`,
      [fixedUlid("Q"), workspaceA, TOKEN_A],
    );

    const progress = await database.query<{
      refs: string[];
      status: string;
      task: string;
    }>(
      "select task, status, refs from public.progress_events where workspace_id = $1",
      [workspaceA],
    );
    const forbiddenEventColumns = await database.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'access_events'
         and column_name in ('prompt', 'prompt_text', 'query', 'task', 'text')`,
    );

    expect(progress.rows).toEqual([
      { refs: ["spec/BUILD_PLAN.md"], status: "done", task: "task-15" },
    ]);
    expect(forbiddenEventColumns.rows).toEqual([]);
    await expect(
      database.query(
        `insert into public.access_events
          (workspace_id, token_id, tool)
         values ($1, $2, 'get_findings')`,
        [workspaceB, TOKEN_A],
      ),
    ).rejects.toThrow(/access_events_token_tenant_fk/);
  });

  it("supports owner revocation and applies RLS to hosted MCP records", async () => {
    await asAuthenticatedUser(database, USER_A, (transaction) =>
      transaction.query(
        "update public.mcp_tokens set revoked_at = now() where id = $1 and workspace_id = $2",
        [TOKEN_A, workspaceA],
      ),
    );
    const revoked = await database.query<{ revoked: boolean }>(
      "select revoked_at is not null as revoked from public.mcp_tokens where id = $1",
      [TOKEN_A],
    );
    const otherRecords = await asAuthenticatedUser(
      database,
      USER_B,
      async (transaction) => {
        const [events, notes, progress] = await Promise.all([
          transaction.query("select id from public.access_events"),
          transaction.query("select id from public.mcp_notes"),
          transaction.query("select id from public.progress_events"),
        ]);
        return [...events.rows, ...notes.rows, ...progress.rows];
      },
    );

    expect(revoked.rows).toEqual([{ revoked: true }]);
    expect(otherRecords).toEqual([]);
  });
});
