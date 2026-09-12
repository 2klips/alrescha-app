# PR #12 production verification

Codex rollout of `c38dc08`, 2026-09-12 UTC (completed September 13 KST).

Merged all three PR commits and deployed Fly v19, image
`arr-worker:deployment-01M2B1YPCEH0EJFJSXJG84Y7EF`. Vercel auto deployment
succeeded, `/` 200 and MCP GET 405. No migration or application code edit.

The actual merge push created a run and both jobs succeeded, closing PR #11's
deferred real-push webhook acceptance. Waited for the inherited queue to drain.

One home `다시 스캔` click produced an **incremental** pair, contrary to the
handoff's full-scan assumption. Both jobs succeeded at attempt 1, zero credits;
analysis used the archive. The home form has no explicit full mode. To verify
the required full path without code/DB changes, re-selected the same canonical
repository once through the existing picker/backfill path.

That full backfill used `archive: 1,221 files, 21,686 KiB` in both scan and
analysis (`316 bodies`). Both succeeded at attempt 1, zero credits, null
errors; both repository SHAs equal `c38dc08`. Final home/header show the
canonical name, completed stages, and enabled rescan button. Counter change
around the full window was 4,966 → 4,963, same reset timestamp. Worker RSS fell
from a 352,516 KiB high-water mark to 253,912 KiB after the pass. No archive
fallback or primary-limit deferral was observed.

Final health: queue 0, new terminal failures 0, historical failures 14 WARN,
other checks OK. Lint/typecheck PASS; 189 test files, 1,738 tests passed, one
skipped. No corrective worker implementation is needed. The handoff procedure
was corrected; OQ-066/OQ-067 remain optional follow-ups.

Full keys, times, raw safe archive lines, budget-measurement limitations,
memory observations, and health:
[production evidence](../../../.omo/evidence/phase4/pr12-production-rollout-2026-09-12.md).
