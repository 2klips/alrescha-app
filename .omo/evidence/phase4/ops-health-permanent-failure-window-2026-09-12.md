# `ops:health` `permanent-failures` — a rolling window, so the check recovers on its own

**Date:** 2026-09-12 · **Trigger:** the null-sha investigation
(`.omo/evidence/phase4/null-sha-scan-requests-2026-09-12.md`, commit
`9a4af68` on `claude/suspicious-goodall-734e3e`) fixed the cause of six
permanently failed scan jobs (2026-09-09 → 12) and left one observation
open: the `permanent-failures` check counted every failure ever recorded, so
production stayed at `warn` (7 > 5) until the rows were set to `cancelled`
by hand. **Boundary:** production was neither read nor touched; everything
here is code, the PGlite-migrated schema and tests. **Scope:**
`scripts/ops-health.ts`, `tests/ops-health.test.ts`,
`docs/DEPLOYMENT_RUNBOOK.md` §10.1. The threshold
`permanentFailureWarn: 5` is unchanged; no migration, no worker or web code.

## What changed

The `permanently_failed_jobs` sub-query of `OPS_HEALTH_SNAPSHOT_QUERY` was

```sql
select count(*)::int from public.jobs
where status = 'failed' and attempt_count >= max_attempts
```

and is now

```sql
select count(*)::int from public.jobs
where status = 'failed'
  and attempt_count >= max_attempts
  and (
    completed_at is null
    or completed_at >= now() - make_interval(days => 7)
  )
```

with `7` spliced from the new module constant
`PERMANENT_FAILURE_WINDOW_DAYS`. The snapshot is still one statement — a
single consistent read — and still a plain string the test runs against the
real migrated schema; the only interpolation is that compile-time constant.
The check's `detail` line now says what it counted:
`N job(s) failed permanently in the last 7 days (warn above 5; older
failures no longer count).`

Once a root cause is fixed and no new failure lands, the count falls as each
row's `completed_at` leaves the window and the check returns to `ok` by
itself. Withdrawing a row as `cancelled` still clears it at once (the status
filter is unchanged), so the immediate route in the null-sha hand-off keeps
working — it is just no longer the only route.

## Why `completed_at`

It is the failure time, and every terminal path stamps it, so the window
measures what it claims to:

| path                                        | where                                                   | stamps                |
| ------------------------------------------- | ------------------------------------------------------- | --------------------- |
| `finish_job`, attempts exhausted            | `supabase/migrations/202608170001_run_lifecycle.sql:185` | `completed_at = now()` |
| `reject_job` (schema-invalid AI output, credits unavailable) | `…202608170001_run_lifecycle.sql:214`          | `completed_at = now()` |
| `reap_stale_jobs`, attempts exhausted       | `…202608170001_run_lifecycle.sql:250–251`                | `completed_at = now()` |
| `cancel_job` / installation revocation      | `…202608170001_run_lifecycle.sql:275`, `…202608100009_release_hardening.sql:214` | `completed_at` too (excluded by status anyway) |
| `requeue_enrich_job_if_terminal`            | `…202608240003_module_summaries.sql:160–161`             | resets `completed_at = null` together with `status = 'queued'` |

No queue function produces `status = 'failed'` with a null `completed_at`.
The query still counts such a row, and counts it regardless of age: a
failure with no completion time is itself an anomaly (a hand edit, or a
future path that forgot the stamp), and a health probe should keep it
visible rather than let it age out silently. This is the one place the
change is deliberately more conservative than "only failures inside the
window".

`created_at` was rejected as the anchor because a job can sit queued and
retry for a while before it fails for good; `cancelled_at` only covers
withdrawals.

## Why seven days — an assumption, stated

Seven days is not a measurement of failure cadence; the only cluster on
record is the six null-sha scans over four days. The reasons for the value:

- The runbook runs `pnpm ops:health` once a day plus after each deploy
  (§10.1), so a burst stays visible across a full week of daily readings; a
  missed day or a weekend does not lose it.
