import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LINK_SCHEMA_VERSION } from "../packages/core/src/index";
import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Backfill on connect and rescan on demand (Phase 4 Wave C todo 16, D11,
 * OQ-029).
 *
 * Connecting a repository stored a row and then waited for a push. A
 * repository that is finished — the case this wave exists for — may not see
 * one for weeks, so the first impression was an empty graph and a suggestion
 * to go and commit something.
 *
 * Both entry points are deterministic and free, and both are idempotent on
 * what actually identifies the request: the head for a backfill, the head
 * *and the mode* for a rescan, because asking for a full relink after an
 * incremental one is a different request rather than a repeat.
 */

const USER = "77000000-0000-4000-8000-000000000001";
const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);
const INSTALLATION_ID = "01K200000000000000000000N1";
const REPOSITORY_ID = "01K200000000000000000000R1";

describe("backfill and rescan", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'rescan@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    // Connected, because that is the only state the hosted scan path can
    // serve: the worker mints an installation token to read bodies, and
    // todo 17 makes a repository without one refuse rather than queue.
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 707, 7070, 'alrescha')`,
      [INSTALLATION_ID, workspaceId],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id, selected_at)
       values ($1, $2, 'alrescha/rescan', $3, 707707, now())`,
      [REPOSITORY_ID, workspaceId, INSTALLATION_ID],
    );
    repositoryId = REPOSITORY_ID;
  });

  afterEach(async () => {
    await database.close();
  });

  async function backfill(headCommitSha: string): Promise<string | null> {
    const rows = await asServiceRole(database, async (transaction) =>
      transaction.query<{ id: string | null }>(
        "select public.enqueue_backfill_scan($1, $2, $3) as id",
        [workspaceId, repositoryId, headCommitSha],
      ),
    );
    return rows.rows[0]?.id ?? null;
  }

  async function rescan(mode?: "full" | "incremental") {
    const rows = await asServiceRole(database, async (transaction) =>
      transaction.query<{
        result: {
          jobId: string | null;
          mode: string | null;
          reason: string;
          scheduled: boolean;
        };
      }>("select public.enqueue_repository_rescan($1, $2, $3, $4) as result", [
        workspaceId,
        repositoryId,
        mode ?? null,
        LINK_SCHEMA_VERSION,
      ]),
    );
    return rows.rows[0]?.result as {
      jobId: string | null;
      mode: string | null;
      reason: string;
      scheduled: boolean;
    };
  }

  async function jobs() {
    const rows = await database.query<{
      credit_cost: number;
      idempotency_key: string;
      kind: string;
      payload: { commitSha?: string; mode?: string; reason?: string };
      run_id: string;
    }>(
      `select kind, idempotency_key, credit_cost, payload, run_id
       from public.jobs
       where workspace_id = $1 order by idempotency_key`,
      [workspaceId],
    );
    return rows.rows;
  }

  /** The scan half of each pair — what the mode and the key are about. */
  async function scanJobs() {
    return (await jobs()).filter(({ kind }) => kind === "scan");
  }

  /** Mark the repository as scanned at `sha`, the way a scan would. */
  async function markScanned(sha: string, linkVersion = LINK_SCHEMA_VERSION) {
    await database.query(
      `update public.repositories
       set last_scanned_commit_sha = $2, link_schema_version = $3
       where id = $1`,
      [repositoryId, sha, linkVersion],
    );
  }

  it("queues one free full scan for a repository nobody has pushed to", async () => {
    const jobId = await backfill(HEAD);
    expect(jobId).toBeTruthy();

    expect(
      (await scanJobs()).map(
        ({ credit_cost, idempotency_key, kind, payload }) => ({
          credit_cost,
          idempotency_key,
          kind,
          payload,
        }),
      ),
    ).toEqual([
      {
        // Free, and the queue enforces it: `enqueue_job` refuses a non-zero
        // cost for a deterministic kind.
        credit_cost: 0,
        idempotency_key: `backfill:${repositoryId}:${HEAD}`,
        kind: "scan",
        // A first scan has nothing to be incremental against.
        payload: { commitSha: HEAD, mode: "full", reason: "backfill" },
      },
    ]);
  });

  /**
   * A push queues `scan` and `analyze` together, and it is the analyze job
   * that writes requirements, findings, CI evidence and the receipt. A
   * backfill that queued only the scan left a finished repository with a
   * graph and nothing else until a push that may never come (WORK_SPEC
   * §4.1-4 names the whole pipeline as the onboarding progress).
   */
  it("queues the analysis with the scan, on the same run, both free", async () => {
    const scanJobId = await backfill(HEAD);
    const queued = await jobs();

    expect(queued.map(({ kind }) => kind)).toEqual(["scan", "analyze"]);
    const [scan, analyze] = queued;
    expect(analyze).toMatchObject({
      credit_cost: 0,
      idempotency_key: `backfill:${repositoryId}:${HEAD}:analyze`,
      // No mode: the analysis reads what the scan stored, in full or not.
      payload: { commitSha: HEAD, reason: "backfill" },
      run_id: scan?.run_id,
    });
    expect(analyze?.payload.mode).toBeUndefined();
    // The return value is still the scan job — the contract todo 16 shipped.
    const returned = await database.query<{ kind: string }>(
      "select kind from public.jobs where id = $1",
      [scanJobId],
    );
    expect(returned.rows[0]?.kind).toBe("scan");
  });

  it("schedules one pair however many times the button is pressed", async () => {
    const first = await backfill(HEAD);
    const second = await backfill(HEAD);
    const third = await backfill(HEAD);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(await jobs()).toHaveLength(2);
  });

  it("refuses a head that is not a commit sha", async () => {
    await expect(backfill("HEAD")).rejects.toThrow(/head commit sha/);
    expect(await jobs()).toEqual([]);
  });

  it("refuses the null sha, which is forty hex characters and no commit", async () => {
    // What an empty repository or a just-deleted default branch reports as
    // its head. The format check alone let it through, and the worker then
    // asked GitHub for a tree that does not exist (2026-09-12 evidence).
    await expect(backfill("0".repeat(40))).rejects.toThrow(/head commit sha/);
    expect(await jobs()).toEqual([]);
    const runs = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.runs where repository_id = $1",
      [repositoryId],
    );
    expect(runs.rows[0]?.count).toBe(0);
  });

  it("refuses a repository from another workspace", async () => {
    await expect(
      asServiceRole(database, async (transaction) =>
        transaction.query("select public.enqueue_backfill_scan($1, $2, $3)", [
          workspaceId,
          "01K200000000000000000000R9",
          HEAD,
        ]),
      ),
    ).rejects.toThrow(/is not in workspace/);
  });

  /**
   * OQ-030, decided in todo 17: the hosted worker never analyses a
   * local-ingest repository, because doing so would mean uploading bodies.
   * `request_rescan` opened that path for agents in todo 16 — the queue
   * accepted the job and the worker failed it three times with a message
   * about installation tokens. It is refused before a job exists now, and
   * the refusal names where the work actually happens.
   */
  it("refuses to schedule server work for a repository the server cannot read", async () => {
    const local = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/pushed') as id",
      [workspaceId],
    );
    const localId = local.rows[0]?.id ?? "";
    await database.query(
      "update public.repositories set last_scanned_commit_sha = $2 where id = $1",
      [localId, HEAD],
    );

    const result = await asServiceRole(database, async (transaction) =>
      transaction.query<{
        result: { jobId: string | null; reason: string; scheduled: boolean };
      }>("select public.enqueue_repository_rescan($1, $2, $3, $4) as result", [
        workspaceId,
        localId,
        "full",
        LINK_SCHEMA_VERSION,
      ]),
    );
    expect(result.rows[0]?.result).toMatchObject({
      jobId: null,
      scheduled: false,
    });
    expect(result.rows[0]?.result.reason).toMatch(/alrescha serve --local/);
    expect(await jobs()).toEqual([]);
  });

  it("says so rather than guessing when there is nothing to rescan against", async () => {
    const result = await rescan();
    expect(result).toMatchObject({
      jobId: null,
      reason: "never-scanned",
      scheduled: false,
    });
    expect(await jobs()).toEqual([]);
  });

  it("rescans incrementally by default, at the head it last saw", async () => {
    await markScanned(HEAD);
    const result = await rescan();

    expect(result).toMatchObject({
      mode: "incremental",
      reason: "requested",
      scheduled: true,
    });
    const queued = await jobs();
    expect(queued[0]).toMatchObject({
      credit_cost: 0,
      idempotency_key: `rescan:${repositoryId}:${HEAD}:incremental`,
      kind: "scan",
      payload: { commitSha: HEAD, mode: "incremental", reason: "rescan" },
    });
    // A relink changes what the rules see, so the analysis follows the scan
    // on the same run — the same pair a push queues.
    expect(queued[1]).toMatchObject({
      credit_cost: 0,
      idempotency_key: `rescan:${repositoryId}:${HEAD}:incremental:analyze`,
      kind: "analyze",
      payload: { commitSha: HEAD, reason: "rescan" },
      run_id: queued[0]?.run_id,
    });
    expect(queued).toHaveLength(2);
  });

  /**
   * Asking for a full relink after an incremental one is a different request,
   * not a repeat — the mode is part of what identifies it.
   */
  it("treats a full relink as a different request from an incremental one", async () => {
    await markScanned(HEAD);
    const incremental = await rescan("incremental");
    const full = await rescan("full");

    expect(full.jobId).not.toBe(incremental.jobId);
    expect(
      (await scanJobs()).map(({ payload }) => payload.mode).sort(),
    ).toEqual(["full", "incremental"]);

    // The same request twice is still one pair.
    expect((await rescan("full")).jobId).toBe(full.jobId);
    expect(await scanJobs()).toHaveLength(2);
    expect(await jobs()).toHaveLength(4);
  });

  /**
   * An incremental pass never re-parses an unchanged file, so a repository
   * whose links came from an older resolver would keep its thin graph until
   * every file happened to change (R5 §2.2 D2).
   */
  it("upgrades an incremental request whose stored links are out of date", async () => {
    await markScanned(HEAD, LINK_SCHEMA_VERSION - 1);
    const result = await rescan("incremental");

    expect(result.mode).toBe("full");
    expect(result.reason).toMatch(/resolver generation/);
    expect((await scanJobs())[0]?.payload.mode).toBe("full");
  });

  it("refuses a mode it does not know", async () => {
    await markScanned(HEAD);
    await expect(
      asServiceRole(database, async (transaction) =>
        transaction.query(
          "select public.enqueue_repository_rescan($1, $2, $3, $4)",
          [workspaceId, repositoryId, "sideways", LINK_SCHEMA_VERSION],
        ),
      ),
    ).rejects.toThrow(/unsupported rescan mode/);
  });

  it("keeps a backfill and a rescan of the same head apart", async () => {
    await backfill(HEAD);
    await markScanned(HEAD);
    await rescan("full");

    // Same repository, same commit, two different reasons to scan it — and
    // each reason brings its own analysis.
    expect(
      (await jobs()).map(({ kind, payload }) => [payload.reason, kind]),
    ).toEqual([
      ["backfill", "scan"],
      ["backfill", "analyze"],
      ["rescan", "scan"],
      ["rescan", "analyze"],
    ]);
  });

  it("charges nothing for either, and the ledger stays empty", async () => {
    await backfill(HEAD);
    await markScanned(OTHER_HEAD);
    await rescan("full");

    expect((await jobs()).every(({ credit_cost }) => credit_cost === 0)).toBe(
      true,
    );
    const ledger = await database.query<{ count: string }>(
      `select count(*)::text as count from public.credit_ledger
       where workspace_id = $1`,
      [workspaceId],
    );
    expect(ledger.rows[0]?.count).toBe("0");
  });

  /**
   * 보완(R-02): a rescan is exactly when prose goes stale, and the screen has
   * to be able to open before analysis catches up. Both states are already
   * reported (S1 and S6); this pins that a rescan produces them together.
   */
  it("leaves the structure ready, the analysis pending and the prose stale", async () => {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [
            {
              classification: "code_metadata",
              digest: "1".repeat(64),
              exportedSymbols: [],
              kind: "code_metadata",
              path: "src/a.ts",
              rationales: [],
              sizeBytes: 64,
              sourceBlobSha: HEAD,
              sourceCommitSha: HEAD,
              symbolEngine: null,
              todoItems: [],
            },
          ],
          codeLinks: [],
          commitSha: HEAD,
          docLinks: [],
          linkScope: "full",
          removedPaths: [],
          routes: [],
          schemaLinks: [],
          schemaObjects: [],
          sectionLinks: [],
          sections: [],
          skipped: [],
          touchedRows: 1,
          treeSha: OTHER_HEAD,
          unchangedPaths: [],
        }),
      ],
    );
    await database.query(
      "select public.apply_artifact_summaries($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify([
          {
            kind: "summary",
            model: "test-model",
            path: "src/a.ts",
            provider: "anthropic",
            summary: "a description of the first blob",
            summaryBlobSha: HEAD,
          },
        ]),
      ],
    );

    // The rescan lands a new blob for the same path.
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [
            {
              classification: "code_metadata",
              digest: "2".repeat(64),
              exportedSymbols: [],
              kind: "code_metadata",
              path: "src/a.ts",
              rationales: [],
              sizeBytes: 96,
              sourceBlobSha: OTHER_HEAD,
              sourceCommitSha: OTHER_HEAD,
              symbolEngine: null,
              todoItems: [],
            },
          ],
          codeLinks: [],
          commitSha: OTHER_HEAD,
          docLinks: [],
          linkScope: "full",
          removedPaths: [],
          routes: [],
          schemaLinks: [],
          schemaObjects: [],
          sectionLinks: [],
          sections: [],
          skipped: [],
          touchedRows: 1,
          treeSha: HEAD,
          unchangedPaths: [],
        }),
      ],
    );

    const basis = await asServiceRole(database, async (transaction) =>
      transaction.query<{ basis: { stages: Record<string, string> }[] }>(
        "select public.read_repository_basis($1) as basis",
        [workspaceId],
      ),
    );
    // Structure republished, analysis untouched — two independent states.
    expect(basis.rows[0]?.basis[0]?.stages).toEqual({
      analysis: "pending",
      structure: "ready",
    });

    // And the prose written for the old blob is now stale, without anyone
    // deleting it: the digest it carries no longer matches the file.
    const artifact = await database.query<{
      source_blob_sha: string;
      summary_blob_sha: string;
    }>(
      `select source_blob_sha, metadata->>'summaryBlobSha' as summary_blob_sha
       from public.artifacts where workspace_id = $1 and path = 'src/a.ts'`,
      [workspaceId],
    );
    expect(artifact.rows[0]?.source_blob_sha).toBe(OTHER_HEAD);
    expect(artifact.rows[0]?.summary_blob_sha).toBe(HEAD);
  });
});
