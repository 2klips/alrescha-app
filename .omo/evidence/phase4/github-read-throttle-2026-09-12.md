# Queued GitHub reads under a rate limit — classify the 403, wait what it asks, defer the retry

**Date:** 2026-09-12 · **Trigger:** the open item in
`.omo/evidence/phase4/pr8-production-rollout-2026-09-12.md` — the production
backfill's scan and analyze both ended on repeated GitHub 403s, three
attempts each, while one fresh request to the same path answered 200.
**Boundary:** production was neither read nor changed; every statement below
comes from the code, its tests and the rollout record. **Branch:**
`claude/github-read-throttle` on `main@35c88d4`, commit `8ac512e`; **PR:**
<https://github.com/2klips/alrescha-app/pull/9>. **Scope:**
`apps/worker/src/{github-repository-source,worker,queue}.ts` (+ tests),
`supabase/migrations/202609120003_finish_job_retry_delay.sql` (new),
`tests/{finish-job-retry-delay,github-read-throttle}.test.ts` (new),
`tests/helpers/database.ts`, `docs/DEPLOYMENT_RUNBOOK.md` §10.1. No
environment variable, no web code, no change to `permanentFailureWarn` or
`PERMANENT_FAILURE_WINDOW_DAYS`, no applied migration touched.

## What the code proves about the failure

The rollout record asked which of primary limit, secondary limit, abuse
detection, request concurrency, a cached token or a too-short retry was at
work. Four of those can be settled from the repository alone; the two that
name a GitHub limit cannot, and this change is what makes them settleable.

1. **The retry was over before any limit could clear.** `finish_job`
   (`202608170001_run_lifecycle.sql`) requeues a failed attempt at
   `now() + 2^attempt_count` seconds: two seconds, then four. The rollout
   record's second pair shows it: the scan succeeded at `11:59:36.884Z` and
   the analyze's third attempt failed at `11:59:46.747Z` — three attempts in
   under ten seconds. GitHub's secondary limit asks for a minute; a primary
   window resets within the hour. Nothing in the queue or the worker read
   either.
2. **The error threw the evidence away.** `GitHubRequestError` kept the
   status and the path. `retry-after`, `x-ratelimit-remaining`,
   `x-ratelimit-reset` and the one body sentence GitHub documents were
   never looked at, so `last_error` could not say which 403 it was, and the
   rollout's "secondary limit" reading stayed an inference.
3. **A full scan kept sending into the refusal.** `mapWithConcurrency`
   (`packages/core/src/ingest/concurrency.ts`) runs every slot and reports
   the first failure only at the end. A 403 on body 200 of 1,170 was
   followed by 970 more contents requests, eight in flight at a time, on
   each of three attempts — the behaviour GitHub's rate-limit guidance says
   may get an integration banned.
4. **The token is not the discriminator.** One source per
   `workspace:repository` is cached and shared by scan and analyze
   (`source-cache.ts`); the drain loop served one workspace, so the two jobs
   never ran concurrently (`draining 1 workspace(s) across 4 loop(s)`). After
   the v17 restart minted a fresh token, the scan's tree read answered 200
   and the analyze's contents reads answered 403 seconds later on that same
   token. The operator's single fresh request answered 200 minutes after
   the failures. What separates 200 from 403 in the record is time and
   volume, not which token asked.

