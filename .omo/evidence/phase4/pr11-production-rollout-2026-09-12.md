# PR #11 production rollout — canonical repository name and webhook ID matching

Date: 2026-09-12. Operator: Codex deployment lane. All timestamps below are UTC.

Status: **web rollout and canonical-name/backfill acceptance complete**. The pair recovered automatically after a production primary-rate-limit reset; both jobs succeeded, zero credits, matching merge-head SHAs, queue zero, no new permanent failures. Next-real-push webhook acceptance remains deferred.

## Scope and preflight

- Read the repository-name handoff, implementation evidence including “Live run” and “Rollout — for the Codex lane,” and the PR #10 rollout background.
- PR: <https://github.com/2klips/alrescha-app/pull/11>.
- Base: `80a99cb1b5ef3f5e6fcca80e2e697ae1b97e77ab`; reviewed/tested head: `f2d4e9a4941ebca37c8a3ec4d816ac6d0faf0dd2`.
- Preserved all three commits: `f6c5b6d`, `e615e3d`, `f2d4e9a`; merge commit, no squash.
- Local gates: `pnpm lint` PASS; `pnpm typecheck` PASS across root/workspaces; `pnpm test` PASS (188 files, 1,720 passed, one skipped; 118.10 s); `git diff --check` PASS. The merged tree equals the tested branch tip.
- No migration, worker/core/health-script change in this PR. No application code was edited by Codex.
- At `14:28:40.917Z`, the latest production ledger entry was `202609120004_first_scan_retry.sql`, applied `2026-09-12T13:41:31.507700Z` (the query client renders milliseconds). No migration command was run.
- Fly remains release v18, created `12:48:41Z`, image `arr-worker:deployment-01M2ATJRDBS6R7P565EH754RE0`, active machine `48e7e62f574d58`. No deploy or restart.
- Read-only baseline at `14:28:11.707Z`: target repository and inventory both `2klips/arr-app`, default branch `main`; repository `selected_at=13:43:36.972Z`, inventory `observed_at=2026-08-27T13:48:23.640Z`; repository scan/analyze SHA both `80a99cb1b5ef3f5e6fcca80e2e697ae1b97e77ab`. No job completed as failed since `14:23:18Z`.
- Pilot workspace: `01M11Q24T11NG2SV2ZCE6P3CYV`; connected target repository: `01M11QNPZ3CWTDF91B9A34F6VZ`; GitHub repository ID: `1328886745`.

## Merge and web deployment

