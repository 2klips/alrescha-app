# Alrescha desktop frontend redesign plan

**Status:** Active

**Decision date:** 2026-08-31

**Owner workflow:** Claude Code implementation + Codex second-pass verification/frontend work

## Progress

| Wave                       | Status   | Evidence                                                                                             |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| F0 — Contract and baseline | Complete | [`BASELINE_2026-08-31.md`](./BASELINE_2026-08-31.md)                                                 |
| F1 — Desktop design system | Complete | [`ALRESCHA_DESIGN_SYSTEM.md`](./ALRESCHA_DESIGN_SYSTEM.md)                                           |
| F2 — App shell/navigation  | Complete | [`logs/2026-09-01-f2-app-shell-navigation.md`](./logs/2026-09-01-f2-app-shell-navigation.md)         |
| F3 — Evidence graph        | Complete | [`logs/2026-09-01-f3-evidence-graph-workspace.md`](./logs/2026-09-01-f3-evidence-graph-workspace.md) |
| F4 — Core screens          | Next     | Shared page primitives and route migration                                                           |
| F5 — Naming migration      | Pending  | User-facing residuals and compatibility review remain                                                |
| F6 — Verification/handoff  | Pending  | Full desktop comparison and handoff remain                                                           |

## 1. Locked decisions

1. Product name is exactly `Alrescha`.
2. This track targets desktop web only. Design and acceptance viewports are 1280px, 1440px, and 1920px wide.
3. Mobile-specific navigation, layouts, touch optimization, screenshots, and acceptance criteria are deferred. Existing mobile behavior must not be deliberately broken, but it is not a release gate for this track.
4. The current Ink & Seal/Toss split, typography, and graph HUD are redesign inputs, not constraints. Product semantics, accessibility guarantees, evidence states, and token enforcement remain constraints.
5. “GitHub page” means the GitHub.com product/repository interface and its official Primer design system, not GitHub Pages templates. Correct this assumption before implementation if the intended reference differs.

## 2. Research decision

Snapshot: 2026-08-31. GitHub stars are repository-level because GitHub does not assign stars to individual skill folders. Skills.sh installs are skill-level.

| Candidate                   | Repository stars |                  Skill installs | Decision                       |
| --------------------------- | ---------------: | ------------------------------: | ------------------------------ |
| Anthropic `frontend-design` |           172.7k |                          838.2k | Primary skill                  |
| `ui-ux-pro-max`             |          123,373 |                          337.8k | Supporting graph/a11y analysis |
| Taste Skill                 |            82.7k |  `design-taste-frontend` 425.7k | Not selected                   |
| Impeccable                  |            64.2k |             `impeccable` 255.2k | Optional later polish pass     |
| ibelick UI Skills           |             7.9k | 22 for registry entry inspected | Not selected                   |

Primary selection: Anthropic `frontend-design`. It is the first Design & UI entry in Skills.sh, ranks fourth across the all-time leaderboard, and has the highest repository star count among the inspected frontend-design candidates. Codex applied the installed copy during this planning task; Claude Code must load the official skill/plugin or apply the recorded rules from this plan before implementation.

F1 rechecked the ranking on 2026-09-01. Repository order was unchanged; exact GitHub API counts and live GitHub UI captures are in [`F1_RESEARCH_2026-09-01.md`](./F1_RESEARCH_2026-09-01.md).

Research sources:

- https://www.skills.sh/anthropics/skills/frontend-design
- https://www.skills.sh/topic/design
- https://github.com/anthropics/skills
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- https://github.com/leonxlnx/taste-skill
- https://github.com/pbakaus/impeccable
- https://github.com/ibelick/ui-skills

## 3. Visual direction: GitHub-native, Alrescha-specific

Use GitHub Primer as the structural reference, not as a trademark clone.

- Product chrome: quiet neutral surfaces, one-pixel semantic borders, compact controls, clear selected states, low shadow usage.
- Information architecture: repository-style context header, horizontal section tabs, route-local left navigation only where the information architecture requires it, and a contextual right rail where needed. No permanent global sidebar.
- Typography: efficient left-aligned reading, restrained size scale, hierarchy through weight and spacing. Use a UI sans stack for normal copy; reserve monospace for SHAs, paths, code, counts that require digit alignment, and machine identifiers.
- Color: neutral foundation with restrained blue interaction accent. Keep `verified`, `inferred`, `failed`, artifact type, and edge direction meanings explicit through text, icon/shape, and line style; never color alone.
- Motion: 120–200ms state feedback only. No ambient glow, decorative graph pulsing, parallax, or scroll-reveal dependency. Honor `prefers-reduced-motion`.
- Density: desktop developer-tool density. Avoid oversized marketing cards and decorative whitespace inside working views.
- Signature element: the evidence graph behaves like a repository dependency canvas—precise, inspectable, and connected to a details rail—rather than a sci-fi HUD.

Official reference sources:

- https://primer.style/
- https://github.com/primer/react
- https://github.com/primer/primitives
- https://github.com/primer/design/blob/main/content/foundations/typography.mdx

Primer packages are references, not approved dependencies. Reuse the existing stack first. Any dependency addition needs a separate decision, bundle check, and migration plan.

## 4. Graph redesign rules

1. Default view exposes a readable subset, not every node at once. Cluster or filter before rendering high-volume graphs.
2. Selected node receives the strongest visual emphasis; unrelated nodes and edges recede without becoming illegible.
3. Edge direction, relation type, and evidence status use labels plus stroke/shape differences.
4. Labels must not overlap page title, global navigation, filters, legend, or inspector.
5. Hover is enhancement only. Keyboard focus reveals the same details; Enter opens/drills; Escape or Back returns.
6. Provide an accessible non-canvas source of truth: adjacency list/table and relationship summary.
7. Keep existing provenance and evidence-state contracts. Visual redesign cannot imply `verified` without execution evidence.
8. Performance budget by visible node count: SVG up to 100; Canvas/WebGL for 101–500; clustering/level-of-detail required above 500. Confirm against real product measurements before changing renderer architecture.

