import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * The writer revision and the publication stages (Codex remedy P0-B §5.3–§5.4,
 * step S6). This is where OQ-053 gets decided: option ⑴, one counter per
 * repository plus one per workspace, and no family of per-table counters.
 *
 * S3 gave a page a snapshot. Across pages there is none, so a fence needs
 * something that moves when the data moves — and a commit SHA is not it: the
 * same commit carries different summaries, findings and todos depending on
 * which jobs have run since.
 *
 * Three rules are load-bearing and each has a case below:
 *
 * - the revision moves in the **same transaction** as the change;
 * - a read never bumps it, or every read would invalidate itself;
 * - a steady revision is **not** a claim that analysis finished.
 */

const USER = "76000000-0000-4000-8000-000000000001";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("repository revision", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'revision@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/revision') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function scan(input: {
    commitSha: string;
    paths: readonly string[];
  }): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: input.paths.map((path, index) => ({
            classification: "code_metadata",
            digest: index.toString(16).padStart(64, "0"),
            exportedSymbols: [],
            kind: "code_metadata",
            path,
            rationales: [],
            sizeBytes: 64,
            sourceBlobSha: input.commitSha,
            sourceCommitSha: input.commitSha,
            symbolEngine: null,
            todoItems: [],
          })),
          codeLinks: [],
          commitSha: input.commitSha,
          docLinks: [],
          linkScope: "full",
          removedPaths: [],
          routes: [],
          schemaLinks: [],
          schemaObjects: [],
          sectionLinks: [],
          sections: [],
          skipped: [],
          touchedRows: input.paths.length,
          treeSha: SHA_B,
          unchangedPaths: [],
        }),
      ],
    );
  }

  async function revision(): Promise<number> {
    const rows = await asServiceRole(database, async (transaction) =>
      transaction.query<{ revision: string }>(
        "select public.revision_of($1, $2)::text as revision",
        [workspaceId, repositoryId],
      ),
    );
    return Number(rows.rows[0]?.revision ?? "0");
  }

  async function basis(): Promise<
    {
      analyzedCommit: string | null;
      dataRevision: number;
      graphGeneration: null;
      indexedCommit: string | null;
      repositoryId: string;
      stages: { analysis: string; structure: string };
    }[]
  > {
    const rows = await asServiceRole(database, async (transaction) =>
      transaction.query<{ basis: unknown }>(
        "select public.read_repository_basis($1) as basis",
        [workspaceId],
      ),
    );
    return rows.rows[0]?.basis as never;
  }

  it("moves when a scan publishes, in the statement that publishes it", async () => {
    const before = await revision();
    await scan({ commitSha: SHA_A, paths: ["src/a.ts"] });
    const after = await revision();

    expect(after).toBeGreaterThan(before);
    // The bump is inside `apply_repository_scan`'s own UPDATE, so there is
    // no moment where the commit is published and the revision is not.
    const published = await database.query<{ sha: string; revision: string }>(
      `select last_scanned_commit_sha as sha, data_revision::text as revision
       from public.repositories where id = $1`,
      [repositoryId],
    );
    expect(published.rows[0]?.sha).toBe(SHA_A);
    expect(Number(published.rows[0]?.revision)).toBe(after);
  });

  /**
   * The case a commit SHA cannot express: the same commit, a different graph.
   * A scan that finds a new file at the same head still changes what a reader
   * sees, and the revision has to say so.
   */
  it("moves again for a second write at the same commit", async () => {
    await scan({ commitSha: SHA_A, paths: ["src/a.ts"] });
    const afterFirst = await revision();

    await scan({ commitSha: SHA_A, paths: ["src/a.ts", "src/b.ts"] });
    const afterSecond = await revision();

    expect(afterSecond).toBeGreaterThan(afterFirst);
    const head = await database.query<{ sha: string }>(
      "select last_scanned_commit_sha as sha from public.repositories where id = $1",
      [repositoryId],
    );
    expect(head.rows[0]?.sha).toBe(SHA_A);
  });

  it("does not move when a summary write applied nothing", async () => {
    await scan({ commitSha: SHA_A, paths: ["src/a.ts"] });
    const before = await revision();

    // The blob moved on, so this summary is superseded and writes no row.
    const outcome = await database.query<{ outcome: { applied: number } }>(
      "select public.apply_artifact_summaries($1, $2, $3::jsonb) as outcome",
      [
        workspaceId,
        repositoryId,
        JSON.stringify([
          {
            kind: "summary",
            model: "test-model",
            path: "src/a.ts",
            provider: "anthropic",
            summary: "a description of an older blob",
            summaryBlobSha: SHA_B,
          },
        ]),
      ],
    );
    expect(outcome.rows[0]?.outcome.applied).toBe(0);
    expect(await revision()).toBe(before);

    // And it does move when the write lands.
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
            summary: "a description of the current blob",
            summaryBlobSha: SHA_A,
          },
        ]),
      ],
    );
    expect(await revision()).toBeGreaterThan(before);
  });

  /**
   * The rule that makes a fence possible at all. `access_events` and
   * `mcp_tokens.last_used_at` are written *by reading*; counting them would
   * make every read invalidate itself and no fence would ever hold.
   */
  it("does not move when a read records that it happened", async () => {
    await scan({ commitSha: SHA_A, paths: ["src/a.ts"] });
    const before = await revision();

    const token = await database.query<{ id: string }>(
      `insert into public.mcp_tokens
         (workspace_id, token_hash, token_prefix, created_by)
       values ($1, 'revision-test-token', 'sp_rev', $2)
       returning id`,
      [workspaceId, USER],
    );
    await database.query(
      `insert into public.access_events
         (workspace_id, token_id, tool, target_node_ids)
       values ($1, $2, 'get_neighbors', array[]::text[])`,
      [workspaceId, token.rows[0]?.id],
    );
    await database.query(
      "update public.mcp_tokens set last_used_at = now() where id = $1",
      [token.rows[0]?.id],
    );
    expect(await revision()).toBe(before);
  });

  it("rolls back the revision with the change that failed", async () => {
    await scan({ commitSha: SHA_A, paths: ["src/a.ts"] });
    const before = await revision();

    await expect(
      database.transaction(async (transaction) => {
        await transaction.query("set local role service_role");
        await transaction.query(
          "select public.publish_repository_change($1, $2, $3)",
          [workspaceId, repositoryId, SHA_A],
        );
        throw new Error("the writer failed after publishing");
      }),
    ).rejects.toThrow("the writer failed after publishing");

    // A revision that survived its own transaction would fence readers away
    // from data that never changed.
    expect(await revision()).toBe(before);
  });

  it("tells a published structure from a caught-up analysis", async () => {
    await scan({ commitSha: SHA_A, paths: ["src/a.ts"] });

    const scanned = await basis();
    expect(scanned[0]).toMatchObject({
      analyzedCommit: null,
      graphGeneration: null,
      indexedCommit: SHA_A,
      stages: { analysis: "pending", structure: "ready" },
    });

    // The gap the remedy names: a repository whose graph is real and whose
    // findings are from an older commit, or from no commit at all.
    await asServiceRole(database, async (transaction) =>
      transaction.query("select public.publish_repository_change($1, $2, $3)", [
        workspaceId,
        repositoryId,
        SHA_A,
      ]),
    );
    expect((await basis())[0]?.stages).toEqual({
      analysis: "current",
      structure: "ready",
    });

    // A new scan reopens the gap without any analysis running.
    await scan({ commitSha: SHA_B, paths: ["src/a.ts", "src/c.ts"] });
    expect((await basis())[0]).toMatchObject({
      analyzedCommit: SHA_A,
      indexedCommit: SHA_B,
      stages: { analysis: "pending", structure: "ready" },
    });
  });

  it("reports a repository that has never been scanned as building", async () => {
    expect((await basis())[0]).toMatchObject({
      analyzedCommit: null,
      indexedCommit: null,
      stages: { analysis: "unavailable", structure: "building" },
    });
  });
});

