# The home names one repository, and a failed first scan can be asked for again

**Date:** 2026-09-12 · **Trigger:** the two UI acceptance gaps the PR #9
production rollout left open
(`.omo/evidence/phase4/pr9-production-rollout-2026-09-12.md`): the
production home showed `2klips/LostArk_Scheduler`'s failed first backfill
with no button while `2klips/alrescha-app`'s fresh pair had just succeeded,
and nothing could retry that first backfill. **Boundary:** production was
neither read nor changed; no failed row, timestamp, threshold or applied
migration was touched. **Branch:** `claude/home-current-repository` on
`main@5cb4379`, commit `d984614`; **PR:**
<https://github.com/2klips/alrescha-app/pull/10>. **Scope:** `supabase/migrations/202609120004_first_scan_retry.sql`
(new), `apps/web/lib/shell/current-repository.ts` (new, + test),
`apps/web/lib/home/journey.ts` (+ test), `apps/web/lib/shell/context.ts`,
`apps/web/lib/map/workspace-map.ts`,
`apps/web/app/app/(shell)/{actions.ts,page.tsx,home-screen.tsx}`,
`apps/web/app/app/(shell)/settings/{ai,mcp}/actions.ts`,
`apps/web/lib/strings/home.ts`, `tests/backfill-and-rescan.test.ts`,
`tests/e2e/onboarding-progress.spec.ts`, `tests/helpers/database.ts`,
`docs/frontend/{WORKLOG.md,logs/…}`, `spec/OPEN_QUESTIONS.md` (OQ-042 note).

## What the "current repository" contract was

Nothing stores one. The row `repositories.selected_at` is stamped by
`saveSelectedRepository` every time a repository is chosen in the connect
picker, re-chosen included, and `findConnectedRepository` reads "connected"
as `selected_at is not null`. Every screen then guessed for itself:

| reader                                        | rule before                        |
| --------------------------------------------- | ---------------------------------- |
| `lib/home/journey.ts` (home)                  | newest `created_at`, first row     |
| `lib/shell/context.ts` (header on every page) | newest `created_at`, `limit 1`     |
| `lib/map/workspace-map.ts` (map name, layout) | newest `created_at`, first row     |
| `settings/ai/actions.ts` (enrich pass)        | newest `created_at`, `limit 1`     |
| `settings/mcp/actions.ts` (index proposal)    | newest `selected_at`, `limit 1`    |
| MCP `#soleRepositoryId`                       | exactly one repository, else named |

Production: `alrescha-app` was connected on 2026-09-06 and selected again
on 2026-09-12 by the live spec; `LostArk_Scheduler` was connected for the
first time at 11:49:56Z. By creation the newer row won, and its first
backfill had failed for good. OQ-042 records the workspace-flat shape and
leaves a switcher or `/app/[repo]/…` to a product decision, so this change
does not add one.

## What the recovery contract was

- `enqueue_backfill_scan` keyed its pair `backfill:<repo>:<head>`. `enqueue_job`
  returns the existing job for a repeated key whatever its status, so
  re-connecting the repository at the same head — the only existing act that
  re-queues a backfill — returned the dead scan job and the connect said
  `backfill=scheduled` while nothing ran.
- `enqueue_repository_rescan` refused any repository whose
  `last_scanned_commit_sha` is null (`never-scanned`), which a failed first
  scan leaves null. The home showed the refusal's hint and no button.
- The same reuse applied to a rescan pair that had failed for good
  (`rescan:<repo>:<sha>:<mode>`): the button would have returned the failed
  pair as "scheduled". Production's `alrescha-app` full rescan pair of
  2026-09-12 is exactly such a terminal pair.
- The judgment and coaching queues solved this on 2026-09-02:
  `next_retry_idempotency_key` mints `<base>:r1`, `:r2`, … once the latest
  job under a key is terminal and returns the live or succeeded key
  otherwise (`202609020001_retry_after_terminal_failure.sql`).
