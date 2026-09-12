# PR #10 production verification

Date: 2026-09-12. Agent: Codex. Deployed commit: `80a99cb`.

Applied migration `202609120004` before merging PR #10 and verifying its
automatic Vercel deployment. The Fly v18 worker was left unchanged.

Authenticated browser verification observed the new multi-repository link
and first-scan retry button. Picker selections changed home and header
together. Both selected repositories reached completed scan/analyze stages
with an enabled rescan button. LostArk recovered through a new `:r1` run;
both jobs succeeded on attempt 1 for zero credits, matching repository SHAs.
Historical failed rows remained unchanged; no permanent failures were added.

One follow-up remains: the available-repository inventory retains the old
`2klips/arr-app` name for the same GitHub ID as `2klips/alrescha-app`. Selecting
it copies that stale name back into the connected repository row. Canonical
name acceptance therefore remains open for Claude; no manual metadata repair
or application-code change was made during deployment.

Lint/typecheck passed; 186 test files, 1,706 tests passed, 1 skipped. Production
`/` returned 200 and MCP GET returned 405. Final health was OK except the
unchanged 14 historical permanent failures; queue depth was zero. No new
classified 403/429 failure or queue deferral was observed.

Full timestamps, job keys, preservation comparison, and health output:
[production evidence](../../../.omo/evidence/phase4/pr10-production-rollout-2026-09-12.md).