- Merged at `14:30:00Z`: `0283dc09acd48e080f2d2bb254fe3b304c432dcf`.
- Parents: `80a99cb1b5ef3f5e6fcca80e2e697ae1b97e77ab` and `f2d4e9a4941ebca37c8a3ec4d816ac6d0faf0dd2`.
- Vercel production status for that exact merge commit: SUCCESS, updated `14:30:24Z`; deployment [6KhmN9ZSsjPasAdZGtk1q8WvFzmM](https://vercel.com/2klips-projects/arr-app-web/6KhmN9ZSsjPasAdZGtk1q8WvFzmM).
- After SUCCESS: `GET https://arr-app-web.vercel.app/` → 200; `GET https://arr-app-web.vercel.app/api/mcp` → 405.
- At `14:30:26.966Z`, the run query for this merge SHA returned zero rows, consistent with the expected old-deployment merge-push behavior. This read alone does not assert a particular webhook response; no delivery identifier/body was read or recorded.

## Picker and identity acceptance

Authenticated pilot-owner Chrome session, production UI only:

| Step | Observed UI |
| --- | --- |
| Before selection (including reload after deployment) | Home and header `2klips/LostArk_Scheduler`; both stages complete; `다시 스캔`; `연결된 레포 2개` and `다른 레포 선택` |
| Open picker through the home link | Buttons `2klips/arr-app` and `2klips/LostArk_Scheduler` |
| Click `2klips/arr-app` once | Returned to `/app?github=pending&backfill=scheduled`; home and header `2klips/alrescha-app`; merge head `0283dc0`; scan/analyze queued; disabled `스캔 진행 중` |
| Return through the same home link | Picker button now `2klips/alrescha-app`; LostArk button unchanged; no second selection |

Read-only verification at `14:33:37.954Z`, scoped to the pilot workspace and target GitHub/repository ID:

| Table | Result |
| --- | --- |
| `repositories` | `full_name=2klips/alrescha-app`, `default_branch=main`, `selected_at=2026-09-12T14:31:41.697Z` |
| `github_available_repositories` | `full_name=2klips/alrescha-app`, `default_branch=main`, `observed_at=2026-09-12T14:31:41.482Z` |
| `security_audit_events`, latest target `repository_selected` | `occurred_at=2026-09-12T14:31:42.054928Z`; metadata `{"kept":false,"renamed":true,"metadataSource":"github"}` |

The handoff SQL names `security_audit_events.created_at`; the production schema uses **`occurred_at`**. The first read-only verification attempts returned `42703` (one also referenced a nonexistent `jobs.started_at`); after checking column names, the query used `occurred_at` and `jobs.claimed_at` and succeeded. No schema or data correction was made.

## Backfill pair and production 403

Run ID: `01M2B0G0MNZ985M796CHKRBSBE`.
Run key: `backfill:0283dc09acd48e080f2d2bb254fe3b304c432dcf`.
Both jobs created at `2026-09-12T14:31:42.448279Z`, credit cost 0 each.

| Kind | Job ID | Idempotency key |
| --- | --- | --- |
| scan | `01M2B0G0NP411EV99G1QDK21TZ` | `backfill:01M11QNPZ3CWTDF91B9A34F6VZ:0283dc09acd48e080f2d2bb254fe3b304c432dcf` |
| analyze | `01M2B0G0P30WAAJ9K3XFQV8G1X` | `backfill:01M11QNPZ3CWTDF91B9A34F6VZ:0283dc09acd48e080f2d2bb254fe3b304c432dcf:analyze` |

Safe, filtered Fly log observations from active v18 (not the earlier local live test):

```text
2026-09-12T14:31:43Z scan 01M2B0G0NP411EV99G1QDK21TZ attempt 1 failed: GitHub repository request failed: 403 primary-rate-limit; retry after 330s; rate limit 0/5000 core, resets in 330s (/repos/2klips/arr-app/git/trees/0283dc09acd48e080f2d2bb254fe3b304c432dcf?recursive=1) — retry deferred 331s
2026-09-12T14:31:44Z analyze 01M2B0G0P30WAAJ9K3XFQV8G1X attempt 1 failed: GitHub repository request failed: 403 primary-rate-limit; retry after 330s; rate limit 0/5000 core, resets in 330s (/repos/2klips/arr-app/git/trees/0283dc09acd48e080f2d2bb254fe3b304c432dcf?recursive=1) — retry deferred 330s
```

At `14:33:37.954Z`, both jobs were `queued`, `attempt_count=1`, `credit_cost=0`, `claimed_at=null`, `completed_at=null`. Their `last_error` was the classified error above (through the tree URL). Scan `available_at=14:37:14.856554Z`; analyze `available_at=14:37:14.210672Z`.

The log's “attempt 1 failed” describes the individual attempt; neither job was terminal `failed`. The log timestamp plus `resets in 330s` places the reset at approximately **14:37:13–14Z** (23:37:13–14 KST); the exact recorded scheduler times above are the authoritative retry times. No `available_at`, failed row, concurrency, or pacer was changed. No repeated picker click or forced push.

This is a production observation of **primary-rate-limit**, answering PR #9's primary/secondary question for these requests. The earlier `1051s` observation in the implementation evidence was from a local worker sharing the same installation budget; it is separate evidence. No secondary-rate-limit has been observed in this rollout so far.

Natural resume observed at `14:37:54.576Z`: analyze was `running`, attempt 2,
claimed at `14:37:15.890Z`; scan remained queued at attempt 1. Analyze's
`available_at` precedes scan's by about 0.65 s, so the observed order is
consistent with the queue schedule. No additional selection or manual retry.

The merged tree contains 1,217 tracked files (`git ls-tree -r --name-only HEAD`
count). This is a file count, not a measurement of GitHub requests or credits.

### Final completion

Read-only verification at `14:41:12.850Z`:

| Kind | Status | Attempt count | Credit cost | Final claim | Completed | Final last_error |
| --- | --- | --- | --- | --- | --- | --- |
| analyze | succeeded | 2 | 0 | `14:37:15.890214Z` | `14:40:13.547371Z` | null |
| scan | succeeded | 2 | 0 | `14:40:13.658827Z` | `14:41:05.753632Z` | null |

At `14:41:30.107Z`, the run was `succeeded`, `started_at=14:31:43.108731Z`,
`completed_at=14:41:05.753632Z`. Target repository name remained
`2klips/alrescha-app`; **both `last_scanned_commit_sha` and
`last_analyzed_commit_sha` equal `0283dc09acd48e080f2d2bb254fe3b304c432dcf`**.
Neither initial deferral became a terminal failure. New terminal failed jobs
since the preflight cutoff `14:23:18Z`: **0**; failed jobs in the seven-day
window: **14**, unchanged.

Final authenticated home reload and screenshot showed the canonical name in
home/header, header SHA `0283dc0`, `구조 스캔 완료`, `분석 완료`, and enabled
`다시 스캔`; graph summary 2,068 nodes / 10,323 links. The multi-repository
line/link remained present. No rescan button was clicked.

Final ledger read at `14:41:30.107Z`: still
`202609120004_first_scan_retry.sql`, same application timestamp. Final Fly
status: v18, same image; active/standby machine last-updated timestamps remain
`12:48:54Z` / `12:48:50Z`. Filtered logs contained the two primary-limit lines
above and no secondary-limit line in this rollout window.

### Final ops health

At approximately `14:41Z`, ran `pnpm --silent ops:health` inside the existing
Fly worker using the already-staged exact health script (unchanged by PR #11)
and the production process environment. Exit 1 is the expected WARN result:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 117 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 14 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 1.0h old (warn above 24h).
status: warn
```

## Deferred validation and rollback

- Webhook ID matching has unit-test coverage and is deployed; its next-real-push production acceptance remains **deferred**. The PR #11 merge-push had no run before picker selection. Do not manufacture another push to satisfy the check; observe the next ordinary push/PR merge, without recording delivery identifiers.
- Web rollback: Vercel Instant Rollback to the preceding `80a99cb` deployment. No migration rollback or data reversal is required; the picker wrote GitHub's current name.
- No immediate application implementation is prescribed by the canonical-name acceptance. OQ-066 (pre-selection inventory refresh, canonical URL path, rename-event subscription) and full-scan request volume under the observed primary budget are follow-up candidates, not authorized scope expansion.

## Record hygiene

Production reads used a read-only transaction inside the existing Fly worker and its environment; no credential value was output. No DATABASE_URL, token, GitHub response body, job/webhook payload, or delivery ID is included here. Existing failed jobs, applied migration files, warning thresholds, unrelated untracked files, and worker deployment were left unchanged.

## Shared working tree and handoff

Codex leaves the rollout evidence, this task's frontend log, frontend WORKLOG
row, and repository-name handoff status uncommitted for the next lane to
preserve. Existing `.claude/launch.json` and brand files were not touched.

During the production wait, concurrent uncommitted worker edits appeared in
`github-repository-source.ts`, `repository-scan.ts`, `run-local.ts`, their two
existing test files, and new `apps/worker/src/github-archive-scan.test.ts`.
These were not authored, tested, reverted, committed, or deployed by this
Codex rollout. The test/deployment claims above apply to `0283dc0` (tree equal
to the tested PR #11 tip), not to those concurrent changes. Preserve them and
establish their scope separately before the next implementation/deployment.

At the final status snapshot, concurrent edits also included
`apps/worker/src/analysis-job.ts` and its test, `docs/DEPLOYMENT_RUNBOOK.md`,
`spec/OPEN_QUESTIONS.md`, and existing `.omo/evidence/phase4/todo-16/` live
artifacts. These were likewise preserved and are outside this rollout's
claims. Preserve all pre-existing/concurrent changes when carrying forward
the four rollout documentation files.

PR rollout comment:
<https://github.com/2klips/alrescha-app/pull/11#issuecomment-5646588415>.

Final documentation formatting checks passed after formatting the WORKLOG
table; scoped `git diff --check` passed. No further application test run was
made against the concurrent worker edits: the complete green gates recorded
above are for the deployed PR #11 tree.
