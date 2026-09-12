# PR #12 production rollout — archive reads for full scans and analysis

Operator: Codex deployment lane. Timestamps are UTC on 2026-09-12 unless
otherwise stated; the verification crosses midnight into September 13 KST.

Status: **rollout complete** — Fly v19; both full scan and analysis used
archives and succeeded at attempt 1 for zero credits; same-window core
counter decrease 3; memory fell after the pass; queue 0, new failures 0,
historical failures 14 WARN. PR #11's real-push webhook check is complete.
The home button actually requested an incremental rescan; the full-pass
acceptance was completed through one normal picker re-selection instead.

## Scope and preflight

- Read the scan-archive handoff, implementation evidence including Live run and Rollout, and deployment runbook §6 / §10.1.
- PR: <https://github.com/2klips/alrescha-app/pull/12>.
- Base `0283dc09acd48e080f2d2bb254fe3b304c432dcf`; tested/reviewed tip `e0bff619b2b955903ecacdd36cfcf15f28ac3968`.
- Preserved commits `4a4e2c6`, `4831bcd`, `e0bff61` with a merge commit, no squash.
- `pnpm lint` and `pnpm typecheck` PASS. `pnpm test`: 189 files, 1,738 passed, one skipped, 114.83 s. `git diff --check` PASS. Merged tree equals tested tip.
- No application code, migration, dependency, pacer, concurrency setting, threshold, or archive cap was changed by Codex. The archive feature uses its default enabled setting.
- At `14:55:01.985Z`, ledger latest was `202609120004_first_scan_retry.sql`, applied `2026-09-12T13:41:31.507700Z`; no migration command was run.
- Preflight worker was v18, image `arr-worker:deployment-01M2ATJRDBS6R7P565EH754RE0`.
- Pilot workspace `01M11Q24T11NG2SV2ZCE6P3CYV`, repository `01M11QNPZ3CWTDF91B9A34F6VZ`, GitHub ID `1328886745`; canonical name `2klips/alrescha-app`, selected at `14:31:41.697Z`.
- Preflight was not idle: 11 jobs queued/running, from existing branch push/check_run events; repository SHA columns already held `4831bcdf0f6c86ac10a064615156e5e34ed5a80f`. No new terminal failures since `14:50:47Z`. Existing jobs were allowed to drain, not cancelled/requeued or edited.

## Merge, deployment, and PR #11 webhook acceptance

