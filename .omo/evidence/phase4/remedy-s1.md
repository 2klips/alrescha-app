# Phase 4 · Codex remedy S1 — summary freshness, read and write

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-02 / P0-A on
todos 19, 20 and 16 — the foundation those surfaces need before they expose
prose. **Scope:** `packages/core/src/enrich/prose-summary.ts`,
`supabase/migrations/202609060003_artifact_summary_cas.sql`,
`apps/worker/src/{enrich-job,postgres-enrich-store}.ts`,
`apps/web/lib/mcp/supabase-store.ts`,
`apps/web/lib/inspection/inspection-report.ts`,
`tests/summary-freshness.test.ts` (new).

## Two halves of one problem

`artifacts.metadata` is **merged** on every scan — deliberately, so a summary
survives a rescan (ADR-014). That is also the defect: prose written for blob A
is still sitting in the row after blob B lands, and every reader served it as
a description of the file *now*.

And the write had no condition at all. A job that started against blob A and
finished after the job for blob B had already stored its prose overwrote B
with A. The newer summary was lost and had to be paid for again.

**Neither fix substitutes for the other.** A read filter hides the wrong
prose; it does not stop the newer prose from being destroyed. A write
condition protects what is stored; it does not stop a summary from going stale
after it was stored correctly. Both are here.

## The read rule, in one function

`summaryState()` answers with four states, not two:

| State     | When                                                          |
| --------- | ------------------------------------------------------------- |
| `current` | two **non-empty** digests that are equal                       |
| `stale`   | two non-empty digests that differ — text kept, not served      |
| `unknown` | either digest absent or empty — including **both** absent      |
| `missing` | no prose at all                                                |

Two nulls are not a match. An artifact with no source digest and a summary
with no cache key agree about nothing, and calling that `current` is exactly
how a legacy row would present itself as a fresh description forever.

`currentSummaryText()` is the accessor a reader uses: the prose in `current`,
`null` in every other state. The text of a stale summary stays in the row and
can be shown deliberately as history; it does not leak into a default answer,
an excerpt or a context pack.

**One function, both sides.** `selectFilesForSummarization` — the enrich
cache predicate — is now expressed through `summaryState`, so a file the
selector calls fresh is exactly a file a reader may quote. The test asserts
that equivalence directly rather than trusting the two to stay in step.

### Callers moved onto it

- `apps/web/lib/mcp/supabase-store.ts` — `content` and `summary` on every MCP
  artifact. This is the one that mattered most: `get_artifact`,
  `get_node_content`, search excerpts and context packs all read from here.
- `apps/web/lib/inspection/inspection-report.ts` — the document freshness
  widget. Its narrowed query gained two short scalars (`source_blob_sha`,
  `metadata->summaryBlobSha`); the reason the unbounded metadata blob stays
  out of that query still holds.
- `apps/worker/src/postgres-enrich-store.ts` `listSummarizedFiles` — the
  concept-layer input already required `summaryBlobSha = source_blob_sha` in
  SQL. Unchanged: it was the only reader that had the rule.

## The write condition, and an honest count

`apply_artifact_summaries` now compares the digest the generation started from
against the artifact's current one and writes only on a match. It returns
what actually happened instead of how many items it was handed:

| Bucket         | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `applied`      | the row exists, its blob still matches — prose written      |
| `superseded`   | the row exists, its blob moved on — nothing written         |
| `missing`      | no artifact at that path any more — nothing written         |
| `invalid`      | no path, or a summary with no digest — nothing written      |
| `skipsApplied` | failure gates written, under the same condition             |

The old function returned `1` for a summary of a file that had since been
deleted while updating no row, and the worker reported that phantom as a
delivered summary.

Skips carry the digest they failed on, for the same reason: a provider failure
recorded against blob A arriving after blob B's summary landed would set a
gate that makes the file look attended-to. It is rejected.

`skipsApplied` is a separate counter on purpose — a recorded failure is not
delivered work, and collapsing it into `applied` would let a run of pure
failures satisfy the no-free-charge guard.

## What `superseded` means for billing

Valid prose that lost a race with a rescan is **not** a provider failure: the
model did the work and the blob moved underneath it. So the no-free-charge
guard counts `applied + superseded` as delivered. Rejecting would refund work
that was performed; retrying would put a repository that is simply being
edited into a loop — the failure mode the remedy names explicitly. A run where
prose reached no row for any other reason (all `missing`, all skipped) still
fails, and a run that delivered nothing because of schema-invalid outputs
still rejects and refunds.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(151 files, 1,237 passed, 1 skipped — 19 more than todo 8),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
324 files).

`tests/summary-freshness.test.ts` (15 cases) covers the four scenarios the
remedy names plus the rule itself:

- the four states, including all four ways a digest can be absent or empty;
- the selector and the reader agreeing file by file;
- **a job that started earlier does not overwrite newer prose** — blob B's
  summary survives blob A's late arrival, `superseded: 1`;
- **a summary for a deleted file applies nothing** and counts as `missing`,
  where the old function reported one applied row;
- a summary with no digest is `invalid` rather than written blind;
- a late failure gate is rejected, and one for the current blob records which
  blob it failed on and is cleared by that blob's summary.

`apps/worker/src/enrich-job.test.ts` gains the two guard cases: an all-
superseded run resolves, an all-missing run throws.
`apps/web/lib/inspection/inspection-report.test.ts` asserts prose is shown
only while it describes the current blob, and that a document with stale prose
still appears — with no summary rather than last week's.

## Not verified here

- **Concurrency.** The overwrite scenario is reproduced by controlling
  completion order, not by racing two live PostgreSQL connections. The CAS is
  a single conditional `UPDATE … RETURNING`, so it is atomic per row, but no
  test here proves behaviour under real lock contention.
- **Billing.** No test asserts what a superseded run does to the credit
  ledger; the guard's behaviour is asserted at the handler, and the existing
  reservation and refund tests were not extended. The remedy's warning about
  claiming an operational billing defect was confirmed applies in reverse too:
  this change is not evidence that billing is now correct.
- **`module_summaries` and the concept graph.** The remedy asks for the same
  conditional store keyed by member digest (todo 20). `apply_module_summary`
  is untouched; `module-tools.ts` already compares `memberDigest` on read.
- **Other prose writers.** `judgments` and coaching merge their own fields
  into `artifacts.metadata`; only the enrich summary path is conditional.
- **Playwright** (no Docker daemon): `/app/inspection` renders the changed
  freshness widget and no e2e has run against it.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