describe("read_edge_page under a revision fence", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'fence@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/fence') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: ["src/a.ts", "src/b.ts"].map((path, index) => ({
            classification: "code_metadata",
            digest: index.toString(16).padStart(64, "0"),
            exportedSymbols: [],
            kind: "code_metadata",
            path,
            rationales: [],
            sizeBytes: 64,
            sourceBlobSha: SHA_A,
            sourceCommitSha: SHA_A,
            symbolEngine: "typescript-ast",
            todoItems: [],
          })),
          codeLinks: [
            {
              kind: "imports",
              method: "module-resolution",
              sourcePath: "src/b.ts",
              span: { endLine: 1, startLine: 1 },
              symbols: [],
              targetPath: "src/a.ts",
              tier: "resolved",
            },
          ],
          commitSha: SHA_A,
          docLinks: [],
          linkScope: "full",
          removedPaths: [],
          routes: [],
          schemaLinks: [],
          schemaObjects: [],
          sectionLinks: [],
          sections: [],
          skipped: [],
          touchedRows: 2,
          treeSha: SHA_B,
          unchangedPaths: [],
        }),
      ],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function page(expectedRevision: number | null) {
    const rows = await asServiceRole(database, async (transaction) =>
      transaction.query<{
        page: {
          coverage: { result: string; stoppedBy: string | null };
          edges: unknown[];
          revision: number;
          revisionChanged: boolean;
        };
      }>(
        "select public.read_edge_page($1, $2, null, 100, 262144, $3) as page",
        [workspaceId, repositoryId, expectedRevision],
      ),
    );
    return rows.rows[0]?.page as never as {
      coverage: { result: string; stoppedBy: string | null };
      edges: unknown[];
      revision: number;
      revisionChanged: boolean;
    };
  }

  it("answers when the ground has not moved, and says which revision", async () => {
    const unfenced = await page(null);
    expect(unfenced.edges.length).toBeGreaterThan(0);
    expect(unfenced.revisionChanged).toBe(false);

    const fenced = await page(unfenced.revision);
    expect(fenced.edges).toEqual(unfenced.edges);
    expect(fenced.coverage).toMatchObject({
      result: "complete",
      stoppedBy: null,
    });
  });

  it("refuses to hand back a page from a different state", async () => {
    const first = await page(null);
    // Any write moves the revision; the caller's fence is now stale.
    await asServiceRole(database, async (transaction) =>
      transaction.query("select public.publish_repository_change($1, $2)", [
        workspaceId,
        repositoryId,
      ]),
    );

    const stale = await page(first.revision);
    expect(stale.revisionChanged).toBe(true);
    expect(stale.edges).toEqual([]);
    expect(stale.coverage).toEqual({
      byteBudget: 262_144,
      result: "partial",
      rowBudget: 100,
      stoppedBy: "revision",
    });
    // And the caller is handed the current revision to restart from.
    expect(stale.revision).toBeGreaterThan(first.revision);
  });
});
