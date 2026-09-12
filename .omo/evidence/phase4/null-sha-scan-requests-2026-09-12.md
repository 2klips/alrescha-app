# Scan requests at the null sha — cause, fix, and the production hand-off

**Date:** 2026-09-12 · **Trigger:** `.omo/evidence/perf/containment-production-2026-09-12.md`
(Codex) — production `ops:health` = `warn`, 7 permanent failures against a
threshold of 5; six are `scan` jobs at `0000000000000000000000000000000000000000`
dated 2026-09-09 → 12, one is the 2026-09-02 truncated coaching response.
**Boundary:** production was not touched. Everything below is from code,
tests and the PGlite fixtures; the production steps are written for Codex.

## What the sha is

Forty zeros is Git's *null object id* — the value Git and GitHub write where
a commit is absent. GitHub's `push` webhook sends it as `after` when the
push **deleted** its ref (a branch or a tag): `deleted: true`,
`head_commit: null`, `commits: []`. It is not a tree sha the lookup failed
on; the worker's message reads that way only because the first thing a scan
does with a commit is `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`,
and that is the request that 404s.

Every check between GitHub and the queue asked the same question — "forty
lowercase hex characters?" — and the null id answers yes:

| layer | check | null id |
|---|---|---|
| `normalizeGitHubWebhook` (`packages/core/src/github/webhook.ts`) | `^[0-9a-f]{40}$` on `body.after` | passes |
| `github_webhook_deliveries.commit_sha`, `runs.commit_sha` constraints | same regex | pass |
| `ingest_github_webhook_event` (202608100004) | none — enqueues `scan` + `analyze` for whatever it is given | enqueued |
| `scanRepository` (`packages/core/src/ingest/repository-scanner.ts`) | same regex | passes, then asks GitHub for the tree |

The dates match: six ref deletions between 09-09 and 09-12 is the cadence of
the containment-join work — PR branches deleted after merge and pushed
worktree branches removed. Each deletion became one delivery, one run at the
null sha, one `scan` job that failed three times (`GitHub repository request
failed: 404 (/repos/…/git/trees/0000…?recursive=1)`) and one `analyze` job.

## Every scan producer, audited

| producer | where the sha comes from | can it be the null id? |
|---|---|---|
| GitHub `push` webhook → `ingest_github_webhook_event` | `body.after` | **yes — a deleted ref.** This is the production case. |
| GitHub `check_run` / `workflow_run` → same RPC | `<run>.head_sha` | no; GitHub always names the commit the run checked |
| Connect → `scheduleBackfillScan` → `enqueue_backfill_scan` (202609060006) | caller-supplied `headCommitSha` | format-only check; neither connect route passes a head today (`apps/web/app/api/github/repositories/route.ts`, `…/url/route.ts` omit it), so the backfill is refused before the RPC. A future caller reading an empty repository's default branch could hand it the null id. Guarded now. |
| "Scan again" / MCP `request_rescan` → `enqueue_repository_rescan` (202609060007) | `repositories.last_scanned_commit_sha` | no — written only by `apply_repository_scan` from a plan whose sha the scanner validated; the scanner now refuses the null id, so the column cannot acquire it. |
| CLI `alrescha push` (`packages/cli/src/local-source.ts`) | synthetic `sha1("commit\0" + treeSha)` | no — a SHA-1 of a non-empty string; the CLI also uploads the plan directly and never enqueues a worker scan. |
| `scripts/replay-github-deliveries.ts` | GitHub redelivery → the web route | same path as the webhook; covered by the handler fix. |

## The fix — refused at enqueue, with the queue's own backstop

The null id is never a legitimate scan target, so the request is refused
before a row exists rather than handled as a special failure in the worker.
Four layers, outermost first:

1. **Webhook handler** (`handleGitHubWebhook`): a delivery whose commit is the
   null id is acknowledged with `202 { ignored: true, reason: "ref_deleted" }`
   — a 2xx, so GitHub does not count it against the App — and neither
   `resolveRepository` nor `insertEvent` runs. `normalizeGitHubWebhook` still
   reports what GitHub sent; the decision belongs to the layer that would
   otherwise persist and enqueue.
2. **Queue functions** (migration `202609120001_null_sha_scan_guard.sql`):
   `ingest_github_webhook_event` raises `webhook delivery … carries no
   scannable commit` before the delivery row, the run and the two jobs;
   `enqueue_backfill_scan` extends its existing head check to refuse the
   null id. This is the refusal for any producer that is not the web handler.
3. **Backfill helper** (`scheduleBackfillScan`): the null id reads as "the
   repository's head commit is unknown" and never reaches the RPC.
4. **Consumers**: `scanRepository` refuses the null id with a message that
   names it (`… is the null sha (a deleted ref): there is no tree to scan`)
   instead of an opaque 404, and the `analyze` job's `commitShaOf` refuses it
   too — see the next section for why that one matters most.

`NULL_GIT_SHA` and `isScannableCommitSha` live in
`packages/core/src/ingest/commit-sha.ts` and are the one definition all four
use. The `ops:health` threshold stays at 5; `scripts/ops-health.ts` is
untouched.

## The quieter half: what `analyze` did at the null sha

