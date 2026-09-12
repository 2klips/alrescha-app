# PR #9 production rollout — GitHub read throttling

Date: 2026-09-12. Scope: review, merge, production migration, worker deployment,
and live verification. Application code and applied migration files were not
edited. All production database reads ran inside the active Fly worker using
its existing connection; no credentials, response bodies, payloads, or delivery
identifiers were retained.

## Merge and release gates

- PR: <https://github.com/2klips/alrescha-app/pull/9>.
- Rollout comment:
  <https://github.com/2klips/alrescha-app/pull/9#issuecomment-5646026677>.
- Merge commit: `5cb4379afa61f71b64d4bd11f15f6e7334509089`, merged at
  `2026-09-12T12:46:49Z` with the merge method, preserving the original commits.
- The live PR differed from the pasted handoff: remote `main` was still
  `19378cae070d9564376883590997d5ef6ff52158`, so the PR included the earlier
  rollout-record commit `35c88d4` as well as `8ac512e` and `88b42b8`.
  Merge parents are `19378ca` and `88b42b8`; no squash or history rewrite.
- Root checkout fast-forwarded to the merge commit. Tracked files were clean
  before deployment; the pre-existing untracked launch file and brand assets
  were left alone and excluded by the Docker build allowlist.
- Review covered refusal classification/body disposal, shared pause behavior,
  retry deferral, defaulted four-argument compatibility, function privileges,
  and the corresponding regression tests. No rollout blocker was found.
- `pnpm lint`: passed, zero warnings.
- `pnpm typecheck`: passed at root and all workspaces.
- `pnpm test`: 185 files passed, 1,693 tests passed, 1 skipped; 112.88 seconds.
  These ran on `88b42b8`, whose tree is the merge result.
- `git diff --check`: passed.

## Migration, before the worker

At `2026-09-12T12:47:18.422Z`, the newest production ledger row was
`202609120002_backfill_analyze_pair.sql`, applied at
`2026-09-12T11:46:08.135Z`.

The worker image intentionally excludes operational scripts and migrations.
The exact merge-checkout package manifest, migration runner, health probe, and
full migration directory were staged in a temporary directory inside v17.
`pnpm --silent db:migrate` then reported one applied migration:

```text
Applied: 202609120003_finish_job_retry_delay.sql
```

Output also included two harmless PostgreSQL NOTICE messages that the ledger
schema/table already existed; it was not literally a one-line transcript.
No other migration was applied. The checksum runner checked the full history.
The new ledger timestamp is `2026-09-12T12:47:46.752314Z`.

At `2026-09-12T12:48:09.653Z`, `pg_get_function_identity_arguments` returned
exactly one `public.finish_job` row:

```text
target_job_id text, target_worker_id text, succeeded boolean, failure_message text, retry_delay_seconds integer
```

## Worker and web

- `WORKER_WORKSPACE_IDS` was confirmed unset before and after deployment.
- Deployed from root `main@5cb4379` with `flyctl deploy --remote-only`.
- Fly release v18, complete, created `2026-09-12T12:48:41Z`.
- Image: `arr-worker:deployment-01M2ATJRDBS6R7P565EH754RE0`.
- Image manifest digest:
  `sha256:a9c22f2ad01326d3bdf632c331c50a604338bb8484fac43bdd05db914bc108b9`.
- Active NRT machine `48e7e62f574d58`: started at `2026-09-12T12:48:54Z`.
  Standby `48ed969dc49238`: stopped, release v18.
- Startup log at `2026-09-12T12:49:04Z`:

  ```text
  worker local-634 draining 1 workspace(s) across 4 loop(s)
  ```

- No manual web deployment. Vercel marked the merge commit successful at
  `2026-09-12T12:47:12Z`. Production `/` returned 200 and `/api/mcp` GET
  returned 405.
- Rollback remains v17,
  `arr-worker:deployment-01M2AQ256FT6E1W3QJYTASMBEK`; keep migration
  `202609120003` in place. No rollback was performed.

## Fresh production pair

The merge push created a new pair at the new head, avoiding the terminal
same-head backfill/rescan keys from PR #8:

