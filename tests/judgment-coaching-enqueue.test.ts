import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Enqueue surfaces for judge and coach (202608310002). The SQL owns the
 * rules the buttons must not be trusted with: kind mapping and open-only for
 * judgments; own-author and raw-consent for coaching; billing per mode; and
 * one job per target via the queue's idempotency key. Everything runs as
 * service_role — the role the web actions hold.
 */

const OWNER = "74444444-4444-4444-8444-444444444444";
const OUTSIDER = "75555555-5555-4555-8555-555555555555";
const fixedUlid = (suffix: string) => `01J2000000000000000000000${suffix}`;

describe("judgment/coaching enqueue functions (Phase 2C follow-up)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;
  const repository = fixedUlid("A");
  const contradiction = fixedUlid("B");
  const drift = fixedUlid("C");
  const ownRecord = fixedUlid("D");
  const outsiderRecord = fixedUlid("E");
  const silentRecord = fixedUlid("F");
  const specArtifact = fixedUlid("G");
  const requirement = fixedUlid("H");
  const oldRequirement = fixedUlid("J");

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    for (const [user, mail] of [
      [OWNER, "enqueue-owner@example.test"],
      [OUTSIDER, "enqueue-outsider@example.test"],
    ]) {
      await database.query(
        "insert into auth.users (id, email) values ($1, $2)",
        [user, mail],
      );
    }
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/enqueue-repo')",
      [repository, workspace],
    );
    await database.query(
      `insert into public.findings
        (id, workspace_id, repository_id, title, kind, severity, status, provenance, confidence)
       values
        ($1, $2, $3, 'MUST 충돌: 세션 저장 위치', 'contradicting-instructions', 'high', 'open', '{"reason":"seeded"}', 0.5),
        ($4, $2, $3, '스펙과 어긋난 구현', 'stale-doc', 'medium', 'open', '{"reason":"seeded"}', 0.7)`,
      [contradiction, workspace, repository, drift],
    );
    await database.query(
      `insert into public.prompt_capture_settings (workspace_id, enabled)
       values ($1, true)
       on conflict (workspace_id) do update set enabled = true`,
      [workspace],
    );
    // Owner consents WITH raw sync (coachable); outsider consents raw too so
    // the own-author rule — not consent — is what blocks their record.
    await database.query(
      `insert into public.prompt_capture_consents (workspace_id, user_id, raw_sync_enabled)
       values ($1, $2, true), ($1, $3, true)`,
      [workspace, OWNER, OUTSIDER],
    );
    await database.query(
      `insert into public.prompt_records (id, workspace_id, user_id, tool_name, raw_text)
       values
        ($1, $2, $3, 'client:test', 'spec/auth.md의 REQ-3 구현, tests 통과까지'),
        ($4, $2, $5, 'client:test', '남의 프롬프트 원문')`,
      [ownRecord, workspace, OWNER, outsiderRecord, OUTSIDER],
    );
    // A record captured without raw sync: metadata only, no text to coach.
    await database.query(
      `insert into public.prompt_records (id, workspace_id, user_id, tool_name)
       values ($1, $2, $3, 'client:test')`,
      [silentRecord, workspace, OWNER],
    );
    // A requirement (graph node → spec artifact → requirement row) for the
    // disambiguation surface, plus a superseded one that must be refused.
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $3, $4, 'artifact', 'spec/auth.md'),
              ($2, $3, $4, 'requirement', 'Sessions expire'),
              ($5, $3, $4, 'requirement', 'Old sessions rule')`,
      [specArtifact, requirement, workspace, repository, oldRequirement],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha)
       values ($1, $2, $3, 'spec', 'spec', 'spec/auth.md', $4, $5)`,
      [specArtifact, workspace, repository, "b".repeat(64), "2".repeat(40)],
    );
    await database.query(
      `insert into public.requirements
        (id, workspace_id, repository_id, source_artifact_id, statement, source_span, status)
       values ($1, $3, $4, $5, '세션은 적절한 시간 뒤에 만료되어야 한다', $6::jsonb, 'active'),
              ($2, $3, $4, $5, '세션은 영원히 유지된다', $6::jsonb, 'superseded')`,
      [
        requirement,
        oldRequirement,
        workspace,
        repository,
        specArtifact,
        JSON.stringify({ endLine: 8, path: "spec/auth.md", startLine: 8 }),
      ],
    );
  });

  function enqueueRequirementJudgment(requirementId: string, mode: string) {
    return asServiceRole(database, (transaction) =>
      transaction.query<{ id: string }>(
        "select public.enqueue_requirement_judgment_job($1, $2, 'anthropic', $3) as id",
        [workspace, requirementId, mode],
      ),
    );
  }

  it("enqueues a requirement disambiguation with the strict payload and a neutral baseline", async () => {
    const queued = await enqueueRequirementJudgment(requirement, "credits");
    const job = await jobRow(queued.rows[0]?.id ?? "");
    expect(job?.kind).toBe("judge");
    expect(job?.credit_cost).toBe(10);
    expect(Object.keys(job?.payload ?? {}).sort()).toEqual([
      "billingMode",
      "context",
      "currentConfidence",
      "currentSeverity",
      "kind",
      "provider",
      "targetId",
    ]);
    expect(job?.payload).toMatchObject({
      currentConfidence: 0.5,
      currentSeverity: "low",
      kind: "requirement-disambiguation",
      targetId: requirement,
    });
    // The statement travels as context, tagged with where it came from.
    const context = job?.payload["context"] as string[];
    expect(context[0]).toContain("source spec/auth.md");
    expect(context[1]).toBe("statement: 세션은 적절한 시간 뒤에 만료되어야 한다");
  });

  it("refuses requirements that are not active", async () => {
    await expect(
      enqueueRequirementJudgment(oldRequirement, "credits"),
    ).rejects.toThrow(/only active requirements/);
  });

  it("gives requirement judgments their own retry generation", async () => {
    const first = (await enqueueRequirementJudgment(requirement, "byok")).rows[0]?.id ?? "";
    expect((await enqueueRequirementJudgment(requirement, "byok")).rows[0]?.id).toBe(first);
    await database.query(
      `update public.jobs set status = 'failed', attempt_count = max_attempts,
         completed_at = now(), last_error = 'terminal' where id = $1`,
      [first],
    );
    const retry = (await enqueueRequirementJudgment(requirement, "byok")).rows[0]?.id ?? "";
    expect(retry).not.toBe(first);
    const rows = await database.query<{ idempotency_key: string }>(
      "select idempotency_key from public.jobs where id = $1",
      [retry],
    );
    expect(rows.rows[0]?.idempotency_key).toBe(`requirement-judgment:${requirement}:r1`);
  });

  afterEach(async () => {
    await database.close();
  });

  function enqueueJudgment(findingId: string, mode: string) {
    return asServiceRole(database, (transaction) =>
      transaction.query<{ id: string }>(
        "select public.enqueue_judgment_job($1, $2, 'anthropic', $3) as id",
        [workspace, findingId, mode],
      ),
    );
  }

  function enqueueCoaching(recordId: string, user: string, mode = "credits") {
    return asServiceRole(database, (transaction) =>
      transaction.query<{ id: string }>(
        "select public.enqueue_coaching_job($1, $2, $3, 'anthropic', $4) as id",
        [workspace, recordId, user, mode],
      ),
    );
  }

  async function jobRow(id: string) {
    const rows = await database.query<{
      credit_cost: number;
      kind: string;
      payload: Record<string, unknown>;
    }>("select kind, credit_cost, payload from public.jobs where id = $1", [
      id,
    ]);
    return rows.rows[0];
  }

  it("enqueues a platform judgment with the exact strict payload", async () => {
    const queued = await enqueueJudgment(contradiction, "credits");
    const job = await jobRow(queued.rows[0]?.id ?? "");
    expect(job?.kind).toBe("judge");
    expect(job?.credit_cost).toBe(10);
    expect(Object.keys(job?.payload ?? {}).sort()).toEqual([
      "billingMode",
      "context",
      "currentConfidence",
      "currentSeverity",
      "kind",
      "provider",
      "targetId",
    ]);
    expect(job?.payload).toMatchObject({
      billingMode: "credits",
      currentSeverity: "high",
      kind: "contradiction-confirmation",
      provider: "anthropic",
      targetId: contradiction,
    });
  });

  it("maps every non-contradiction kind to a drift verdict, byok at zero cost", async () => {
    const queued = await enqueueJudgment(drift, "byok");
    const job = await jobRow(queued.rows[0]?.id ?? "");
    expect(job?.credit_cost).toBe(0);
    expect(job?.payload["kind"]).toBe("drift-verdict-confirmation");
  });

  it("is idempotent per finding", async () => {
    const first = await enqueueJudgment(contradiction, "credits");
    const second = await enqueueJudgment(contradiction, "credits");
    expect(second.rows[0]?.id).toBe(first.rows[0]?.id);
  });

  it("refuses findings that are not open", async () => {
    await database.query(
      "update public.findings set status = 'resolved', resolved_at = now() where id = $1",
      [drift],
    );
    await expect(enqueueJudgment(drift, "credits")).rejects.toThrow(
      /only open findings/,
    );
  });

  it("enqueues coaching for the author's own raw-synced record", async () => {
    const queued = await enqueueCoaching(ownRecord, OWNER);
    const job = await jobRow(queued.rows[0]?.id ?? "");
    expect(job?.kind).toBe("coach");
    expect(job?.credit_cost).toBe(1);
    // ADR-011: the queue row names the record, never carries the raw prompt
    // text — the worker reads it at run time, so a revoked consent is honored.
    expect(Object.keys(job?.payload ?? {}).sort()).toEqual([
      "billingMode",
      "promptRecordId",
      "provider",
    ]);
    expect(job?.payload).toMatchObject({
      billingMode: "credits",
      promptRecordId: ownRecord,
      provider: "anthropic",
    });
    const again = await enqueueCoaching(ownRecord, OWNER);
    expect(again.rows[0]?.id).toBe(queued.rows[0]?.id);
  });

  it("refuses coaching on another member's record", async () => {
    await expect(enqueueCoaching(outsiderRecord, OWNER)).rejects.toThrow(
      /only the author/,
    );
  });

  it("refuses coaching without the raw prompt text", async () => {
    await expect(enqueueCoaching(silentRecord, OWNER)).rejects.toThrow(
      /raw prompt text/,
    );
  });

  async function markTerminal(jobId: string, status: "cancelled" | "failed") {
    await database.query(
      `update public.jobs
       set status = $2, attempt_count = max_attempts, completed_at = now(),
           last_error = 'terminal for the retry test'
       where id = $1`,
      [jobId, status],
    );
  }

  async function keyOf(jobId: string): Promise<string> {
    const rows = await database.query<{ idempotency_key: string }>(
      "select idempotency_key from public.jobs where id = $1",
      [jobId],
    );
    return rows.rows[0]?.idempotency_key ?? "";
  }

  it("mints a new generation after a terminal judgment failure, but never redoes a success", async () => {
    const first = (await enqueueJudgment(contradiction, "credits")).rows[0]?.id ?? "";
    expect(await keyOf(first)).toBe(`judgment:${contradiction}`);

    // Live attempt: the same job comes back.
    expect((await enqueueJudgment(contradiction, "credits")).rows[0]?.id).toBe(first);

    await markTerminal(first, "failed");
    const second = (await enqueueJudgment(contradiction, "credits")).rows[0]?.id ?? "";
    expect(second).not.toBe(first);
    expect(await keyOf(second)).toBe(`judgment:${contradiction}:r1`);

    // A second terminal failure counts up, so the key never collides.
    await markTerminal(second, "cancelled");
    const third = (await enqueueJudgment(contradiction, "credits")).rows[0]?.id ?? "";
    expect(await keyOf(third)).toBe(`judgment:${contradiction}:r2`);

    // Success is final: the request resolves to the succeeded job, no new one.
    await database.query(
      "update public.jobs set status = 'succeeded', completed_at = now() where id = $1",
      [third],
    );
    expect((await enqueueJudgment(contradiction, "credits")).rows[0]?.id).toBe(third);
    const total = await database.query<{ n: number }>(
      "select count(*)::int as n from public.jobs where kind = 'judge'",
    );
    expect(total.rows[0]?.n).toBe(3);
  });

  it("retries coaching after a terminal failure on a fresh job with its own reservation key", async () => {
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 20, 'retry-test-grant')`,
      [workspace],
    );
    const first = (await enqueueCoaching(ownRecord, OWNER)).rows[0]?.id ?? "";
    await markTerminal(first, "failed");
    const retry = (await enqueueCoaching(ownRecord, OWNER)).rows[0]?.id ?? "";
    expect(retry).not.toBe(first);
    expect(await keyOf(retry)).toBe(`coaching:${ownRecord}:r1`);
    // The ledger keys are derived from the job id, so the retry reserves and
    // settles under keys the failed attempt never touched.
    const claimed = await database.query<{ id: string }>(
      "select id from public.claim_next_job($1, 'worker-retry', 30)",
      [workspace],
    );
    expect(claimed.rows[0]?.id).toBe(retry);
    const reservation = await database.query<{ reservation_id: string | null }>(
      "select public.reserve_job_credits($1) as reservation_id",
      [retry],
    );
    expect(reservation.rows[0]?.reservation_id).toBeTruthy();
    const ledger = await database.query<{ idempotency_key: string }>(
      "select idempotency_key from public.credit_ledger where event = 'reserve' order by created_at",
    );
    expect(ledger.rows.map((row) => row.idempotency_key)).toEqual([
      `reserve:${retry}`,
    ]);
  });
});
