/**
 * Isolated remedy research. Uses an IN-MEMORY PGlite database only.
 * Applies existing migrations there; never connects to Supabase or edits product.
 * The UPDATE and bounded SQL below are experimental candidates, not migrations.
 * Run from app: node --import tsx docs/reports/remedy-design-2026-09-06.experiment.mjs
 */
import assert from "node:assert/strict";
import console from "node:console";
import {
  ALL_MIGRATIONS,
  createTestDatabase,
} from "../../tests/helpers/database.ts";

const database = await createTestDatabase([...ALL_MIGRATIONS]);
const observations = [];
const record = (name, result) => observations.push({ name, ...result });
const blobA = "1".repeat(40);
const blobB = "2".repeat(40);
const commit = "a".repeat(40);

try {
  await database.query(
    "insert into auth.users (id, email) values ($1, 'remedy@example.test')",
    ["81111111-1111-4111-8111-111111111111"],
  );
  const workspaceId = (await database.query("select id from public.workspaces"))
    .rows[0].id;
  const repositoryId = (
    await database.query(
      "select public.ensure_local_repository($1, 'local/remedy-research') as id",
      [workspaceId],
    )
  ).rows[0].id;
  const scan = async (blob) =>
    database.query("select public.apply_repository_scan($1, $2, $3::jsonb)", [
      workspaceId,
      repositoryId,
      JSON.stringify({
        artifacts: [
          {
            classification: "code_metadata",
            digest: blob.repeat(2).slice(0, 64),
            exportedSymbols: [{ kind: "function", name: "run" }],
            kind: "code_metadata",
            path: "src/a.ts",
            rationales: [],
            sizeBytes: 120,
            sourceBlobSha: blob,
            sourceCommitSha: commit,
            symbolEngine: "typescript-ast",
            todoItems: [],
          },
        ],
        codeLinks: [],
        commitSha: commit,
        removedPaths: [],
        skipped: [],
        touchedRows: 1,
        treeSha: "b".repeat(40),
        unchangedPaths: [],
      }),
    ]);
  const summary = (blob, text, path = "src/a.ts") => ({
    kind: "summary",
    path,
    summary: text,
    summaryBlobSha: blob,
    model: "research-model",
    provider: "research-provider",
  });
  const existingSave = async (item) =>
    (
      await database.query(
        "select public.apply_artifact_summaries($1, $2, $3::jsonb) as touched",
        [workspaceId, repositoryId, JSON.stringify([item])],
      )
    ).rows[0].touched;
  const current = async () =>
    (
      await database.query(
        "select source_blob_sha, metadata from public.artifacts where workspace_id=$1 and repository_id=$2 and path='src/a.ts'",
        [workspaceId, repositoryId],
      )
    ).rows[0];

  // Deterministic interleaving: B's work finishes before the older A's work.
  // This reproduces late completion, not multiconnection PostgreSQL concurrency.
  await scan(blobA);
  await scan(blobB);
  await existingSave(summary(blobB, "Fresh summary B"));
  await existingSave(summary(blobA, "Late summary A"));
  const overwritten = await current();
  assert.equal(overwritten.source_blob_sha, blobB);
  assert.equal(overwritten.metadata.summaryBlobSha, blobA);
  record("existing_writer_late_completion", {
    sourceBlob: overwritten.source_blob_sha,
    summaryBlob: overwritten.metadata.summaryBlobSha,
    servedText: overwritten.metadata.summary,
    staleOverwroteFresh: true,
  });

  await existingSave(summary(blobB, "Fresh summary B"));
  const guardedSave = async (item) =>
    (
      await database.query(
        `with changed as (
       update public.artifacts
       set metadata = (coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'summary', $4::text, 'summaryBlobSha', $5::text,
         'summaryGrade', 'inferred'
       )) - 'summarySkipped'
       where workspace_id=$1 and repository_id=$2 and path=$3
         and source_blob_sha is not null
         and source_blob_sha=$5::text
       returning id
     ) select count(*)::int as applied from changed`,
        [
          workspaceId,
          repositoryId,
          item.path,
          item.summary,
          item.summaryBlobSha,
        ],
      )
    ).rows[0].applied;
  const rejectedOld = await guardedSave(summary(blobA, "Late summary A"));
  assert.equal(rejectedOld, 0);
  assert.equal((await current()).metadata.summary, "Fresh summary B");
  const acceptedCurrent = await guardedSave(
    summary(blobB, "Current replacement B"),
  );
  assert.equal(acceptedCurrent, 1);
  record("candidate_digest_guard", {
    lateApplied: rejectedOld,
    currentApplied: acceptedCurrent,
    finalText: (await current()).metadata.summary,
  });

  const missing = summary(blobB, "Not delivered", "src/deleted.ts");
  const oldMissingCount = await existingSave(missing);
  const newMissingCount = await guardedSave(missing);
  assert.equal(oldMissingCount, 1);
  assert.equal(newMissingCount, 0);
  record("delivery_count", {
    existingMissingCount: oldMissingCount,
    candidateAppliedCount: newMissingCount,
  });

  // Small synthetic data, real SQL: measure semantic behavior, not performance.
  await database.exec(
    "create temporary table research_rows(id integer primary key, label text not null)",
  );
  await database.exec(
    "insert into research_rows select n, 'file-' || n from generate_series(1,1001) n",
  );
  const page = async (after, take) =>
    (
      await database.query(
        `with candidates as materialized (
       select id, label from research_rows where id > $1 order by id limit $2 + 1
     ), visible as (
       select * from candidates order by id limit $2
     )
     select jsonb_build_object(
       'rows', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from visible v), '[]'::jsonb),
       'hasMore', (select count(*) > $2 from candidates),
       'lastId', (select max(id) from visible)
     ) as envelope`,
        [after, take],
      )
    ).rows[0].envelope;
  const firstPage = await page(0, 1000);
  const secondPage = await page(firstPage.lastId, 1000);
  assert.equal(firstPage.rows.length, 1000);
  assert.equal(firstPage.hasMore, true);
  assert.deepEqual(
    secondPage.rows.map(({ id }) => id),
    [1001],
  );
  assert.equal(secondPage.hasMore, false);
  record("bounded_scalar_envelope", {
    firstCount: firstPage.rows.length,
    firstHasMore: firstPage.hasMore,
    secondCount: secondPage.rows.length,
    secondHasMore: secondPage.hasMore,
    total: firstPage.rows.length + secondPage.rows.length,
    limitation:
      "SQL semantics only. No PostgREST payload ceiling/RLS or concurrent mutation verified.",
  });
} finally {
  await database.close();
}