- `settle_run_after_job` settles a run only while it is `pending`/`running`
  and never reopens a `failed` one, so a retry appended to the old run would
  be invisible to every reader of `runs`.

## The change

**One selection rule** — `currentRepository(rows)`
(`apps/web/lib/shell/current-repository.ts`): the most recently selected
repository leads; a repository never selected (a local push, which has no
`selected_at`) counts by its creation; ties and unusable timestamps keep the
caller's order, so a newest-first loader degrades to what it showed before.
The home, the header, the map and both settings actions call it, each
selecting `created_at,selected_at` alongside what it read before. The home
model gains `repositoryCount` and `repositorySwitchHref` (the picker for the
current repository's installation, the existing act that selects — and now
correctly retries — a repository); with more than one repository the connect
step says so in one line and links there.

**Retry generations for both scan entry points** —
`202609120004_first_scan_retry.sql` recreates `enqueue_backfill_scan` and
`enqueue_repository_rescan` (same signatures, same return shapes) keying each
half of the pair through `next_retry_idempotency_key`, with a small
`retry_generation_of(key)` helper. A retry opens a run of its own
(`<trigger>:rN`). Properties, each pinned below: a live pair is one pair
however often it is asked for; a terminal pair is retried as a new pair with
the failed rows untouched; only what failed is retried (a succeeded scan
beside a failed analyze yields one new analyze on a new run and no second
scan); nothing is charged. A rescan of a never-scanned repository that has a
scan job retries the first scan at the head that job carried through
`enqueue_backfill_scan` and answers `reason: "first-scan-retry"`, `mode:
"full"`; a repository with no scan job at all is still `never-scanned`, and a
local repository is still refused before either.

**The home** — `buildScanProgress` returns `rescan: "retry"` when the newest
scan failed, no scan has landed, and the job names a head. The same form and
server action as `available`, worded `첫 스캔 다시 시도`; the redirect carries
`rescan=first-scan` and the page says `첫 스캔을 다시 예약했습니다 — 실패한
이전 시도는 기록에 남고, 새 시도가 이어집니다`. The MCP `request_rescan`
tool reaches the same function and so gains the same recovery.

Contracts kept: the failed rows keep `status`, `attempt_count`, `last_error`
and `completed_at` (so `ops:health` keeps counting them until the window
passes); scan and analyze still refuse credits; `enqueue_backfill_scan`
still refuses a non-sha and the null sha; a repository from another
workspace is still refused by both functions; `never-scanned` and the
local-repository refusal keep their exact wording; the map's graph stays
workspace-wide.

## Red, then green

The new tests were run first with the previous code — the new migration, its
registry entry and `journey.ts` stashed:

```text
× journey.test.ts > with several repositories, the last one selected leads, not the last one created
    → expected 'acme/other' to be 'acme/app'
× journey.test.ts > a failed scan carries the queue's own words, and can be asked for again
    → expected 'never-scanned' to be 'retry'
× journey.test.ts > a first scan that failed for good can be tried again, at the head it tried
× journey.test.ts > a locally pushed repository counts by its creation … / … still connects (repositoryCount)
× backfill-and-rescan.test.ts > retrying a first scan that failed for good > queues a new pair under the next generation …
× … > a live pair is still one pair, however often it is asked for
× … > retries only what failed: a landed scan is kept, its failed analysis is queued again
× … > a rescan of a never-scanned repository retries the first scan at the head it tried
× … > a rescan whose pair failed for good is retried the same way
Test Files  2 failed (2)   Tests  10 failed | 28 passed (38)
```

Then green, with the change:

