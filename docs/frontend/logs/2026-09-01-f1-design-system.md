# F1 desktop design system

**Completed:** 2026-09-01

**Agent:** Codex

**Starting commit:** `47afca55d45d94210240fe86aabe608b483f730e`

## Objective

Turn the approved GitHub/Primer direction into an implementation-ready Alrescha desktop system before broad page edits.

## Starting state

- `main` was two local frontend documentation commits ahead of `origin/main`.
- Claude Code worktree `claude/awesome-lehmann-a47e28` remained six commits behind `main`; it was not modified.
- Seventeen modified `.omo/evidence` files and untracked `docs/brand/ALRESCA_*` assets remained user-owned and untouched.
- Product code already had strict theme/color/font/radius tests and an existing token layer; F1 therefore specifies an additive migration instead of replacement in one change.

## Skills used

- `frontend-design`: forced two concepts, one signature, and two critique passes. It prevented a generic dashboard or pure GitHub skin.
- `ui-ux-pro-max`: supplied dense dashboard, graph threshold, adjacency fallback, focus-not-obscured, and dynamic-bundle checks. Irrelevant landing, amber, Fira, GSAP, and mobile output was rejected.
- `playwright`: captured the real public GitHub repository UI in light/dark at 1440×900.
- `caveman`: kept progress reporting compressed; it did not change design decisions.

## Research results

- Anthropic `frontend-design` remained the highest-starred inspected candidate at 172,912 stars.
- GitHub's current repository layout confirmed horizontal global/repository/tab bands, bordered content, a contextual right column, compact controls, and geometry parity across themes.
- Primer's current functional color, typography, layout, loading, and split-view guidance formed the structural source.
- Proposed semantic foreground/status pairs were independently contrast-calculated; all normal text pairs clear 4.5:1 against default canvases.

## Outputs

- `docs/frontend/F1_RESEARCH_2026-09-01.md`
- `docs/frontend/ALRESCHA_DESIGN_SYSTEM.md`
- `docs/frontend/COMPONENT_STATE_MATRIX.md`
- Light/dark GitHub reference captures under `output/playwright/alrescha-f1-github-reference-2026-09-01/`
- Updated plan progress, README read order, and worklog.

## Decisions

1. Selected repository shell; rejected permanent app sidebar for graph routes.
2. System sans and system mono replace shipped webfonts during F2 after verification.
3. Light and dark share 6px default radius and all geometry.
4. Primary interaction is blue; evidence uses success/attention/danger plus non-color cues.
5. `Evidence trace` is the only signature visual treatment.
6. Existing Pixi/d3/graphology stack remains. No new UI, icon, font, or graph dependency.
7. Current token names become temporary aliases while consumers migrate.

## Verification

- GitHub API counts retrieved successfully for all five candidate repositories.
- Real Chromium light/dark captures visually inspected.
- Proposed foreground/background contrast ratios calculated; minimum normal-text pair is 4.63:1 for white on dark primary fill.
- Product code, dependencies, generated schemas, and pre-existing evidence were not edited.

## Next task

F2 app shell and navigation implementation: canonical token aliases, system font migration, Alrescha user-visible shell copy, repository header/tabs, and route-local navigation only where needed.
