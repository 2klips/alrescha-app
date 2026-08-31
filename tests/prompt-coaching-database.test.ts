import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 2C todo 5 — the coaching runner's persistence contract.
 *
 * A valid rubric lands on `prompt_records.rubric` (the column the team
 * surfaces read); an invalid model output lands in the append-only
 * `prompt_coaching_attempts` log and never touches the record. Both paths
 * run as service_role, the role the worker actually holds, so a missing
 * grant fails here instead of in production.
 */

const USER_A = "72222222-2222-4222-8222-222222222222";
const USER_B = "73333333-3333-4333-8333-333333333333";
const fixedUlid = (suffix: string) => `01J1000000000000000000000${suffix}`;
const DIGEST = "a".repeat(64);

const VALID_PAYLOAD = {
  grade: "inferred",
  rubric: {
    batchSize: 1,
    contextGrounding: 2,
    noOverInstruction: 2,
    specificity: 2,
    stopCondition: 0,
    verifiability: 2,
  },
  suggestions: ["정지 조건을 넣으세요 — 어디까지 하고 멈출지 적으세요."],
} as const;

describe("prompt coaching persistence (Phase 2C todo 5)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;
  let job: string;
  const repository = fixedUlid("A");
  const run = fixedUlid("B");
  const promptRecord = fixedUlid("C");

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    for (const [user, mail] of [
      [USER_A, "coach-owner@example.test"],
      [USER_B, "coach-outsider@example.test"],
    ]) {
      await database.query(
        "insert into auth.users (id, email) values ($1, $2)",
        [user, mail],
      );
    }
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
       values ($1, $2, $3, 'manual', 'coach-store-seed', $4)`,
      [run, workspace, repository, "d".repeat(40)],
    );
    const enqueued = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'coach', 'coach-store-job', '{}'::jsonb, 0, 3) as id`,
      [workspace, repository, run],
    );
    job = enqueued.rows[0]?.id ?? "";
    // ADR-011 double opt-in: workspace capture on AND the member's consent —
    // a prompt record cannot exist without both.
    await database.query(
      `insert into public.prompt_capture_settings (workspace_id, enabled)
       values ($1, true)
       on conflict (workspace_id) do update set enabled = true`,
      [workspace],
    );
    await database.query(
      `insert into public.prompt_capture_consents (workspace_id, user_id)
       values ($1, $2)`,
      [workspace, USER_A],
    );
    await database.query(
      `insert into public.prompt_records (id, workspace_id, user_id, tool_name)
       values ($1, $2, $3, 'client:test')`,
      [promptRecord, workspace, USER_A],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function rubricOf(recordId: string): Promise<unknown> {
    const rows = await database.query<{ rubric: unknown }>(
      "select rubric from public.prompt_records where id = $1",
      [recordId],
    );
    return rows.rows[0]?.rubric;
  }

  it("lands a valid rubric on the prompt record", async () => {
    await asServiceRole(database, (transaction) =>
      transaction.query(
        `select public.apply_prompt_coaching($1, $2, $3, 'anthropic', 'claude-sonnet-5', $4::jsonb, $5)`,
        [job, workspace, promptRecord, JSON.stringify(VALID_PAYLOAD), DIGEST],
      ),
    );
    expect(await rubricOf(promptRecord)).toEqual(VALID_PAYLOAD);
  });

  it("refuses a payload that is not an inferred rubric", async () => {
    await expect(
      asServiceRole(database, (transaction) =>
        transaction.query(
          `select public.apply_prompt_coaching($1, $2, $3, 'anthropic', 'claude-sonnet-5', $4::jsonb, $5)`,
          [
            job,
            workspace,
            promptRecord,
            JSON.stringify({ ...VALID_PAYLOAD, grade: "verified" }),
            DIGEST,
          ],
        ),
      ),
    ).rejects.toThrow(/inferred rubric/);
    expect(await rubricOf(promptRecord)).toEqual({});
  });

  it("refuses a record outside the workspace", async () => {
    await expect(
      asServiceRole(database, (transaction) =>
        transaction.query(
          `select public.apply_prompt_coaching($1, $2, $3, 'anthropic', 'claude-sonnet-5', $4::jsonb, $5)`,
          [
            job,
            workspace,
            fixedUlid("Z"),
            JSON.stringify(VALID_PAYLOAD),
            DIGEST,
          ],
        ),
      ),
    ).rejects.toThrow(/is not in workspace/);
  });

  it("records an invalid output once per attempt, idempotently", async () => {
    const record = (attempt: number) =>
      asServiceRole(database, (transaction) =>
        transaction.query(
          `select public.record_invalid_prompt_coaching($1, $2, 'openai', 'gpt-5.6', 'Rubric axis specificity exceeds its observable ceiling (0).', $3, $4)`,
          [job, workspace, DIGEST, attempt],
        ),
      );
    await record(1);
    await record(1);
    await record(2);

    const attempts = await database.query<{
      error_code: string;
      status: string;
    }>(
      "select status, error_code from public.prompt_coaching_attempts where job_id = $1 order by attempt_number",
      [job],
    );
    expect(attempts.rows).toEqual([
      { error_code: "schema_invalid", status: "rejected" },
      { error_code: "schema_invalid", status: "rejected" },
    ]);
    expect(await rubricOf(promptRecord)).toEqual({});
  });

  it("keeps the attempt log tenant-isolated under RLS", async () => {
    await asServiceRole(database, (transaction) =>
      transaction.query(
        `select public.record_invalid_prompt_coaching($1, $2, 'openai', 'gpt-5.6', 'invalid', $3, 1)`,
        [job, workspace, DIGEST],
      ),
    );
    const countFor = (user: string) =>
      asAuthenticatedUser(database, user, async (transaction) => {
        const rows = await transaction.query<{ n: number }>(
          "select count(*)::int as n from public.prompt_coaching_attempts",
        );
        return rows.rows[0]?.n ?? -1;
      });
    expect(await countFor(USER_A)).toBe(1);
    expect(await countFor(USER_B)).toBe(0);
  });
});
