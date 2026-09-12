# PR #11 production verification

Date: 2026-09-12. Agent: Codex. Deployed commit: `0283dc0`.

Status: canonical-name and backfill acceptance complete; next-real-push
webhook acceptance deferred.

Merged PR #11 with all three commits preserved, and verified the automatic
Vercel production deployment: `/` 200, MCP GET 405. No migration, worker
deployment/restart, application code change, or manual repository metadata edit.

Authenticated pilot-owner verification opened the picker through the home's
`다른 레포 선택` link. One click on `2klips/arr-app` changed home and header to
`2klips/alrescha-app`; the returning picker also listed the canonical name.
Read-only checks confirmed the same name in both repository/inventory tables
and audit metadata `{"kept":false,"renamed":true,"metadataSource":"github"}`.
The audit table's timestamp column is `occurred_at`, not the `created_at` in the
handoff query.

The merge-head backfill pair costs zero credits. Production v18 classified
both initial attempts as `403 primary-rate-limit`, budget `0/5000 core`, and
deferred them to approximately `14:37:15Z`; the analysis job resumed naturally
at `14:37:15.890Z`. This production observation is separate from Claude's
earlier local live test with a 1,051-second deferral.

Both jobs succeeded on attempt 2 for zero credits: analysis at
`14:40:13.547371Z`, scan at `14:41:05.753632Z`. Final errors are null and both
repository SHAs equal the merge head. Final home/header show the canonical
name, completed scan and analysis stages, and an enabled `다시 스캔` button.
Health: queue zero, no new terminal failures, only the unchanged 14 historical
permanent failures WARN; other checks OK. Ledger and Fly v18 are unchanged.

Lint/typecheck passed; 188 test files and 1,720 tests passed, one skipped. The
merged tree equals the tested tip. Next-real-push webhook verification remains
deferred to the next ordinary push/PR merge; no event was manufactured.

Concurrent worker edits appeared during the wait and were preserved. They
are outside this rollout's implementation/test/deployment claims.

Full timestamps, keys, deployment link, and final outcome:
[production evidence](../../../.omo/evidence/phase4/pr11-production-rollout-2026-09-12.md).
