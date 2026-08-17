import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("Supabase auth and solo-workspace RLS", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    database = await createTestDatabase([AUTH_TENANCY_MIGRATION]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'a@example.test'), ($2, 'b@example.test')",
      [USER_A, USER_B],
    );

    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>(
      "select id, owner_user_id from public.workspaces order by owner_user_id",
    );
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    workspaceB =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)
        ?.id ?? "";

    await database.query(
      `insert into public.repositories (id, workspace_id, full_name)
       values ('01J0000000000000000000000A', $1, 'owner-a/repo'),
              ('01J0000000000000000000000B', $2, 'owner-b/repo')`,
      [workspaceA, workspaceB],
    );
    await database.query(
      `insert into public.findings (id, workspace_id, repository_id, title)
       values ('01J0000000000000000000000C', $1, '01J0000000000000000000000A', 'A finding'),
              ('01J0000000000000000000000D', $2, '01J0000000000000000000000B', 'B finding')`,
      [workspaceA, workspaceB],
    );
    await database.query(
      `insert into public.receipts (id, workspace_id, repository_id, commit_sha)
       values ('01J0000000000000000000000E', $1, '01J0000000000000000000000A', $3),
              ('01J0000000000000000000000F', $2, '01J0000000000000000000000B', $3)`,
      [workspaceA, workspaceB, "1".repeat(40)],
    );
    await database.query(
      `insert into public.mcp_tokens (id, workspace_id, token_hash)
       values ('01J0000000000000000000000G', $1, 'token-a'),
              ('01J0000000000000000000000H', $2, 'token-b')`,
      [workspaceA, workspaceB],
    );
    await database.query(
      `insert into public.credit_ledger (id, workspace_id, event, amount, idempotency_key)
       values ('01J0000000000000000000000J', $1, 'grant', 50, 'grant-a'),
              ('01J0000000000000000000000K', $2, 'grant', 50, 'grant-b')`,
      [workspaceA, workspaceB],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it("auto-provisions exactly one owner workspace and membership per auth user", async () => {
    const workspaces = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.workspaces",
    );
    const memberships = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.workspace_members where role = 'owner'",
    );

    expect(workspaces.rows[0]?.count).toBe(2);
    expect(memberships.rows[0]?.count).toBe(2);
    expect(workspaceA).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(workspaceB).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it.each([
    ["workspaces", "select id from public.workspaces", "id"],
    [
      "repositories",
      "select workspace_id from public.repositories",
      "workspace_id",
    ],
    ["findings", "select workspace_id from public.findings", "workspace_id"],
    ["receipts", "select workspace_id from public.receipts", "workspace_id"],
    [
      "mcp_tokens",
      "select workspace_id from public.mcp_tokens",
      "workspace_id",
    ],
    [
      "credit_ledger",
      "select workspace_id from public.credit_ledger",
      "workspace_id",
    ],
  ] as const)(
    "prevents user A reading user B %s rows",
    async (_table, query, workspaceColumn) => {
      const rows = await asAuthenticatedUser(
        database,
        USER_A,
        async (transaction) => transaction.query<Record<string, string>>(query),
      );

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.[workspaceColumn] ?? rows.rows[0]?.id).toBe(
        workspaceA,
      );
    },
  );

  it("prevents cross-tenant repository mutation at the database layer", async () => {
    const update = await asAuthenticatedUser(
      database,
      USER_A,
      async (transaction) =>
        transaction.query(
          "update public.repositories set full_name = 'stolen/repo' where workspace_id = $1 returning id",
          [workspaceB],
        ),
    );

    expect(update.rows).toEqual([]);

    await expect(
      asAuthenticatedUser(database, USER_A, async (transaction) =>
        transaction.query(
          "insert into public.repositories (workspace_id, full_name) values ($1, 'stolen/new')",
          [workspaceB],
        ),
      ),
    ).rejects.toThrow(/row-level security policy/);
  });

  it.each([
    [
      "findings",
      "update public.findings set title = 'tampered' where workspace_id = $1",
    ],
    ["receipts", "delete from public.receipts where workspace_id = $1"],
    [
      "credit_ledger",
      "update public.credit_ledger set amount = 999 where workspace_id = $1",
    ],
  ] as const)(
    "prevents user A mutating user B %s rows",
    async (_table, query) => {
      await expect(
        asAuthenticatedUser(database, USER_A, async (transaction) =>
          transaction.query(query, [workspaceB]),
        ),
      ).rejects.toThrow(/permission denied|row-level security policy/);
    },
  );

  it("prevents user A deleting user B MCP tokens", async () => {
    const deletion = await asAuthenticatedUser(
      database,
      USER_A,
      async (transaction) =>
        transaction.query(
          "delete from public.mcp_tokens where workspace_id = $1 returning id",
          [workspaceB],
        ),
    );

    expect(deletion.rows).toEqual([]);
  });
});
