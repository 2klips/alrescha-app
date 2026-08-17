import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const OWNER = "61111111-1111-4111-8111-111111111111";
const ADMIN = "62222222-2222-4222-8222-222222222222";
const MEMBER = "63333333-3333-4333-8333-333333333333";
const VIEWER = "64444444-4444-4444-8444-444444444444";
const STRANGER = "65555555-5555-4555-8555-555555555555";

/**
 * Phase 2B todo 9 — the role capability matrix, exhaustively, positive and
 * negative, driven only through the production functions and RLS.
 */
describe("team workspaces (todo 9)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;
  const repository = "01J0000000000000000000000T";

  async function call(
    userId: string,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<unknown[]> {
    return asAuthenticatedUser(database, userId, async (transaction) => {
      const result = await transaction.query(sql, parameters);
      return result.rows;
    });
  }

  async function expectRejected(
    userId: string,
    sql: string,
    parameters: unknown[],
    message: RegExp,
  ): Promise<void> {
    await expect(call(userId, sql, parameters)).rejects.toThrow(message);
  }

  async function inviteAndAccept(
    inviter: string,
    invitee: string,
    role: string,
  ): Promise<void> {
    await call(inviter, "select public.invite_workspace_member($1, $2, $3)", [
      workspace,
      invitee,
      role,
    ]);
    await call(invitee, "select public.accept_workspace_invite($1)", [
      workspace,
    ]);
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      `insert into auth.users (id, email) values
       ($1, 'owner@example.test'), ($2, 'admin@example.test'),
       ($3, 'member@example.test'), ($4, 'viewer@example.test'),
       ($5, 'stranger@example.test')`,
      [OWNER, ADMIN, MEMBER, VIEWER, STRANGER],
    );
    workspace = (
      await database.query<{ id: string }>(
        "select id from public.workspaces where owner_user_id = $1",
        [OWNER],
      )
    ).rows[0]!.id;
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'team/repo')",
      [repository, workspace],
    );
    await database.query(
      `insert into public.findings (workspace_id, repository_id, title, source_node_id, kind, severity, status, provenance, confidence, evidence_grade)
       values ($1, $2, '팀 공유 발견', null, 'stale-doc', 'low', 'open', '{"reason":"seed"}', 0.9, 'inferred')`,
      [workspace, repository],
    );
    await inviteAndAccept(OWNER, ADMIN, "admin");
    await inviteAndAccept(ADMIN, MEMBER, "member");
    await inviteAndAccept(ADMIN, VIEWER, "viewer");
  });

  afterEach(async () => {
    await database.close();
  });

  it("shares the graph with every active role and with no one else", async () => {
    for (const userId of [OWNER, ADMIN, MEMBER, VIEWER]) {
      const rows = await call(
        userId,
        "select title from public.findings where workspace_id = $1",
        [workspace],
      );
      expect(rows).toHaveLength(1);
    }
    expect(
      await call(
        STRANGER,
        "select title from public.findings where workspace_id = $1",
        [workspace],
      ),
    ).toEqual([]);
  });

  it("enforces the invitation capability matrix, positive and negative", async () => {
    // owner may grant admin; admin may not.
    await expectRejected(
      ADMIN,
      "select public.invite_workspace_member($1, $2, 'admin')",
      [workspace, STRANGER],
      /Only the owner can grant the admin role/,
    );
    // member and viewer may invite no one.
    for (const userId of [MEMBER, VIEWER]) {
      await expectRejected(
        userId,
        "select public.invite_workspace_member($1, $2, 'viewer')",
        [workspace, STRANGER],
        /Only owners and admins can invite/,
      );
    }
    // no invitation can grant ownership.
    await expectRejected(
      OWNER,
      "select public.invite_workspace_member($1, $2, 'owner')",
      [workspace, STRANGER],
      /admin, member, or viewer only/,
    );
    // admin invites a viewer — allowed.
    await call(ADMIN, "select public.invite_workspace_member($1, $2, 'viewer')", [
      workspace,
      STRANGER,
    ]);
    // double-invite is rejected.
    await expectRejected(
      OWNER,
      "select public.invite_workspace_member($1, $2, 'viewer')",
      [workspace, STRANGER],
      /already invited or active/,
    );
  });

  it("keeps invited users powerless until they accept, and strangers cannot accept for them", async () => {
    await call(OWNER, "select public.invite_workspace_member($1, $2, 'member')", [
      workspace,
      STRANGER,
    ]);
    // Invited ≠ active: still no graph access.
    expect(
      await call(
        STRANGER,
        "select title from public.findings where workspace_id = $1",
        [workspace],
      ),
    ).toEqual([]);
    // Only the invitee can accept.
    await expectRejected(
      MEMBER,
      "select public.accept_workspace_invite($1)",
      [workspace],
      /No pending invitation/,
    );
    await call(STRANGER, "select public.accept_workspace_invite($1)", [
      workspace,
    ]);
    expect(
      await call(
        STRANGER,
        "select title from public.findings where workspace_id = $1",
        [workspace],
      ),
    ).toHaveLength(1);
  });

  it("enforces the revocation matrix and cuts access immediately", async () => {
    // member/viewer cannot revoke.
    for (const userId of [MEMBER, VIEWER]) {
      await expectRejected(
        userId,
        "select public.revoke_workspace_member($1, $2)",
        [workspace, MEMBER],
        /Only owners and admins can revoke/,
      );
    }
    // nobody revokes the owner.
    await expectRejected(
      ADMIN,
      "select public.revoke_workspace_member($1, $2)",
      [workspace, OWNER],
      /owner cannot be revoked/,
    );
    // admin cannot revoke an admin; the owner can.
    await expectRejected(
      ADMIN,
      "select public.revoke_workspace_member($1, $2)",
      [workspace, ADMIN],
      /Only the owner can revoke an admin/,
    );
    // admin revokes a member → access is gone at once.
    await call(ADMIN, "select public.revoke_workspace_member($1, $2)", [
      workspace,
      MEMBER,
    ]);
    expect(
      await call(
        MEMBER,
        "select title from public.findings where workspace_id = $1",
        [workspace],
      ),
    ).toEqual([]);
    await call(OWNER, "select public.revoke_workspace_member($1, $2)", [
      workspace,
      ADMIN,
    ]);
    expect(
      await call(
        ADMIN,
        "select title from public.findings where workspace_id = $1",
        [workspace],
      ),
    ).toEqual([]);
  });

  it("shows the roster to members but keeps cross-tenant workspaces invisible", async () => {
    const roster = await call(
      VIEWER,
      "select user_id, role, status from public.workspace_members where workspace_id = $1 order by role",
      [workspace],
    );
    expect(roster).toHaveLength(4);
    // The stranger's own personal workspace is intact and isolated.
    const strangerWorkspace = (
      await database.query<{ id: string }>(
        "select id from public.workspaces where owner_user_id = $1",
        [STRANGER],
      )
    ).rows[0]!.id;
    expect(
      await call(
        MEMBER,
        "select user_id from public.workspace_members where workspace_id = $1",
        [strangerWorkspace],
      ),
    ).toEqual([]);
  });

  it("leaves solo workspaces untouched: the owner works alone exactly as before", async () => {
    const soloWorkspace = (
      await database.query<{ id: string }>(
        "select id from public.workspaces where owner_user_id = $1",
        [STRANGER],
      )
    ).rows[0]!.id;
    const memberRows = await database.query(
      "select role, status from public.workspace_members where workspace_id = $1",
      [soloWorkspace],
    );
    expect(memberRows.rows).toEqual([{ role: "owner", status: "active" }]);
    const owned = await call(
      STRANGER,
      "select id from public.workspaces where id = $1",
      [soloWorkspace],
    );
    expect(owned).toHaveLength(1);
  });
});