- Repository: `2klips/alrescha-app`.
- Head: `5cb4379afa61f71b64d4bd11f15f6e7334509089`.
- Run: `01M2ATG2P59AH74EFJ3NWHJR05`.
- Created: `2026-09-12T12:46:53.073423Z`.
- Scan: `01M2ATG2PZY6EJGBB377XDJDDD`.
- Analyze: `01M2ATG2QDHQMJJPGXBCRVYF9N`.
- Both still had attempt count zero after v18 startup at
  `2026-09-12T12:49:44.343Z`; execution therefore belongs to v18.

Final read-only snapshot: `2026-09-12T12:55:28.252Z`.

| kind | status | attempts | credit_cost | claimed at (UTC) | completed at (UTC) | duration | last_error |
| --- | --- | ---: | ---: | --- | --- | ---: | --- |
| scan | succeeded | 1 | 0 | `12:51:10.378152Z` | `12:51:12.375812Z` | 1.998 s | null |
| analyze | succeeded | 1 | 0 | `12:53:14.651769Z` | `12:55:22.414290Z` | 127.763 s | null |

Both repository SHA columns equal
`5cb4379afa61f71b64d4bd11f15f6e7334509089`; the SQL equality is **true**, not
null. New permanent failures since the merge timestamp: **0**.

At `12:52:15.933Z`, analyze was still queued behind an earlier analysis.
An earlier v17 analysis interrupted by deployment was automatically reclaimed
on attempt 2 with `worker lease expired`, then completed successfully; no
manual queue repair was used. The new pair itself had no retry.

No classified 403/429 failed-attempt line was found in the v18 log window from
startup through `12:55:50Z`. Neither new job ever exposed a non-null
`last_error` in the observed snapshots. Thus the live refusal kind remains
**unobserved**; an inline pause cannot be inferred from duration alone. This
run proves successful v18 execution, but does not provide a production
observation of queue deferral or settle the old primary-vs-secondary question.
The regression tests cover those branches. No secondary-limit/pacer escalation
is supported by this run's logs.

## UI observation and implementation-lane follow-up

The authenticated production home was checked before rollout and again after
the pair succeeded at approximately `12:55:40Z`. It displays
`2klips/LostArk_Scheduler`, the most recently created repository, and its
historical failed backfill. It shows `구조 스캔 실패`, `분석 실패`, and no
`다시 스캔` button. The requested `구조 스캔 완료 · 분석 완료` home state is
therefore **not verified**; this is the same UI state seen before deployment.

`apps/web/lib/home/journey.ts` orders repositories by `created_at` descending
and `buildWorkspaceJourney` always uses the first one. Consequently, success
of the fresh alrescha-app pair cannot by itself satisfy the requested home UI
acceptance in this workspace. Reconnecting an existing repository updates
`selected_at`, which the home query does not use. The available-repository
inventory contains only the two already connected repositories, so the
suggested new-repository backfill is not available through the existing
inventory. No repository timestamps, failure rows, or permissions were changed
to force a passing screen. This belongs to the implementation lane.

Claude follow-up: make the home repository selection explicit/consistent with
the repository being verified, or provide a supported recovery path for the
terminal first backfill. The existing LostArk pair cannot be reused as a new
test at the same head; its scan SHA is still null, so ordinary rescan also
refuses it. Do not cancel/delete its failed rows or edit timestamps to hide
the state. No frontend fix was made in this deployment lane.

## Production health

The exact checkout's health script was staged in v18 and run with
`pnpm --silent ops:health` inside `/app` at approximately
`2026-09-12T12:55:48Z`:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 107 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 14 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.1h old (warn above 24h).
status: warn
```

The command returned status 1 as designed for `warn`. The permanent-failure
count remains the pre-rollout 14; every other signal is OK, and the queue is
empty. The warning threshold and seven-day window remain unchanged.

## Acceptance status

- Migration and worker rollout: complete.
- Fresh pair, zero-credit completion and repository SHA equality: passed.
- Production home completed-stage UI: blocked by the repository-selection
  behavior described above.
- Live refusal kind and queue deferral: not observed in this run. In-job pauses
  do not emit a failure line; do not infer primary or secondary from duration.
- No failure deletion/cancellation, `available_at` editing, threshold change,
  applied-migration edit, or application-code change.
