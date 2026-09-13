# PR #14 production rollout — enrich archive

Date: 2026-09-13. All times below are UTC.

**Deployment complete; shared analyze archive path verified on v20. The merge push pair succeeded at zero credits. Scan completed on v19 at attempt 1; analyze crossed the rolling restart and completed on v20 at attempt 2. The requested “both on v20, attempt 1” condition was therefore not met. Subsequent authorized enrich observation is complete: its archive path worked, but the job failed because the Anthropic platform credit balance was insufficient; the app credit was fully refunded. See “Enrich observation” below.**

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

**At the initial rollout**, the actual enrich archive log was deferred until a user-authorized execution. That execution and its outcome are now recorded below. Below the archive threshold, the absence of a new archive line remains expected. No actual enrich memory, request-count, or paid-provider performance claim is made here.

No mandatory follow-up implementation was identified. Leave OQ-067 ⑵⑶ for the second-repository measurements, OQ-066 for the required App settings work, and OQ-068 for a user decision. Do not start an optional scope without that decision.

Rollback remains available: deploy the previous v19 image `registry.fly.io/arr-worker:deployment-01M2B1YPCEH0EJFJSXJG84Y7EF`, or set `SCAN_ARCHIVE_FETCH=off`. Neither rollback was needed or performed.

## Enrich observation

Subsequent user authorization on 2026-09-13 explicitly permitted **one** enrich pass in the pilot workspace through Settings → AI. This supersedes the earlier verification-only prohibition for this one execution. No second execution is authorized.

### PR #15 and preflight

- Documentation-only PR #15 was merged with merge commit `26b0d1d5e0b5478e6d1bd862c02e28085640b206` at `2026-09-13T12:11:22Z`, preserving `2a1a3bd5fe7023d2a234515054580990e07f3dfe`. Vercel reported success at `2026-09-13T12:11:46Z`.
- No worker deployment or migration was performed. Fly remained v20, image `arr-worker:deployment-01M2D9ZJRM2J4J61QMTZ4EGTT6`. The automatic merge push pair was left to its normal processing, without a separate verification workload.
- Target workspace: `01M11Q24T11NG2SV2ZCE6P3CYV`; repository: `01M11QNPZ3CWTDF91B9A34F6VZ`, `2klips/alrescha-app`. The product header showed this repository before submission; no picker reselection was needed.
- Read-only preflight at `2026-09-13T12:12:25.000Z`: credit balance **18**, BYOK providers **none**, queue **0**, existing enrich jobs in the pilot workspace **0**, pending files **899**. The AI settings UI independently showed 18 credits and Anthropic/OpenAI both unconfigured. No key value was accessed.
- The pending-file predicate was `source_blob_sha IS NOT NULL` and `metadata->>'summaryBlobSha' IS DISTINCT FROM source_blob_sha`, scoped to the target workspace and repository. The worker also requires a last-seen commit. The largest eligible commit group was **239** files at `a1a38ce41bf43439e8ce05ecaab34480198ea115` (read at `2026-09-13T12:12:46.367Z`). The archive threshold applies to this group, not all 899 files together; the remaining 660 files retain their own commit reads.

### One product submission and archive evidence

The existing `개념 패스 실행` button on `/app/settings/ai` was clicked **exactly once**. The product redirected to `?enrich=queued` and displayed the queued status. No SQL enqueue, direct action invocation, extra enrich, scan, or repository reselection was used.

- Enrich job: `01M2DAYJGE19HQC4D0P5JQ4BHQ`.
- Run: `01M2DAYJG9DZJK9ANVPRTV3JG3`.
- Created: `2026-09-13T12:12:54.123Z`; first claimed: `2026-09-13T12:12:54.952Z`.
- Billing: Anthropic platform credits (no BYOK); enqueue assigned `credit_cost=1`. At the initial observation the job was running at attempt 1 with `last_error=null`. The UI showed the one-credit reservation and balance **17**.

Original archive log line:

```text
2026-09-13T12:12:56Z app[48e7e62f574d58] nrt [info]  enrich @a1a38ce 239 bodies (archive: 1,169 files, 20,806 KiB)
```

