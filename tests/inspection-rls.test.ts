import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 2C todo 1 — the inspection inputs are workspace-scoped.
 *
 * The loader trusts RLS to do the tenant filtering, so these tests exercise
 * the policies directly as `authenticated`: what a member of workspace A can
 * read must never include workspace B's rows, and a non-member must not be
 * able to append to someone else's log.
 */

const USER_A = "61111111-1111-4111-8111-111111111111";
const USER_B = "62222222-2222-4222-8222-222222222222";

describe("inspection inputs are tenant-scoped (Phase 2C todo 1)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'insp-a@example.test'), ($2, 'insp-b@example.test')",
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
    await database.query(
      "select public.record_ruled_out_as($1, $2, 'A의 가설', 'A의 결과')",
      [workspaceA, USER_A],
    );
    await database.query(
      "select public.record_ruled_out_as($1, $2, 'B의 가설', 'B의 결과')",
      [workspaceB, USER_B],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("a member reads only their own workspace's ruled-out log", async () => {
    const seenByA = await asAuthenticatedUser(database, USER_A, (tx) =>
      tx.query<{ hypothesis: string }>(
        "select hypothesis from public.ruled_out_attempts",
      ),
    );
    expect(seenByA.rows).toEqual([{ hypothesis: "A의 가설" }]);

    const seenByB = await asAuthenticatedUser(database, USER_B, (tx) =>
      tx.query<{ hypothesis: string }>(
        "select hypothesis from public.ruled_out_attempts",
      ),
    );
    expect(seenByB.rows).toEqual([{ hypothesis: "B의 가설" }]);
  });

  it("a non-member cannot append to another workspace's log", async () => {
    await expect(
      asAuthenticatedUser(database, USER_B, (tx) =>
        tx.query(
          "insert into public.ruled_out_attempts (workspace_id, hypothesis, outcome) values ($1, 'B가 심은 행', '결과')",
          [workspaceA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("even a member cannot rewrite the log through the authenticated role", async () => {
    await expect(
      asAuthenticatedUser(database, USER_A, (tx) =>
        tx.query(
          "update public.ruled_out_attempts set outcome = '고쳐 씀' where workspace_id = $1",
          [workspaceA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("the audit table is reachable by service_role (the worker's role)", async () => {
    const seen = await asServiceRole(database, (tx) =>
      tx.query("select id from public.dependency_audit_reports"),
    );
    expect(seen.rows).toEqual([]);
  });

  it("uploaded dependency audits stay inside their workspace", async () => {
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/audit') as id",
      [workspaceA],
    );
    await database.query(
      "insert into public.dependency_audit_reports (workspace_id, repository_id, report) values ($1, $2, $3::jsonb)",
      [
        workspaceA,
        repository.rows[0]!.id,
        JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }),
      ],
    );

    const seenByA = await asAuthenticatedUser(database, USER_A, (tx) =>
      tx.query("select id from public.dependency_audit_reports"),
    );
    expect(seenByA.rows).toHaveLength(1);

    const seenByB = await asAuthenticatedUser(database, USER_B, (tx) =>
      tx.query("select id from public.dependency_audit_reports"),
    );
    expect(seenByB.rows).toEqual([]);
  });
});
