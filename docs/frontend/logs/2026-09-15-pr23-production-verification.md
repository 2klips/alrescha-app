# PR #23 production verification — 2026-09-15

Status: **PASS — document pages recovered and final-main CI evidence is visible on test nodes. Exactly one authorized rescan completed.**

Merged main `3866daa40ee9a6ad1ab72edcc799156b38092bb6`, Vercel production Ready, Fly v22. Full operations evidence: [PR #23 rollout](../../../.omo/evidence/phase4/pr23-production-rollout-2026-09-15.md).

| Check | Result | Observation |
| --- | --- | --- |
| Document list | PASS | 173 pages: repo 1, module 21, directory 151; every row says `산문 없음`, all prose states missing, no verified badges. |
| Document detail | PASS | `scripts/adr-guardrails.ts` has 6 members and 15 export names. Final-main view shows commit `3866daa` and references 65/calls 5/imports 5/tests 3. |
| Unknown document | PASS | `/app/docs/00000000000000000000000000000000` renders `404 · 알 수 없는 경로`. |
| Test-node grade | PASS | `apps/worker/src/analysis-job.test.ts`: `data-grade="verified"`, visible verified badge, header commit `3866daa`. |
| Source/lib grades | PASS | `apps/worker/src/analysis-job.ts` and `apps/web/lib/graph/engine.ts`: `data-grade="inferred"`. All 203 CI targets are test paths; no other targets. |

Read-only database verification at 2026-09-15T14:35:01.051Z confirmed all 173 pages reference the final merged commit and have no prose/verified grade. The previous slug collision is no longer reproduced. Historical failed jobs are preserved; the actual pre-rollout docskeleton failure count was 3, including two branch-head failures completed before this deployment began.

Main CI run 34981877954 succeeded at 14:37:39Z (203 files / 1,879 tests passed). The sole manual rescan was queued at 14:40:33.597Z; scan and analyze both succeeded on attempt 1, credit_cost 0, last_error null. At 14:41:28.728934836Z the worker logged `ci evidence 203 row(s), 203 supporting, 0 removed`. Both repository SHA columns match final main. Queue 0; no new failures after migration; historical analyze failed 5 and docskeleton failed 3 remain. ops:health has the existing 18-failure seven-day WARN and all other checks OK.

Screenshot: [verified test node](../../../.omo/evidence/phase4/todo-18/2026-09-15-pr23-production-ci-verified.png). Worker evidence: [safe log extract](../../../.omo/evidence/phase4/todo-18/2026-09-15-pr23-production-worker.log). The docskeleton uses the base key on the new SHA; the old failed SHA's `:r1` was checked read-only and was not enqueued.

Local lint/typecheck/Vitest passed (203 files, 1,878 passed / 1 skipped). No UI source, layout setting, pin, or environment variable was changed; the authorized migration was the only manual production SQL mutation. Todo evidence-note and BUILD_PLAN updates are reserved for Claude Code. Existing untracked `.claude/launch.json` and `docs/brand/` user files remain untouched.
