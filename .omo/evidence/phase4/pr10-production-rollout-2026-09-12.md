# PR #10 production rollout — current repository and first-scan retry

Date: 2026-09-12. Scope: production migration, PR merge/web deployment, and
authenticated selection/recovery verification. Application code was not
edited. The worker was neither deployed nor restarted. Production SQL reads
ran inside the existing Fly worker with its existing connection; credentials,
response bodies, payloads, and delivery identifiers were not retained.

## Release gates and migration before merge

- PR: <https://github.com/2klips/alrescha-app/pull/10>.
- Rollout comment:
  <https://github.com/2klips/alrescha-app/pull/10#issuecomment-5646330557>.
- Tested tip: `30ecf3c7d74cf6b1be91e23e37df10e1b2e86c5a`.
- `pnpm lint` and root/all-workspace `pnpm typecheck`: passed.
- `pnpm test`: 186 files passed, 1,706 tests passed, 1 skipped, 114.93 s.
- `git diff --check`: clean. No worker/core files changed; exactly one new
  migration. No previously applied migration was edited.
- At `2026-09-12T13:39:43.387Z`, the production ledger ended at
  `202609120003_finish_job_retry_delay.sql`, applied
  `2026-09-12T12:47:46.752314Z`.
- The exact PR checkout's manifest, runner, and full migration directory were
  staged under `/app/pr10-rollout` inside v18, then
  `pnpm --silent db:migrate` was run there. Output:

  ```text
  Applied: 202609120004_first_scan_retry.sql
  ```

  Two harmless existing-ledger NOTICE messages accompanied that line. The
  new ledger timestamp is `2026-09-12T13:41:31.507700Z`.
- Function inspection at `2026-09-12T13:41:35.098Z` returned exactly:

  | proname | body contains next_retry_idempotency_key |
  | --- | --- |
  | enqueue_backfill_scan | true |
  | enqueue_repository_rescan | true |
  | retry_generation_of | false |

  The helper's false value is expected; both enqueue functions contain the
  retry-key mechanism.

## Merge, web, and unchanged worker

- Merge commit: `80a99cb1b5ef3f5e6fcca80e2e697ae1b97e77ab`, merged at
  `2026-09-12T13:41:48Z`, after the migration and function verification.
- Merge method preserved `c1ba617`, `d984614`, and `30ecf3c`; parents are
  `5cb4379` and `30ecf3c`. No squash/history rewrite.
- Root `main` fast-forwarded to the merge commit; its tree equals the tested
  tip. Tracked files were clean. Existing untracked launch/brand files were
  left alone.
- Vercel automatic deployment:
  <https://vercel.com/2klips-projects/arr-app-web/HRpRrXG1QCSWBDVRof1E93tVYNbZ>.
  GitHub Vercel status became success at `2026-09-12T13:42:14Z`.
- Production `/` returned 200; `/api/mcp` GET returned 405.
- Fly remains v18, image
  `arr-worker:deployment-01M2ATJRDBS6R7P565EH754RE0`. Active machine
  `48e7e62f574d58` was started, standby `48ed969dc49238` stopped; the active
  machine's last update was still `2026-09-12T12:48:54Z`.
- No rollback was performed. Web rollback point remains the deployment of
  `5cb4379`; leave `202609120004` in place.

## Baseline and picker selection

The first pre-deploy home navigation showed a server-error fallback; one
reload restored the normal authenticated home. This occurred before the
migration/merge and did not reproduce on that reload.

Before rollout, both home and header named `2klips/LostArk_Scheduler` with
failed scan/analyze stages and no rescan button. After the new deployment,
they still named LostArk and now displayed `연결된 레포 2개`,
`다른 레포 선택`, and `첫 스캔 다시 시도`.

Actual selection timestamps differed from the handoff's assumed dates:

| repository before selection | selected_at (UTC) |
| --- | --- |
| 2klips/LostArk_Scheduler | 2026-09-12T11:49:54.576Z |
| 2klips/alrescha-app | 2026-08-27T13:48:39.701Z |