- Merged at `14:57:02Z`: `c38dc082096efbf28c72468bcb6376b7aa859496`.
- Merge parents: `0283dc09acd48e080f2d2bb254fe3b304c432dcf`, `e0bff619b2b955903ecacdd36cfcf15f28ac3968`.
- Vercel automatic deployment [H6zC9buSwpVCXzGheAWhVVpC9Mdk](https://vercel.com/2klips-projects/arr-app-web/H6zC9buSwpVCXzGheAWhVVpC9Mdk) succeeded at `14:57:24Z`. Production `/` → 200; `/api/mcp` GET → 405. No web source change.
- Ran `flyctl deploy` from the repository root with the checked-in Dockerfile/config and unchanged build allowlist. Rolling deployment completed successfully.
- Fly release **v19**, created `14:57:42Z`, complete; image **`registry.fly.io/arr-worker:deployment-01M2B1YPCEH0EJFJSXJG84Y7EF`**; image manifest SHA256 `fce56389fd2803af4feae4379476d10b9264c5774d3a8880ad4ca1a8f38cac57`.
- Active machine `48e7e62f574d58`: v19, started, nrt, last updated `14:57:55Z`. Standby `48ed969dc49238`: v19, stopped, last updated `14:57:52Z`. No HTTP service/port is configured, as intended.
- v19 startup at `14:58:05Z`: one workspace across four drain loops.

**PR #11's next-real-push validation is now observed.** The actual PR #12
merge created a `push` run at `14:57:05.991453Z` for the canonical repository
and exact merge SHA: run `01M2B1YGFX38NHJ6FZTXWQFJSZ`, two zero-credit jobs.
The first read at `14:57:39.619Z` found both queued, attempt 0. This confirms
webhook ingestion/run creation after PR #11; no synthetic push, delivery ID,
payload, or webhook response body was used or recorded. The v18 backlog meant
the merge pair had not started before the worker rollout.

## Inherited queue and measurement isolation

v19 began draining existing work using the new analysis archive path:

```text
2026-09-12T14:58:08Z scan @e0bff61 incremental → 3 rows
2026-09-12T14:58:10Z analyze @e0bff61 316 bodies (archive: 1,221 files, 21,686 KiB)
2026-09-12T14:58:48Z scan @4831bcd incremental → 3 rows
2026-09-12T14:58:50Z analyze @4831bcd 316 bodies (archive: 1,221 files, 21,686 KiB)
```

At `14:58:58.380Z`, one pre-existing check_run analysis was running at
attempt 2; it had been in flight on v18 during the rolling replacement. This
is distinct from the requested manual-rescan attempt-1 acceptance. At
`15:00:26.314Z`, the inherited queue had fallen to five jobs with no new
terminal failures. The production home correctly kept its rescan button
disabled while the merge-head pair was pending.

At `15:02:06.196Z`, the queue was zero. The merge-push pair had completed on
v19, each at attempt 1, zero credits: scan claimed `15:01:19.053427Z`,
completed `15:01:21.000995Z`; analyze claimed `15:01:21.038943Z`, completed
`15:01:58.554195Z`. No new terminal failure since preflight. The home/header
showed the canonical name and merge SHA with an enabled rescan button.

The rate-limit probe uses the worker's existing GitHub App environment to
mint a repository-scoped read-only installation token, keeps it in memory,
and prints only core counters/reset/status. Initial connectivity observation
at `14:59:36.123Z`: HTTP 200, limit 5,000, remaining 4,971, used 29, reset
`15:43:25Z`. This is a diagnostic reading while the queue is active, not the
isolated rescan baseline. No claim of pair request consumption follows from it.

Memory is sampled without touching the worker: `/proc/meminfo` and the worker
process's `VmRSS`/`VmHWM`, numeric values only. At `14:58:37.639Z` during
inherited work, total memory 469,892 KiB, available 188,076 KiB; worker PID 634
RSS 239,872 KiB, peak RSS 269,904 KiB. These are process/VM samples, not heap
allocation or archive-lifetime instrumentation.

## Home rescan — procedure correction

The authenticated pilot owner clicked the home's `다시 스캔` **once**.
It returned `/app?rescan=scheduled&mode=incremental`. This is not the full
rescan promised in the original handoff: the deployed home form sends only
`repositoryId`; the action supplies no explicit `full` mode; for an up-to-date
resolver, the queue chooses incremental. Read-only source confirmation:
`apps/web/app/app/(shell)/home-screen.tsx`, `actions.ts`, and
`202609120004_first_scan_retry.sql`. No form, payload, resolver version, or
repository SHA was altered to force a result.

Run `01M2B28RCFDBS2TG6ZWY6QDV5Q`, created `15:02:41.767650Z`, key
`rescan:c38dc082096efbf28c72468bcb6376b7aa859496:incremental`.

| Kind | Job ID | Status / attempt / cost | Claimed | Completed |
| --- | --- | --- | --- | --- |
| scan | `01M2B28RD97RMH27FY6BVDBY4X` | succeeded / 1 / 0 | `15:02:42.612492Z` | `15:02:42.916879Z` |
| analyze | `01M2B28RDNEYZF8ZFF0K439AAK` | succeeded / 1 / 0 | `15:02:42.986549Z` | `15:03:20.298561Z` |

Scan key:
`rescan:01M11QNPZ3CWTDF91B9A34F6VZ:c38dc082096efbf28c72468bcb6376b7aa859496:incremental`;
analysis appends `:analyze`. Both final errors null. Safe Fly log lines:

```text
2026-09-12T15:02:42Z app[48e7e62f574d58] nrt [info]  scan @c38dc08 incremental → 0 rows
2026-09-12T15:02:44Z app[48e7e62f574d58] nrt [info]  analyze @c38dc08 316 bodies (archive: 1,221 files, 21,686 KiB)
```

This proves analysis archive use, not full scan archive use. The difference
is in the rollout instructions, not an observed worker failure.

## Full archive acceptance through the existing picker

To exercise a real full pass without application/DB edits, used the existing
picker connection path, whose backfill explicitly requests `mode=full`.
After the home session expired, the existing GitHub login flow restored the
session without a permission change. Opened `다른 레포 선택` and selected the
same canonical `2klips/alrescha-app` once. The production route returned
`/app?github=pending&backfill=scheduled`. Selection timestamp changed normally
through that UI to `15:06:11.572Z`; the selected repository/name stayed the
same. No further home rescan click or synthetic push.

Full backfill run **`01M2B2F6NKT3Z0SFCTMKT6HBV6`**, created
`15:06:13.033763Z`, key
`backfill:c38dc082096efbf28c72468bcb6376b7aa859496`.

| Kind | Job ID | Idempotency key |
| --- | --- | --- |
| scan | `01M2B2F6NRWSEZKK9Y5F4Y0615` | `backfill:01M11QNPZ3CWTDF91B9A34F6VZ:c38dc082096efbf28c72468bcb6376b7aa859496` |
| analyze | `01M2B2F6NTMC89HEF19GZZ7SF7` | `backfill:01M11QNPZ3CWTDF91B9A34F6VZ:c38dc082096efbf28c72468bcb6376b7aa859496:analyze` |

Exact safe Fly lines (no body or payload):

```text
2026-09-12T15:06:43Z app[48e7e62f574d58] nrt [info]  scan @c38dc08 full (archive: 1,221 files, 21,686 KiB) → 1 rows
2026-09-12T15:06:45Z app[48e7e62f574d58] nrt [info]  analyze @c38dc08 316 bodies (archive: 1,221 files, 21,686 KiB)
```

Final read at `15:07:52.630Z`:

| Kind | Status | Attempts | Credit cost | Claimed | Completed | last_error |
| --- | --- | --- | --- | --- | --- | --- |
| scan | succeeded | 1 | 0 | `15:06:14.527140Z` | `15:06:43.823638Z` | null |
| analyze | succeeded | 1 | 0 | `15:06:43.914217Z` | `15:07:38.099423Z` | null |

Run `succeeded`; elapsed from creation to completion about **85.07 s**
(scan execution 29.30 s, analyze 54.19 s). This production timing is not a
controlled comparison against the earlier local 18.9-second measurement.

Repository name remains canonical; both `last_scanned_commit_sha` and
`last_analyzed_commit_sha` equal **`c38dc082096efbf28c72468bcb6376b7aa859496`**.
Final authenticated home/screenshot showed the canonical header, `c38dc08`,
`구조 스캔 완료`, `분석 완료`, enabled `다시 스캔`, 2,074 nodes / 10,379 links.

## Budget and memory observations

Fresh one-shot installation-token probes with the same scope and the same
core reset timestamp `15:43:25Z` (limit 5,000):

| Window | Before | After | Observed decrease |
| --- | --- | --- | --- |
| Home incremental pair | `15:02:29.530Z`: remaining 4,967 / used 33 | `15:04:11.719Z`: remaining 4,966 / used 34 | 1 |
| Picker/full-backfill window | `15:05:50.223Z`: remaining 4,966 / used 34 | `15:07:54.719Z`: remaining 4,963 / used 37 | **3** |

These are measured counter differences around product actions, not a packet
trace or exact attribution of every request. The full window includes the
picker's metadata/head reads, and other clients can share the installation.
No unrelated production queue work was present immediately before either
action. The observed full-window change is only a few core units, consistent
with the archive log evidence; no claim of zero cost for every endpoint is
made.

A separate continuous probe retained one token in memory. After its first
reading, repeated `/rate_limit` responses reported used 0 / remaining 5,000
and a reset moving to one hour after each observation (e.g. `16:02:39Z`,
`16:02:50Z`). Those readings did not retain a common counter window and were
**excluded** from consumption calculations; their cause was not established.
The table uses the fresh one-shot readings sharing `15:43:25Z`. No token or
response body was retained, only these safe scalar projections.

Full-pass process memory observations, worker PID 634:

| Observation | RSS (KiB) | High-water RSS (KiB) | Meaning |
| --- | --- | --- | --- |
| `15:05:48.881Z`, before picker/full pass | 267,744 | 295,420 | about 261.47 MiB baseline |
| `15:06:31.720Z`, during full scan | 333,784 | 352,516 | high-water mark about 344.25 MiB |
| `15:07:36.569Z`, near analysis completion | 269,080 | 352,516 | observed drop from pass-time RSS |
| `15:07:58.479Z`, after completion | 253,268 | 352,516 | below pre-pass RSS |
| `15:09:03.805Z`, final one-shot sample | 253,912 | 352,516 | about 247.96 MiB; no persistent climb observed |

Final VM total/available memory: 469,892 / 159,672 KiB. Diagnostic processes
also affect VM available memory, so worker RSS is the cleaner comparison.
This short observation supports memory dropping after the pass; it is not
a long-duration leak test. Final Fly status kept the same v19 active/standby
timestamps (`14:57:55Z` / `14:57:52Z`), with no observed restart/OOM.

Filtered Fly logs from deployment through verification contained **no 403
primary-rate-limit, retry-deferred, archive-fallback, or OOM line**. Both
full-pass final errors were null. No pacing/concurrency/cap adjustment or
rollback was needed.

## Final health and handoff

Production `pnpm --silent ops:health` inside v19, approximately `15:08Z`;
the unchanged root health script was staged with its package command:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 127 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 14 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.2h old (warn above 24h).
status: warn
```

Exit 1 is the expected historical WARN. Read-only final count: new terminal
failures since preflight **0**. Ledger remains `202609120004`, same applied
timestamp.

No corrective application implementation is required by the completed worker
acceptance. **Correct the rollout assumption:** the current home rescan is
incremental on an up-to-date resolver; use an existing full-backfill path to
verify full archive reads. Do not silently change the home button to full as
part of a documentation correction. OQ-067 and OQ-066 remain optional product
decisions. PR #11's next-real-push validation is closed by the actual merge
push run above.

## Rollback and record hygiene

- Worker rollback remains the previous v18 image through `fly deploy --image`, or `SCAN_ARCHIVE_FETCH=off` as a Fly secret (which restarts the process). Neither rollback was invoked.
- No production DB data was manually modified; failed jobs, `available_at`, applied migration files, `permanentFailureWarn=5`, and `PERMANENT_FAILURE_WINDOW_DAYS=7` were not changed.
- Diagnostic helpers and the unchanged `ops-health` script were staged separately in the container; they are not worker implementation edits. Queries execute read-only transactions. Credentials, source bodies, payloads and delivery IDs are never printed or persisted by these probes.
- Existing `.claude/launch.json` and brand assets are unrelated and preserved.

Rollout evidence, frontend log/WORKLOG, scan-archive handoff status/procedure,
and the repository-name handoff's deferred-webhook status are left
uncommitted for Claude to preserve. PR rollout comment:
<https://github.com/2klips/alrescha-app/pull/12#issuecomment-5646741312>.
Final documentation formatting and `git diff --check` passed.