- It equals the GitHub App's *Recent Deliveries* retention (§10.2), which is
  the log-side record an investigation of a failed scan needs — while the
  check still shows the failure, the corroborating deliveries are still
  there.
- Shorter windows would let a systematic failure that only fires a few
  times a week slip under the threshold; longer ones defer recovery for
  little gain at pilot scale.

The window is a module constant rather than a member of
`OpsHealthThresholds`: the query is one fixed statement, and a threshold the
evaluator could be handed independently of the query would let the detail
line report a window the snapshot was not read with.

### What production should read after this lands (inferred, not observed)

From the null-sha evidence: the 2026-09-02 coaching failure is already
outside a seven-day window on 2026-09-12, so the count becomes 6 (the
null-sha scans, `completed_at` 2026-09-09 → 12) — still `warn`. It returns
to `ok` when the oldest of the six is more than seven days old (on or
about 2026-09-16 if that one failed on 09-09; exact timestamps were not
read) and reaches 0 by about 2026-09-19. Running the withdrawal SQL from the
null-sha hand-off brings it to `ok` immediately instead. Either way the
threshold stays 5.

## Tests

`tests/ops-health.test.ts` runs the real query against the PGlite-migrated
schema. Added:

- **forgets a permanent failure once it leaves the window and keeps a recent
  one** — inserts three `failed` / `attempt_count = max_attempts` analyze
  jobs: one completed `PERMANENT_FAILURE_WINDOW_DAYS + 1` days ago, one
  `PERMANENT_FAILURE_WINDOW_DAYS − 1` days ago, one with no `completed_at`.
  Expects `permanentlyFailedJobs = 2` (aged-out excluded; recent and
  unstamped counted), `permanent-failures` at `ok`, `queueDepth` and
  `scanJobs` untouched, and the count dropping to 1 after the recent row is
  withdrawn as `cancelled`. `analyze` is used so the scan audit trigger and
  the scan counter stay out of it.
- **tells the operator which window the permanent-failure count covers** —
  the detail line names `in the last 7 days` and `warn above 5`.
- the warn-boundary test now also asserts `permanentFailureWarn` exactly
  (5) is `ok`, mirroring the existing queue-depth boundary assertion.

The window test fails against the previous query — verified by swapping the
old sub-query back in and re-running: `AssertionError: expected 3 to be 2`,
then restored. `pnpm vitest run tests/ops-health.test.ts`: 13 passed (was
11). `pnpm lint`, `pnpm typecheck`, `pnpm test`: green — 179 files, 1630
passed, 1 pre-existing platform skip.

## Hand-off (Codex) and merge note

- Nothing to deploy: `pnpm ops:health` runs from a checkout with the
  worker's `DATABASE_URL`; the next run from a checkout containing this
  commit reads the window. No migration, no `arr-worker` or `arr-app-web`
  change.
- The null-sha hand-off's step 3 (withdraw the six scans) becomes optional
  for the warning; run it if the rows should be marked as withdrawn for the
  record, not because the check needs it.
- `claude/suspicious-goodall-734e3e` (`9a4af68`) is merged into this branch
  (`a0dbee5`), so both land in one PR. Its runbook paragraph under §10.1
  (`permanent-failures`는 전 기간 누적이다 …) was dropped in favour of this
  branch's, with its pointer to the null-sha evidence carried over; its
  "never decays" observation and hand-off step 3 are marked resolved /
  optional in that evidence. The PR therefore also carries migration
  `202609120001_null_sha_scan_guard.sql` and the worker guards — the
  null-sha hand-off (apply the migration, redeploy `arr-worker`) still stands.

## Observations left as they are

- `reject_job` marks a job `failed` at whatever attempt it was on
  (`claim_job` increments `attempt_count` on claim, so typically 1 of 3),
  which `attempt_count >= max_attempts` does not count as permanent even
  though rejection is terminal. Pre-existing and unchanged here; read from
  code, not checked against production rows.
- The check still counts every kind together. Splitting the detail by
  `kind` would say *which* producer is failing, which is the question the
  warning raises; not done, the threshold rationale is per-total.