What the record cannot say is whether the limit was primary (the
installation's hourly budget) or secondary (per-minute request pressure),
because no header was kept. This change does not decide that either. After
it, the first throttled job in production writes the answer into
`last_error` and the worker log — `403 primary-rate-limit; retry after
1800s; rate limit 0/5000 core, resets in 1800s` or `403
secondary-rate-limit; retry after 60s; rate limit 4990/5000 core` — from
headers alone.

## The change

**`apps/worker/src/github-repository-source.ts`**

- `classifyGitHubRefusal(response, path, now)` reads a non-2xx into a
  `GitHubRequestError` carrying `kind`, `retryAt` (epoch ms), `rateLimit`
  (`limit`/`remaining`/`reset`/`resource` from the `x-ratelimit-*` headers)
  and the existing `status`. Kinds: `primary-rate-limit`
  (`x-ratelimit-remaining: 0`, retry at the reset), `secondary-rate-limit`
  (a `retry-after` header, or the body naming a secondary rate limit — read
  for that one predicate and dropped; GitHub's own minute when no header),
  `rate-limited` (a bare 429), `forbidden` (a bare 403 — a scope or access
  refusal waiting will not change), `other` (401, 404, 5xx: the message
  keeps its previous shape exactly). The message never contains the body.
- A `ThrottleGate` per source instance, shared by every request on it and
  therefore by a repository's scan and analyze. The first throttled answer
  of a wave sets one pause of `retryAt − now` plus bounded jitter (a tenth
  of the hint, at most 5 s); answers already in flight join that pause
  rather than extending it; nothing is sent until it passes. A pause the
  source will wait inline is at most `MAX_INLINE_WAIT_MS` (90 s — GitHub's
  secondary `retry-after` is 60 s); a longer one, or a fourth consecutive
  pause (`MAX_THROTTLE_PAUSES = 3`, reset by any successful answer), trips
  the gate: the request throws the classified error and every later request
  fails at once, without a network call, until the pause is over. This is
  what stops the 970 follow-on requests, on the scan and on the analyze that
  inherits the same source.
- Constructor gains an optional fifth argument `{ now, random, sleep }` for
  tests; the four-argument form used by `run-local.ts`,
  `tests/helpers/github-shaped-plan.ts` and `tests/repository-scanner.test.ts`
  is unchanged.

**`apps/worker/src/worker.ts`** — `retryDelaySeconds(error, now)`: when the
failure carries a finite `retryAt`, the seconds until it plus one of grace,
bounded by `MAX_RETRY_DEFERRAL_SECONDS = 3600`; nothing for a time already
past or no time at all. `runWorkerOnce` passes it as a fifth argument to
`queue.finish` only when present, and appends `— retry deferred Ns` to the
failure log line. Every other path — rejections, credit pauses, the
four-argument finish — is untouched.

**`apps/worker/src/queue.ts`** — `WorkerQueue.finish` gains the optional
`retryDelaySeconds`; `PostgresWorkerQueue` calls the five-argument
`finish_job` when given one and, if that function does not exist
(PostgreSQL `42883`), falls back to the four-argument call so a worker
released ahead of the migration still finishes the job on the old backoff
instead of holding its lease for the reaper.

**`supabase/migrations/202609120003_finish_job_retry_delay.sql`** — drops
`finish_job(text, text, boolean, text)` and recreates it with
`retry_delay_seconds integer default null`; the retry branch queues at
`now() + greatest(2^attempt seconds, least(delay, 3600) seconds)`. Success
and terminal branches are byte-for-byte the previous body. The
four-argument signature is dropped rather than overloaded because, with the
new parameter defaulted, a four-argument call would be ambiguous. Grants are
re-issued for the new signature (revoke from public/anon/authenticated,
execute to service_role). Registered as `FINISH_JOB_RETRY_DELAY_MIGRATION`
in `tests/helpers/database.ts`.

Contracts kept, each still pinned by its existing test: `readTransientSource`
treats only `status === 404` as a vanished file (`source-cache.test.ts`,
including `403 → must fail the job`); scan and analyze still refuse credits
and share the idempotency story (`worker.test.ts`,
`tests/backfill-and-rescan.test.ts`); `describeFailure` still appends a
`cause`; `reap_stale_jobs` and its backoff are unchanged.

## Red, then green

The new tests were run against the previous implementation first —
`github-repository-source.ts`, `worker.ts` and `queue.ts` stashed, the new
migration and test files in place:

```text
FAIL tests/finish-job-retry-delay.test.ts > … > the worker's queue passes the delay through
     AssertionError: expected 1.998 to be greater than 1795
FAIL tests/github-read-throttle.test.ts > … > a limit that asks for a minute is waited out, and the pair lands as scanned = analysed
FAIL tests/github-read-throttle.test.ts > … > a limit that resets in half an hour defers the retry instead of spending it, and the job says which limit
FAIL tests/github-read-throttle.test.ts > … > a refusal with nothing to wait for still exhausts its attempts, and the reason on screen names the kind
FAIL apps/worker/src/worker.test.ts > retryDelaySeconds > … (×3)  TypeError: retryDelaySeconds is not a function
FAIL apps/worker/src/worker.test.ts > … > defers the retry to the time a rate-limited failure names
Test Files  3 failed (3)   Tests  8 failed | 13 passed (21)
```

The 1.998 s is the previous `finish_job` backoff: the delay the worker
asked for was ignored. `github-repository-source.test.ts` cannot run against
the old module at all (its exports do not exist there).

With the change, the same files:

| file                                              | cases | what it pins                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/github-repository-source.test.ts` |    16 | classification of primary / secondary (header, body sentence, HTTP-date) / bare 429 / bare 403 / 404; the body never in the message; one 60 s pause then the repeat; bounded jitter; long reset thrown at once with later requests stopped at the gate; eight concurrent readers sharing one pause (8 sent, none for a minute, 8 after); the fourth consecutive pause failing fast until the pause passes; a success resetting the run; the tree walk gated too |
| `apps/worker/src/worker.test.ts`                  |    +5 | `retryDelaySeconds` (grace second, hour cap, past / missing / non-error); the deferral reaching `finish` and the log; a failure with no time leaving the four-argument call as it was                                                                       |
| `tests/finish-job-retry-delay.test.ts`            |     7 | over PGlite and every migration: the delay honoured, the exponential backoff winning when longer, the hour cap, the four-argument call unchanged, no resurrection on the last attempt, the worker's queue passing it through, and the fallback against a database without `202609120003` |
| `tests/github-read-throttle.test.ts`              |     3 | the real queue functions, `GitHubRepositorySource`, scan and analysis stores and `buildScanProgress` over the migrated schema, GitHub played by a scripted fetch on a fake clock: **(a)** a 60 s secondary limit on the analyze's first body read is waited out, no request leaves during the minute, both jobs succeed, `last_scanned_commit_sha = last_analyzed_commit_sha`, and the home model reads `structure: ready · analysis: ready · rescan: available`; **(b)** a primary limit resetting in 1800 s ends attempt 1 as `retrying` with `available_at` ≈ +1801 s, `last_error` = `GitHub repository request failed: 403 primary-rate-limit; retry after 1800s; rate limit 0/5000 core, resets in 1800s (/repos/…/contents/…` and no body text, the job is not claimable meanwhile (`analysis: queued`), and once both clocks pass the reset the same job finishes the pair; **(c)** a bare `403 forbidden` still exhausts three attempts, no pause is taken, and the failed job's reason names the kind on screen (`analysis: failed`, `analysisError` = `last_error`) |

Two harness faults were found on the way and are recorded here so nobody
re-derives them: a Crockford ULID has no `U` (the run id first ended in
`U1` and tripped `runs_id_ulid`); and the worker dates a deferral against
`Date.now()` while the source reads the fake clock, so the fake clock starts
at the real time and moves only on sleep — and the "window passed" step
advances both the queue (`available_at = now()`) and the source's clock,
because the gate correctly keeps failing fast until the reset time it was
told.

## Gates (branch tip)

- `pnpm lint` (`--max-warnings=0`): clean.
- `pnpm typecheck`: root and every workspace clean.
- `pnpm test`: 185 files, 1,693 passed, 1 pre-existing platform skip
  (PR #8 rollout: 182 files, 1,662 passed).
- Prettier `--check` over every changed and added `.ts`: clean (the `.sql`
  migration and `.omo/` are outside Prettier's scope, as before).
- `pnpm exec tsx scripts/verify-scope-boundaries.ts`: PASS, 12 boundaries,
  360 files, 0 forbidden paths.
- `git diff --check`: clean, new files included.

## Rollout — for the Codex lane

**Needs:** one migration and one worker deploy. No web deploy (no web
change), no new environment variable, no data change.

**Order: migration first, then the worker.** The migration serves the
running v17 unchanged (a four-argument call resolves against the defaulted
fifth parameter). A v18 worker against the old function would fall back to
the four-argument call on throttled retries only, so the wrong order
degrades to today's behaviour rather than failing — but there is no reason
to test that in production.

1. Inside the Fly worker (its `DATABASE_URL`; print no value), confirm the
   ledger's newest entry is `202609120002_backfill_analyze_pair.sql`, then
   `pnpm db:migrate`. Expected output: exactly
   `Applied: 202609120003_finish_job_retry_delay.sql`.
2. Confirm the installed signature:

   ```sql
   select pg_get_function_identity_arguments(oid) as args
   from pg_proc
   where proname = 'finish_job' and pronamespace = 'public'::regnamespace;
   ```

   Exactly one row: `target_job_id text, target_worker_id text, succeeded boolean, failure_message text, retry_delay_seconds integer`.
3. `WORKER_WORKSPACE_IDS` unset; `flyctl deploy --remote-only` from the
   repository root at the merge commit. Record release and image.
4. Queue a **new** pair. The existing LostArk backfill and alrescha-app
   rescan keys already point at terminal jobs, so the same call at the
   same head may return the old job: use a new head (a push, or a backfill
   of a repository not yet in the workspace), or the other rescan mode
   (`full` after `incremental`, or the reverse) for the same head.
5. Watch `flyctl logs -a arr-worker`. A throttled attempt now logs
   `… attempt N failed: GitHub repository request failed: 403 <kind>; retry after Ns; rate limit R/L core[, resets in Ss] (/repos/…) — retry deferred Ns`.
   The `<kind>` word is the answer to the open question. A pause the
   source waits out inline produces no failure line at all — only a longer
   job.
6. Read the pair (read-only):

   ```sql
   select kind, status, attempt_count, credit_cost,
          round(extract(epoch from (available_at - now()))) as seconds_until_claim,
          left(last_error, 200) as last_error, completed_at
   from public.jobs
   where run_id = '<run>'
   order by created_at, kind;
   ```

   Acceptance: both `succeeded`, both `credit_cost = 0`; on the repository
   row `last_scanned_commit_sha = last_analyzed_commit_sha` (true, not
   null); the home shows `구조 스캔 완료 · 분석 완료` and the `다시 스캔`
   button. If a job is `queued` with `seconds_until_claim` in the hundreds
   or more, that is the deferral working — wait for it rather than
   requeueing.
7. `pnpm ops:health`: `permanent-failures` still warns on the 14 rows of
   2026-09-12 until the window passes; the acceptance is that this pair
   adds none.

**Rollback:** worker to v17,
`arr-worker:deployment-01M2AQ256FT6E1W3QJYTASMBEK`. Leave the migration in
place — v17 runs against it. If the function itself must ever go back, add
a new migration that drops the five-argument function and recreates the
four-argument body of `202608170001` with its grants; do not edit either
applied file.

## Not done here, and why

- **No request pacer.** GitHub's documented secondary budget is 900 points
  per minute; a 1,170-blob full scan at eight in flight has completed in
  55 s in production before, so a fixed pacer would be a guess against a
  limit that has not been observed. The gate is reactive: it waits exactly
  what GitHub asks and stops the follow-on burst. If production logs show
  `secondary-rate-limit` on full scans, the next step is a pacer at that
  documented rate or a lower `SCAN_FETCH_CONCURRENCY` (existing knob), with
  the log as the measurement.
- **`GitHubCiEvidenceSource` is not gated.** It shares the token and could
  in principle send during a pause, but it makes a handful of requests per
  analyze and its failures already read as "no evidence" rather than a
  failed job (todo 18). Sharing the gate belongs with the source-factory
  split in todo 20.
- **`reap_stale_jobs` keeps its 2^n backoff.** A reaped lease is a dead
  worker, not a rate limit.
- **The production cause is still unnamed.** Deliberately: the record has
  no header, and the next throttled job will write one.