The archive line verifies use of the enrich archive path; it does not by itself establish job success or complete enrichment of all pending files. The final result below is **failed**, with the app credit fully refunded.

### Provider failure during the first attempt

At `2026-09-13T12:21:35.592Z`, the same job was running at attempt 2 (claimed `2026-09-13T12:20:38.821Z`) with the application-generated error `Enrich produced no summaries: 899 file(s) skipped.` Read-only classification of the stored skip reasons found **899 Anthropic HTTP 400 failures**. A subsequent boolean/count query at `2026-09-13T12:22:56.958Z` confirmed all 899 matched **provider credit balance insufficient**. The provider response bodies were never selected into tool output or copied into this evidence.

The workspace's 18 app credits were sufficient for enqueue; the failure is the separate Anthropic platform account balance. No BYOK key is configured. This prevents a successful paid-provider pass even though the GitHub archive path works. The job's existing `max_attempts=3` policy controls automatic retries; no additional product submission, manual retry, cancellation, credential change, or provider top-up was performed.

The same archive line appeared again at `2026-09-13T12:20:40Z` on the automatic second attempt. No archive fallback or GitHub primary/secondary 403 was found in the inspected logs through the first retry.

Attempt 3 was claimed at `2026-09-13T12:28:18.497Z`, retaining the same job ID, `credit_cost=1`, and the same no-summaries error from attempt 2. Its archive log was:

```text
2026-09-13T12:28:20Z app[48e7e62f574d58] nrt [info]  enrich @a1a38ce 239 bodies (archive: 1,169 files, 20,806 KiB)
```

The credit ledger at `2026-09-13T12:27:16.041Z` contained only the original `reserve=-1` for this job; retries had not reserved additional credits.

### Terminal result and credit refund

Read-only terminal observation at `2026-09-13T12:36:01.229Z`:

| Field | Result |
| --- | --- |
| Job ID | `01M2DAYJGE19HQC4D0P5JQ4BHQ` |
| Status | **failed** |
| Attempt / maximum | **3 / 3**, automatic retries of the single submitted job |
| Credit cost | **1**, unchanged from enqueue |
| Completed at | `2026-09-13T12:35:44.077Z` |
| Last error | `Enrich produced no summaries: 899 file(s) skipped.` |
| Run status | **failed** |
| Remaining pending files | **899** |
| App credit balance | **18 → 17 reserved → 18 refunded** |

The credit ledger at `2026-09-13T12:36:43.145Z` had exactly two entries for the job: `reserve=-1` at `2026-09-13T12:12:54.989Z`, and `refund=+1` at `2026-09-13T12:35:44.077Z`. **Net app credit consumption: 0.** A read-only reload of the AI settings page also showed 18 credits and the refund; the execute button was not clicked again.

The final DB snapshot at `2026-09-13T12:36:37.695Z` showed queue **0**, newly terminal-failed jobs since preflight **1**, and total enrich jobs for the target workspace/repository **1**. The ledger remained `202609120004_first_scan_retry.sql`. In the inspected `12:12–12:36Z` worker logs, primary 403, secondary 403, and enrich archive fallback counts were all **0**.

`pnpm --silent ops:health` ran through the same unchanged read-only probe in the v20 worker after the enrich job terminated:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 145 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 15 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.4h old (warn above 24h).
status: warn
```

Exit 1 is WARN. The historical 14 failures now have **one new enrich failure**, for 15 total. The requested `succeeded`, `last_error=null`, and `new failures=0` acceptance conditions were **not met**. No job or threshold was altered to change that result.

**Observation complete; successful enrichment remains blocked by the Anthropic platform balance.** This observation does not identify a required archive implementation change. Resolving the provider balance and any later enrich execution require the user's separate action/authorization; the one approved product submission has been used. Keep the existing Claude lane sequence (todo 24 → todo 15), without creating a new scope or PR. Preserve these two uncommitted documentation updates and the unrelated existing local work.

This session reran lint, typecheck, and the complete tests: 189 files, 1,741 passed, 1 skipped. No implementation change was made. Preserve the Claude lane's current todo 24 → todo 15 sequence; this observation does not open a new implementation scope.