Following the actual home link opened the picker. It offered
`2klips/arr-app` and `2klips/LostArk_Scheduler`. A read-only join and GitHub's
repository API confirmed that `2klips/arr-app` is the stale cached label for
GitHub repository ID `1328886745`, whose canonical name is
`2klips/alrescha-app` (connected repository ID `01M11QNPZ3CWTDF91B9A34F6VZ`).
The matching ID was selected through the picker, without direct timestamp
or metadata SQL.

At `2026-09-12T13:43:36.972Z`, `selected_at` advanced normally. Home and header
both switched to that repository, but both named it **`2klips/arr-app`**:
the selection path copied the stale inventory name into
`public.repositories.full_name`, replacing the previously canonical name.
This is a reproducible metadata/name problem for the Claude lane; selection
agreement itself works. No manual name repair was performed.

The handoff also assumed this selection would reuse a succeeded same-head
backfill. The live selection instead created a new backfill at merge head
`80a99cb`, distinct from the push-triggered pair:

- Backfill run: `01M2AXQZKBFDFF1CJ34FZ46JF0`.
- Created: `2026-09-12T13:43:37.805541Z`.
- Trigger key: `backfill:80a99cb1b5ef3f5e6fcca80e2e697ae1b97e77ab`.
- Scan key:
  `backfill:01M11QNPZ3CWTDF91B9A34F6VZ:80a99cb1b5ef3f5e6fcca80e2e697ae1b97e77ab`.
- Analyze key: the same base followed by `:analyze`.
- Initial stages were queued and the button was disabled as `스캔 진행 중`.
  This is normal newly queued work, not evidence of retry deferral.

The merge-push run `01M2AXMRHR9SJPAS69XKRD96NG` succeeded at attempt 1,
zero credits for both jobs: scan `13:44:45.918Z`–`13:44:49.576Z`, analyze
`13:44:49.640Z`–`13:48:14.408Z`. The picker backfill's scan then succeeded
at attempt 1, zero credits, `13:48:14.457529Z`–`13:49:28.249798Z`; its
analysis succeeded at attempt 1, zero credits,
`13:49:28.299326Z`–`13:52:48.480490Z`. Both `last_error` values are null.
At `13:52:51.556Z`, both stored SHA columns equaled `80a99cb` (full SHA
above), and SQL `current` was true. A browser reload then showed
`구조 스캔 완료`, `분석 완료`, and `다시 스캔`. Home/header still both named
`2klips/arr-app`: completion and selection agreement passed, while the exact
canonical-name expectation did not.

## LostArk recovery and preserved history

Baseline repository: `01M2AQ7RC28P1TGDKPNHJT6M1Y`, GitHub ID `1197355582`.
Head: `484e6a0c4cd8c0258d7fb121c5d7dce759afaabc`.
Old run: `01M2AQ7SPPFGV0MTBXW6FJZ0WP`, created
`2026-09-12T11:49:56.051824Z`.

| old job | kind | status | attempts | credit_cost | completed_at (UTC) | preservation hash |
| --- | --- | --- | ---: | ---: | --- | --- |
| 01M2AQ7SPWPC95HYS67XEEX7PM | scan | failed | 3 | 0 | 2026-09-12T11:50:20.346993Z | 1f003e58f437b92176414b6bb8d81fe7 |
| 01M2AQ7SPYYYSA8XAA52S3358V | analyze | failed | 3 | 0 | 2026-09-12T11:50:20.648804Z | 4ec7476105ceaf2d4e5312af879fcd6b |

Hashes are `md5(row(status,attempt_count,last_error,completed_at)::text)`
from the read-only baseline; they allow exact comparison without retaining
additional error content. Old scan error: GitHub tree request 403 at the
head above. Old analyze error: `analyze ran before any artifact was stored
— the scan job for this run has not applied its plan`.

LostArk was reselected through the same picker at
`2026-09-12T13:53:34.572Z`. Both home and header switched to LostArk, and the
home showed scan running/analyze queued with the rescan control disabled.
The new pair was created at `2026-09-12T13:53:35.637180Z`:

