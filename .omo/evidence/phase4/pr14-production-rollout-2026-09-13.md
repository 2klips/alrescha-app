# PR #14 production rollout — enrich archive

Date: 2026-09-13. All times below are UTC.

**Deployment complete; shared analyze archive path verified on v20. The merge push pair succeeded at zero credits. Scan completed on v19 at attempt 1; analyze crossed the rolling restart and completed on v20 at attempt 2. The requested “both on v20, attempt 1” condition was therefore not met. Enrich itself was not run and its production archive observation remains pending until the user next runs it.**

## Merge and deployment

- PR: <https://github.com/2klips/alrescha-app/pull/14>.
- [Rollout comment](https://github.com/2klips/alrescha-app/pull/14#issuecomment-5653140028) posted; this evidence and the handoff status update are left uncommitted for the Claude lane to preserve.
- Merge commit: `e564df987c684243a5a156c95e4a863b5d3c635a`, merged at `2026-09-13T11:55:53Z`.
- Parents: `d8e4c1b36551ebe884ab96e4430dad4558b1f801` and `3933be8422d0de43a19c11193af6bdb85c5ee971`. Both PR commits (`ed9115b`, `3933be8`) are preserved; no squash.
- Local main was fast-forwarded to the merge. Its tree equals the tested PR tip (`git diff --exit-code 3933be8 HEAD`). No application code was edited by Codex.
- `flyctl deploy` from the repository root completed successfully. Fly release **v20**, status `complete`, created at `2026-09-13T11:56:27Z`.
- Image: `registry.fly.io/arr-worker:deployment-01M2D9ZJRM2J4J61QMTZ4EGTT6`.
- Image manifest: `sha256:c4e6af8f19a22f55411d627245d40e0e07524271cb88b09b35149471e3158c51`.
- `flyctl status`: active machine `48e7e62f574d58`, nrt, v20, started, updated `2026-09-13T11:56:42Z`; standby `48ed969dc49238`, v20, stopped, updated `2026-09-13T11:56:38Z`. Deployment smoke and machine checks passed. No HTTP listener is expected.
- Vercel's automatic main deployment reported `success` at `2026-09-13T11:56:16Z`: [deployment](https://vercel.com/2klips-projects/arr-app-web/8NyUBMFRn2mnBZFrTkfg5pGwW8zp). Web code was unchanged. HTTP checks: `/` → **200**, GET `/api/mcp` → **405**.
- No migration or setting change. The production ledger remained `202609120004_first_scan_retry.sql` (applied `2026-09-12T13:41:31.507700Z`), checked before and after deployment through the worker's existing database connection without displaying credentials.

## Merge push pair and restart

The production queue was empty at `2026-09-13T11:54:19.411Z`. The actual merge push created run `01M2D9ZHN5PWZYVQ32QYF9R85P` at `2026-09-13T11:55:57.397Z`, with `trigger_kind=push` and commit `e564df987c684243a5a156c95e4a863b5d3c635a`. Read-only verification at `2026-09-13T12:00:06.489Z` returned run status `succeeded`:

| Kind | Job ID | Status | Attempt | Credit cost | Latest claimed at | Completed at | Last error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scan | `01M2D9ZHQ7D4ADTRGN82GN7GMW` | succeeded | 1 | 0 | `11:55:58.281226Z` | `11:56:01.943141Z` | null |
| analyze | `01M2D9ZHR885JN0SRN45M558QF` | succeeded | 2 | 0 | `11:57:04.506397Z` | `11:57:42.294682Z` | null |

Selected worker log lines, with their original timestamps and messages:

```text
2026-09-13T11:56:01Z app[48e7e62f574d58] nrt [info]  scan @e564df9 incremental → 1 rows
2026-09-13T11:56:04Z app[48e7e62f574d58] nrt [info]  analyze @e564df9 316 bodies (archive: 1,225 files, 21,703 KiB)
2026-09-13T11:56:39Z app[48e7e62f574d58] nrt [info] INFO Sending signal SIGINT to main child process w/ PID 634
2026-09-13T11:56:40Z app[48e7e62f574d58] nrt [info] INFO Main child exited with signal (with signal 'SIGINT', core dumped? false)
2026-09-13T11:56:52Z app[48e7e62f574d58] nrt [info]worker local-634 draining 1 workspace(s) across 4 loop(s)
2026-09-13T11:57:07Z app[48e7e62f574d58] nrt [info]  analyze @e564df9 316 bodies (archive: 1,225 files, 21,703 KiB)
```

The first scan and analyze archive lines precede the v20 restart and belong to v19. The second analyze archive line follows the v20 startup and precedes its successful completion. The restart timeline and attempt counter support deployment interruption as the reason for attempt 2; no rate-limit error was observed. This is not evidence that both jobs ran on v20 at attempt 1. It does verify that the extracted shared preparer still serves analyze through the archive on v20.

No `archive fallback`, `403 ...rate-limit`, or `retry deferred` line was returned in the inspected `11:55–11:59Z` rollout log window. No extra push, rescan, picker reselection, or enrich was triggered to replace the observed pair. Webhook-derived keys and delivery identifiers were not read into the report.

## Final read-only checks

At `2026-09-13T12:01:00.308Z`:

- Global queued/running jobs: **0**.
- Newly terminal-failed jobs since preflight (`2026-09-13T11:54:19.411Z`): **0**.
- Enrich jobs created since preflight: **0**.
- `2klips/alrescha-app`: `last_scanned_commit_sha` and `last_analyzed_commit_sha` both equal `e564df987c684243a5a156c95e4a863b5d3c635a`.
- Ledger latest: `202609120004_first_scan_retry.sql`.

`pnpm --silent ops:health` was run inside the production worker using unchanged repository `scripts/ops-health.ts` and `package.json` staged in `/app/pr14-rollout`, with the installed worker dependencies. Its complete health output was:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 140 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 14 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.1h old (warn above 24h).
status: warn
```

Exit 1 represents the existing 14-job WARN. The new pair added no terminal failures. No database data, failed jobs, availability timestamps, migration files, warning thresholds, pacer, concurrency, archive thresholds, caps, or secrets were changed.

## Validation and remaining observation

Codex reran `pnpm lint`, `pnpm typecheck`, and the complete `pnpm test` before merging: **189 test files, 1,741 passed, 1 skipped**. All gates passed; the deployed merge tree equals that tested tree.

**Pending, by design:** the actual enrich archive log. On the next user-initiated enrich, record the `enrich @<sha> <N> bodies (archive: …)` line when the dominant commit group has at least 32 pending files, or its fallback reason. Below the threshold, the absence of a new archive line is expected. Do not run an enrich solely to verify this change. No actual enrich memory, request-count, or paid-provider performance claim is made here.

No mandatory follow-up implementation was identified. Leave OQ-067 ⑵⑶ for the second-repository measurements, OQ-066 for the required App settings work, and OQ-068 for a user decision. Do not start an optional scope without that decision.

Rollback remains available: deploy the previous v19 image `registry.fly.io/arr-worker:deployment-01M2B1YPCEH0EJFJSXJG84Y7EF`, or set `SCAN_ARCHIVE_FETCH=off`. Neither rollback was needed or performed.
