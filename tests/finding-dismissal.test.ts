import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresAnalysisStore } from "../apps/worker/src/postgres-analysis-store";
import type { PersistedFinding } from "../apps/worker/src/analysis-job";
import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";
import { pgliteSql } from "./helpers/pglite-sql";

/**
 * Dismissing a finding, and making it stay dismissed (Phase 4 Wave D
 * todo 19 ⑷).
 *
 * `findings.status` has allowed `dismissed` since the first migration and
 * nothing wrote it. A person deciding a finding is not a defect had no
 * writer; `apply_successful_judgment` read the AI's confidence and severity
 * and ignored its verdict, so a `rejected` judgment left the finding open
 * with *higher* confidence than before; and `reconcileFindings` re-opened
 * everything it re-derived, so even a dismissal that existed would not have
 * survived the next push.
 *
 * All three are here, because any one of them left alone makes the other two
 * pointless.
 */

const OWNER = "7A000000-0000-4000-8000-000000000001".toLowerCase();
const OTHER = "7B000000-0000-4000-8000-000000000002".toLowerCase();
const fixedUlid = (suffix: string) => `01J9000000000000000000000${suffix}`;

const REPOSITORY = fixedUlid("B");
const ARTIFACT = fixedUlid("A");
const FINDING = fixedUlid("F");

function finding(overrides: Partial<PersistedFinding> = {}): PersistedFinding {
  return {
    confidence: 0.5,
    evidenceGrade: "inferred",
    fingerprint: "stale-doc:spec.md:3:1",
    kind: "stale-doc",
    provenance: { reason: "deterministic stale-doc rule" },
    severity: "medium",
    sourceNodeId: ARTIFACT,
    targetNodeId: null,
    title: "문서가 코드보다 오래됐습니다",
    ...overrides,
  };
}

