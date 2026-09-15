# PR #23 production rollout — 2026-09-15

Status: **Deployed and verified. Both production blockers are resolved; exactly one authorized rescan completed at zero credits.** Historical docskeleton failures are 3 (not the handoff's expected 1). The new main succeeded with a base key; same-head `:r1` execution was not forced or claimed.

Codex deployment lane. Scope: apply the one authorized migration, merge PR #23, deploy the current root main to Fly, run one pilot rescan after main CI completes, and verify documents/CI grades at zero credits. No application code edit or manual production SQL mutation.

## Migration and preserved history

- Preflight at **2026-09-15T14:26:41.297Z**: **66** applied migrations; latest `202609130001_access_events_channel_policy.sql`, applied 2026-09-13T13:23:55.536Z. All applied-file checksums matched the checked-out PR. The only pending file was `202609150001_doc_page_slug_identity.sql`.
- Production `doc_pages` count before applying: **0** (14:27:10.339Z), so its readdressing UPDATE affected no existing page.
- Ran the unchanged repository migrator via `pnpm --silent db:migrate` inside Fly using its existing DATABASE_URL, never exposing the value. Checked-in migration files and the migrator were staged separately from the running app.
- Output: `Applied: 202609150001_doc_page_slug_identity.sql`; exit **0**. Existing-ledger NOTICE codes 42P06/42P07 and nested-transaction WARNING codes 25001/25P01 were observed, as explained in the handoff. The new ledger timestamp is **2026-09-15T14:27:43.031Z**.
- Read-only postcheck: two module identities with the same member-directory set now produce distinct slugs; doc_pages remained 0 before automatic jobs ran.
- Preserved the exact existing record commit **`3ed4139321da5d51a0c32010dba40b20423d099e`**, pushing local main to origin before the PR merge. The user's handoff explicitly left push/merge ordering to Codex. No amended/rebased/recreated record commit.

## Merge and deployment

- [PR #23](https://github.com/2klips/alrescha-app/pull/23) final head **`5e6c8ea8834146acd36bebc1bdf3cbf5bab5ff84`** had both gate checks and Vercel successful before merge. The PR contained **4 commits**, including the final PR-link documentation commit.
- Merge commit **`3866daa40ee9a6ad1ab72edcc799156b38092bb6`**, merged **2026-09-15T14:28:26Z** (23:28:26 KST), merge-commit method.
- Root checkout switched to main and fast-forwarded to that exact commit; the preserved `3ed4139` is an ancestor. Only the protected user files were untracked before the build.
- [Vercel deployment](https://vercel.com/2klips-projects/arr-app-web/HKgmbX9hdMbwXyrk5WDZSxhSnPTZ): **Ready**, production; created 14:28:30Z, success timestamp **14:28:55Z**. URL `https://arr-app-m97nk7z3x-2klips-projects.vercel.app`; alias `https://arr-app-web.vercel.app`.
- `flyctl deploy` from root main exited **0**. Fly **v22**, image **`arr-worker:deployment-01M2JQGA7Q6YERECJP99WXSZQ2`**. Active machine `48e7e62f574d58` started **14:29:07Z**; standby `48ed969dc49238` stopped **14:29:02Z**, both nrt. Environment variables unchanged.
- Previous worker for rollback: v21 / `arr-worker:deployment-01M2JMM7W0NFXSA847G1YBNR21`. No rollback was performed.

## Important differences from the handoff's expected observations

The historical docskeleton failure count was already **3**, not 1, before this rollout began. All three remain failed, attempt 3, cost 0, with the same slug-constraint error:

| Job | Commit | Failed at (UTC) |
| --- | --- | --- |
| `01M2JN34NV8ZWMFJN2XQFPNHHX` | `e53b36b` | 13:47:12.019Z |
| `01M2JPPPKDHNS93SK0NMSY7J5M` | `b075e42` | 14:18:32.857Z |
| `01M2JPTBKVSG7Y4C7XRXR9SY2X` | `5e6c8ea` | 14:21:17.357Z |

The latter two were earlier worker failures on PR #23 branch heads, before Codex's migration at 14:27:43Z. They must not be erased or misreported as new failures from this deployment. At 14:32:37.839Z, all-time failed counts were analyze 5, scan 9, docskeleton 3, enrich 1, coach 1.

The final merged head has no prior failed docskeleton. Its first automatic skeleton therefore uses the **base key**, not `:r1`:

- Job **`01M2JQKMVH8WH82CD5ZQZXGN29`**, key `docskeleton:01M11QNPZ3CWTDF91B9A34F6VZ:3866daa40ee9a6ad1ab72edcc799156b38092bb6`, created **14:30:19.710Z**, **succeeded**, attempt **1**, cost **0**, completed **14:31:50.141Z**.
- The matching worker completion line at **14:31:50.204898948Z** is `  local-635-0 job → succeeded`. The worker logs generic successful outcomes; its kind/key are established by the read-only job row, not fabricated into a raw log line.
- A separate read-only `next_retry_idempotency_key` check for the old failed `e53b36b` returns its `:r1` key, while the succeeded final-main key remains unchanged. No old-head retry was enqueued just to create that suffix. Same-head retry execution is not claimed as an observed production event.

## UI checks before the authorized rescan

- `/app/docs`: **173** rows = repo **1**, module **21**, directory **151**. All `data-prose="missing"`, all display `산문 없음`, zero verified badges.
- Opened the formerly colliding `scripts/adr-guardrails.ts` module page: **6** members, **15** export names, no prose and no verified badge. The initial page reflected the earlier automatic `3ed4139` skeleton. Reopening the detail on final main showed **commit 3866daa**, with relations **references 65 / calls 5 / imports 5 / tests 3**. Read-only verification at 14:35:01.051Z confirmed all 173 pages reference final main, with no prose or verified grade.
- `/app/docs/00000000000000000000000000000000`: displayed **404 · 알 수 없는 경로** and the not-found page.

## Gates, rescan, CI evidence and final health

- Local merged-main gates: lint/typecheck clean; Vitest **203 files passed / 1,878 passed / 1 skipped**, duration **131.13s**. No test or timeout was edited by Codex.
- Final-main CI: [run 34981877954](https://github.com/2klips/alrescha-app/actions/runs/34981877954), commit `3866daa40ee9a6ad1ab72edcc799156b38092bb6`, **success**, attempt 1, completed **14:37:39Z**. CI Vitest: **203 files / 1,879 tests passed**, duration **393.05s**. One unexpired `vitest-junit` artifact, **74,131 bytes**, created **14:37:36Z**. No workflow rerun was requested.
- Automatic CI-triggered jobs were allowed to finish; their first successful collection line was at 14:38:44.983721194Z. They are separate from the operator's one rescan.
- Clicked the pilot home **다시 스캔 exactly once**, after CI completed. The product confirmed `/app?rescan=scheduled&mode=incremental` and `다시 스캔을 예약했습니다`. A navigation wait timed out after the click; inspecting the current URL and job rows confirmed success, so the action was not repeated.
- Run **`01M2JR6CABMQ2EMKQSFCSF953F`**, head `3866daa40ee9a6ad1ab72edcc799156b38092bb6`, created **2026-09-15T14:40:33.597Z** (23:40:33 KST):

| Kind | Job | Status | Attempt | Credit cost | Completed (UTC) | last_error |
| --- | --- | --- | --- | --- | --- | --- |
| scan | `01M2JR6CARPCK1DKQCEZ60TR47` | succeeded | 1 | 0 | 14:40:34.901Z | null |
| analyze | `01M2JR6CAVKWVPHZW3Z9TK5BAH` | succeeded | 1 | 0 | 14:41:37.199Z | null |

Safe raw log lines from this pass:

```text
2026-09-15T14:40:34.890821461Z   scan @3866daa incremental → 0 rows
2026-09-15T14:40:36.469898788Z   analyze @3866daa 337 bodies (archive: 1,325 files, 22,814 KiB)
2026-09-15T14:41:28.728934836Z   ci evidence 203 row(s), 203 supporting, 0 removed
```

- No `ci evidence collection failed`, parse-failure, or `403 primary-rate-limit` line appeared in the manual pass window (14:40:33.597Z–14:41:37.250Z). Earlier logs contain two parse warnings for the superseded **3ed4139** head; those are preserved in the log extract and are not the final-main result.
- The manual analyze reused the already-succeeded final-main docskeleton. Its base key remains the successful row recorded above; no extra skeleton was required for the same SHA.
- Read-only final check **14:45:33.291Z**: repository scan/analyze SHA columns both equal final main; doc_pages **173**; queued/running **0**; **0** jobs failed after migration time. Historical failed counts remain analyze **5**, docskeleton **3**, scan **9**, enrich **1**, coach **1**.
- CI evidence: **203 test/supports rows**, **203 distinct targets**. At 14:47:27.202Z, all 203 target paths matched a test-directory or `.test`/`.spec` filename pattern; **0** other targets. Artifact `classification` is a metadata category, so it was not used as a test-file classifier.
- `/app/map` on final main: `apps/worker/src/analysis-job.test.ts` has `data-grade="verified"` and a visible verified badge. `apps/worker/src/analysis-job.ts` and `apps/web/lib/graph/engine.ts` both have `data-grade="inferred"`. These are explicit UI samples; the database target check above establishes the CI evidence boundary across all 203 targets.
- Screenshot: [verified test node](todo-18/2026-09-15-pr23-production-ci-verified.png). Safe worker lines, including the timestamp-correlated docskeleton completion and final CI evidence: [log extract](todo-18/2026-09-15-pr23-production-worker.log).

Final unchanged `pnpm --silent ops:health` inside Fly (approximately 14:44Z; exit 1 means the existing WARN):

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 250 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 18 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.1h old (warn above 24h).
status: warn
```

The 7-day WARN count is 18; the all-time failed total is 19. Neither historical rows nor warning settings were changed. Both deployment blockers pass production verification, with the historical-count correction and unexecuted same-head retry distinction retained for Claude.

## Handoff and preservation

Todo-18/todo-20 evidence-note and BUILD_PLAN checkbox updates belong to Claude Code; this deployment record does not change them. No further implementation is required for these two blockers. G3/docpage, MCP document tools/todo-22 budget, feature producer, far labels, OQ-026/071/072 decisions and todo 26 remain outside scope. The new rollout records are committed locally only; pushing or opening another PR is left to the user/Codex decision.

Preserve `.claude/launch.json` and existing untracked `docs/brand/` user work without modifying, deleting, or committing it. No enrich/docpage/benchmark run, failed-job change, available_at change, applied-migration edit, credential/body/payload/delivery-ID recording, or configuration change was performed.