- New run: `01M2AYA7D8NG6MBCK9BAW9W203`.
- Run trigger: `backfill:484e6a0c4cd8c0258d7fb121c5d7dce759afaabc:r1`.
- Scan job: `01M2AYA7DJ0RSA207321RP9S4K`.
- Scan key:
  `backfill:01M2AQ7RC28P1TGDKPNHJT6M1Y:484e6a0c4cd8c0258d7fb121c5d7dce759afaabc:r1`.
- Analyze job: `01M2AYA7DQZAHM4K48XZ7DS73F`.
- Analyze key:
  `backfill:01M2AQ7RC28P1TGDKPNHJT6M1Y:484e6a0c4cd8c0258d7fb121c5d7dce759afaabc:analyze:r1`.
- Both credit costs are zero. Scan was claimed at `13:53:36.303644Z` on
  attempt 1; analyze was initially queued on attempt 0.
- The `13:53:56.315Z` read-only snapshot reproduced both old preservation
  hashes exactly. Both historical failures remain failed, attempt 3, with
  their original errors and completion timestamps.

Final recovery snapshot: `2026-09-12T13:56:16.538Z`.

| kind | status | attempts | credit_cost | claimed UTC | completed UTC | duration | last_error |
| --- | --- | ---: | ---: | --- | --- | ---: | --- |
| scan | succeeded | 1 | 0 | 13:53:36.303644 | 13:54:01.837236 | 25.534 s | null |
| analyze | succeeded | 1 | 0 | 13:54:01.884926 | 13:54:19.851571 | 17.967 s | null |

LostArk's two SHA columns both equal
`484e6a0c4cd8c0258d7fb121c5d7dce759afaabc`, and SQL equality is **true**.
The final exact comparison of the old failed rows returned **true** again.
New permanent failures since migration: **0**.

After completion, an authenticated browser reload showed LostArk in both
home and header, `구조 스캔 완료`, `분석 완료`, and an enabled `다시 스캔`
button. The graph summary displayed 2,059 nodes and 10,252 edges (workspace
totals). LostArk remains the last selected repository at the end of this
verification.

The home retry button's presence was observed before selection; recovery was
submitted through the picker route, one of the two authorized alternatives.
No second manual recovery or `:r2` request was made. A repeated live-pair
click was not exercised in production; the local regression suite covers it.

## Health, limits, and follow-up

`pnpm --silent ops:health` ran inside `/app/pr10-rollout` on the unchanged
v18 worker at approximately `2026-09-12T13:56:20Z`:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 116 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 14 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.2h old (warn above 24h).
status: warn
```

Exit code 1 is expected for the unchanged 14-failure warning. All other
signals are OK and the queue is empty. The final Fly status/release check
still showed v18 created `12:48:41Z`, the original image, and the original
active-machine update time `12:48:54Z`.

No classified 403/429 failed attempt was observed in the inspected v18 log
windows through `13:55:33Z`; all verification pairs succeeded on their first
attempt and their final errors are null. The primary-vs-secondary question
and production queue-deferral observation remain **open**. Do not infer
inline pauses from duration alone.

Claude follow-up: the picker uses `github_available_repositories.full_name`
without refreshing renamed repository metadata, and the connect selection
upserts that stale name into `repositories`. Reproduce with a stable GitHub
ID and differing cached/canonical names; preserve identity and refresh the
canonical name through the supported application path. The picker also still
says `첫 레포를 선택하세요` during reselection; record that wording as context,
not as a reason to expand this metadata fix. No pacer/concurrency change is
supported by this run's evidence.

Acceptance: rollout, current-repository agreement, completed-stage/rescan UI,
LostArk `:r1` recovery, zero credits, SHA equality, preserved failed history,
and health baseline all passed. Exact `2klips/alrescha-app` naming did **not**
pass because of stale picker metadata. Full canonical-name acceptance is
not claimed; the application-code follow-up remains with Claude.

No failed-job deletion, cancellation, status change, `available_at` edit,
timestamp manipulation, threshold/window change, worker deployment/restart,
or application-code change was performed by this rollout.
