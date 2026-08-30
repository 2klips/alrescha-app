import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

/**
 * QW-1 / QW-8 (perf research 2026-08-27): 202608300001 rewrote every
 * `*_select_member` SELECT policy from `(select
 * public.is_workspace_member(workspace_id))` — a call the planner cannot
 * turn into a one-time initplan, because the argument is a row column — to
 * `workspace_id in (select ...)`, whose inner select depends only on
 * `(select auth.uid())` and so can be. 202608300002 added the
 * `(workspace_id, occurred_at desc)` index `access_events` reads actually
 * use.
 *
 * The bulk of the rewritten policies (findings, prompt_records,
 * ruled_out_attempts, dependency_audit_reports, workspace_members roster,
 * ...) are already exercised for cross-tenant isolation and the
 * invited/active/revoked boundary by team-workspaces.test.ts,
 * team-privacy.test.ts, and inspection-rls.test.ts, and all of those pass
 * against the rewritten migration. This file covers what those do not:
 * `workspaces_select_member` itself (the one rewritten policy keyed on `id`
 * rather than `workspace_id`) still hides another tenant's workspace, and
 * the new access_events index exists.
 */

const OWNER_A = "71111111-1111-4111-8111-111111111111";
const OWNER_B = "72222222-2222-4222-8222-222222222222";

describe("initplan-friendly select policies (QW-1) and access_events index (QW-8)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'initplan-a@example.test'), ($2, 'initplan-b@example.test')",
      [OWNER_A, OWNER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === OWNER_A)
        ?.id ?? "";
    workspaceB =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === OWNER_B)
        ?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  it("workspaces_select_member: an owner sees their own workspace and not the other tenant's", async () => {
    const ownRows = await asAuthenticatedUser(
      database,
      OWNER_A,
      async (transaction) =>
        transaction.query<{ id: string }>(
          "select id from public.workspaces where id = $1",
          [workspaceA],
        ),
    );
    expect(ownRows.rows).toEqual([{ id: workspaceA }]);

    const crossTenantRows = await asAuthenticatedUser(
      database,
      OWNER_A,
      async (transaction) =>
        transaction.query<{ id: string }>(
          "select id from public.workspaces where id = $1",
          [workspaceB],
        ),
    );
    expect(crossTenantRows.rows).toEqual([]);

    const allVisibleRows = await asAuthenticatedUser(
      database,
      OWNER_A,
      async (transaction) =>
        transaction.query<{ id: string }>("select id from public.workspaces"),
    );
    expect(allVisibleRows.rows).toEqual([{ id: workspaceA }]);
  });

  it("adds the (workspace_id, occurred_at desc) index access_events readers filter and sort by", async () => {
    const indexes = await database.query<{
      indexdef: string;
    }>(
      `select indexdef from pg_indexes
       where schemaname = 'public'
         and tablename = 'access_events'
         and indexname = 'access_events_workspace_occurred_idx'`,
    );

    expect(indexes.rows).toHaveLength(1);
    expect(indexes.rows[0]?.indexdef).toMatch(
      /\(workspace_id, occurred_at DESC\)/i,
    );
    // The prior three-column index still exists for token-scoped lookups —
    // this is an addition, not a replacement.
    const priorIndex = await database.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public'
         and tablename = 'access_events'
         and indexname = 'access_events_workspace_token_occurred_idx'`,
    );
    expect(priorIndex.rows).toHaveLength(1);
  });
});
