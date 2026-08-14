import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AI_JUDGMENT_MIGRATION,
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  PILOT_INSTRUMENTATION_MIGRATION,
  RELEASE_HARDENING_MIGRATION,
  REPOSITORY_SCAN_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const ROOT = resolve(import.meta.dirname, "..");
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const INSTALLATION_ID = "01J0000000000000000000000A";
const REPOSITORY_ID = "01J0000000000000000000000B";
const RUN_ID = "01J0000000000000000000000C";

describe("pilot release hardening", () => {
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
      AI_JUDGMENT_MIGRATION,
      PILOT_INSTRUMENTATION_MIGRATION,
      RELEASE_HARDENING_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'release-a@example.test'), ($2, 'release-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{ id: string; owner_user_id: string }>(
      "select id, owner_user_id from public.workspaces",
    );
    workspaceA = workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)?.id ?? "";
    workspaceB = workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)?.id ?? "";
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 777, 1001, 'specproof')`,
      [INSTALLATION_ID, workspaceA],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id, selected_at)
       values ($1, $2, 'specproof/drifted-demo', $3, 424242, now())`,
      [REPOSITORY_ID, workspaceA, INSTALLATION_ID],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'release-revoke', $4)`,
      [RUN_ID, workspaceA, REPOSITORY_ID, "1".repeat(40)],
    );
    await database.query(
      `insert into public.jobs
        (workspace_id, repository_id, run_id, kind, idempotency_key)
       values ($1, $2, $3, 'scan', 'release-revoke-scan')`,
      [workspaceA, REPOSITORY_ID, RUN_ID],
    );
  });

  afterAll(async () => database.close());

  it("marks a revoked installation, cancels repository jobs, and audits once", async () => {
    const first = await database.query<{ revoke_github_installation: string }>(
      "select public.revoke_github_installation(777, 'deleted', 'delivery-release-1')",
    );
    const duplicate = await database.query<{ revoke_github_installation: string }>(
      "select public.revoke_github_installation(777, 'deleted', 'delivery-release-1')",
    );
    const installation = await database.query<{ revoked_at: string | null; revocation_reason: string | null }>(
      "select revoked_at, revocation_reason from public.github_installations where id = $1",
      [INSTALLATION_ID],
    );
    const jobs = await database.query<{ status: string }>(
      "select status from public.jobs where workspace_id = $1",
      [workspaceA],
    );
    const audits = await database.query<{ action: string; count: number }>(
      `select action, count(*)::integer as count
       from public.security_audit_events
       where workspace_id = $1 and action = 'github_installation_revoked'
       group by action`,
      [workspaceA],
    );

    expect(first.rows[0]?.revoke_github_installation).toBe("revoked");
    expect(duplicate.rows[0]?.revoke_github_installation).toBe("duplicate");
    expect(installation.rows[0]?.revoked_at).not.toBeNull();
    expect(installation.rows[0]?.revocation_reason).toBe("deleted");
    expect(jobs.rows).toEqual([{ status: "cancelled" }]);
    expect(audits.rows).toEqual([{ action: "github_installation_revoked", count: 1 }]);
  });

  it("isolates minimal audit metadata by workspace", async () => {
    await database.query(
      "select public.record_security_audit_event($1, 'system', null, 'repository_selected', 'repository', null, '{}'::jsonb, 'release-b')",
      [workspaceB],
    );
    const visible = await asAuthenticatedUser(database, USER_A, (transaction) =>
      transaction.query<{ workspace_id: string }>("select workspace_id from public.security_audit_events"),
    );

    expect(visible.rows.length).toBeGreaterThan(0);
    expect(visible.rows.every(({ workspace_id }) => workspace_id === workspaceA)).toBe(true);
  });

  it("enforces a durable workspace operation limit", async () => {
    const consume = () => database.query<{ allowed: boolean }>(
      "select public.consume_workspace_security_limit($1, 'repository_selection', 2, 60) as allowed",
      [workspaceA],
    );

    expect((await consume()).rows[0]?.allowed).toBe(true);
    expect((await consume()).rows[0]?.allowed).toBe(true);
    expect((await consume()).rows[0]?.allowed).toBe(false);
  });

  it("prunes expired access events using workspace retention", async () => {
    await database.query(
      `insert into public.mcp_tokens
        (id, workspace_id, token_hash, token_prefix, created_by)
       values ('01J0000000000000000000000D', $1, 'release-retention-token', 'sp_rel', $2)`,
      [workspaceA, USER_A],
    );
    await database.query(
      `insert into public.access_events (id, workspace_id, token_id, tool, occurred_at)
       values
        ('01J0000000000000000000000E', $1, '01J0000000000000000000000D', 'search_index', now() - interval '31 days'),
        ('01J0000000000000000000000F', $1, '01J0000000000000000000000D', 'search_index', now() - interval '2 days')`,
      [workspaceA],
    );

    const pruned = await database.query<{ prune_expired_access_events: number }>(
      "select public.prune_expired_access_events()",
    );
    const remaining = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.access_events where workspace_id = $1",
      [workspaceA],
    );

    expect(pruned.rows[0]?.prune_expired_access_events).toBe(1);
    expect(remaining.rows[0]?.count).toBe(1);
  });

  it("ships explicit security, privacy, deployment, and pilot documents", async () => {
    const documents = await Promise.all(
      ["SECURITY_CHECKLIST.md", "PRIVACY.md", "DEPLOYMENT_CHECKLIST.md", "PILOT_RECRUITMENT.md"].map(
        (name) => readFile(resolve(ROOT, "docs", name), "utf8"),
      ),
    );
    const releaseText = documents.join("\n");

    expect(releaseText).toContain("metadata-only");
    expect(releaseText).toContain("transient");
    expect(releaseText).toContain("BYOK");
    expect(releaseText).toContain("/app/stats");
    expect(releaseText).toContain("baseline");
    expect(releaseText).not.toMatch(/guaranteed savings/i);
  });
});
