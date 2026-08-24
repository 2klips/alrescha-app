import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  ENRICH_PASS_MIGRATION,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 3 Wave C todo 6 — the enrich pass at the database.
 *
 * Three contracts live here: ⑴ `enqueue_enrich_job` is cache-aware — a fully
 * cached repository enqueues nothing at all, which is what "cache hit costs
 * zero credits" means at the ledger; ⑵ enrich inherits the credit lifecycle
 * (charge once, refund on schema rejection, idempotent per pending digest);
 * ⑶ `apply_repository_scan` now derives `index_entries` deterministically,
 * closing the Wave D finding that real scans had no search index.
 */

const USER_A = "81111111-1111-4111-8111-111111111111";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const ENRICH_MIGRATION = ENRICH_PASS_MIGRATION;
const MIGRATIONS_BEFORE_ENRICH = ALL_MIGRATIONS.slice(
  0,
  ALL_MIGRATIONS.indexOf(ENRICH_PASS_MIGRATION),
) as string[];

const COMMIT = "a".repeat(40);
const BLOB_A = "1".repeat(40);
const BLOB_A2 = "2".repeat(40);
const BLOB_B = "3".repeat(40);

function planArtifact(input: {
  path: string;
  blobSha: string;
  symbols?: readonly string[];
}) {
  return {
    classification: "code_metadata",
    digest: input.blobSha
      .repeat(2)
      .slice(0, 64)
      .replace(/[^0-9a-f]/g, "0"),
    exportedSymbols: (input.symbols ?? []).map((name) => ({
      kind: "function",
      name,
    })),
    kind: "code_metadata",
    path: input.path,
    rationales: [],
    sizeBytes: 120,
    sourceBlobSha: input.blobSha,
    sourceCommitSha: COMMIT,
    symbolEngine: "typescript-compiler",
    todoItems: [],
  };
}

function plan(
  artifacts: readonly ReturnType<typeof planArtifact>[],
  codeLinks: readonly unknown[] = [],
) {
  return {
    artifacts,
    codeLinks,
    commitSha: COMMIT,
    removedPaths: [],
    skipped: [],
    touchedRows: artifacts.length,
    treeSha: "b".repeat(40),
    unchangedPaths: [],
  };
}

