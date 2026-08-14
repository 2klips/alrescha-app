import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import { encryptByokKey } from "../packages/core/src/ai/byok";

import {
  AI_JUDGMENT_MIGRATION,
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;

describe("AI judgment persistence", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  const repositoryId = fixedUlid("A");
  const runId = fixedUlid("B");

  beforeEach(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
      WORKER_CREDIT_MIGRATION,
      HOSTED_MCP_MIGRATION,
      AI_JUDGMENT_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'judge@example.test')",
      [USER_ID],
    );
    workspaceId =
      (await database.query<{ id: string }>("select id from public.workspaces"))
        .rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/repo')",
      [repositoryId, workspaceId],
    );
    await database.query(
      `insert into public.runs (id, workspace_id, repository_id, trigger_kind, trigger_key)
       values ($1, $2, $3, 'manual', 'judgment-run')`,
      [runId, workspaceId, repositoryId],
    );
  });

  afterEach(async () => database.close());

  it("stores one inferred payload record per successful judgment job", async () => {
    const job = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'judge', 'judge-once', '{}'::jsonb, 0, 3) as id`,
      [workspaceId, repositoryId, runId],
    );
    const jobId = job.rows[0]?.id ?? "";
    const payload = {
      confidence: 0.88,
      evidenceGrade: "inferred",
      explanation: "Both spans govern the same API scope.",
      severity: "medium",
      verdict: "confirmed",
    };

    await database.query(
      `select public.record_successful_judgment($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [
        jobId,
        workspaceId,
        repositoryId,
        "contradiction-confirmation",
        "finding-1",
        "openai",
        JSON.stringify(payload),
        "a".repeat(64),
        "test-model",
      ],
    );
    await database.query(
      `select public.record_successful_judgment($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [
        jobId,
        workspaceId,
        repositoryId,
        "contradiction-confirmation",
        "finding-1",
        "openai",
        JSON.stringify(payload),
        "a".repeat(64),
        "test-model",
      ],
    );
    const records = await database.query<{
      evidence_grade: string;
      payload: unknown;
    }>(
      "select evidence_grade, payload from public.judgments where job_id = $1",
      [jobId],
    );

    expect(records.rows).toEqual([{ evidence_grade: "inferred", payload }]);
  });

  it("records the payload before atomically upgrading finding confidence and severity", async () => {
    const findingId = fixedUlid("F");
    await database.query(
      `insert into public.findings
        (id, workspace_id, repository_id, title, provenance, confidence, severity)
       values ($1, $2, $3, 'Ambiguous conflict', '{"reason":"deterministic candidate"}', 0.55, 'low')`,
      [findingId, workspaceId, repositoryId],
    );
    const job = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'judge', 'apply-finding', '{}'::jsonb, 0, 3) as id`,
      [workspaceId, repositoryId, runId],
    );
    const jobId = job.rows[0]?.id ?? "";
    const payload = {
      confidence: 0.88,
      evidenceGrade: "inferred",
      explanation: "The contradiction is confirmed.",
      severity: "medium",
      verdict: "confirmed",
    };

    await database.query(
      `select public.apply_successful_judgment($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
      [
        jobId,
        workspaceId,
        repositoryId,
        "contradiction-confirmation",
        findingId,
        "openai",
        JSON.stringify(payload),
        "d".repeat(64),
        "test-model",
        0.88,
        "medium",
      ],
    );
    const finding = await database.query<{
      confidence: number;
      evidence_grade: string;
      severity: string;
    }>(
      "select confidence::real, evidence_grade, severity from public.findings where id = $1",
      [findingId],
    );
    const judgment = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.judgments where job_id = $1",
      [jobId],
    );

    expect(judgment.rows[0]?.count).toBe(1);
    expect(finding.rows[0]).toEqual({
      confidence: 0.88,
      evidence_grade: "inferred",
      severity: "medium",
    });
  });

  it("rejects any attempt to store AI judgment as verified", async () => {
    const job = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'judge', 'judge-invalid', '{}'::jsonb, 0, 3) as id`,
      [workspaceId, repositoryId, runId],
    );
    const jobId = job.rows[0]?.id ?? "";

    await expect(
      database.query(
        `select public.record_successful_judgment($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [
          jobId,
          workspaceId,
          repositoryId,
          "drift-verdict-confirmation",
          "finding-2",
          "openai",
          JSON.stringify({
            confidence: 1,
            evidenceGrade: "verified",
            explanation: "invalid",
            severity: "critical",
            verdict: "confirmed",
          }),
          "b".repeat(64),
          "test-model",
        ],
      ),
    ).rejects.toThrow(/judgment payload must remain inferred/);
  });

  it("records schema-invalid metadata, rejects the job, and refunds immediately", async () => {
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 20, 'judgment-grant')`,
      [workspaceId],
    );
    const job = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'judge', 'invalid-output', '{}'::jsonb, 10, 3) as id`,
      [workspaceId, repositoryId, runId],
    );
    const jobId = job.rows[0]?.id ?? "";
    await database.query(
      "select * from public.claim_next_job($1, 'judge-worker', 30)",
      [workspaceId],
    );
    await database.query("select public.reserve_job_credits($1)", [jobId]);
    await database.query(
      `select public.record_invalid_judgment($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [
        jobId,
        workspaceId,
        repositoryId,
        "openai",
        "test-model",
        JSON.stringify([{ code: "invalid_value", path: "evidenceGrade" }]),
        "c".repeat(64),
        1,
      ],
    );
    await database.query(
      "select public.reject_job($1, 'judge-worker', 'schema invalid')",
      [jobId],
    );

    const balance = await database.query<{ balance: number }>(
      "select sum(amount)::integer as balance from public.credit_ledger where workspace_id = $1",
      [workspaceId],
    );
    const entries = await database.query<{ event: string }>(
      "select event from public.credit_ledger where job_id = $1 order by created_at",
      [jobId],
    );
    const attempts = await database.query<{
      error_code: string;
      payload_digest: string;
    }>(
      "select error_code, payload_digest from public.judgment_attempts where job_id = $1",
      [jobId],
    );

    expect(balance.rows[0]?.balance).toBe(20);
    expect(entries.rows.map(({ event }) => event)).toEqual([
      "reserve",
      "refund",
    ]);
    expect(attempts.rows).toEqual([
      { error_code: "schema_invalid", payload_digest: "c".repeat(64) },
    ]);
  });

  it("stores BYOK credentials only as encrypted envelopes", async () => {
    const providerKey = "workspace-provider-secret";
    const envelope = encryptByokKey({
      masterKey: randomBytes(32).toString("base64"),
      providerKey,
    });

    await database.query(
      `insert into public.workspace_ai_keys
        (workspace_id, provider, algorithm, ciphertext, iv, auth_tag, key_version)
       values ($1, 'openai', $2, $3, $4, $5, $6)`,
      [
        workspaceId,
        envelope.algorithm,
        envelope.ciphertext,
        envelope.iv,
        envelope.authTag,
        envelope.version,
      ],
    );
    const stored = await database.query<Record<string, unknown>>(
      "select provider, algorithm, ciphertext, iv, auth_tag, key_version from public.workspace_ai_keys where workspace_id = $1",
      [workspaceId],
    );

    expect(JSON.stringify(stored.rows)).not.toContain(providerKey);
    expect(stored.rows[0]).toMatchObject({
      algorithm: "aes-256-gcm",
      key_version: 1,
      provider: "openai",
    });
    await expect(
      asAuthenticatedUser(database, USER_ID, (transaction) =>
        transaction.query("select provider from public.workspace_ai_keys"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("reuses one reservation across a provider retry and settles once", async () => {
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 30, 'retry-grant')`,
      [workspaceId],
    );
    const job = await database.query<{ id: string }>(
      `select public.enqueue_job($1, $2, $3, 'judge', 'retry-once', '{}'::jsonb, 10, 3) as id`,
      [workspaceId, repositoryId, runId],
    );
    const jobId = job.rows[0]?.id ?? "";
    await database.query(
      "select * from public.claim_next_job($1, 'worker-1', 30)",
      [workspaceId],
    );
    const first = await database.query<{ reservation_id: string }>(
      "select public.reserve_job_credits($1) as reservation_id",
      [jobId],
    );
    await database.query(
      "select public.finish_job($1, 'worker-1', false, 'transient')",
      [jobId],
    );
    await database.query(
      "update public.jobs set available_at = now() where id = $1",
      [jobId],
    );
    await database.query(
      "select * from public.claim_next_job($1, 'worker-2', 30)",
      [workspaceId],
    );
    const second = await database.query<{ reservation_id: string }>(
      "select public.reserve_job_credits($1) as reservation_id",
      [jobId],
    );
    await database.query(
      "select public.finish_job($1, 'worker-2', true, null)",
      [jobId],
    );
    const entries = await database.query<{ event: string }>(
      "select event from public.credit_ledger where job_id = $1 order by created_at",
      [jobId],
    );

    expect(second.rows[0]?.reservation_id).toBe(first.rows[0]?.reservation_id);
    expect(entries.rows.map(({ event }) => event)).toEqual([
      "reserve",
      "settle",
    ]);
  });

  it("completes a BYOK judgment with no credit ledger event", async () => {
    const job = await database.query<{ id: string }>(
      `select public.enqueue_job(
        $1, $2, $3, 'judge', 'byok-free',
        '{"billingMode":"byok"}'::jsonb, 0, 3
      ) as id`,
      [workspaceId, repositoryId, runId],
    );
    const jobId = job.rows[0]?.id ?? "";
    await database.query(
      "select * from public.claim_next_job($1, 'worker-byok', 30)",
      [workspaceId],
    );
    const reservation = await database.query<{ reservation_id: string | null }>(
      "select public.reserve_job_credits($1) as reservation_id",
      [jobId],
    );
    await database.query(
      "select public.finish_job($1, 'worker-byok', true, null)",
      [jobId],
    );
    const entries = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.credit_ledger where job_id = $1",
      [jobId],
    );

    expect(reservation.rows[0]?.reservation_id).toBeNull();
    expect(entries.rows[0]?.count).toBe(0);
  });
});
