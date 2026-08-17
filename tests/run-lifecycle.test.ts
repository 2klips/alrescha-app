import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AI_JUDGMENT_MIGRATION,
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  LIBRARY_MIGRATION,
  PILOT_INSTRUMENTATION_MIGRATION,
  PROGRESS_DASHBOARD_MIGRATION,
  RELEASE_HARDENING_MIGRATION,
  REPOSITORY_SCAN_MIGRATION,
  RUN_LIFECYCLE_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const USER = "31111111-1111-4111-8111-111111111111";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;

interface RunRow {
  readonly completed_at: string | null;
  readonly started_at: string | null;
  readonly status: string;
}

/**
 * OQ-014 — the queue functions now write the run lifecycle. Every case below
 * drives the run exclusively through the production SQL functions (enqueue →
 * claim → finish/reject/cancel); no test writes `runs.status` except the
 * resurrection guard, which simulates the revocation path.
 */
describe("run lifecycle written by the job queue", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;
  const repository = fixedUlid("A");
  const run = fixedUlid("R");

  beforeEach(async () => {
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
      PROGRESS_DASHBOARD_MIGRATION,
      LIBRARY_MIGRATION,
      RUN_LIFECYCLE_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'runs@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [USER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/repo')",
      [repository, workspace],
    );
    await database.query(
      `insert into public.runs (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'push', 'seed', $4)`,
      [run, workspace, repository, "1".repeat(40)],
    );
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 100, 'initial')`,
      [workspace],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function enqueue(
    kind: "analyze" | "judge" | "scan",
    key: string,
    maxAttempts = 3,
  ): Promise<string> {
    const result = await database.query<{ id: string }>(
      "select public.enqueue_job($1, $2, $3, $4, $5, '{}'::jsonb, 0, $6) as id",
      [workspace, repository, run, kind, key, maxAttempts],
    );
    return result.rows[0]?.id ?? "";
  }

  async function claim(): Promise<string> {
    const result = await database.query<{ id: string }>(
      "select id from public.claim_next_job($1, 'worker-1', 30)",
      [workspace],
    );
    return result.rows[0]?.id ?? "";
  }

  async function finish(jobId: string, succeeded: boolean): Promise<string> {
    const result = await database.query<{ outcome: string }>(
      "select public.finish_job($1, 'worker-1', $2, $3) as outcome",
      [jobId, succeeded, succeeded ? null : "analysis blew up"],
    );
    return result.rows[0]?.outcome ?? "";
  }

  async function runRow(): Promise<RunRow> {
    const result = await database.query<RunRow>(
      "select status, started_at, completed_at from public.runs where id = $1",
      [run],
    );
    return result.rows[0]!;
  }

  it("claiming the first job marks the run running and stamps started_at once", async () => {
    await enqueue("scan", "k-scan");
    await enqueue("analyze", "k-analyze");
    expect((await runRow()).status).toBe("pending");

    const first = await claim();
    const afterFirstClaim = await runRow();
    expect(afterFirstClaim.status).toBe("running");
    expect(afterFirstClaim.started_at).not.toBeNull();

    await finish(first, true);
    await claim();
    // The second claim must not move started_at. (PGlite returns timestamptz
    // as Date objects, so this is a value comparison, not identity.)
    expect((await runRow()).started_at).toStrictEqual(
      afterFirstClaim.started_at,
    );
  });

  it("the run succeeds only when its last job succeeds", async () => {
    await enqueue("scan", "k-scan");
    await enqueue("analyze", "k-analyze");

    await finish(await claim(), true);
    const midway = await runRow();
    expect(midway.status).toBe("running");
    expect(midway.completed_at).toBeNull();

    await finish(await claim(), true);
    const done = await runRow();
    expect(done.status).toBe("succeeded");
    expect(done.completed_at).not.toBeNull();

    // The exact shape the pilot report queries is now satisfiable from the
    // production path (it was empty by construction before — OQ-014).
    const pilotShape = await database.query(
      `select id from public.runs
       where workspace_id = $1 and status = 'succeeded'
         and started_at is not null and completed_at is not null`,
      [workspace],
    );
    expect(pilotShape.rows).toHaveLength(1);
  });

  it("a terminal job failure fails the run", async () => {
    await enqueue("scan", "k-scan");
    await enqueue("analyze", "k-analyze", 1);

    await finish(await claim(), true);
    expect(await finish(await claim(), false)).toBe("failed");

    const failed = await runRow();
    expect(failed.status).toBe("failed");
    expect(failed.completed_at).not.toBeNull();
  });

  it("a retry requeue keeps the run running", async () => {
    await enqueue("scan", "k-scan", 3);
    expect(await finish(await claim(), false)).toBe("retrying");

    const retrying = await runRow();
    expect(retrying.status).toBe("running");
    expect(retrying.completed_at).toBeNull();
  });

  it("a rejected job settles the run as failed", async () => {
    await enqueue("judge", "k-judge");
    const jobId = await claim();
    const rejected = await database.query<{ outcome: string }>(
      "select public.reject_job($1, 'worker-1', 'schema-invalid output') as outcome",
      [jobId],
    );
    expect(rejected.rows[0]?.outcome).toBe("failed");
    expect((await runRow()).status).toBe("failed");
  });

  it("cancelling every job cancels the run, and a failure outranks a cancel", async () => {
    const scan = await enqueue("scan", "k-scan");
    const analyze = await enqueue("analyze", "k-analyze");
    await database.query("select public.cancel_job($1, $2)", [workspace, scan]);
    // The analyze job is still queued, so the run is not settled yet.
    expect((await runRow()).status).toBe("pending");
    await database.query("select public.cancel_job($1, $2)", [
      workspace,
      analyze,
    ]);
    expect((await runRow()).status).toBe("cancelled");
  });

  it("a failed job outranks cancelled jobs in the run verdict", async () => {
    const scan = await enqueue("scan", "k-scan");
    await enqueue("analyze", "k-analyze", 1);
    await database.query("select public.cancel_job($1, $2)", [workspace, scan]);
    expect(await finish(await claim(), false)).toBe("failed");
    expect((await runRow()).status).toBe("failed");
  });

  it("never resurrects a run the revocation path already cancelled", async () => {
    await enqueue("scan", "k-scan");
    await database.query(
      "update public.runs set status = 'cancelled', completed_at = now() where id = $1",
      [run],
    );

    const jobId = await claim();
    expect((await runRow()).status).toBe("cancelled");
    await finish(jobId, true);
    expect((await runRow()).status).toBe("cancelled");
  });
});