describe("dismissing a finding", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let store: PostgresAnalysisStore;
  let workspace: string;

  async function findingRow() {
    const rows = await database.query<{
      dismissed_by: string | null;
      dismissed_reason: string | null;
      id: string;
      status: string;
    }>(
      `select id, status, dismissed_reason, dismissed_by
       from public.findings where workspace_id = $1 order by id`,
      [workspace],
    );
    return rows.rows[0];
  }

  async function dismiss(
    reason: string,
    user = OWNER,
    findingId = FINDING,
  ): Promise<{ dismissed: boolean; reason: string }> {
    const rows = await asAuthenticatedUser(database, user, async (tx) =>
      tx.query<{ result: { dismissed: boolean; reason: string } }>(
        "select public.dismiss_finding($1, $2, $3) as result",
        [workspace, findingId, reason],
      ),
    );
    return rows.rows[0]?.result as { dismissed: boolean; reason: string };
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    store = new PostgresAnalysisStore(
      pgliteSql(database) as unknown as postgres.Sql,
    );
    await database.query(
      "insert into auth.users (id, email) values ($1, 'dismiss@example.test'), ($2, 'other@example.test')",
      [OWNER, OTHER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/dismiss')",
      [REPOSITORY, workspace],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'spec.md')`,
      [ARTIFACT, workspace, REPOSITORY],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha)
       values ($1, $2, $3, 'spec', 'spec', 'spec.md', $4, $5)`,
      [ARTIFACT, workspace, REPOSITORY, "a".repeat(64), "1".repeat(40)],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'finding', 'stale doc')`,
      [FINDING, workspace, REPOSITORY],
    );
    await database.query(
      `insert into public.findings
        (id, workspace_id, repository_id, title, source_node_id, kind, severity,
         status, provenance, confidence, evidence_grade, fingerprint)
       values ($1, $2, $3, '문서가 코드보다 오래됐습니다', $4, 'stale-doc',
               'medium', 'open', $5::jsonb, 0.5, 'inferred', 'stale-doc:spec.md:3:1')`,
      [
        FINDING,
        workspace,
        REPOSITORY,
        ARTIFACT,
        JSON.stringify({ reason: "deterministic stale-doc rule" }),
      ],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("records who dismissed it and why", async () => {
    expect(await dismiss("설계상 의도된 차이입니다")).toMatchObject({
      dismissed: true,
    });

    expect(await findingRow()).toMatchObject({
      dismissed_by: OWNER,
      dismissed_reason: "설계상 의도된 차이입니다",
      status: "dismissed",
    });
  });

  /**
   * A dismissal with no reason is indistinguishable from a finding nobody
   * looked at, which is the state dismissal exists to get out of.
   */
  it("refuses a dismissal with no reason", async () => {
    await expect(dismiss("   ")).rejects.toThrow(/needs a reason/);
    expect(await findingRow()).toMatchObject({ status: "open" });
  });

  it("refuses to dismiss a finding that is already resolved", async () => {
    await database.query(
      "update public.findings set status = 'resolved', resolved_at = now() where id = $1",
      [FINDING],
    );

    // Resolved is the stronger statement: the rule stopped reproducing.
    // Overwriting it with an opinion would lose a fact.
    expect(await dismiss("아니라고 봅니다")).toMatchObject({
      dismissed: false,
      reason: "already-resolved",
    });
  });

  it("tells another workspace's member nothing", async () => {
    const result = await dismiss("남의 것", OTHER);

    // The same answer a missing id gets: RLS hid the row, and the caller
    // learns neither that it exists nor that it does not.
    expect(result).toMatchObject({ dismissed: false, reason: "not-found" });
    expect(await findingRow()).toMatchObject({ status: "open" });
  });

  it("keeps the first decision's author when dismissed twice", async () => {
    await dismiss("첫 판단");
    await dismiss("다시 확인함");

    const row = await findingRow();
    expect(row).toMatchObject({
      dismissed_by: OWNER,
      // The newer sentence, the original author and time.
      dismissed_reason: "다시 확인함",
      status: "dismissed",
    });
  });

  /**
   * The half that made the other half pointless. The rule reproducing again
   * is not news to whoever dismissed it — it is why they dismissed it.
   */
  it("survives a re-analysis that re-derives the same finding", async () => {
    await dismiss("의도된 차이");

    const delta = await store.reconcileFindings({
      findings: [finding()],
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });

    expect(await findingRow()).toMatchObject({
      dismissed_reason: "의도된 차이",
      status: "dismissed",
    });
    // And it is not counted as open, so the board does not show it either.
    expect(delta.openTotal).toBe(0);
  });

  it("still resolves a dismissed finding's neighbours normally", async () => {
    // A second finding that this analysis no longer derives.
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'finding', 'other')`,
      [fixedUlid("G"), workspace, REPOSITORY],
    );
    await database.query(
      `insert into public.findings
        (id, workspace_id, repository_id, title, source_node_id, kind, severity,
         status, provenance, confidence, evidence_grade, fingerprint)
       values ($1, $2, $3, '다른 건', $4, 'stale-doc', 'medium', 'open',
               $5::jsonb, 0.5, 'inferred', 'stale-doc:other.md:1:1')`,
      [
        fixedUlid("G"),
        workspace,
        REPOSITORY,
        ARTIFACT,
        JSON.stringify({ reason: "deterministic stale-doc rule" }),
      ],
    );
    await dismiss("의도된 차이");

    await store.reconcileFindings({
      findings: [],
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });

    const rows = await database.query<{ id: string; status: string }>(
      "select id, status from public.findings where workspace_id = $1 order by id",
      [workspace],
    );
    expect(rows.rows).toEqual([
      { id: FINDING, status: "dismissed" },
      { id: fixedUlid("G"), status: "resolved" },
    ]);
  });
});

