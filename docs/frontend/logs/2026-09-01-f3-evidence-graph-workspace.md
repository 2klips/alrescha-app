# F3 evidence graph workspace

## Objective and acceptance

Replace the legacy sci-fi HUD composition with a repository-tool graph workspace. Acceptance required a page summary, 44px toolbar, filter/legend row, non-overlay plot and inspector grid, accessible list source of truth, keyboard-equivalent selection, layout-settings popover, state surfaces, provenance-preserving local graph, light/dark parity, and the existing 450KB gzip route budget.

Result: complete. `/map` and `/graph` now use the Alrescha F3 graph language. Activity is an inspector tab; the repository summary rail and permanent bottom activity overlay are gone.

## Starting state

- Start SHA: `f4acec8a9b4df308cd0cdd6c7e4aef653f72e92f` on `main`.
- The worktree already contained 17 modified `.omo/evidence/**` files and untracked brand direction/assets. During F3, Claude Code also added concurrent inspection/team judgment/coaching work. Those files were treated as user-owned, not edited by this task, and excluded from the F3 commit.
- Claude Code worktree `claude/awesome-lehmann-a47e28` was not modified.

## Decisions applied

- GitHub repository/dependency views supplied the structural reference: compact summary, ordinary borders, dense toolbar, table fallback, and a fixed contextual inspector.
- The plot and inspector are sibling grid columns. Closing the inspector expands the plot; no permanent panel overlays the canvas.
- Graph and table views share filters and selected-node state. Table rows expose node type, grade, relationship count, and source path; Arrow Up/Down/Home/End move row focus.
- `L` switches graph/table outside editable controls. Escape closes layout settings with focus return, then steps back through inspector context and selection.
- Layout settings remain an anchored popover because they are transient controls. Activity moved into an explicit inspector tab.
- `frontend-design` drove the restrained developer-tool composition. `ui-ux-pro-max` contributed the table alternative, focus return, actionable states, non-color evidence labels, and stable inspector geometry. Next/React guidance kept the heavy graph renderer dynamically split and limited the realtime clock to the canvas/feed leaves.
- No dependency or downloaded font was added. Mobile remains deferred.

## Implementation

- Rebuilt `DashboardScreen` around summary, toolbar, facets, plot, CI status, and 336–400px inspector regions.
- Added the accessible graph table, shared selection announcement, relationship and activity tabs, and keyboard view switching.
- Converted force controls to an always-expanded, focus-returning toolbar popover while retaining the legacy collapsed component contract for existing consumers/tests.
- Replaced `map-hud.css`; removed active repository rail, HUD channel, bottom activity overlay, blur-card, and side-width compensation rules.
- Migrated `/graph` to the same fixed plot/inspector geometry and added its graph/list alternative without changing provenance, edge selection, orphan, finding, or source-record contracts.
- Added unit coverage for the table source of truth and force popover mode.

## Verification

Commands and exact results:

- `pnpm exec eslint ...`: passed for all changed TS/TSX files.
- `pnpm --filter @arr/web typecheck`: passed.
- Targeted Vitest for `dashboard-screen` and `graph-force-panel`: passed.
- `pnpm --filter @arr/web build`: passed; Next.js generated 29 static/dynamic routes.
- `node --import tsx scripts/measure-route-bundle.ts --budget 450 /map`: passed. Idle payload 405.4KB gzip across 30 chunks; CSS 18.0KB gzip; 0 font files.
- Playwright CLI at 1440×1000: plot 1094px, inspector 346px, horizontal overflow false, plot/inspector overlap false.
- Five warm development reloads to visible canvas: 124.5/146.2/155.0/157.6/169.1ms; median 155.0ms.
- Keyboard: table ArrowDown moved focus from `Tenant-safe auth` to `Idempotent webhooks`; Escape closed layout settings and returned focus to its trigger.
- Accessibility snapshot exposed semantic table headers/caption, selected rows, tablist/tabpanel, sliders, live status, canvas node toolbar, and provenance relation buttons.
- Browser console: 0 errors and 0 warnings.

The full Playwright suite was not run because it writes into the user's modified `.omo/evidence` files and its fixed port 3000 belongs to another project. Targeted CLI sessions used port 3010 and `output/playwright/`.

## Visual evidence

- `output/playwright/alrescha-f3-graph-2026-09-01/map-dark-canvas.png`
- `output/playwright/alrescha-f3-graph-2026-09-01/map-dark-table.png`
- `output/playwright/alrescha-f3-graph-2026-09-01/map-dark-settings.png`
- `output/playwright/alrescha-f3-graph-2026-09-01/map-dark-activity.png`
- `output/playwright/alrescha-f3-graph-2026-09-01/map-light-canvas.png`
- `output/playwright/alrescha-f3-graph-2026-09-01/graph-detail-dark.png`
- `output/playwright/alrescha-f3-graph-2026-09-01/graph-detail-list-dark.png`

All captures were inspected. Note: early CLI sessions inherited the opposite saved theme from the filename on two map captures; both color systems were still visually reviewed. Geometry is identical.

## Deferred and next task

1. F4 next: normalize dashboard, assurance/findings, commits, progress, library, inspection, team, stats, settings, and remaining desktop routes with shared page primitives.
2. F5 pending: finish visible naming migration and decide compatibility-sensitive technical identifiers/assets separately.
3. F6 pending: full three-width/two-theme Playwright and axe matrix, regression closure, and Claude Code handoff.
