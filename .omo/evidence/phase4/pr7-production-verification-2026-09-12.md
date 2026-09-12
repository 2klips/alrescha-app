# PR #7 production verification — rejected jobs in permanent failures

Date: 2026-09-12 UTC
PR: <https://github.com/2klips/alrescha-app/pull/7>
Merge commit: `1eb4de74514fe5e8c9c0ac0241edf395f8dce6da`

## Merge and deployment confirmation

- The previously local PR #6 rollout record commit, `ab6ef49`, was pushed to
  `origin/main` before this merge.
- PR #7 was `MERGEABLE` with merge state `CLEAN` and a successful Vercel
  preview, then merged at `2026-09-12T10:48:05Z`.
- Vercel reported production status `success` for merge commit `1eb4de7` at
  `2026-09-12T10:48:28Z`. The merged change affects only the health-check
  script, tests, and documentation; no web runtime rollout action was needed.
- No database migration was applied and no worker deployment was performed.
  The active Fly worker remains v16, image
  `arr-worker:deployment-01M2AJB8XZQH13QKQWZ2XA483W`.

## Production `ops:health`

Executed the PR #7 version of `scripts/ops-health.ts` at
`2026-09-12T10:48:46.025Z` inside the Fly worker using its existing production
`DATABASE_URL`. The connection value, secrets, payloads, prompts, and error
text were not printed or recorded.

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 91 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 7 job(s) queued or running (warn above 25).
WARN  permanent-failures — 6 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.0h old (warn above 24h).
status: warn
```

The count is exactly the 6 known null-SHA scan failures, so PR #7 exposed 0
additional rejected jobs in the current seven-day window. Because the result
was not greater than 6, no `kind` or `last_error` inspection was needed. The
warning is expected while the six historical rows remain inside the window;
the threshold of 5 and window of 7 days were not changed.

## Local release gates

Run on `main@1eb4de7` after the production check:

- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed across the root and all workspace projects.
- Prettier check over every PR #7 file plus this rollout record: passed.
- `pnpm test`: 181 files passed; 1,643 tests passed, 1 pre-existing platform
  test skipped.
- `git diff --check`: passed.

The repository-wide `pnpm format:check` also traverses user-owned, untracked
`.claude/worktrees/*` checkouts and reported their pre-existing format
differences. Those worktrees were not modified; the scoped check above covers
the merged PR and this record.