## 5. Delivery waves

### F0 — Contract and baseline

- Lock name, scope, references, and logging contract.
- Capture current desktop screenshots at 1280, 1440, and 1920 in light/dark themes.
- Inventory every user-visible `Arr`, `SpecProof`, and `Alresca` string.
- Record baseline bundle size, graph render timing, accessibility, and existing automated gates.

Exit: this plan, baseline evidence, and rename inventory are reviewed.

### F1 — Desktop design system

- Replace the split Ink & Seal/Toss visual language with one coherent GitHub-native Alrescha system.
- Specify semantic color, type, spacing, border, radius, elevation, icon, motion, and z-index tokens.
- Create component state matrix: default, hover, focus-visible, active, selected, disabled, loading, empty, error.
- Preserve no-hardcoded-color and contrast tests.

Exit: token proposal and component matrix approved before broad page edits.

### F2 — App shell and navigation

- Implement desktop shell, repository-style context header, horizontal tabs, route-local navigation, and page frame.
- Migrate global actions, project/repository selector, theme control, and account controls.
- Remove obsolete HUD/chrome rules only after all consumers migrate.

Exit: every desktop route renders in the new shell; keyboard navigation and theme gates pass.

Delivered 2026-09-01: 56px global header, 48px repository identity row, 40px horizontal tab row, settings-only local navigation, command palette focus containment/return, paired light/dark geometry, and system-font loading. Existing graph-internal rails and HUD remain explicitly assigned to F3.

### F3 — Evidence graph workspace

- Redesign graph canvas, toolbar, filters, legend, selected state, inspector rail, loading/empty/error states, and accessible list view.
- Resolve label collisions and layering defects.
- Measure large-graph rendering and interaction latency.

Exit: real graph fixtures pass visual, keyboard, accessibility, and performance acceptance.

Delivered 2026-09-01: fixed plot/inspector grid, compact toolbar and facets, graph/table shared selection, keyboard navigation, inspector relationship/activity tabs, focus-returning layout popover, migrated local provenance graph, and 405.4KB gzip `/map` idle payload.

### F4 — Core product screens

- Migrate dashboard, findings, assurance workspace, commits, team, stats, settings, and remaining shell routes in dependency order.
- Use shared primitives; reject page-local token forks.

Exit: all desktop routes use the Alrescha system; legacy visual components have no active consumers.

### F5 — Naming migration

- Replace user-facing product strings and metadata with `Alrescha`.
- Review package names, environment keys, database identifiers, URLs, external integration names, and repository names separately. Do not rename compatibility-sensitive identifiers without a migration decision.
- Review legacy `Alresca` logo assets; regenerate or retire rather than silently treating misspelled assets as final.

Exit: user-facing name audit is clean; retained technical legacy names are documented.

### F6 — Second-pass verification and handoff

- Run lint, typecheck, unit/integration tests, production build, desktop Playwright suite, accessibility checks, theme screenshots, and graph performance checks.
- Compare before/after evidence at 1280, 1440, and 1920.
- Record remaining defects and deferred mobile work.

Exit: all relevant gates green, visual review accepted, handoff log complete.

## 6. Task logging contract

Every frontend task creates `docs/frontend/logs/YYYY-MM-DD-<task-slug>.md` and appends one row to `docs/frontend/WORKLOG.md`.

Each task log must contain:

1. Objective and acceptance criteria.
2. Starting commit SHA and dirty-worktree note.
3. Design/reference decisions used.
4. Files changed and why.
5. Commands run with exact results.
6. Before/after desktop screenshot paths when visual output changes.
7. Accessibility, keyboard, theme, and performance checks relevant to the change.
8. Deferred items, regressions, open questions, and recommended next task.

Never overwrite another agent's uncommitted work. Do not claim a baseline file as task output unless the log records that it was already modified before the task.

## 7. Desktop acceptance gates

- No clipped, overlapping, or unreachable UI at 1280×720, 1440×900, and 1920×1080.
- Complete keyboard route through navigation, graph controls, inspector, dialogs, and primary actions.
- Visible focus, semantic labels, AA text contrast, and non-color state cues.
- Light and dark themes use the same component language and hierarchy.
- No raw color literals outside the token source of truth.
- No unnecessary font downloads; no layout shift caused by fonts or async graph chrome.
- Heavy graph/rendering code remains split from routes that do not need it.
- Existing domain contracts and security/privacy rules remain unchanged.
- Relevant lint, typecheck, test, build, and Playwright gates pass.

## 8. Non-goals

- Mobile redesign or mobile acceptance certification.
- Native mobile app.
- GitHub trademark, logo, or exact branded asset copying.
- Backend/domain behavior changes unrelated to frontend migration.
- Renaming external identifiers without a compatibility plan.

## 9. Remaining work

1. **F4 — Next:** migrate dashboard, findings, assurance, commits, team, stats, settings, and remaining desktop screens to shared primitives; remove legacy visual CSS only after its final consumer moves.
2. **F5 — Pending:** finish the user-facing `Arr` → `Alrescha` audit, review metadata and legacy `Alresca` assets, and retain package/env/schema/URI identifiers until a compatibility migration is approved.
3. **F6 — Pending:** run the complete desktop Playwright/axe matrix, compare before/after evidence at all three widths and both themes, close remaining regressions, document mobile deferral, and create the final Claude Code handoff.
