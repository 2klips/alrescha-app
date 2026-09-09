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

---

## Second pass — 2026-09-07: what the stale premise was still hiding

The Phase 4 plan still carried "Docker 부재로 미실행" in four places a day
after this file recorded that it was untrue. A note nobody corrects is worse
than no note: it tells the next reader an acceptance criterion is unreachable
when it has in fact been met. The four are fixed in
`spec/BUILD_PLAN_PHASE4.md`, each against a measurement rather than an
assurance.

| plan note | what it said | what is true |
|---|---|---|
| todo 5 | e2e written, never runnable | 136 passed, 1 skipped |
| todo 18 | map snapshot unrun for want of Docker | Playwright runs; **nobody wrote that spec** — blocked became not-done |
| todo 19 | two-theme axe · Korean sweep · live e2e all unrun | axe 36/36 (0 violations), Korean sweep was always vitest, `findings.spec.ts` 3/3 |
| todo 24 | `instruction-cost.spec.ts` never executed | **7/7**, and every one of the four named criteria is among them |
| todo 3 | `/app/map` TTFB needs Docker | Docker is here; the *before* commit is gone, and no spec measures the *after* |

### A port, not a daemon

Today's first run failed 55 of 137 on `Could not create the test user:
Unexpected token '<'`. The cause was not Supabase:

```
http://[::1]:54321/auth/v1/health      → 200   (Docker)
http://127.0.0.1:54321/auth/v1/health  → 404   (Steam)
```

Steam had taken `127.0.0.1:54321` while Docker Desktop was stopped. Docker's
proxy binds `0.0.0.0`, and on Windows the more specific bind wins, so every
localhost request went to Steam — which answers HTML. `.env.local` points at
`127.0.0.1`, so nothing reached the database. Worth writing down because the
symptom looks exactly like a broken auth service and is not one.

### The exclusion was hiding a defect

`AUTHENTICATED_SCREENS` left out `/app/connect/github` because it reads
`GITHUB_APP_ID` and friends at render time and used to answer 500. All six
GitHub App variables are now present, the screen renders, and it joined the
sweep — where axe immediately found **two AA colour-contrast violations in
dark**:

```
button.button — white on #4493f8 = 3.09:1 (needs 4.5:1)
a.button      — same
```

`.button` sits on `--accent-fg` while carrying `--fg-on-emphasis` text: two
tokens that were never meant to meet. In light they are the same colour, so
it passed there and nobody saw it. Fixed by putting the filled button on
`--accent-emphasis`, which it should always have been — `#1f6feb` against
white is 4.63:1. Both themes 0 violations now.

`.button` is used on the two GitHub connect screens and nowhere else, which
is exactly why the defect survived: the only screens that use it were the
only screens excluded from the audit.

`/app/connect/github/repositories` stays out, and for a reason that will not
go stale: it redirects to the connect screen until an installation exists,
`walkBothThemes` refuses to audit a screen it did not land on, and the
redirect is correct behaviour.

### G2, restated

This file previously said G2 was shut for want of `GITHUB_APP_CLIENT_SECRET`
and `GITHUB_APP_PRIVATE_KEY`. Both are present now (checked by name and
length, never by value), so the connect screen renders and the OAuth entry
point is live. What is still shut is **delivery**: the App's webhook URL
points at Vercel, so no local push reaches this machine, and no installation
exists yet. Half of the gate opened; the plan notes that say "G2 미개통" mean
that half.

### Verification

- `npx playwright test` — 136 passed, 1 skipped
- `npx playwright test -g "app-connect-github"` — 3 passed (theme sweep, axe
  dark, axe light)
