import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Phase 2C todo 8 — coaching bills through the credit ledger.
 *
 * Coaching became a fifth job kind rather than a second billing path, so what
 * has to be proven is that it inherits the existing lifecycle exactly: charge
 * on success, refund on a schema-invalid rejection, no double charge on
 * retry, and no reservation at all under BYOK. Each assertion reads the
 * ledger, not the job row — the ledger is what a bill is drawn from.
 */

const USER_A = "71111111-1111-4111-8111-111111111111";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;

describe("coaching credit lifecycle (Phase 2C todo 8)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;
  const repository = fixedUlid("E");
  const run = fixedUlid("F");

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'coach-a@example.test')",
      [USER_A],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [USER_A],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/coach-repo')",
      [repository, workspace],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'coach-seed', $4)`,
      [run, workspace, repository, "c".repeat(40)],
    );
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 100, 'coach-initial')`,
      [workspace],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function enqueueCoaching(key: string, cost = 5): Promise<string> {
    const result = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'coach', $4, '{}'::jsonb, $5, 3) as id`,
      [workspace, repository, run, key, cost],
    );
    return result.rows[0]?.id ?? "";
  }

  async function claim(workerId = "worker-1") {
    return database.query<{ id: string }>(
      "select id from public.claim_next_job($1, $2, 30)",
      [workspace, workerId],
    );
  }

  async function ledger(): Promise<{ amount: number; event: string }[]> {
    const rows = await database.query<{ amount: number; event: string }>(
      "select event, amount from public.credit_ledger where event <> 'grant' order by created_at, id",
    );
    return rows.rows;
  }

  async function balance(): Promise<number> {
    const rows = await database.query<{ total: number }>(
      "select coalesce(sum(amount), 0)::integer as total from public.credit_ledger where workspace_id = $1",
      [workspace],
    );
    return rows.rows[0]?.total ?? 0;
  }

  it("accepts 'coach' as a billable kind", async () => {
    const id = await enqueueCoaching("coach-accepted");
    const row = await database.query<{ credit_cost: number; kind: string }>(
      "select kind, credit_cost from public.jobs where id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({ credit_cost: 5, kind: "coach" });
  });

  it("charges a successful coaching job once", async () => {
    const id = await enqueueCoaching("coach-success");
    await claim();
    await database.query("select public.reserve_job_credits($1)", [id]);
    await database.query(
      "select public.finish_job($1, 'worker-1', true, null) as outcome",
      [id],
    );

    expect(await ledger()).toEqual([
      { amount: -5, event: "reserve" },
      { amount: 0, event: "settle" },
    ]);
    expect(await balance()).toBe(95);
  });

  it("refunds when the model's output fails the schema — the no-charge rule", async () => {
    const id = await enqueueCoaching("coach-invalid");
    await claim();
    await database.query("select public.reserve_job_credits($1)", [id]);
    // What the worker does on CoachingValidationError: reject, never finish.
    await database.query(
      "select public.reject_job($1, 'worker-1', 'Coaching output failed the schema contract') as outcome",
      [id],
    );

    const entries = await ledger();
    expect(entries.map(({ event }) => event)).toEqual(["reserve", "refund"]);
    expect(await balance()).toBe(100);
  });

  it("does not double-charge when a coaching job is retried", async () => {
    const id = await enqueueCoaching("coach-retry");
    await claim();
    await database.query("select public.reserve_job_credits($1)", [id]);
    // A transient failure requeues the job; the reservation settles first.
    await database.query(
      "select public.finish_job($1, 'worker-1', false, 'transient') as outcome",
      [id],
    );
    await claim("worker-2");
    await database.query("select public.reserve_job_credits($1)", [id]);
    await database.query(
      "select public.finish_job($1, 'worker-2', true, null) as outcome",
      [id],
    );

    // The reservation lives on the job row, so the second `reserve` call
    // returns the existing one rather than taking new credits. Two attempts
    // therefore leave exactly one reserve in the ledger — a stronger property
    // than refund-and-re-reserve, since no balance moves in between.
    const reserved = (await ledger()).filter(
      ({ event }) => event === "reserve",
    );
    expect(reserved).toHaveLength(1);
    expect(await balance()).toBe(95);
  });

  it("is idempotent per key — a repeated enqueue reuses the job", async () => {
    const first = await enqueueCoaching("coach-idempotent");
    const second = await enqueueCoaching("coach-idempotent");
    expect(second).toBe(first);
    const count = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.jobs where kind = 'coach'",
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("a BYOK coaching job reserves nothing", async () => {
    const id = await enqueueCoaching("coach-byok", 0);
    await claim();
    await database.query(
      "select public.finish_job($1, 'worker-1', true, null) as outcome",
      [id],
    );
    expect(await ledger()).toEqual([]);
    expect(await balance()).toBe(100);
  });

  it("still refuses a credit cost on the deterministic kinds", async () => {
    await expect(
      database.query(
        `select public.enqueue_job($1, $2, $3, 'scan', 'scan-costly', '{}'::jsonb, 5, 3)`,
        [workspace, repository, run],
      ),
    ).rejects.toThrow(/zero credit cost/i);
  });
});