The six deliveries enqueued six `analyze` jobs too, and those are **not**
among the permanent failures — which means they most likely succeeded. Read
the handler at the null id:

- `readTransientSource` treats only a 404 as "the file vanished" and returns
  `null`; the contents API answers 404 for every path at a ref that does not
  exist.
- so every document and every test file is dropped from the analysis
  (`assuranceSourceRequired` = documents and test paths), leaving code files
  with an empty body;
- `reconcileRequirements` supersedes every requirement (none extracted),
  `reconcileCiEvidence` replaces all CI evidence with nothing (the collector
  fails and is caught), `reconcileFindings` resolves every document-anchored
  finding, and a receipt is written with `commitSha` = the null id and a
  `git:commit` subject of forty zeros.

The next real push re-creates all of it (same fingerprints, same requirement
ids), so the damage is churn plus bogus rows, not loss — but it is exactly
the MT-1 mass-resolve through a different door, and it is why layer 4 is not
decorative. This is inferred from code; the verification queries below say
whether it happened.

## Tests

Each one fails against the previous behaviour — verified by knocking every
guard out, re-running (7 failures), then restoring.

- `tests/null-sha-scan-guard.test.ts` — the handler acknowledges a deletion
  push without storing it (and still receives a creation push, whose null id
  is `before`); the RPC raises at the null id and leaves no delivery, run or
  job (and still produces the scan/analyze pair for a real commit); the
  backfill helper never reaches the RPC; the scanner refuses before
  `listTree`.
- `tests/backfill-and-rescan.test.ts` — `enqueue_backfill_scan` refuses the
  null id and writes no run.
- `apps/worker/src/analysis-job.test.ts` — the analyze job rejects the null
  id before reading a body, reconciling or issuing a receipt.

`pnpm lint`, `pnpm typecheck`, `pnpm test`: green (180 files, 1638 tests, 1
pre-existing platform skip).

## Production — for Codex (nothing below has been run)

**1. Confirm the mechanism** (read-only, inside the Fly worker with its
`DATABASE_URL`, values never printed):

```sql
-- the six deliveries, and that they were pushes
select delivery_id, event, received_at
from public.github_webhook_deliveries
where commit_sha = repeat('0', 40) order by received_at;

-- their jobs: six failed scans, and whatever the analyzes did
select kind, status, attempt_count, created_at, left(last_error, 80) as error
from public.jobs
where payload->>'commitSha' = repeat('0', 40) order by created_at, kind;

-- receipts the analyzes may have issued at a commit that does not exist
select id, run_id, status, created_at
from public.receipts where commit_sha = repeat('0', 40);
```

The GitHub App's *Recent Deliveries* page shows `"deleted": true` on each of
those delivery ids if the reading here is right.

**2. Deploy the fix.** Merge → Vercel deploys `arr-app-web` (the handler fix
is in `packages/core`, consumed by the web route). Apply
`202609120001_null_sha_scan_guard.sql` with the migration runner the same
way the 2026-09-12 batch was applied (checksum ledger; no data change, two
`create or replace function`). Redeploy `arr-worker` (v16) for the scanner
and analyze guards — not urgent, the queue holds no null-sha job, but it is
what stops a stray one from mass-resolving findings.

**3. Clear the warning without touching the threshold — now optional.** When
this was written the `permanent-failures` count was all-time (`status =
'failed' and attempt_count >= max_attempts`, no window), so the six rows
would have kept `ops:health` at `warn` until neutralised. Since the merge
with `.omo/evidence/phase4/ops-health-permanent-failure-window-2026-09-12.md`
the count covers a rolling 7-day window on `completed_at`, so the check
returns to `ok` on its own once the oldest of the six is more than seven
days old (about 2026-09-16). Run the SQL below only to clear the warning
immediately or to mark the rows as withdrawn for the record; in one
transaction:

```sql
-- withdraw the six scans that could never have succeeded; the rows stay
update public.jobs
set status = 'cancelled', cancelled_at = now(), last_error =
  coalesce(last_error, '') || ' [withdrawn 2026-09-12: null sha, a deleted ref — see evidence]'
where kind = 'scan' and status = 'failed'
  and payload->>'commitSha' = repeat('0', 40);

-- if step 1 found receipts at the null sha, they describe nothing
update public.receipts set status = 'invalidated'
where commit_sha = repeat('0', 40) and status <> 'invalidated';
```

Leave the delivery rows and the runs: they are the record of what GitHub
sent, and the `audit-write-coverage` check tolerates fewer scan jobs than
audit rows. After this, `ops:health` should report 1 permanent failure (the
coaching response) and `ok` overall. The coaching failure is a separate
item and was not investigated here.

## Observations left as they are

- ~~`permanent-failures` never decays.~~ **Resolved 2026-09-12**, same day, in
  `.omo/evidence/phase4/ops-health-permanent-failure-window-2026-09-12.md`:
  the count now covers a rolling 7-day window on `completed_at` and recovers
  on its own; the threshold is still 5.
- `inspection-report.ts` takes the newest run's `commit_sha` as the head
  shown in the stale banner; a deletion run at the null id would have shown
  `0000000` there until the next push. No new such run can be created now.
- Pushes to *any* ref, not only the default branch, enqueue a scan. That is
  the existing product behaviour and was not changed.
