# PR #8 production rollout — backfill analyze pair and onboarding progress

Date: 2026-09-12 UTC
PR: <https://github.com/2klips/alrescha-app/pull/8>
Merge commit: `19378cae070d9564376883590997d5ef6ff52158`
Result: migration, worker, and web rollout complete; live functional acceptance
blocked by repeat GitHub repository API 403 responses.

## Review and merge

- PR #8 was `MERGEABLE` with merge state `CLEAN` and a successful Vercel
  preview. The migration kept both function signatures and changed no table
  or stored data; the worker publishes the analyzed commit after recording the
  receipt.
- It was merged without squash at `2026-09-12T11:44:07Z`. The three evidence
  commits (`862d3d8`, `c74b812`, `3c512b7`) remain separate beneath merge
  commit `19378ca`.
- The root checkout was fast-forwarded to `main@19378ca` before the migration
  and worker build.

## Database migration

The checksum ledger was read inside the Fly worker using its existing
production `DATABASE_URL`. No connection value or other secret was printed or
copied. The five newest entries before migration were:

- `202609120001_null_sha_scan_guard.sql` —
  `2026-09-12T10:24:05.052Z`.
- `202609110015_containment_join_shape.sql` —
  `2026-09-12T08:41:42.054Z`.
- `202609060012_progress_attribution.sql` —
  `2026-09-12T08:41:41.854Z`.
- `202609060011_session_telemetry.sql` —
  `2026-09-12T08:41:41.637Z`.
- `202609060010_doc_pages.sql` — `2026-09-12T08:41:41.416Z`.

The required precondition held: `202609120001_null_sha_scan_guard.sql` was the
latest applied migration. The checksum-ledger runner then reported exactly:

```text
Applied: 202609120002_backfill_analyze_pair.sql
```

The ledger records its application at `2026-09-12T11:46:08.135Z`. Installed
function inspection returned:

```text
enqueue_backfill_scan       pair=true
enqueue_repository_rescan   pair=true
```

No applied migration file was changed, no row was deleted, and no rollback
SQL was run.

## Worker deployment

- `WORKER_WORKSPACE_IDS` was confirmed unset before deployment, so production
  continues to drain every workspace.
- Deployed `main@19378ca` from the repository root using
  `flyctl deploy --remote-only`.
- Fly release: v17, created `2026-09-12T11:47:12Z`.
- Image: `arr-worker:deployment-01M2AQ256FT6E1W3QJYTASMBEK`.
- The active NRT machine reached `started`; the standby reached `stopped`.
  The active process logged `draining 1 workspace(s) across 4 loop(s)` at
  `2026-09-12T11:47:38Z`.
- With the queue empty, the active v17 machine was restarted once at
  `2026-09-12T11:59:03Z` to clear its repository-source token cache during
  the 403 investigation. It returned to `started` and logged the same drain
  shape at `2026-09-12T11:59:12Z`; the release and image did not change.
- Worker rollback point: v16,
  `arr-worker:deployment-01M2AJB8XZQH13QKQWZ2XA483W`.

## Web deployment and smoke

- Vercel production status for `19378ca` became `success` at
  `2026-09-12T11:44:35Z`.
- `https://arr-app-web.vercel.app/` returned 200.
- `/api/mcp` GET returned 405, the expected result for the POST-only endpoint.

## Live functional verification

### Backfill connect

`2klips/LostArk_Scheduler`, an already installed pilot repository not yet in
the production workspace, was connected through the real
`/app/connect/github` URL form. The redirect was
`github=pending&backfill=scheduled`. At `2026-09-12T11:49:56.051Z`, the new
function created the required pair on one run:

| kind | credit cost | final status | attempts | completed at |
| --- | ---: | --- | ---: | --- |
| scan | 0 | failed | 3 | `2026-09-12T11:50:20.346Z` |
| analyze | 0 | failed | 3 | `2026-09-12T11:50:20.648Z` |

The scan's terminal cause was a GitHub repository tree request returning 403.
The analyze job then found no stored artifact because the scan had not applied
its plan. The repository remained `structure_ready=false` and
`analysis_current=false`. The production home truthfully rendered
`구조 스캔 실패` and `분석 실패`; it did not render the expected completed
stages or the rescan button.

### Recovery checks

- A fresh, repository-scoped installation token made a single request to the
  same tree immediately after the failure and received HTTP 200 with core
  rate-limit capacity remaining. This makes transient or secondary GitHub
  throttling the leading diagnosis, but it is an inference rather than a
  confirmed response reason.
- A zero-credit full rescan pair for `2klips/alrescha-app` also exhausted on
  GitHub 403 responses. After the v17 cache-clearing restart, a distinct
  incremental rescan pair was queued at `2026-09-12T11:59:34.929Z`:

  | kind | credit cost | final status | attempts | completed at |
  | --- | ---: | --- | ---: | --- |
  | scan | 0 | succeeded | 1 | `2026-09-12T11:59:36.884Z` |
  | analyze | 0 | failed | 3 | `2026-09-12T11:59:46.747Z` |

  The analyze cause was a GitHub contents request returning 403. A fresh
  token's single request to that same file returned HTTP 200, but the queued
  analysis still failed. `last_scanned_commit_sha =
  last_analyzed_commit_sha` remains false/null, so v17's successful publish
  path has not been observed in production.
- The first new valid-SHA 403 failures completed at
  `2026-09-12T11:46:44Z`, before v17 was released. Rolling back to v16 would
  therefore not address the observed failure, and v17 remains deployed.

This verifies that both new database functions queue a scan/analyze pair on
one run at zero credits. It does **not** satisfy the end-to-end acceptance of
two successful jobs, `analysis_current=true`, or the completed-stage UI.

## Production `ops:health`

Executed the PR #8 version of `scripts/ops-health.ts` inside the Fly worker at
`2026-09-12T12:01:41Z` using its production connection:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 99 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 14 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.3h old (warn above 24h).
status: warn
```

The 14 failures comprise the 6 historical null-SHA scans, 3 valid-SHA scan
jobs ending on GitHub 403, 4 analyze jobs ending on GitHub 403, and 1 analyze
job ending because its scan stored no artifact. The valid-SHA failures range
from `2026-09-12T11:46:44.264Z` through `2026-09-12T11:59:46.747Z`. No
withdrawal or cancellation SQL was run. Every signal other than
`permanent-failures` is `OK`.

## Local release gates

Run on `main@19378ca` after the rollout:

- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed across the root and all workspace projects.
- `pnpm test`: 182 files passed; 1,662 tests passed, 1 pre-existing platform
  test skipped.
- `scripts/verify-scope-boundaries.ts`: passed, 12 boundaries and 359 files.
- Prettier check over every non-binary PR #8 file: passed.
- `git diff --check`: passed.

## Follow-up boundary

Deployment code and applied database state were not changed during diagnosis.
The unresolved item is the repeat GitHub 403 under queued repository reads;
its retry/backoff or request behavior belongs to the implementation lane.
Todo 18's G2 pilot live-fire, OQ-065, and worker source-factory separation
remain outside this rollout.
