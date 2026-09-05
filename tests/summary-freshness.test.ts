import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  currentSummaryText,
  selectFilesForSummarization,
  summaryState,
} from "../packages/core/src/index";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Summary freshness, read and write (Codex remedy P0-A / R-02, step S1).
 *
 * Two halves of one problem, and neither substitutes for the other:
 *
 * - **Read.** `artifacts.metadata` is merged on rescan, so prose written for
 *   blob A survives every scan until enrich replaces it. A reader that shows
 *   it without checking the digest presents last week's description of a file
 *   that has changed.
 * - **Write.** A job that started against blob A and finished after the job
 *   for blob B had already stored its prose used to overwrite B with A. The
 *   newer summary was lost and had to be paid for again. Filtering on read
 *   hides that; only a compare-and-set prevents it.
 *
 * And the count: the old function returned the number of *items sent*, so a
 * summary for a deleted file reported one applied row while updating none.
 */

const USER = "74000000-0000-4000-8000-000000000001";
const BLOB_A = "a".repeat(40);
const BLOB_B = "b".repeat(40);
const SHA = "c".repeat(40);

describe("the freshness rule", () => {
  it("needs two non-empty digests that agree", () => {
    expect(
      summaryState({
        currentBlobSha: BLOB_A,
        summary: "설명",
        summaryBlobSha: BLOB_A,
      }),
    ).toEqual({
      grade: "inferred",
      sourceBlobSha: BLOB_A,
      state: "current",
      text: "설명",
    });
  });

  it("calls prose from an older blob stale, and keeps its text", () => {
    expect(
      summaryState({
        currentBlobSha: BLOB_B,
        summary: "옛 설명",
        summaryBlobSha: BLOB_A,
      }),
    ).toEqual({
      currentBlobSha: BLOB_B,
      sourceBlobSha: BLOB_A,
      state: "stale",
      text: "옛 설명",
    });
  });

  /**
   * The case that makes `unknown` a separate state. Two absent digests agree
   * about nothing; calling that a match would present a legacy summary with
   * no cache key as a fresh description forever.
   */
  it.each([
    ["neither side has a digest", null, null],
    ["the summary has none", BLOB_A, null],
    ["the artifact has none", null, BLOB_A],
    ["the digests are empty strings", "", ""],
  ])("is unknown when %s", (_label, currentBlobSha, summaryBlobSha) => {
    const state = summaryState({
      currentBlobSha,
      summary: "설명",
      summaryBlobSha,
    });
    expect(state.state).toBe("unknown");
    expect(
      currentSummaryText({ currentBlobSha, summary: "설명", summaryBlobSha }),
    ).toBeNull();
  });

  it("is missing when there is no prose at all", () => {
    expect(
      summaryState({
        currentBlobSha: BLOB_A,
        summary: "   ",
        summaryBlobSha: BLOB_A,
      }),
    ).toEqual({ state: "missing" });
  });

  it("serves prose only in the current state", () => {
    expect(
      currentSummaryText({
        currentBlobSha: BLOB_A,
        summary: "설명",
        summaryBlobSha: BLOB_A,
      }),
    ).toBe("설명");
    expect(
      currentSummaryText({
        currentBlobSha: BLOB_B,
        summary: "설명",
        summaryBlobSha: BLOB_A,
      }),
    ).toBeNull();
  });

  /**
   * The write side and the read side decide with the same function, which is
   * the point: a file the selector calls fresh is exactly a file the reader
   * may quote.
   */
  it("selects for summarization exactly what the reader may not quote", () => {
    const candidates = [
      { path: "fresh.ts", sourceBlobSha: BLOB_A, summaryBlobSha: BLOB_A },
      { path: "moved.ts", sourceBlobSha: BLOB_B, summaryBlobSha: BLOB_A },
      { path: "never.ts", sourceBlobSha: BLOB_A, summaryBlobSha: null },
    ];
    expect(selectFilesForSummarization(candidates).map((c) => c.path)).toEqual([
      "moved.ts",
      "never.ts",
    ]);
    for (const candidate of candidates) {
      const quotable =
        currentSummaryText({
          currentBlobSha: candidate.sourceBlobSha,
          summary: "설명",
          summaryBlobSha: candidate.summaryBlobSha,
        }) !== null;
      const selected = selectFilesForSummarization([candidate]).length === 1;
      expect([candidate.path, quotable]).toEqual([candidate.path, !selected]);
    }
  });
});

