# Home current-repository rule and first-scan retry (PR #9 follow-up)

## Objective and acceptance

Close the two UI acceptance gaps the PR #9 production rollout left open
(`.omo/evidence/phase4/pr9-production-rollout-2026-09-12.md`): with two
connected repositories the home kept showing one repository's old failed
backfill while the other's fresh pair had just succeeded, and a first backfill
that failed for good offered no way back. Acceptance: with several
repositories the selected one and the home's progress agree; a succeeded pair
shows `구조 스캔 완료 · 분석 완료` and `다시 스캔`; a failed first scan (scan
sha null) has a supported recovery; failed history, tenant isolation and the
zero-credit contract are preserved.

## Starting state and isolation

- Start SHA: `5cb43790` (`origin/main` after PR #9), branch
  `claude/home-current-repository`.
- Desktop web only; both themes through the existing token set. No new
  colours, no new scale values, no new route.

## What the contract was

There is no stored "current repository". Each reader guessed one:
`lib/home/journey.ts`, `lib/shell/context.ts`, `lib/map/workspace-map.ts` and
`settings/ai/actions.ts` took the newest **created** row; the index proposal in
`settings/mcp/actions.ts` took the newest **selected** row (`selected_at`,
which `saveSelectedRepository` stamps every time a repository is chosen in
the picker, re-chosen included); the MCP store resolves an omitted id only
when the workspace has exactly one. OQ-042 records the workspace-flat shape
and leaves a dedicated switcher or `/app/[repo]/…` to a product decision.

## Screens touched

- `/app` (`home-screen.tsx`): the rescan affordance gains a fifth state,
  `retry` — the same form and action as `available`, worded `첫 스캔 다시
시도`, shown when the newest scan failed for good and no scan has landed.
  A `first-scan` outcome line after it. Under the connect step, with more
  than one repository, one line says how many are connected and that the
  home and header follow the last selected one, with a link to the picker
  for the current installation (`data-testid="repository-others"`).
- The header (`context-strip.tsx`, unchanged) now names the same repository
  the home does, through `lib/shell/context.ts`.
- `/app/map`: the repository named in the empty state and the layout config
  read follow the same rule; the graph stays workspace-wide (OQ-042).
- Copy: `lib/strings/home.ts` (`journey.connect.others`, `switchCta`,
  `scan.rescan.retryCta`, `scan.rescan.outcomes.firstScan`).

## Model

- `lib/shell/current-repository.ts` — `currentRepository(rows)`: the most
  recently **selected** repository leads; a repository never selected (a
  local push) counts by its creation; ties and unusable timestamps keep the
  caller's order. Used by the home, the header, the map, and both settings
  actions, so every screen names one repository.
- `lib/home/journey.ts` — `buildScanProgress` returns `rescan: "retry"`
  for a failed first scan whose job names a head; the model carries
  `repositoryCount` and `repositorySwitchHref`.
- `supabase/migrations/202609120004_first_scan_retry.sql` — both queue entry
  points key their pair through `next_retry_idempotency_key`, so a terminal
  pair is retried as a new pair on a new run while a live pair stays one
  pair; a rescan of a never-scanned repository retries the first scan at the
  head its job carried (`reason: "first-scan-retry"`).

## Verification

- `apps/web/lib/shell/current-repository.test.ts` (4), `journey.test.ts`
  (+3, one revised), `tests/backfill-and-rescan.test.ts` (+6, PGlite over
  every migration), red first against the previous code (10 failures),
  then green.
- `tests/e2e/onboarding-progress.spec.ts`: the connect walk gains the retry
  step (button, outcome, new `:r1` scan at zero credits, failed row and
  queued analysis untouched), and a new test seeds two repositories and
  asserts the home and the header follow the last selected one.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (186 files, 1,706 passed,
  1 skipped), `verify-scope-boundaries` (12 boundaries, 362 files), Prettier
  on every changed file, `git diff --check`.
- Results and the rollout procedure:
  `.omo/evidence/phase4/home-current-repository-first-scan-retry-2026-09-12.md`.