// Proposed pure policy experiment, NOT the production impactOf implementation.
const impactCandidates = (edges, changed, maxDepth = 2) => {
  const visited = new Set([changed]);
  const candidates = [];
  let frontier = [changed];
  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    const next = [];
    for (const id of frontier) {
      for (const edge of edges) {
        if (
          !["imports", "calls"].includes(edge.relation) ||
          edge.target !== id ||
          edge.layoutOnly
        )
          continue;
        if (visited.has(edge.source)) continue;
        visited.add(edge.source);
        candidates.push(edge.source);
        next.push(edge.source);
      }
    }
    frontier = next;
  }
  return candidates.sort();
};
const edges = [
  { source: "A", target: "B", relation: "imports" },
  { source: "C", target: "B", relation: "imports" },
  { source: "README", target: "A", relation: "references" },
  { source: "README", target: "C", relation: "references" },
  { source: "folder", target: "B", relation: "contains", layoutOnly: true },
];
assert.deepEqual(impactCandidates(edges, "A"), []);
assert.deepEqual(impactCandidates(edges, "B"), ["A", "C"]);
record("candidate_reverse_dependency_policy", {
  changedA: impactCandidates(edges, "A"),
  changedB: impactCandidates(edges, "B"),
  limitation:
    "Demonstrates direction/family exclusion only; not whole-program behavioral impact.",
});
console.log(
  JSON.stringify(
    {
      date: "2026-09-06",
      scope:
        "In-memory PGlite with current main migrations + isolated candidate SQL/pure policy",
      productionChanged: false,
      assertions: "passed",
      observations,
    },
    null,
    2,
  ),
);
