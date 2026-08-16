# Phase 2A · Task 2 — Theme toggle and persistence

**Commit:** `feat(ui): theme toggle with persistence`
**Governing spec:** `spec/BUILD_PLAN_PHASE2A_UI.md` todo 2, ADR-009-3.

## What landed

| Artifact | Path |
| --- | --- |
| Preference logic + boot script | `apps/web/lib/theme/theme-preference.ts` |
| Header control | `apps/web/app/ui/theme-toggle.tsx` |
| Inline boot script in `<head>` | `apps/web/app/layout.tsx` |
| Toggle styling (tokenized) | `apps/web/app/globals.css` (`.header-actions`, `.theme-toggle`) |
| Unit tests (19) | `tests/theme-toggle.test.ts` |
| E2E (5) | `tests/e2e/theme.spec.ts` |

## Behaviour contract

1. **Dark is the default.** `DEFAULT_THEME = "dark"`, matching `:root` in `tokens.css`.
2. **`prefers-color-scheme` applies on the first visit only.** Once the user has chosen, the
   stored value outranks the OS hint — flipping the OS theme must not silently undo an
   explicit decision. Covered by the `first visit follows the OS preference, then the stored
   choice wins` e2e case.
3. **No flash of the wrong theme.** `THEME_INIT_SCRIPT` is inlined in `<head>` (id
   `arr-theme-init`) and stamps `data-theme` on `<html>` before the first paint. The script is
   dependency-free and wrapped in `try/catch`, so blocked storage falls back to dark instead of
   throwing during boot.
4. **Storage failures never break the UI.** `applyTheme` still paints the attribute when
   `localStorage.setItem` throws (private mode, quota).
5. **Junk in storage is ignored** rather than painted as an undefined theme.

The toggle is mounted in all three themed headers: the dashboard topbar
(`dashboard-screen.tsx`), the assurance header shared by findings/lint/receipts
(`assurance-workspace.tsx`), and the progress ledger header (`progress/page.tsx`).
It renders theme-agnostic markup on the server and syncs to the painted value on mount, so
hydration never disagrees with what is on screen.

## Unthemed-state sweep

Todo 1 removed every hex from `globals.css`; this todo finished the job on the remaining
non-hex colours. The three `rgb(0 0 0 / N%)` panel shadows now mix a new `--shadow-color`
token (black in dark, ink `#20242E` in light — a pure-black shadow reads as dirt on the paper
theme). `globals.css` now contains **zero** raw colour functions and **zero** custom-property
declarations of its own; three tests lock that down:

- no `rgb()/rgba()/hsl()/oklch()/lab()` anywhere in the stylesheet;
- `@import "./styles/tokens.css"` present and no `--token:` declarations outside it;
- every `font-family` is exactly `var(--font-sans)` or `var(--font-mono)`.

## Acceptance

| Criterion | Result |
| --- | --- |
| Playwright toggles theme on dashboard/findings/receipts | 3 parameterised cases, all green |
| Asserts token-derived computed styles | reads the resolved `--bg` custom property and asserts dark ≠ light |
| Persistence across reload | reload asserts both `data-theme` and the toggle's reported `data-theme-value` |
| No-flash verified via init-script presence test | unit test runs the real `THEME_INIT_SCRIPT` in a `node:vm` context with a scripted browser; e2e probes `data-theme` at `readystatechange` and asserts it is never `dark`/`unset` after choosing light |

`pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ **277 passed** (244 pre-existing + 33 new) ·
`playwright test theme.spec.ts app-shell findings progress` ✅ 12 passed

### Playwright note (pre-existing failures, not from this phase)

4 specs fail on this machine — `dashboard.spec.ts:30`, `live-graph.spec.ts:25`,
`pilot-flow.spec.ts:262`, `release-hardening.spec.ts:6`. They fail identically with this
phase's work stashed, and `docs/reports/IMPLEMENTATION_REVIEW_2026-08-14.md` records that the
Playwright suite was never re-run locally and has no CI job. `dashboard.spec.ts:30` looks for a
single `/Unresolved/` button while `feat(web): rebrand homepage as Arr` (`e0057dc`, before this
branch) started rendering the metric chips twice (desktop rail + mobile row); the others need a
seeded Supabase. Flagged for Wave 4 (todo 9), which owns the full-suite gate.
