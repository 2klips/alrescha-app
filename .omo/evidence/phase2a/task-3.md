# Phase 2A · Task 3 — Korean-first string centralization

**Commit:** `refactor(ui): centralize korean-first strings`
**Governing spec:** `spec/BUILD_PLAN_PHASE2A_UI.md` todo 3, ADR-009-3.
**Copy snapshot:** `.omo/evidence/phase2a/task-3-copy-snapshot.md` (every string, generated from the modules)

## What landed

| Artifact | Path |
| --- | --- |
| Term policy (English allowlist) | `apps/web/lib/strings/terms.ts` |
| Shared copy (brand, nav, theme, grades) | `apps/web/lib/strings/common.ts` |
| Dashboard copy | `apps/web/lib/strings/dashboard.ts` |
| Findings / 지시문 린트 / Receipts copy | `apps/web/lib/strings/assurance.ts` |
| Progress ledger copy | `apps/web/lib/strings/progress.ts` |
| Barrel | `apps/web/lib/strings/index.ts` |
| Policy + centralization tests (12) | `tests/korean-strings.test.ts` |

## Converted screens

`dashboard-screen.tsx`, `assurance-workspace.tsx` (findings + lint + receipts), `graph-canvas.tsx`,
`theme-toggle.tsx`, `progress/page.tsx`, `progress-dashboard.tsx`. Two library modules that
produced copy were moved onto the same source: `lib/dashboard/graph-model.ts` (the CI banner) and
the graph canvas's accessible name.

Tone follows the plan: 제품 카피는 간결한 평서형, 버튼은 명사형. Conventional English terms stay
English — Dashboard, Graph, Findings, Receipt, verified/inferred, MCP, GitHub, commit, token —
and the brand tagline "Proof, before merge." is treated as an asset, not copy (ADR-008).

## Deliberately still English

Demo **fixture data** (`lib/assurance/fixtures.ts`, `lib/progress/fixtures.ts`) is repository
content, not UI chrome — finding titles, instruction quotes, file paths and commit summaries stand
in for what a real English-language repo would contain. Translating them would misrepresent what
the product reads out of a repository. The chrome around them is Korean.

## Deferred to todo 8 (recorded in the test, not in prose)

`tests/korean-strings.test.ts` keeps two lists: `CONVERTED_SCREENS` (checked for stray literals on
every run) and `PENDING_SCREENS` (20 files: onboarding, graph detail, harness, library, settings
×3, stats, auth, not-found and their page shells). A third test walks `apps/web/app` and fails if a
screen with inline copy appears in **neither** list — so todo 8 gets a working checklist and a new
screen cannot slip past unclassified.

## Acceptance

| Criterion | Result |
| --- | --- |
| A test catches stray hardcoded user-facing literals on the reworked screens | `test.each(CONVERTED_SCREENS)` scans JSX text nodes plus `aria-label`/`placeholder`/`title`/`alt`; the detector's regex excludes TS generics and ternaries so it reports copy, not code |
| The detector is proven to fire | positive control asserts it still finds inline copy in `PENDING_SCREENS` |
| Korean-first sweep is testable | after removing the English allowlist and technical tokens, no Latin prose may remain in any module string — a new English word forces either a translation or a deliberate allowlist entry |
| Conventional terms stay English | asserted verbatim (`Graph`, `Findings`, `Receipts`, `verified`, `inferred`) |
| Snapshot of key screens' copy committed | `task-3-copy-snapshot.md` |

`pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ **290 passed** (244 pre-existing + 46 new)

### Playwright

The sweep also repaired three specs that were already failing on stale English selectors from the
earlier Arr rebrand: `dashboard.spec.ts:30` (`/Unresolved/` chip and the old search placeholder),
`live-graph.spec.ts:25`, and `release-hardening.spec.ts:17`. E2E specs now import the same string
modules the screens use, so a future copy change updates both at once.

Remaining Playwright failures: `release-hardening.spec.ts:8` and `pilot-flow.spec.ts:264` — both
walk the seeded demo repository journey and need a running Supabase, which this environment does
not have. They fail identically with this phase's work reverted. Wave 4 (todo 9) owns the
full-suite gate.
