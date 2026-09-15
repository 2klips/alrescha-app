# PR #19–#22 production rollout — 2026-09-15

Status: **Deployed; the single authorized rescan succeeded. Production acceptance is BLOCKED by docskeleton slug collisions and CI artifact ZIP HTTP 415. No application code was changed.**

Codex deployment lane. The user's 2026-09-15 instruction lifted the earlier hold and authorized sequential merge commits, worker deployment, one pilot rescan, and one suitable finding dismissal through the product. No application code, migration, environment variable, or manual production SQL mutation is part of this rollout.

## Merge and deployment

| PR | Merge commit | Merged at (UTC) |
| --- | --- | --- |
| #19 | `62c92e8834105070c7319929fb375854bb9b6c36` | 2026-09-15T13:36:11Z |
| #20 | `bc6b5eaa30299197a08dd64c1a13a4b1f1183659` | 2026-09-15T13:36:47Z |
| #21 | `b650670d6bbf6d969a40328c44429e44a04e8408` | 2026-09-15T13:37:29Z |
| #22 | `e53b36b3b34333b904607d6b4e562e7804e1cfee` | 2026-09-15T13:37:46Z |

- Preserved all commits; no squash or branch deletion. After each predecessor merged, the next PR still targeted the predecessor branch. Retargeted #20, #21, and #22 to `main`, confirmed mergeability and checks, then merged in order with the observed head pinned.
- #22 final head `cfa8a5c9855356793183c3cf8f58dc7356990809` had both `gate` checks successful before merging (runs `34968308808` and `34968303390`).
- Root checkout fast-forwarded to `main` / `origin/main` at `e53b36b`; `git diff --exit-code cfa8a5c HEAD` confirmed identical trees before the Fly build. Only the protected user files were untracked.
- [Final Vercel deployment](https://vercel.com/2klips-projects/arr-app-web/A5SNKUkBKmgSGrgT17E9nkKu6ZdS): **Ready**, production. Created 2026-09-15T13:37:51Z; GitHub Vercel success timestamp 2026-09-15T13:38:18Z.
- Deployment URL: `https://arr-app-i6hcy1iqv-2klips-projects.vercel.app`; production alias: `https://arr-app-web.vercel.app`.
- `flyctl deploy` ran from the updated repository root and exited 0. Fly **v21**, image `arr-worker:deployment-01M2JMM7W0NFXSA847G1YBNR21`. Active machine `48e7e62f574d58` started at 2026-09-15T13:39:48Z; standby `48ed969dc49238` stopped at 13:39:43Z. Both nrt. No HTTP service is expected.
- Previous worker: v20, `arr-worker:deployment-01M2D9ZJRM2J4J61QMTZ4EGTT6`.

## Completed zero-credit checks

- `/app/progress`: all three digest windows and attention section present. First visit displayed `이 화면을 연 기록이 없습니다.`; subsequent visit displayed `변화 없음` in the third window (a recorded visit with zero subsequent changes).
- `/app/inspection`: reason input and exclusion button present. Excluded finding `01M2G6PZG78508GJVWD911SSQY` through its product form. This reported the nonexistent `spec/verify-benchmark-report.ts`, whereas the abbreviated script name in `spec/BUILD_PLAN_PHASE4.md` refers to the existing `scripts/verify-benchmark-report.ts`, whose published-report audit passed during this rollout.
- Dismissal reason: `파일은 scripts/verify-benchmark-report.ts에 존재하며 2026-09-15 게시 리포트 감사 PASS를 확인했습니다. BUILD_PLAN_PHASE4의 파일명 축약을 spec/ 상대 경로로 해석한 오탐이므로 제외합니다.`
- Observed `/app/inspection?dismiss=done`, the success banner, and the excluded board containing that reason; the finding's open dismissal form disappeared. This intentional state change persists through a web rollback. No AI judgment button was used.
- `/app/map`: selected `apps/worker/src/analysis-job.ts` after narrowing with search. File card showed `code_metadata / lib / backend`, `요약 없음 — 아직 설명이 생성되지 않았습니다.`, 15 exports (12 displayed, including `createAnalysisJobHandler`), and `모듈 없음 — import·호출 군집에 속하지 않습니다.`. Node was `inferred`.
- Read-only manifest check: v3 loader digest `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`; v4 `4baeed030abf564e7e3b162dac99eefc6b53c8656d471cf304efb5e4f3d08899`.

```text
PASS efficacy benchmark: 600/600 trials, 8.6906pp accuracy, 67.390662% token reduction, 284 claim files
PASS graph-surface benchmark: v1 96/96 (0 failed, NOT MET), v2 96/96 (0 failed, NOT MET), v3 96/96 (0 failed, NOT MET), v3-relational 32/32 (0 failed, NOT MET)
```

Only the existing reports were audited; no benchmark was executed. Local gates on merged main: lint and typecheck clean; Vitest **203 files passed, 1,874 passed / 1 skipped**, duration 122.45s. The Linux main CI run is recorded separately below.

## Baseline

At 2026-09-15T13:38:12.605Z, all-time failed jobs by kind were analyze **5**, coach **1**, enrich **1**, scan **9**, docskeleton **0**. Health's seven-day window contained **15** permanent failures (the all-time total is 16).

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 221 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 1 job(s) queued or running (warn above 25).
WARN  permanent-failures — 15 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.0h old (warn above 24h).
status: warn
```

All four merge-push scan/analyze pairs succeeded at attempt 1, cost 0, before the new worker started. At 13:44:28.237Z the pilot had 0 docskeleton jobs, 0 doc pages, and 0 CI evidence rows. No extra scan was triggered for this baseline.

## Final-main CI and one rescan

Main CI run: [34976234807](https://github.com/2klips/alrescha-app/actions/runs/34976234807), head `e53b36b3b34333b904607d6b4e562e7804e1cfee`.

Attempt 1 failed at the unit-test step: `tests/scanner-extensions.test.ts` → `rationale nodes and handoff todos reach the database and dashboard > persists rationale as a first-class node with a provenance edge, and handoff todos flow to the progress board` exceeded its existing **5,000 ms** timeout (JUnit duration 5.091833642s). The other 202 test files passed. The failure artifact was uploaded (74,052 bytes). No test, timeout, or application code was changed. Codex requested one rerun of the failed CI job after observing successful pre-merge CI and successful local gates on the same tree. The first failure is retained here; the rescan was not triggered while CI was failed.

Attempt **2 succeeded**, updated **2026-09-15T13:53:13Z**: **203 files / 1,875 tests passed**, Vitest duration **302.64s**. Its `vitest-junit` artifact was created at 13:53:07Z, **73,695 bytes**. The first failed report remains alongside it; neither artifact was deleted. This history must be considered when assessing evidence across reruns; no grading policy was changed during deployment.

After CI success, the worker was already v21 and both repository SHA columns equalled final main. Codex clicked the pilot home **다시 스캔 exactly once**, receiving `/app?rescan=scheduled&mode=incremental` and the scheduling notice. Request/job creation time: **2026-09-15T13:54:26.772Z** (22:54:26.772 KST).

Run `01M2JNHYB9N0QPWRTSNDWDDFF3`, commit `e53b36b3b34333b904607d6b4e562e7804e1cfee`:

| Kind | Job ID | Status | Attempt | Credit cost | Completed (UTC) |
| --- | --- | --- | --- | --- | --- |
| scan | `01M2JNHYBESDVX4QVDJX12Z25M` | succeeded | 1 | 0 | 13:54:39.669Z |
| analyze | `01M2JNHYBMK8EMD3JYRPKRCHKH` | succeeded | 1 | 0 | 13:55:19.013Z |

Both have `last_error = null`. Separate automatic workflow/check pairs at 13:53:15–16Z are not additional operator rescans. The per-repository/commit docskeleton idempotency key returned the existing failed job; no new docskeleton success occurred and no manual retry was attempted.

Final read-only repository check at **2026-09-15T14:00:34.261Z**: both `last_scanned_commit_sha` and `last_analyzed_commit_sha` equal `e53b36b3b34333b904607d6b4e562e7804e1cfee`; doc pages **0**, evidence rows **0**.

```text
2026-09-15T13:54:39.653970394Z   scan @e53b36b incremental → 0 rows
2026-09-15T13:54:41.658878954Z   analyze @e53b36b 337 bodies (archive: 1,319 files, 22,703 KiB)
```

The new worker's observed log window contains **0** `ci evidence` lines. Stored evidence remained **0**. The test node `apps/worker/src/analysis-job.test.ts` is **inferred**, not the expected verified; the implementation-file sample `apps/worker/src/analysis-job.ts` is inferred. No source file was promoted by CI evidence, since no such evidence was stored. The requested positive CI-grade acceptance therefore **failed**, even though the jobs and GitHub CI succeeded.

- [Single production screenshot](todo-18/2026-09-15-production-ci-inferred.png): final main, selected test file, inferred badge.
- [Whitelisted worker log lines](todo-18/2026-09-15-production-worker.log): 13 archive/scan/failure lines, with no credentials, bodies, payloads, or delivery IDs. There is no successful `ci evidence` line to quote.

### Production blocker — CI artifact download HTTP 415

A read-only diagnostic used the deployed `GitHubCiEvidenceSource` with the worker's normal repository-scoped installation authentication. Only endpoint classes and HTTP statuses were emitted; credentials and response/report bodies stayed in process memory.

| Request | Deployed collector | Diagnostic Accept variant |
| --- | --- | --- |
| Artifact list | 200 | 200 |
| Check runs | 200 | 200 |
| Artifact ZIP | **415** | **200** for both artifacts |

The deployed `downloadReports` passes `Accept: application/octet-stream`; its exact error is `GitHub CI evidence request failed: 415`. `collectedCiEvidence` catches collection errors and returns empty evidence, allowing analyze to succeed silently. A separate read-only comparison request changed only the ZIP request Accept header to `application/vnd.github+json`: the collector returned **1 check / 2 reports / 0 coverage reports**. This was an operations diagnostic, not an application patch, enqueue, rescan, deployment, or database write. The deployed worker still has the original behavior. Claude should fix and regression-test the download boundary and preserve honest handling of unavailable evidence.

## Final health and handoff

Final `pnpm --silent ops:health`, run inside v21 at approximately **2026-09-15T13:56:35Z**, using the unchanged checked-in health script staged with installed worker dependencies:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 228 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 16 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.1h old (warn above 24h).
status: warn
```

Read-only failure counts at **13:58:09.276Z**: analyze **5 unchanged**, scan **9 unchanged**, coach 1, enrich 1, docskeleton **0 → 1**. Queue 0. The warning increased **15 → 16** because of this docskeleton failure; the no-new-failure acceptance criterion did **not** pass.

Todo-18 evidence-note and BUILD_PLAN checkbox updates belong to Claude Code, using the saved failed live observation; do not mark them fully verified. Follow-up is limited to the two production blockers above, plus noting the existing CI timeout and two-artifact rerun history. Todo 26 is only a future candidate. G3/docpage, MCP doc tools/todo-22 budget, feature producer, far labels, OQ-026/071/072 decisions, and OQ-066/067/068 stay outside this rollout.

### Production blocker — docskeleton slug collision

The automatic workflow/check processing after the first main CI attempt enqueued `docskeleton` job `01M2JN34NV8ZWMFJN2XQFPNHHX` at **2026-09-15T13:46:21.692Z**. It failed permanently at **13:47:12.019Z**, attempt **3**, credit cost **0**:

```text
duplicate key value violates unique constraint "doc_pages_workspace_repository_slug_unique"
```

Read-only reproduction used the deployed `PostgresDocSkeletonStore.loadSkeletonRows`, the pure `buildDocSkeletonPages`, and `public.doc_page_slug` inside a `read only` transaction. It did not call the apply/enqueue functions. Production metadata produces **173** pages (repo 1, module 21, directory 151) and one duplicate slug group:

| Scope | Identity / title | Members | Slug |
| --- | --- | --- | --- |
| module | `module:scripts/adr-guardrails.ts` / `scripts/adr-guardrails.ts` | 6 | `100afb351208ff049ba0e7a569e9901d` |
| module | `module:scripts/verify-plan-coverage.ts` / `scripts/verify-plan-coverage.ts` | 3 | `100afb351208ff049ba0e7a569e9901d` |

The installed slug function hashes scope plus distinct member directories for module/repo/feature pages, while the row identity also distinguishes module keys. Separate modules can therefore collide at the unique slug constraint. No applied migration, data, failed job, retry timestamp, or implementation was modified. `/app/docs` displays `아직 문서 페이지가 없습니다`; the requested populated list/detail checks cannot pass in this state. Claude must receive this concrete failure before this rollout can be called fully verified. Existing failed rows must remain intact.

Preserve `.claude/launch.json` and all existing untracked `docs/brand/` user work; do not modify, delete, or commit them. No enrich, docpage, benchmark run, MCP token issuance, manual DB write, failed-job change, or threshold/concurrency/cap change was performed. Documentation and the two observation assets are preserved locally without an extra push, PR, or deployment.
