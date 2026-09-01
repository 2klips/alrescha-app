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
    expect(job?.payload).toMatchObject({
      billingMode: "credits",
      promptRecordId: ownRecord,
      promptText: "spec/auth.md의 REQ-3 구현, tests 통과까지",
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
});
