# F4 core product screens

## Objective and acceptance

Normalize the remaining desktop product routes onto one GitHub-native Alrescha page language. Acceptance required shared page/header/section/empty-state primitives, canonical semantic-token consumers, no decorative showcase heroes or floating HUD composition, preserved product behavior, light/dark parity, no horizontal overflow at the 1440px review width, and green lint, type, test, build, browser-console, and bundle gates.

Result: complete. Overview, commit analysis, assurance/findings/lint/receipts, progress, library, harness, inspection, team, home, stats, and settings now share the F4 page hierarchy. The authenticated `/app/map` compatibility layout is an ordinary rail/plot/inspector grid with an in-flow activity row.

## Starting state and concurrent work

- F4 started from `828c7bd0cd8a6f0cd88f9254621683cb620f9641` on `main`.
- During the task, Claude Code committed judgment/coaching work as `bd6f68cf97211a99c0af790b636ed70d54ae8b3d`. F4 continued on that new `main` parent without rewriting or staging Claude's inspection/team actions, strings, report logic, database helper, migration, or tests.
- Seventeen modified `.omo/evidence/**` files and untracked `docs/brand/**` direction/assets were already user-owned. They remained untouched and are excluded from the F4 commit.
- Claude Code worktree `claude/awesome-lehmann-a47e28` was not modified.

## Decisions applied

- GitHub repository pages supplied the structural reference: compact page headers, quiet borders, dense controls, plain surfaces, restrained blue selection, and content-first hierarchy.
- Added `ProductPageHeader`, `ProductSectionHeader`, and `ProductEmptyState` rather than preserving route-specific hero variants.
- Removed active legacy palette aliases from screen/base/primitives/shared CSS consumers. Compatibility aliases remain defined only in the token source for existing JavaScript and contract tests.
- Preserved desktop-only scope. Existing narrow-width fallbacks remain, but mobile redesign and mobile acceptance are deferred.
- `frontend-design` drove the restrained developer-tool composition. `ui-ux-pro-max` priorities 1–3 supplied keyboard/semantic review, interaction clarity, stable geometry, and bundle-splitting checks. React guidance exposed and removed `/graph`'s import of the large dashboard module by extracting `GraphTableView`.
- No dependency, external font, backend behavior, data contract, or compatibility-sensitive identifier was changed.

## Implementation

- Added reusable page-layout primitives and render coverage.
- Migrated public and authenticated core screens to the `product-page` contract.
- Rebuilt shared/page CSS around canonical `--bg-*`, `--fg-*`, `--border-*`, semantic status, radius, spacing, and layout tokens.
- Normalized commit cards/details, assurance workspaces, progress ledger, library filters/cards, harness form, inspection/team panels, settings cards, stats, and home sections.
- Replaced library/harness showcase gradients and oversized typography with compact repository-tool headers.
- Added authenticated map compatibility grid rules without reinstating the removed floating HUD or `backdrop-filter` channel.
- Extracted the keyboard-addressable graph table to `graph-table-view.tsx`, keeping Graph/Table selection behavior while reducing `/graph` idle JavaScript coupling.
- Added source-contract tests that require all core routes to consume shared page primitives and prohibit active legacy palette variables and HUD overlay rules.

## Verification

Commands and exact results:

- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed across all six workspace projects with typecheck scripts.
- `pnpm test`: 129 files passed; 962 tests passed, 1 skipped, 0 failed.
- Targeted F4/graph/token suite: 4 files and 50 tests passed.
- `pnpm build`: passed; Next.js compiled and generated 29 static pages plus dynamic routes.
- `node --import tsx scripts/measure-route-bundle.ts --budget 450 /map`: passed. Idle payload 404.9KB gzip across 29 chunks; CSS 19.3KB gzip; 0 font files.
- `node --import tsx scripts/measure-route-bundle.ts --budget 450 /graph`: passed. Idle payload 222.1KB gzip across 11 chunks; CSS 19.3KB gzip; 0 font files.
- Playwright CLI at 1440×1000 traversed `/`, `/commits`, `/findings`, `/lint`, `/receipts`, `/progress`, `/library`, `/inspection`, `/team`, `/harness`, and `/overview`: one visible `h1`, a `product-page` main contract, no horizontal overflow, 0 console errors, and 0 console warnings on every route.
- Final focused rerun of `/commits`, `/library`, and `/harness` confirmed the same geometry after count/title/hero fixes.
- Light captures for nine representative screens and a dark inspection capture were visually inspected. Headers, cards, filters, empty states, and state colors retained hierarchy without clipping or overlay collisions.
- Authenticated settings, stats, and `/app/map` redirect without a session, so they were validated through source contracts, typecheck, tests, and the production build rather than mocked browser evidence.

The full Playwright test suite was not run because it writes into the user's modified `.omo/evidence` files and its fixed port 3000 belongs to another project. The targeted CLI session used port 3010 and `output/playwright/`.

## Visual evidence

- `output/playwright/alrescha-f4-core-screens-2026-09-01/overview-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/commits-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/findings-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/progress-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/library-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/harness-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/inspection-light.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/inspection-dark.png`
- `output/playwright/alrescha-f4-core-screens-2026-09-01/team-light.png`

## Deferred and next task

1. F5 next: finish visible `Arr`/`Alresca` naming and metadata audit. Retain package, environment, schema, URI, and integration identifiers until a compatibility migration is explicitly approved.
2. F6 pending: run the complete 1280/1440/1920 × light/dark Playwright and axe matrix, close regressions, document mobile deferral, and prepare the Claude Code handoff.
