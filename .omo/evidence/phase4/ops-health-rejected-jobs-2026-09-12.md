# `ops:health` `permanent-failures` — a rejected job is a permanent failure too

**Date:** 2026-09-12 · **Trigger:** the follow-up recorded in
`.omo/evidence/phase4/ops-health-permanent-failure-window-2026-09-12.md` and
`.omo/evidence/phase4/pr6-production-rollout-2026-09-12.md` ("Known unchanged
gap"): `reject_job` ends a job as `failed` at whatever attempt the worker gave
up on — typically 1 of 3 — so the check's `attempt_count >= max_attempts`
clause never counted it. **Boundary:** production was neither read nor
touched; the diagnosis is from the migrations, the worker, their tests and
the PGlite-migrated schema. **Scope:** `scripts/ops-health.ts`,
`tests/ops-health.test.ts`, `docs/DEPLOYMENT_RUNBOOK.md` §10.1.
`permanentFailureWarn: 5` and `PERMANENT_FAILURE_WINDOW_DAYS: 7` are
unchanged; no migration, no worker or web code.

## Diagnosis first: what `failed` means in this queue

The question was whether the attempts clause encoded an intent (count only
exhausted retries) or was a restatement that happened to exclude a path. The
queue answers it:

| writer                            | where                                                       | when it writes `status = 'failed'`                      | `attempt_count` at that moment |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `finish_job(…, succeeded = false)` | `supabase/migrations/202608170001_run_lifecycle.sql:174–190` | only when `attempt_count >= max_attempts`; otherwise back to `queued` with backoff | `= max_attempts`               |
| `reap_stale_jobs`                 | `…202608170001_run_lifecycle.sql:249–256`                    | only when attempts are exhausted; otherwise back to `queued` | `= max_attempts`               |
| `reject_job`                      | `…202608170001_run_lifecycle.sql:195–220` ("terminal by definition") | at any attempt; refunds the reservation                 | whatever `claim_next_job` set — **1 of 3** on a first attempt |

Nothing else writes `failed`. A retry never passes through it — both retry
branches write `queued`, and `claim_next_job` only claims `queued` rows with
`attempt_count < max_attempts`. `requeue_enrich_job_if_terminal`
(`…202608240003_module_summaries.sql:151–172`) takes a `failed` enrich job
back to `queued` with `attempt_count = 0` and `completed_at = null`, so a
requeued row stops being `failed` before it stops counting.

The queue's own consumers already treat `failed` as terminal without an
attempts qualifier:

- `settle_run_after_job` (`…202608170001_run_lifecycle.sql:39–85`): any
  `failed` job fails the run — pinned by `tests/run-lifecycle.test.ts:185`
  ("a rejected job settles the run as failed").
- `next_retry_idempotency_key` (`…202609020001_retry_after_terminal_failure.sql`):
  `failed` and `cancelled` are the terminal generations that mint a new key.
- `packages/core/src/runs/analysis-cards.ts:122–139`: a run with a `failed`
  or `cancelled` job is shown as failed.

So `attempt_count >= max_attempts` was a restatement of the two exhausted
paths that silently excluded the third. The intent of the check — the
threshold comment says "a provider or a job kind is failing systematically"
and `docs/DEPLOYMENT_CHECKLIST.md` names "provider failures/refunds" as the
signal to monitor — points the other way: `reject_job` *is* the refund path.
The worker (`apps/worker/src/worker.ts:69–83`) rejects for exactly two
reasons, both terminal and both refunded:

- schema-invalid AI output (`code: "schema_invalid"` from
  `JudgmentValidationError` / `CoachingValidationError`, matched by
  `isNonBillableAiError` in `packages/core/src/team/prompt-coach.ts:53`) —
  the canonical systematic provider failure;
- credits unavailable for a judgment (`CREDIT_UNAVAILABLE`) — a workspace
  condition rather than a provider fault, but still a terminal failure a
  human at pilot scale should see.

Neither one is more "occasional" than an exhausted retry; if anything a run
of schema-invalid outputs is the case the warning exists for.

## The change

`permanently_failed_jobs` drops the attempts clause and counts every
`status = 'failed'` row inside the seven-day `completed_at` window:

```sql
select count(*)::int from public.jobs
where status = 'failed'
  and (completed_at is null
       or completed_at >= now() - make_interval(days => 7))
```

The snapshot is still one statement; the window and the unstamped-row rule
from the previous change are untouched. The detail line now says what the
count covers: `N job(s) failed permanently in the last 7 days — attempts
exhausted or rejected (warn above 5; older failures no longer count).`

Considered and rejected: a separate `rejected-jobs` check. The threshold
rationale is per total ("more than a handful" of terminal failures), and
splitting the signal would let five rejections and five exhausted retries
in the same week read as two `ok`s.

## Tests

`tests/ops-health.test.ts`, against the real PGlite-migrated schema, adds
**counts a job the worker rejected on its first attempt**: a zero-credit
`judge` job goes through `enqueue_job` → `claim_next_job` (attempt 1 of 3)
→ `reject_job('schema-invalid output')`, the real lifecycle rather than a
hand-written row. It asserts the claim returned that job (the stale scan
lease reaped by `claim_next_job` is requeued with a one-second delay, so it
is not claimable), the outcome `failed`, the row at `attempt_count = 1`,
`max_attempts = 3`, `completed_at` stamped, and the snapshot count one
higher than before.

The test fails against the previous query — verified by restoring the
`attempt_count >= max_attempts` clause and re-running:
`AssertionError: expected 1 to be 2`, then restored. Every earlier
ops-health assertion still holds (14 tests, was 13). No test was weakened.

## What production may show (inferred, not observed)

Rejected jobs inside the current window would now count; whether any exist
is not known from here. The 2026-09-03 baseline of one permanent failure
was measured with the old clause, so it says nothing about rejections. If
the next `pnpm ops:health` from a checkout containing this change reads
higher than the six null-sha scans, the difference is rejections in the
window — read their `kind` and the first characters of `last_error`
(never a payload) to tell schema-invalid output from credit exhaustion.
The check going `warn` on that would be the check working, not a
regression.

## Hand-off (Codex) — nothing to deploy

`pnpm ops:health` runs from a checkout with the worker's `DATABASE_URL`; no
migration, no `arr-worker` or `arr-app-web` change. The next run from a
checkout containing this commit applies the new definition.

## Left as is

- The check counts every kind together; a per-kind breakdown in the detail
  line would say *which* producer is failing. Not done here — same
  reasoning as the previous change.
- Credits-unavailable rejections count alongside provider failures. If they
  ever dominate at pilot scale, a separate signal for "workspaces hitting
  the credit wall" is the right shape, not a narrower definition of
  failure.
