# Phase 4 — the Playwright debt, paid

**Date:** 2026-09-06 · **Scope:** `tests/e2e/{agent-memory,graph-facets,
local-ingest-card,overview,instruction-cost}.spec.ts`,
`tests/e2e/helpers/session.ts`,
`apps/web/app/app/(shell)/stats/pilot-stats-dashboard.tsx`, and the evidence
artefacts every spec writes.

## The premise was stale

Every session report since Wave A has said "this machine has no Docker
daemon, so `pnpm test:e2e` cannot run at all". That was inherited and it is
**not true**: Docker Engine 29.7.2 is running, a local Supabase stack has
been up for hours, and Playwright 1.62.1 is installed. The suite runs.

Two things were actually in the way, and both were fixable here:

1. **The worktree had no `.env.local`.** Copied in from the root checkout
   (gitignored, so the tree stays clean).
2. **The local database was 19 migrations behind** — everything from
   `202609030001_prune_access_events_cron` through
   `202609060011_session_telemetry`. `/app/stats` answered 500 because
   `usage_daily` did not exist yet. Applied with `node --env-file=.env.local
   --import tsx scripts/migrate.ts`; `db:migrate` alone does not load the env
   file.

## Result

**133 passed, 1 skipped, 0 failed** — the whole suite, for the first time in
Phase 4. Four specs were failing on stale expectations, each one a wave that
changed the product while nobody could run the browser.

| spec | what had drifted | fix |
|---|---|---|
| `agent-memory` | called `search_nodes`, merged away in todo 22 ⑴ | `search_index(include_excerpt: false)`, plus a new assertion that the excerpt key is **omitted** rather than blanked — the merge's contract, now pinned live |
| `graph-facets` | 5 area chips; Wave A todo 4 added `database` and `기타` | asserts the **ordered set** of areas, not a count, so the next addition has to name itself |
| `overview` | 4 brain areas, same cause | asserts 6 **and that every row carries a number** — a count alone would pass on six empty rows |
| `local-ingest-card` | unscoped `.progress-metric` after todo 19 added a second metric; and the card says `측정 안 됨` (`no-data`), not `미측정 — 구현 링크 없음` (`no-links`) | scoped by `data-basis`, and asserts the three states stay distinct: no requirements ≠ requirements without `implements` ≠ 0% |

None of these were product defects. All four are the cost of a browser suite
that could not run: the product moved four times and nothing said so.

## Two real findings from the new spec

`tests/e2e/instruction-cost.spec.ts` (todo 24) went from "written, never run"
to **7/7 green**, and it found two things on the way:

1. The stats page showed the whole-page empty state after consent, because a
   fresh workspace has no evidence — correct behaviour, wrong test. It now
   seeds 24 measured access events through the service role (no UI creates
   them) and asserts the measured card gets a headline while the other two
   say `증거 부족 — 0/5`.
2. **The card printed its supporting numbers under "not enough evidence".**
   Withholding the headline and then showing the detail underneath hands
   over the thin figure the card just declined to publish. Fixed: below the
   threshold the detail and the footnote go too, and only the assumption
   line stays.

Todo 24's acceptance criterion "두 테마 axe" is now **met** rather than
written: `.omo/evidence/phase4/todo-24/axe-contrast-{app-harness,app-stats}-{dark,light}.json`,
all four with `violationCount: 0`.

## Also regenerated

Every screenshot and axe report the suite writes is current as of this run.
They had been stale since the wave that produced them; the diff is large and
it is the point — those files are now evidence of a suite that passes today
rather than of one that passed months ago.

## What this does not cover

- **`/app/map` TTFB** is still unmeasured; no spec asserts it.
- **G2** is still shut: `apps/web/.env.local` has four of the six GitHub App
  variables and is missing `GITHUB_APP_CLIENT_SECRET` and
  `GITHUB_APP_PRIVATE_KEY`, so every live-connect path stays on fixtures.
- **The real-client compat pass** (Claude Code · Codex · Cursor against the
  hosted MCP) is a human task and remains undone.