describe("enrich pass (Wave C todo 6)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'enrich@example.test')",
      [USER_A],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/enrich') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 100, 'enrich-initial')`,
      [workspaceId],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function applyScan(scanPlan: unknown): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceId, repositoryId, JSON.stringify(scanPlan)],
    );
  }

  async function enqueue(
    billing: "byok" | "credits" = "credits",
  ): Promise<string | null> {
    const result = await database.query<{ id: string | null }>(
      "select public.enqueue_enrich_job($1, $2, 'anthropic', $3) as id",
      [workspaceId, repositoryId, billing],
    );
    return result.rows[0]?.id ?? null;
  }

  async function applySummaries(items: readonly unknown[]): Promise<void> {
    await database.query(
      "select public.apply_artifact_summaries($1, $2, $3::jsonb)",
      [workspaceId, repositoryId, JSON.stringify(items)],
    );
  }

  async function ledger(): Promise<{ amount: number; event: string }[]> {
    const rows = await database.query<{ amount: number; event: string }>(
      "select event, amount from public.credit_ledger where event <> 'grant' order by created_at, id",
    );
    return rows.rows;
  }

  it("enqueues with one credit while files are uncached, and nothing once cached", async () => {
    await applyScan(
      plan([
        planArtifact({ blobSha: BLOB_A, path: "src/a.ts", symbols: ["runA"] }),
        planArtifact({ blobSha: BLOB_B, path: "src/b.ts" }),
      ]),
    );

    const jobId = await enqueue();
    expect(jobId).not.toBeNull();
    const job = await database.query<{ credit_cost: number; kind: string }>(
      "select kind, credit_cost from public.jobs where id = $1",
      [jobId],
    );
    expect(job.rows[0]).toEqual({ credit_cost: 1, kind: "enrich" });

    // Summaries land; every blob is now cached.
    await applySummaries([
      {
        kind: "summary",
        model: "claude-sonnet-5",
        path: "src/a.ts",
        provider: "anthropic",
        summary: "Prose about a.",
        summaryBlobSha: BLOB_A,
      },
      {
        kind: "summary",
        model: "claude-sonnet-5",
        path: "src/b.ts",
        provider: "anthropic",
        summary: "Prose about b.",
        summaryBlobSha: BLOB_B,
      },
    ]);

    // With every summary cached the only remaining work is the concept
    // layer (todo 7); store one under the matching digest so both layers
    // are fresh. Then the cache-hit proof: no job, no ledger movement.
    const digestRow = await asServiceRole(database, (tx) =>
      tx.query<{ digest: string }>(
        `select md5(string_agg(path || ':' || (metadata->>'summaryBlobSha'), E'\n' order by path collate "C")) as digest
         from public.artifacts
         where workspace_id = $1 and repository_id = $2
           and (metadata->>'summaryBlobSha') = source_blob_sha`,
        [workspaceId, repositoryId],
      ),
    );
    await database.query(
      "select public.apply_concept_graph($1, $2, $3::jsonb, $4)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify([
          {
            kind: "concept",
            links: [],
            memberPaths: ["src/a.ts"],
            name: "Alpha",
            slug: "alpha",
            summary: "Prose about alpha.",
          },
        ]),
        digestRow.rows[0]?.digest ?? "",
      ],
    );
    expect(await enqueue()).toBeNull();
    expect(await ledger()).toEqual([]);

    // A rescan that changes one blob re-opens exactly one pending file.
    await applyScan(
      plan([
        planArtifact({ blobSha: BLOB_A2, path: "src/a.ts", symbols: ["runA"] }),
      ]),
    );
    const again = await enqueue();
    expect(again).not.toBeNull();
    expect(again).not.toBe(jobId);
  });

  it("a BYOK enqueue reserves nothing; billing inherits the shared lifecycle", async () => {
    await applyScan(
      plan([planArtifact({ blobSha: BLOB_A, path: "src/a.ts" })]),
    );

    const byokJob = await enqueue("byok");
    const byokRow = await database.query<{ credit_cost: number }>(
      "select credit_cost from public.jobs where id = $1",
      [byokJob],
    );
    expect(byokRow.rows[0]?.credit_cost).toBe(0);

    // The credits path: claim → reserve → reject (schema_invalid) refunds.
    await applySummaries([
      {
        kind: "summary",
        model: "m",
        path: "src/a.ts",
        provider: "anthropic",
        summary: "cached",
        summaryBlobSha: BLOB_A2,
      },
    ]);
    const billed = await enqueue("credits");
    expect(billed).not.toBeNull();
    await database.query("select public.claim_next_job($1, 'w1', 30)", [
      workspaceId,
    ]);
    // The BYOK job claims first (FIFO); finish it uncharged, then reach ours.
    await database.query("select public.finish_job($1, 'w1', true, null)", [
      byokJob,
    ]);
    await database.query("select public.claim_next_job($1, 'w1', 30)", [
      workspaceId,
    ]);
    await database.query("select public.reserve_job_credits($1)", [billed]);
    await database.query(
      "select public.reject_job($1, 'w1', 'Enrich output failed the prose contract')",
      [billed],
    );

    const entries = await ledger();
    expect(entries.map(({ event }) => event)).toEqual(["reserve", "refund"]);
  });

  it("apply_artifact_summaries stores inferred prose and a clearable skip gate", async () => {
    await applyScan(
      plan([planArtifact({ blobSha: BLOB_A, path: "src/a.ts" })]),
    );

    await applySummaries([
      { kind: "skip", path: "src/a.ts", reason: "provider down" },
    ]);
    const skipped = await asServiceRole(database, (tx) =>
      tx.query<{ metadata: Record<string, unknown> }>(
        "select metadata from public.artifacts where path = 'src/a.ts'",
      ),
    );
    const skipMeta = skipped.rows[0]?.metadata ?? {};
    expect(skipMeta.summarySkipped).toMatchObject({ reason: "provider down" });
    expect(skipMeta.summaryBlobSha).toBeUndefined();

    await applySummaries([
      {
        kind: "summary",
        model: "claude-sonnet-5",
        path: "src/a.ts",
        provider: "anthropic",
        summary: "Prose about a.",
        summaryBlobSha: BLOB_A,
      },
    ]);
    const stored = await asServiceRole(database, (tx) =>
      tx.query<{ metadata: Record<string, unknown> }>(
        "select metadata from public.artifacts where path = 'src/a.ts'",
      ),
    );
    const metadata = stored.rows[0]?.metadata ?? {};
    expect(metadata).toMatchObject({
      summary: "Prose about a.",
      summaryBlobSha: BLOB_A,
      summaryGrade: "inferred",
      summaryModel: "claude-sonnet-5",
    });
    // A landed summary clears the gate.
    expect(metadata.summarySkipped).toBeUndefined();
  });

  it("apply_repository_scan derives index entries — the Wave D search gap closes", async () => {
    await applyScan(
      plan(
        [
          planArtifact({
            blobSha: BLOB_A,
            path: "src/session.ts",
            symbols: ["issueToken", "revokeToken"],
          }),
          planArtifact({ blobSha: BLOB_B, path: "src/login.ts" }),
        ],
        [
          {
            kind: "imports",
            method: "module-resolution",
            sourcePath: "src/login.ts",
            span: { endLine: 1, startLine: 1 },
            symbols: ["issueToken"],
            targetPath: "src/session.ts",
            tier: "resolved",
          },
        ],
      ),
    );

    const entries = await asServiceRole(database, (tx) =>
      tx.query<{
        neighbor_ids: string[];
        node_id: string;
        path: string;
        search_key: string;
        symbols: string[];
        title: string;
      }>(
        `select node_id, path, title, symbols, search_key, neighbor_ids
         from public.index_entries order by path`,
      ),
    );
    expect(entries.rows).toHaveLength(2);
    const session = entries.rows.find((row) => row.path === "src/session.ts");
    expect(session).toMatchObject({
      symbols: ["issueToken", "revokeToken"],
      title: "session.ts",
    });
    expect(session?.search_key).toContain("issuetoken");
    expect(session?.search_key).toContain("src/session.ts");

    // The neighbor cache reflects the structure edge in both directions.
    const login = entries.rows.find((row) => row.path === "src/login.ts");
    expect(login?.neighbor_ids).toContain(session?.node_id);
    expect(session?.neighbor_ids).toContain(login?.node_id);

    // Removal cascades with the node.
    await applyScan({
      ...plan([]),
      removedPaths: ["src/login.ts"],
      touchedRows: 1,
    });
    const remaining = await asServiceRole(database, (tx) =>
      tx.query<{ path: string }>("select path from public.index_entries"),
    );
    expect(remaining.rows.map(({ path }) => path)).toEqual(["src/session.ts"]);
  });

  it("backfills index entries for artifacts scanned before the migration", async () => {
    const before = await createTestDatabase(MIGRATIONS_BEFORE_ENRICH);
    try {
      await before.query(
        "insert into auth.users (id, email) values ($1, 'backfill@example.test')",
        [USER_A],
      );
      const workspaces = await before.query<{ id: string }>(
        "select id from public.workspaces",
      );
      const workspace = workspaces.rows[0]?.id ?? "";
      const repository = await before.query<{ id: string }>(
        "select public.ensure_local_repository($1, 'local/backfill') as id",
        [workspace],
      );
      await before.query(
        "select public.apply_repository_scan($1, $2, $3::jsonb)",
        [
          workspace,
          repository.rows[0]?.id,
          JSON.stringify(
            plan([
              planArtifact({
                blobSha: BLOB_A,
                path: "src/old.ts",
                symbols: ["legacy"],
              }),
            ]),
          ),
        ],
      );
      const empty = await asServiceRole(before, (tx) =>
        tx.query("select 1 from public.index_entries"),
      );
      expect(empty.rows).toHaveLength(0);

      await before.exec(
        await readFile(resolve(repoRoot, ENRICH_MIGRATION), "utf8"),
      );
      const filled = await asServiceRole(before, (tx) =>
        tx.query<{ path: string; symbols: string[] }>(
          "select path, symbols from public.index_entries",
        ),
      );
      expect(filled.rows).toEqual([
        { path: "src/old.ts", symbols: ["legacy"] },
      ]);
    } finally {
      await before.close();
    }
  });
});