describe("apply_artifact_summaries", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'freshness@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/freshness') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function scan(
    files: readonly { blob: string; path: string }[],
    removedPaths: readonly string[] = [],
  ) {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: files.map(({ blob, path }) => ({
            classification: "code_metadata",
            digest: blob.slice(0, 2).repeat(32),
            exportedSymbols: [],
            kind: "code_metadata",
            path,
            rationales: [],
            sizeBytes: 64,
            sourceBlobSha: blob,
            sourceCommitSha: SHA,
            symbolEngine: null,
            todoItems: [],
          })),
          codeLinks: [],
          commitSha: SHA,
          docLinks: [],
          linkScope: "full",
          removedPaths,
          routes: [],
          schemaLinks: [],
          schemaObjects: [],
          sectionLinks: [],
          sections: [],
          skipped: [],
          touchedRows: files.length,
          treeSha: BLOB_B,
          unchangedPaths: [],
        }),
      ],
    );
  }

  async function apply(items: readonly unknown[]) {
    const rows = await database.query<{ outcome: Record<string, number> }>(
      "select public.apply_artifact_summaries($1, $2, $3::jsonb) as outcome",
      [workspaceId, repositoryId, JSON.stringify(items)],
    );
    return rows.rows[0]?.outcome;
  }

  async function stored(path: string) {
    const rows = await database.query<{
      source_blob_sha: string;
      summary: string | null;
      summary_blob_sha: string | null;
    }>(
      `select source_blob_sha,
              metadata->>'summary' as summary,
              metadata->>'summaryBlobSha' as summary_blob_sha
       from public.artifacts
       where workspace_id = $1 and path = $2`,
      [workspaceId, path],
    );
    return rows.rows[0];
  }

  function summary(blob: string, text: string) {
    return {
      kind: "summary",
      model: "test-model",
      path: "src/session.ts",
      provider: "anthropic",
      summary: text,
      summaryBlobSha: blob,
    };
  }

  it("does not let a job that started earlier overwrite newer prose", async () => {
    await scan([{ blob: BLOB_A, path: "src/session.ts" }]);
    // The job for blob A starts. Before it finishes a rescan lands blob B
    // and the job for B stores its prose.
    await scan([{ blob: BLOB_B, path: "src/session.ts" }]);
    expect(await apply([summary(BLOB_B, "B의 요약")])).toEqual({
      applied: 1,
      invalid: 0,
      missing: 0,
      skipsApplied: 0,
      superseded: 0,
    });

    // Now the old job finishes. It must lose.
    expect(await apply([summary(BLOB_A, "A의 요약")])).toEqual({
      applied: 0,
      invalid: 0,
      missing: 0,
      skipsApplied: 0,
      superseded: 1,
    });
    expect(await stored("src/session.ts")).toEqual({
      source_blob_sha: BLOB_B,
      summary: "B의 요약",
      summary_blob_sha: BLOB_B,
    });
  });

  it("counts rows written, not items sent, for a file that is gone", async () => {
    await scan([{ blob: BLOB_A, path: "src/session.ts" }]);
    await scan([{ blob: BLOB_A, path: "src/other.ts" }], ["src/session.ts"]);

    // The old function returned 1 here — one input item — while updating no
    // row at all, and the worker reported that phantom as a delivered
    // summary.
    expect(await apply([summary(BLOB_A, "사라진 파일의 요약")])).toEqual({
      applied: 0,
      invalid: 0,
      missing: 1,
      skipsApplied: 0,
      superseded: 0,
    });
  });

  it("refuses a summary that states no digest rather than writing it blind", async () => {
    await scan([{ blob: BLOB_A, path: "src/session.ts" }]);
    expect(
      await apply([
        {
          kind: "summary",
          model: "test-model",
          path: "src/session.ts",
          provider: "anthropic",
          summary: "조건 없는 요약",
        },
      ]),
    ).toEqual({
      applied: 0,
      invalid: 1,
      missing: 0,
      skipsApplied: 0,
      superseded: 0,
    });
    expect((await stored("src/session.ts"))?.summary).toBeNull();
  });

  it("keeps an older failure from landing on a newer success", async () => {
    await scan([{ blob: BLOB_A, path: "src/session.ts" }]);
    await scan([{ blob: BLOB_B, path: "src/session.ts" }]);
    expect(await apply([summary(BLOB_B, "B의 요약")])).toEqual({
      applied: 1,
      invalid: 0,
      missing: 0,
      skipsApplied: 0,
      superseded: 0,
    });

    // A provider failure recorded against blob A arrives late. The skip gate
    // it would set is what makes the file look attended-to, so it has to be
    // rejected too — and a rejected gate is not a gate written.
    expect(
      await apply([
        {
          kind: "skip",
          path: "src/session.ts",
          reason: "provider-failure",
          summaryBlobSha: BLOB_A,
        },
      ]),
    ).toEqual({
      applied: 0,
      invalid: 0,
      missing: 0,
      skipsApplied: 0,
      superseded: 0,
    });

    const rows = await database.query<{ skipped: string | null }>(
      `select metadata->'summarySkipped' as skipped from public.artifacts
       where workspace_id = $1 and path = 'src/session.ts'`,
      [workspaceId],
    );
    expect(rows.rows[0]?.skipped).toBeNull();
  });

  it("records a failure against the blob it happened on", async () => {
    await scan([{ blob: BLOB_A, path: "src/session.ts" }]);
    expect(
      await apply([
        {
          kind: "skip",
          path: "src/session.ts",
          reason: "provider-failure",
          summaryBlobSha: BLOB_A,
        },
      ]),
    ).toEqual({
      applied: 0,
      invalid: 0,
      missing: 0,
      skipsApplied: 1,
      superseded: 0,
    });

    const rows = await database.query<{ blob: string; reason: string }>(
      `select metadata->'summarySkipped'->>'reason' as reason,
              metadata->'summarySkipped'->>'sourceBlobSha' as blob
       from public.artifacts
       where workspace_id = $1 and path = 'src/session.ts'`,
      [workspaceId],
    );
    expect(rows.rows[0]).toEqual({ blob: BLOB_A, reason: "provider-failure" });
  });

  it("clears the skip gate when the summary for that blob lands", async () => {
    await scan([{ blob: BLOB_A, path: "src/session.ts" }]);
    await apply([
      {
        kind: "skip",
        path: "src/session.ts",
        reason: "provider-failure",
        summaryBlobSha: BLOB_A,
      },
    ]);
    await apply([summary(BLOB_A, "재시도 성공")]);

    const rows = await database.query<{ skipped: string | null }>(
      `select metadata->'summarySkipped' as skipped from public.artifacts
       where workspace_id = $1 and path = 'src/session.ts'`,
      [workspaceId],
    );
    expect(rows.rows[0]?.skipped).toBeNull();
    expect((await stored("src/session.ts"))?.summary).toBe("재시도 성공");
  });
});
