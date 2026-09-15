# PR #19–#22 production verification — 2026-09-15

Status: **Web and worker deployed; one rescan succeeded. Progress, dismissal, and file cards passed. Doc pages and CI verified grades failed production acceptance.**

Start: `cfa8a5c`. Merged main: `e53b36b3b34333b904607d6b4e562e7804e1cfee`. Full deployment, job, CI, and health details are in [the rollout record](../../../.omo/evidence/phase4/pr19-22-production-rollout-2026-09-15.md).

| Surface | Result | Observation |
| --- | --- | --- |
| `/app/progress` | PASS | Three digest windows; first visit says `이 화면을 연 기록이 없습니다.`; subsequent visit says `변화 없음`. Attention section present. |
| `/app/inspection` | PASS | Reason field and exclusion action; confirmed path-shorthand false positive `01M2G6PZG78508GJVWD911SSQY` dismissed through the product. Success URL/banner and excluded board reason verified; open form removed. |
| `/app/map` file card | PASS | `apps/worker/src/analysis-job.ts`: code metadata/lib/backend, no-summary sentence, 15 exports (12 shown), explicit no-module state. |
| `/app/docs` list/detail | BLOCKED | `docskeleton` failed at attempt 3 on `doc_pages_workspace_repository_slug_unique`; the page shows `아직 문서 페이지가 없습니다`. Cannot verify populated rows, members, exports, relations, or page badges. |
| `/app/map` CI grades | FAIL | Main CI attempt 2 passed all 1,875 tests; one operator rescan succeeded at attempt 1/cost 0. ZIP download HTTP 415 leaves 0 evidence rows; `analysis-job.test.ts` stays inferred. |

Vercel final main deployment is Ready; Fly v21 contains the updated worker. Local lint/typecheck/Vitest passed (203 files, 1,874 passed / 1 skipped). Published benchmark report audit passed without running benchmarks.

The final health probe has queue 0, analyze failures unchanged at 5, and docskeleton failures increased 0 → 1; the seven-day warning is 16 instead of the baseline 15. [Screenshot](../../../.omo/evidence/phase4/todo-18/2026-09-15-production-ci-inferred.png) and [safe worker lines](../../../.omo/evidence/phase4/todo-18/2026-09-15-production-worker.log) preserve the failed live observation. Evidence-note and BUILD_PLAN checkbox updates are handed back to Claude; no success checkbox was added.

The dismissal is an intentional persisted product action: `scripts/verify-benchmark-report.ts` exists and its report audit passed, while the finding interpreted a filename abbreviation in `spec/BUILD_PLAN_PHASE4.md` as a missing `spec/`-relative path. Web rollback will not undo it.

No app source, theme, layout setting, pin, environment variable, migration, or manual database value was changed. User files under `.claude/launch.json` and `docs/brand/` were preserved. Claude Code receives the slug-collision failure and the todo-18 observation; this task does not begin todo 26 or any deferred OQ/G3 work.