describe("enrich requeue-on-terminal (pilot round 4)", () => {
  it("re-enqueueing the same pending state revives a failed job", async () => {
    const database = await createTestDatabase([...ALL_MIGRATIONS]);
    try {
      await database.query(
        "insert into auth.users (id, email) values ($1, 'requeue@example.test')",
        ["82111111-1111-4111-8111-111111111111"],
      );
      const workspaces = await database.query<{ id: string }>(
        "select id from public.workspaces",
      );
      const workspace = workspaces.rows[0]?.id ?? "";
      const repository = await database.query<{ id: string }>(
        "select public.ensure_local_repository($1, 'local/requeue') as id",
        [workspace],
      );
      await database.query(
        "select public.apply_repository_scan($1, $2, $3::jsonb)",
        [
          workspace,
          repository.rows[0]?.id,
          JSON.stringify(
            plan([planArtifact({ blobSha: BLOB_A, path: "src/a.ts" })]),
          ),
        ],
      );
      const enqueueOnce = async () => {
        const result = await database.query<{ id: string | null }>(
          "select public.enqueue_enrich_job($1, $2, 'anthropic', 'byok') as id",
          [workspace, repository.rows[0]?.id],
        );
        return result.rows[0]?.id ?? null;
      };

      const first = await enqueueOnce();
      await database.query("select public.claim_next_job($1, 'w1', 30)", [
        workspace,
      ]);
      await database.query(
        "select public.reject_job($1, 'w1', 'delivered nothing')",
        [first],
      );
      const failed = await database.query<{ status: string }>(
        "select status from public.jobs where id = $1",
        [first],
      );
      expect(failed.rows[0]?.status).toBe("failed");

      // Same pending state → same key → the failed job revives as queued.
      const again = await enqueueOnce();
      expect(again).toBe(first);
      const revived = await database.query<{
        attempt_count: number;
        status: string;
      }>("select status, attempt_count from public.jobs where id = $1", [
        first,
      ]);
      expect(revived.rows[0]).toEqual({ attempt_count: 0, status: "queued" });
    } finally {
      await database.close();
    }
  });
});
