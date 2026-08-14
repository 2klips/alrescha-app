import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  PROGRESS_DASHBOARD_MIGRATION,
  REPOSITORY_SCAN_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;
const REPOSITORY_A = fixedUlid("A");
const ARTIFACT_A = fixedUlid("B");
const TOKEN_A = fixedUlid("M");

describe("progress persistence", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA = "";

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
      WORKER_CREDIT_MIGRATION,
      REPOSITORY_SCAN_MIGRATION,
      HOSTED_MCP_MIGRATION,
      PROGRESS_DASHBOARD_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'progress-a@example.test'), ($2, 'progress-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 101, 201, 'progress-owner')`,
      [fixedUlid("C"), workspaceA],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id)
       values ($1, $2, 'owner/progress', $3, 301)`,
      [REPOSITORY_A, workspaceA, fixedUlid("C")],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'TODO.md')`,
      [ARTIFACT_A, workspaceA, REPOSITORY_A],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest,
         source_blob_sha, source_commit_sha, last_seen_commit_sha, size_bytes,
         exported_symbols, metadata)
       values ($1, $2, $3, 'todo', 'todo_progress', 'TODO.md', $4,
         $5, $5, $5, 42, '[]'::jsonb, '{}'::jsonb)`,
      [ARTIFACT_A, workspaceA, REPOSITORY_A, "a".repeat(64), "1".repeat(40)],
    );
    await database.query(
      `insert into public.mcp_tokens
        (id, workspace_id, created_by, name, token_hash, token_prefix, scopes)
       values ($1, $2, $3, 'Progress test', $4, 'sp_mcp_test',
         array['mcp:read', 'mcp:write'])`,
      [TOKEN_A, workspaceA, USER_A, "b".repeat(64)],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it("stores document todos with exact spans and isolates them through RLS", async () => {
    await database.query(
      `insert into public.todos
        (id, workspace_id, repository_id, title, status, source_kind, source_key,
         source_artifact_id, source_path, source_span)
       values ($1, $2, $3, 'Implement progress board', 'open', 'document',
         'document:TODO.md:12', $4, 'TODO.md', $5::jsonb)`,
      [
        fixedUlid("D"),
        workspaceA,
        REPOSITORY_A,
        ARTIFACT_A,
        JSON.stringify({ endLine: 4, path: "TODO.md", startLine: 4 }),
      ],
    );

    const ownerRows = await asAuthenticatedUser(
      database,
      USER_A,
      (transaction) =>
        transaction.query<{
          source_path: string;
          source_span: unknown;
          status: string;
        }>("select source_path, source_span, status from public.todos"),
    );
    const otherRows = await asAuthenticatedUser(
      database,
      USER_B,
      (transaction) => transaction.query("select id from public.todos"),
    );

    expect(ownerRows.rows).toEqual([
      {
        source_path: "TODO.md",
        source_span: { endLine: 4, path: "TODO.md", startLine: 4 },
        status: "open",
      },
    ]);
    expect(otherRows.rows).toEqual([]);
  });

  it("atomically creates and updates one todo linked to every progress event", async () => {
    const started = await database.query<{
      event_id: string;
      todo_id: string;
      todo_status: string;
    }>(`select * from public.log_progress_atomic($1, $2, $3, $4, $5, $6, $7)`, [
      workspaceA,
      USER_A,
      TOKEN_A,
      "Task 21",
      "started",
      "Started progress dashboard.",
      ["spec/BUILD_PLAN.md"],
    ]);
    const done = await database.query<{
      event_id: string;
      todo_id: string;
      todo_status: string;
    }>(`select * from public.log_progress_atomic($1, $2, $3, $4, $5, $6, $7)`, [
      workspaceA,
      USER_A,
      TOKEN_A,
      "Task 21",
      "done",
      "Finished progress dashboard.",
      ["202608100010"],
    ]);
    const rows = await database.query<{
      event_todo_id: string;
      status: string;
      title: string;
      todo_id: string;
    }>(
      `select event.todo_id as event_todo_id, todo.id as todo_id,
        todo.title, todo.status
       from public.progress_events event
       join public.todos todo on todo.id = event.todo_id
       where event.workspace_id = $1
       order by event.occurred_at, event.id`,
      [workspaceA],
    );

    expect(started.rows[0]?.todo_id).toBe(done.rows[0]?.todo_id);
    expect(started.rows[0]?.todo_status).toBe("in-progress");
    expect(done.rows[0]?.todo_status).toBe("done");
    expect(rows.rows).toEqual([
      {
        event_todo_id: started.rows[0]?.todo_id,
        status: "done",
        title: "Task 21",
        todo_id: started.rows[0]?.todo_id,
      },
      {
        event_todo_id: started.rows[0]?.todo_id,
        status: "done",
        title: "Task 21",
        todo_id: started.rows[0]?.todo_id,
      },
    ]);
  });

  it("rejects an oversized summary without a partial todo or event write", async () => {
    const before = await database.query<{ events: number; todos: number }>(
      `select
        (select count(*)::int from public.progress_events) as events,
        (select count(*)::int from public.todos) as todos`,
    );

    await expect(
      database.query(
        `select * from public.log_progress_atomic($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspaceA,
          USER_A,
          TOKEN_A,
          "Oversized",
          "progress",
          "x".repeat(201),
          [],
        ],
      ),
    ).rejects.toThrow(/summary.*200/i);

    const after = await database.query<{ events: number; todos: number }>(
      `select
        (select count(*)::int from public.progress_events) as events,
        (select count(*)::int from public.todos) as todos`,
    );
    expect(after.rows).toEqual(before.rows);
  });
});