describe("an AI judgment that rejects a finding", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  async function judge(verdict: string, explanation: string | null) {
    // The applier refuses a payload that claims anything but `inferred`:
    // an AI verdict never raises the evidence grade (ADR-001).
    const payload: Record<string, unknown> = {
      evidenceGrade: "inferred",
      verdict,
    };
    if (explanation !== null) payload.explanation = explanation;
    return asServiceRole(database, async (tx) =>
      tx.query(
        `select public.apply_successful_judgment(
           $1, $2, $3, 'drift-verdict-confirmation', $4, 'anthropic',
           $5::jsonb, $6, 'claude-test', 0.9, 'low')`,
        [
          fixedUlid("J"),
          workspace,
          REPOSITORY,
          FINDING,
          JSON.stringify(payload),
          "d".repeat(64),
        ],
      ),
    );
  }

  async function findingRow() {
    const rows = await database.query<{
      confidence: string;
      dismissed_reason: string | null;
      severity: string;
      status: string;
    }>(
      `select status, severity, confidence, dismissed_reason
       from public.findings where workspace_id = $1`,
      [workspace],
    );
    return rows.rows[0];
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'judge@example.test')",
      [OWNER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/judge')",
      [REPOSITORY, workspace],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'spec.md'), ($4, $2, $3, 'finding', 'stale doc')`,
      [ARTIFACT, workspace, REPOSITORY, FINDING],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha)
       values ($1, $2, $3, 'spec', 'spec', 'spec.md', $4, $5)`,
      [ARTIFACT, workspace, REPOSITORY, "a".repeat(64), "1".repeat(40)],
    );
    await database.query(
      `insert into public.findings
        (id, workspace_id, repository_id, title, source_node_id, kind, severity,
         status, provenance, confidence, evidence_grade, fingerprint)
       values ($1, $2, $3, '문서 드리프트', $4, 'stale-doc', 'medium', 'open',
               $5::jsonb, 0.4, 'inferred', 'stale-doc:spec.md:3:1')`,
      [
        FINDING,
        workspace,
        REPOSITORY,
        ARTIFACT,
        JSON.stringify({ reason: "deterministic stale-doc rule" }),
      ],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key)
       values ($1, $2, $3, 'manual', 'judge:1')`,
      [fixedUlid("N"), workspace, REPOSITORY],
    );
    await database.query(
      `insert into public.jobs
        (id, workspace_id, repository_id, run_id, kind, idempotency_key,
         payload, status, credit_cost)
       values ($1, $2, $3, $4, 'judge', 'judge:1', '{}'::jsonb, 'running', 0)`,
      [fixedUlid("J"), workspace, REPOSITORY, fixedUlid("N")],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  /**
   * The verdict was already stored and never read. Raising the confidence of
   * a finding the model just rejected is the opposite of what it said.
   */
  it("dismisses the finding and keeps the model's explanation", async () => {
    await judge("rejected", "이 문서는 의도적으로 상위 수준입니다");

    expect(await findingRow()).toMatchObject({
      dismissed_reason: "이 문서는 의도적으로 상위 수준입니다",
      status: "dismissed",
    });
  });

  it("names the model when it rejected without explaining", async () => {
    await judge("rejected", null);

    const row = await findingRow();
    expect(row?.status).toBe("dismissed");
    // A dismissal always carries a reason; the schema will not store one
    // without it, so "which model decided" is the minimum honest answer.
    expect(row?.dismissed_reason).toBe("rejected by claude-test");
  });

  it("leaves a confirmed finding open, with confidence and severity moved", async () => {
    await judge("confirmed", "실제 드리프트입니다");

    expect(await findingRow()).toMatchObject({
      dismissed_reason: null,
      severity: "low",
      status: "open",
    });
    expect(Number((await findingRow())?.confidence)).toBeCloseTo(0.9, 3);
  });

  it("leaves an ambiguous verdict alone", async () => {
    await judge("ambiguous", "판단할 수 없습니다");

    expect(await findingRow()).toMatchObject({ status: "open" });
  });

  /**
   * A person's decision outranks a later model run: the judgment does not
   * un-dismiss, and it does not overwrite the sentence they wrote.
   */
  it("does not rewrite a dismissal a person already made", async () => {
    await database.query(
      `update public.findings
       set status = 'dismissed', dismissed_reason = '사람이 판단함', dismissed_at = now()
       where id = $1`,
      [FINDING],
    );

    await judge("rejected", "모델의 사유");

    expect(await findingRow()).toMatchObject({
      dismissed_reason: "사람이 판단함",
      status: "dismissed",
    });
  });
});
