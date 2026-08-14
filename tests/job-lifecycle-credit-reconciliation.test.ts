import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;

describe("Postgres worker queue and credit lifecycle", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;
  const repositoryA = fixedUlid("A");
  const repositoryB = fixedUlid("B");
  const runA = fixedUlid("C");
  const runB = fixedUlid("D");

  beforeEach(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
      WORKER_CREDIT_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'worker-a@example.test'), ($2, 'worker-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{ id: string; owner_user_id: string }>(
      "select id, owner_user_id from public.workspaces",
    );
    workspaceA = workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)?.id ?? "";
    workspaceB = workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)?.id ?? "";
    await database.query(
      `insert into public.repositories (id, workspace_id, full_name)
       values ($1, $2, 'owner-a/repo'), ($3, $4, 'owner-b/repo')`,
      [repositoryA, workspaceA, repositoryB, workspaceB],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'seed-a', $7),
              ($4, $5, $6, 'manual', 'seed-b', $7)`,
      [runA, workspaceA, repositoryA, runB, workspaceB, repositoryB, "1".repeat(40)],
    );
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 100, 'initial-a'), ($2, 'grant', 100, 'initial-b')`,
      [workspaceA, workspaceB],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function enqueue(input: {
    cost?: number;
    key: string;
    kind: "analyze" | "judge" | "pack" | "scan";
    maxAttempts?: number;
    repositoryId?: string;
    runId?: string;
    workspaceId?: string;
  }): Promise<string> {
    const result = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, $4, $5, '{}'::jsonb, $6, $7) as id`,
      [
        input.workspaceId ?? workspaceA,
        input.repositoryId ?? repositoryA,
        input.runId ?? runA,
        input.kind,
        input.key,
        input.cost ?? 0,
        input.maxAttempts ?? 3,
      ],
    );
    return result.rows[0]?.id ?? "";
  }

  async function claim(workspaceId = workspaceA, workerId = "worker-1") {
    return database.query<{ attempt_count: number; id: string; workspace_id: string }>(
      "select id, workspace_id, attempt_count from public.claim_next_job($1, $2, 30)",
      [workspaceId, workerId],
    );
  }

  async function balance(workspaceId = workspaceA): Promise<number> {
    const result = await database.query<{ balance: number }>(
      "select coalesce(sum(amount), 0)::integer as balance from public.credit_ledger where workspace_id = $1",
      [workspaceId],
    );
    return result.rows[0]?.balance ?? 0;
  }

  it("turns one webhook delivery into idempotent zero-credit scan and analyze jobs", async () => {
    const parameters = [
      workspaceA,
      repositoryA,
      "00000000-0000-4000-8000-000000000010",
      "push",
      null,
      null,
      "2".repeat(40),
      "a".repeat(64),
    ];
    const first = await database.query<{ inserted: boolean }>(
      "select public.ingest_github_webhook_event($1,$2,$3,$4,$5,$6,$7,$8) as inserted",
      parameters,
    );
    const duplicate = await database.query<{ inserted: boolean }>(
      "select public.ingest_github_webhook_event($1,$2,$3,$4,$5,$6,$7,$8) as inserted",
      parameters,
    );
    const jobs = await database.query<{ credit_cost: number; kind: string }>(
      "select kind, credit_cost from public.jobs order by kind",
    );
    const ledger = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.credit_ledger where event <> 'grant'",
    );

    expect(first.rows[0]?.inserted).toBe(true);
    expect(duplicate.rows[0]?.inserted).toBe(false);
    expect(jobs.rows).toEqual([
      { credit_cost: 0, kind: "analyze" },
      { credit_cost: 0, kind: "scan" },
    ]);
    expect(ledger.rows[0]?.count).toBe(0);
  });

  it("single-claims jobs and never crosses the requested tenant", async () => {
    const jobA = await enqueue({ key: "claim-a", kind: "scan" });
    const jobB = await enqueue({
      key: "claim-b",
      kind: "scan",
      repositoryId: repositoryB,
      runId: runB,
      workspaceId: workspaceB,
    });

    const firstA = await claim(workspaceA, "worker-a-1");
    const secondA = await claim(workspaceA, "worker-a-2");
    const firstB = await claim(workspaceB, "worker-b-1");

    expect(firstA.rows.map(({ id }) => id)).toEqual([jobA]);
    expect(secondA.rows).toEqual([]);
    expect(firstB.rows.map(({ id }) => id)).toEqual([jobB]);
    expect(firstA.rows[0]?.workspace_id).toBe(workspaceA);
    expect(firstB.rows[0]?.workspace_id).toBe(workspaceB);
  });

  it("accepts heartbeats only from the active claimant", async () => {
    const jobId = await enqueue({ key: "heartbeat", kind: "scan" });
    await claim(workspaceA, "active-worker");
    const rejected = await database.query<{ accepted: boolean }>(
      "select public.heartbeat_job($1, 'wrong-worker', 30) as accepted",
      [jobId],
    );
    const accepted = await database.query<{ accepted: boolean }>(
      "select public.heartbeat_job($1, 'active-worker', 30) as accepted",
      [jobId],
    );

    expect(rejected.rows[0]?.accepted).toBe(false);
    expect(accepted.rows[0]?.accepted).toBe(true);
  });

  it("bounds retries at max_attempts", async () => {
    const jobId = await enqueue({ key: "bounded", kind: "judge", maxAttempts: 2 });
    await claim();
    const firstFailure = await database.query<{ outcome: string }>(
      "select public.finish_job($1, 'worker-1', false, 'transient') as outcome",
      [jobId],
    );
    await database.query("update public.jobs set available_at = now() where id = $1", [jobId]);
    await claim();
    const secondFailure = await database.query<{ outcome: string }>(
      "select public.finish_job($1, 'worker-1', false, 'permanent') as outcome",
      [jobId],
    );
    const thirdClaim = await claim();
    const job = await database.query<{ attempt_count: number; status: string }>(
      "select status, attempt_count from public.jobs where id = $1",
      [jobId],
    );

    expect(firstFailure.rows[0]?.outcome).toBe("retrying");
    expect(secondFailure.rows[0]?.outcome).toBe("failed");
    expect(thirdClaim.rows).toEqual([]);
    expect(job.rows[0]).toEqual({ attempt_count: 2, status: "failed" });
  });

  it("cancels safely, rejects late completion, and refunds once", async () => {
    const jobId = await enqueue({ cost: 10, key: "cancel-credit", kind: "judge" });
    await claim();
    await database.query("select public.reserve_job_credits($1)", [jobId]);
    const cancelled = await database.query<{ cancelled: boolean }>(
      "select public.cancel_job($1, $2) as cancelled",
      [workspaceA, jobId],
    );
    const repeated = await database.query<{ cancelled: boolean }>(
      "select public.cancel_job($1, $2) as cancelled",
      [workspaceA, jobId],
    );
    const lateFinish = await database.query<{ outcome: string }>(
      "select public.finish_job($1, 'worker-1', true, null) as outcome",
      [jobId],
    );
    const refunds = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.credit_ledger where job_id = $1 and event = 'refund'",
      [jobId],
    );

    expect(cancelled.rows[0]?.cancelled).toBe(true);
    expect(repeated.rows[0]?.cancelled).toBe(false);
    expect(lateFinish.rows[0]?.outcome).toBe("ignored");
    expect(refunds.rows[0]?.count).toBe(1);
    expect(await balance()).toBe(100);
  });

  it("reserves and settles credits exactly once on success", async () => {
    const jobId = await enqueue({ cost: 10, key: "settle-credit", kind: "judge" });
    await claim();
    const firstReservation = await database.query<{ id: string }>(
      "select public.reserve_job_credits($1) as id",
      [jobId],
    );
    const secondReservation = await database.query<{ id: string }>(
      "select public.reserve_job_credits($1) as id",
      [jobId],
    );
    await database.query("select public.finish_job($1, 'worker-1', true, null)", [jobId]);
    await database.query("select public.settle_job_credits($1, true)", [jobId]);
    const entries = await database.query<{ amount: number; event: string }>(
      "select event, amount from public.credit_ledger where job_id = $1 order by event",
      [jobId],
    );

    expect(firstReservation.rows[0]?.id).toBe(secondReservation.rows[0]?.id);
    expect(entries.rows).toEqual([
      { amount: -10, event: "reserve" },
      { amount: 0, event: "settle" },
    ]);
    expect(await balance()).toBe(90);
  });

  it("refunds a terminal failed judgment and forbids charging deterministic jobs", async () => {
    const jobId = await enqueue({ cost: 15, key: "failed-credit", kind: "judge", maxAttempts: 1 });
    await claim();
    await database.query("select public.reserve_job_credits($1)", [jobId]);
    const failure = await database.query<{ outcome: string }>(
      "select public.finish_job($1, 'worker-1', false, 'provider failed') as outcome",
      [jobId],
    );

    await expect(
      enqueue({ cost: 1, key: "illegal-scan-charge", kind: "scan" }),
    ).rejects.toThrow(/deterministic jobs must have zero credit cost/);
    expect(failure.rows[0]?.outcome).toBe("failed");
    expect(await balance()).toBe(100);
  });

  it("applies per-workspace enqueue rate limits without penalizing duplicates", async () => {
    await database.query(
      "update public.workspace_job_settings set max_enqueues_per_minute = 2 where workspace_id = $1",
      [workspaceA],
    );
    const first = await enqueue({ key: "rate-1", kind: "scan" });
    await enqueue({ key: "rate-2", kind: "analyze" });
    const duplicate = await enqueue({ key: "rate-1", kind: "scan" });

    await expect(enqueue({ key: "rate-3", kind: "pack" })).rejects.toThrow(
      /workspace enqueue rate limit exceeded/,
    );
    expect(duplicate).toBe(first);
  });

  it("enforces per-job and monthly workspace credit caps", async () => {
    await database.query(
      `update public.workspace_job_settings
       set per_job_credit_cap = 10, monthly_credit_cap = 15
       where workspace_id = $1`,
      [workspaceA],
    );
    const firstJob = await enqueue({ cost: 10, key: "cap-first", kind: "judge" });
    await claim();
    await database.query("select public.reserve_job_credits($1)", [firstJob]);
    await database.query("select public.finish_job($1, 'worker-1', true, null)", [firstJob]);

    const monthlyCappedJob = await enqueue({ cost: 10, key: "cap-monthly", kind: "judge" });
    await claim();
    await expect(database.query("select public.reserve_job_credits($1)", [monthlyCappedJob])).rejects.toThrow(
      /workspace monthly credit cap exceeded/,
    );

    const perJobCappedJob = await enqueue({ cost: 11, key: "cap-job", kind: "judge" });
    await database.query("update public.jobs set priority = 0 where id = $1", [perJobCappedJob]);
    await claim(workspaceA, "worker-2");
    await expect(database.query("select public.reserve_job_credits($1)", [perJobCappedJob])).rejects.toThrow(
      /per-job cap/,
    );
    expect(await balance()).toBe(90);
  });
});