| file                                                | cases | what it pins                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/shell/current-repository.test.ts`     |     4 | empty → null; the last selected leads over the last created (the production pair, in both orders); a never-selected local push counts by creation, before or after; ties and garbled timestamps keep order, and any real time outranks none                                                                                                                                                                                             |
| `apps/web/lib/home/journey.test.ts`                 |    +3 | two repositories, newest-created first as the loader orders them: the home names the one selected later, reads its succeeded pair as `ready · ready · available`, counts 2 and links the picker; a local push created later leads and has no picker; a failed first scan reads `retry` (busy once its retry is queued; `never-scanned` when the failed job carries no head). One existing case revised: a failed first scan now offers `retry` |
| `tests/backfill-and-rescan.test.ts`                 |    +6 | PGlite over every migration, the pair exhausted through `claim_next_job`/`finish_job` as the worker does: a new `:r1` pair on run `backfill:<head>:r1` with the failed rows unchanged (`failed`, 3 attempts, the 403 reason kept) and the old run `failed`; the live retry returned for every further press; a landed scan kept and only its failed analyze re-queued; a never-scanned rescan answering `first-scan-retry` with the same pair and idempotent on repeat; a terminal rescan pair retried under `rescan:…:full:r1`; another workspace's repository refused, and a repository with no scan job still `never-scanned` |
| `tests/e2e/onboarding-progress.spec.ts` (Playwright) | +1, +1 step | see below                                                                                                                                                                                                                                                                                                                                                                                                                                |

Two harness facts found on the way, recorded so nobody re-derives them: the
pair is written in one transaction and shares a `created_at`, so the queue's
tie-break between scan and analyze is arbitrary — the test parks the other
queued job while claiming one; and the e2e stack runs against the local
docker Supabase, which had neither `202609120003` nor `202609120004` applied
until `pnpm db:migrate` was run against it (local only — production was not
touched).

## Playwright

`tests/e2e/onboarding-progress.spec.ts` against the local stack:

- **the connect walk** gains step 4b: after the scan fails for good the
  `[data-rescan='retry']` affordance and the `첫 스캔 다시 시도` button are
  visible; the click lands on `rescan=first-scan` with the outcome line; the
  jobs under `backfill:%` are exactly `[…, scan, failed, 0]`, `[…:analyze,
  analyze, queued, 0]`, `[…:r1, scan, queued, 0]` — the failed row untouched,
  the still-queued analysis reused, the new scan free; the walk then marks
  the `:r1` scan landed and continues through structure-ready, rescan, and
  the existing assertions unchanged.
- **a new test** seeds two repositories under one installation — one created
  first and selected now, one created later and selected an hour earlier —
  and asserts the home's connect step and the header both name the selected
  one, its stages read `ready · ready`, `다시 스캔` is visible, and the
  `repository-others` line counts 2 and links
  `/app/connect/github/repositories?installation=<id>`.
- Result: 3 passed in 9.9 s (the two tests above and the existing local-push
  test), after `pnpm db:migrate` against the local docker Supabase. The first
  run, before that migration, failed the retry step at the click with
  `rescan=never-scanned` — the old function's answer — which is the exact
  behaviour production shows today and the reason the migration goes first.

## Gates (branch tip)

- `pnpm lint` (`--max-warnings=0`): clean.
- `pnpm typecheck`: root and every workspace clean.
- `pnpm test`: 186 files, 1,706 passed, 1 pre-existing platform skip
  (PR #9: 185 files, 1,693 passed).
- Prettier `--check` over every changed and added file: clean.
- `pnpm exec tsx scripts/verify-scope-boundaries.ts`: PASS, 12 boundaries,
  362 files, 0 forbidden paths.
- `git diff --check`: clean, new files included.

## Rollout — for the Codex lane

**Needs:** one migration and one web deploy. No worker deploy (no worker
code change; the worker calls neither function). No environment variable.
No data change.

**Order: migration first, then the web.** The migration changes two
functions the web calls with unchanged signatures and return shapes: the
running web keeps working against it, and its only behavioural change is
that a repeated request for a terminal pair now queues a new pair. A new web
against the old functions would show the retry button and, on click, receive
`never-scanned` from the old function and say so — honest, but not the
recovery — so apply the migration first. Vercel deploys `main` on merge;
merge only after the migration is applied, or apply it immediately after.

1. Inside the Fly worker (its `DATABASE_URL`; print no value), confirm the
   ledger's newest entry is `202609120003_finish_job_retry_delay.sql`, then
   `pnpm db:migrate`. Expected: `Applied: 202609120004_first_scan_retry.sql`
   (plus the two harmless ledger NOTICE lines seen on PR #9).
2. Confirm the functions:

   ```sql
   select proname, prosrc like '%next_retry_idempotency_key%' as retries
   from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('enqueue_backfill_scan', 'enqueue_repository_rescan', 'retry_generation_of')
   order by proname;
   ```

   Three rows; `retries = true` for the two enqueue functions.
3. Merge the PR; Vercel deploys `main`. Smoke: `/` → 200, `/api/mcp` GET →
   405.
4. **Selection.** Sign in as the pilot workspace owner and open `/app`. With
   the two repositories both selected on 2026-09-12 (`LostArk_Scheduler` at
   11:49:56Z, `alrescha-app` earlier that day by the live spec), the home
   still shows `LostArk_Scheduler` — by selection, now, not by creation —
   and the new line `연결된 레포 2개 — …` with `다른 레포 선택`. Follow it to
   the picker and choose `2klips/alrescha-app`: the connect re-selects it
   (`selected_at` moves) and re-queues its backfill at the current head,
   which is idempotent against the succeeded merge-head pair. Expected home:
   `2klips/alrescha-app 연결됨`, `구조 스캔 완료 · 분석 완료`, `다시 스캔`; the
   header names it too. Read-only check: `select full_name, selected_at,
   last_scanned_commit_sha = last_analyzed_commit_sha as current from
   public.repositories where workspace_id = '<ws>' order by selected_at desc`.
5. **Recovery.** Select `2klips/LostArk_Scheduler` again in the picker (the
   connect path), or on its home press `첫 스캔 다시 시도`. Either queues a new
   pair under `backfill:<repo>:<head>:r1` on run `backfill:<head>:r1`,
   both `credit_cost = 0`; the two failed rows keep `status = 'failed'`,
   `attempt_count = 3` and their `last_error`. Watch `flyctl logs -a
   arr-worker`: with v18 a throttled read now logs its `<kind>` and defers.
   Acceptance: both new jobs `succeeded`, the repository row's two sha
   columns equal, the home at `구조 스캔 완료 · 분석 완료` with `다시 스캔`.
   If the retry fails again, `last_error` names the 403 kind — that is the
   PR #9 question answered, and the pair can be retried once more the same
   way (`:r2`).
6. `pnpm ops:health`: `permanent-failures` still counts the 14 rows of
   2026-09-12 (untouched by design) until the window passes; the acceptance
   is that the retried pair adds none.

**Rollback:** web — Vercel Instant Rollback to the previous deployment
(`5cb4379`). Leave the migration in place: the previous web calls both
functions with the same signatures and reads the same return shape; the only
difference it would see is a new pair for a terminal key, which is the
intended behaviour. If the functions themselves must ever go back, add a new
migration restoring the `202609120002` bodies; do not edit an applied file.

## Not done here, and why

- **No repository switcher, no `/app/[repo]/…`.** OQ-042's decision is the
  user's; this is the interim selection contract, recorded there.
- **The URL connect form does not re-select** an already connected
  repository (`url-connect.ts` answers `already_connected` before the
  connect runs). The picker does, and the home now links to it. Changing the
  URL form's answer is a product choice, not a bug.
- **A retry does not re-read the head.** It scans at the head the failed job
  carried — the head the connect read. A repository that has moved on gets
  its newer commits through the push path as before; re-selecting in the
  picker reads the current head.
- **`reap_stale_jobs`, `ingest_github_webhook_event` and the enrich/judge
  paths are unchanged.** Only the two manual scan entry points learned to
  retry.
