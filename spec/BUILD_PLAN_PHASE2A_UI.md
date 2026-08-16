# arr-app — Phase 2A Work Plan: Full UI Rebuild (Ink & Seal + Graph-First)

> Governing decisions: `DECISIONS-ADR.md` ADR-009 (§3 Ink & Seal design system, §8 UI rebuild) and research spec `RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` (renderer stack, LOD, glow rendering — treat its §5-① as the normative interaction spec). Product spec `WORK_SPEC.md` §5 still defines what each screen contains; this plan changes HOW it looks and the graph engine, not features. Conflict priority: ADR = WORK_SPEC > this plan.

## TL;DR (For humans)

Rebuild the entire arr-app UI on the **Ink & Seal design system** (Korean-first copy, dark default + light "paper" mode) and replace the graph engine with the research-confirmed stack: **graphology + d3-force in a Web Worker + Pixi.js v8 (WebGL)**. The dashboard becomes a true Obsidian-class full-bleed graph — 3-level zoom LOD, grid label decluttering, tunable force panel, drift badges, and a shader-based neuron-glow layer driven by MCP access events. All existing features and their 244 tests stay green; this phase changes presentation and the graph engine only.

**Effort:** L
**Risk:** Medium — WebGL renderer swap (SSR, worker lifecycle, disposal leaks), 60fps perf budget at 500+ nodes, visual regression across 9 screens, dark/light theme completeness.
**Decisions locked (do not relitigate):** Ink & Seal tokens exactly as ADR-009-3; Pretendard Variable + IBM Plex Mono; dark default with persisted light toggle; graphology+d3-force(Worker)+Pixi v8 (React Flow is retired for the brain map); Korean-first copy with conventional English terms kept in English (Dashboard, Graph, Findings, Receipt, Data Brain, verified/inferred).

## Scope
### Must have
- **Design tokens as CSS variables** in a single source (`apps/web/app/styles/tokens.css` or equivalent): the exact ADR-009-3 palette — Dark: bg `#0B0E14` / surface `#141926` / line `#232B3D` / text `#E8ECF4` / muted `#8A94A8`; Light("paper"): bg `#FAF7F1` / surface `#FFFFFF` / line `#E3DDD0` / text `#20242E`; brand vermilion `#FF5A45`(D)/`#D6402E`(L); verified `#3DDC97`/`#1E8A5E`; inferred `#F5B84A`/`#B07A14`; info/graph blue `#6C9EFF`/`#3B6FDB`. Node-type colors: doc=blue, requirement=vermilion, code=verified-green, test=amber — same tokens feed both DOM UI and the Pixi renderer (single source, no hex literals in components).
- **Theming:** dark is default; light toggle in the app header persisted per user (localStorage + profile column optional); respects `prefers-color-scheme` only on first visit; every screen and every state (badges, banners, snippets, charts) fully styled in both themes — no unthemed hardcoded colors (lint/test enforced).
- **Typography:** Pretendard Variable (self-hosted, subset) for body/headings; IBM Plex Mono for numbers, code, SHAs, logs, token counts. No other font families.
- **Korean-first copy sweep:** all UI strings Korean, keeping conventional English terms in English; centralize strings in one module per app area (no scattered literals) so the sweep is testable; tone = 제품 카피는 간결한 평서형, 버튼은 명사형.
- **Graph engine replacement (brain map):** graphology graph model; d3-force simulation running in a **Web Worker** (positions streamed to main thread via transferable Float32Array); **Pixi.js v8** WebGL renderer mounted with Next.js `dynamic(..., { ssr: false })`; clean disposal on unmount/navigation (no WebGL context leaks — tested).
- **Force parameter panel** (Obsidian-style, collapsible HUD card): center force, repel force, link force, link distance sliders + **text fade threshold** slider; sensible defaults; persisted per user.
- **Zoom LOD (3 levels, per research §5-①):** Far = no labels (or top-N hub labels only), nodes as glow dots sized by degree, low-alpha edges; Mid = grid-cell label selection (one best label per screen-space cell, degree-weighted) + text fade threshold; Near (node pixel size > threshold) = all labels + status badges on nodes.
- **Clustering:** ≤3,000 nodes render raw (Obsidian aesthetic); above that, **community-detection supernodes** (graphology-communities-louvain; folder/module fallback) collapse at Far zoom only (visual aggregation — no re-layout), expand on click; community coloring available as a graph option (absorbed from graphify — REVIEW_EXTERNAL_PROJECTS_2026-08-16.md G1).
- **Drift/assurance overlay:** red ring on nodes with open findings; red dashed broken-evidence edges; verified/inferred edge tinting from tokens; click-through behavior unchanged from current dashboard (HUD chips, feed, double-click to evidence detail).
- **Neuron glow layer (rebuilt on shader):** per-node `glowIntensity` attribute updated in-place (never re-layout), time-uniform pulse in shader or additive-blend glow sprites; exponential decay ~1.5s; afterglow tint on recently-touched nodes; edge "propagation" flow on touched edges (additive); access events coalesced in 100ms windows before render; burst-safe (50 events/s stays smooth — tested).
- **HUD restyle:** repo/metric chips, live activity feed, legend, banners — all restyled to Ink & Seal on the full-bleed graph; feed click-to-focus camera animation kept.
- **All other screens restyled** to the system: onboarding/connect, findings (+detail), harness, evidence detail graph (`/graph` — may keep a simpler renderer but must use the same tokens), receipts, progress, library, settings (mcp/ai/privacy), stats, auth pages, not-found. No feature changes.
- **Marketing-consistency handoff:** the marketing site (repo `2klips/arr`) is restyled by the planning session separately — this plan only requires the app to export its final token set as a reference (`docs/design-tokens.md` listing the variables).
- **Perf budget (tested):** 500-node fixture ≥ 60fps target frame budget in a headless perf smoke (frame time p95 < 16.7ms simulated ticks; document methodology), initial dashboard JS bundle for the graph route < 450KB gz (Pixi included) or documented exception.
- **Verification:** all existing 244 tests stay green (visual-only changes must not break contracts); Playwright e2e specs updated for new selectors; NEW: theme toggle e2e (dark↔light on 3 screens), glow burst e2e (scripted event stream → pulse assertions via test hooks), force-panel persistence test, WebGL disposal test (mount/unmount ×10, no context loss errors), hardcoded-hex lint rule (only tokens file may contain hex colors).

### Must NOT have
- No feature additions/removals (Phase 2B items — 점검 대시보드 확장, 등록 플로우, 팀 기능 — are OUT).
- No changes to `packages/core`, `packages/mcp` logic, DB schema, or MCP contracts (renderer consumes existing data/APIs as-is).
- No React Flow left in the brain-map path (evidence-detail `/graph` may migrate or stay temporarily, but must be tokens-themed; note the choice in evidence).
- No new fonts, no CDN font loading (self-host), no hex literals outside the tokens file, no unthemed states.
- No guardrail regressions: verified/inferred labels remain visible in every restyled surface; no efficiency claims added anywhere without the benchmark report link.

## Execution strategy
### Waves
- Wave 1: tokens + theming + typography + string centralization (todos 1–3)
- Wave 2: graph engine (todos 4–6)
- Wave 3: dashboard HUD + screens restyle (todos 7–8)
- Wave 4: perf/e2e/a11y verification + handoff docs (todos 9–10)

### Dependency matrix
| Todo | Depends on | Blocks |
| --- | --- | --- |
| 1 | none | 2,3,4,7,8 |
| 2 | 1 | 7,8,9 |
| 3 | 1 | 7,8 |
| 4 | 1 | 5,6,9 |
| 5 | 4 | 6,7,9 |
| 6 | 4,5 | 7,9 |
| 7 | 2,3,5,6 | 9,10 |
| 8 | 2,3 | 9,10 |
| 9 | 4,5,6,7,8 | 10 |
| 10 | 7,8,9 | final |

## Todos
> Implementation + Test = ONE todo. One conventional commit per todo. Evidence under `.omo/evidence/phase2a/task-N.*`.

- [x] 1. Design tokens, fonts, and theme infrastructure
  Create the single tokens stylesheet with the exact ADR-009-3 palette as CSS variables (semantic names: `--bg`, `--surface`, `--line`, `--text`, `--muted`, `--brand`, `--verified`, `--inferred`, `--info`, `--node-doc/req/code/test`), dark as `:root` default and light via `[data-theme="light"]`; self-host Pretendard Variable (Korean subset) + IBM Plex Mono with `next/font/local`; export a typed TS accessor for the Pixi renderer reading the same variables at runtime. Must not leave any `#hex` outside the tokens file (add the lint rule now, allowlist only tokens.css + generated assets).
  Acceptance: lint rule fails on a seeded violation fixture and passes on the codebase; both themes produce defined values for every semantic token (unit test walks the token list); fonts load without layout shift (font-display swap + size-adjust documented).
  Commit: feat(ui): add ink-and-seal tokens, fonts, and theme base

- [x] 2. Theme toggle and persistence
  Header toggle (dark default; first visit honors prefers-color-scheme, then persisted in localStorage); no flash-of-wrong-theme (inline script sets `data-theme` before hydration); all shared primitives (buttons, chips, cards, tables, banners, badges, code snippets) restyled from tokens in both themes.
  Acceptance: Playwright toggles theme on dashboard/findings/receipts and asserts token-derived computed styles + persistence across reload; no-flash verified via init-script presence test.
  Commit: feat(ui): theme toggle with persistence

- [x] 3. Korean-first string centralization
  Move user-facing strings per app area into typed string modules; sweep to Korean-first copy (conventional English terms stay English: Dashboard, Graph, Findings, Receipt, Data Brain, verified/inferred, MCP); keep existing meaning — this is a copy/i18n-structure task, not a rewrite of semantics.
  Acceptance: a test enumerates JSX text nodes (or lint rule) to catch stray hardcoded user-facing literals outside string modules on the reworked screens; snapshot review of key screens' copy committed as evidence.
  Commit: refactor(ui): centralize korean-first strings

- [x] 4. Graph engine core: worker simulation + Pixi renderer
  Implement graphology model + d3-force in a Web Worker (configurable center/repel/link forces + link distance; positions posted as transferable Float32Array at ~30Hz, interpolated on main thread); Pixi v8 stage rendering nodes (type-colored via tokens accessor), edges, selection; `dynamic(ssr:false)` mount; full disposal on unmount (worker terminate + Pixi destroy + context release). React Flow removed from the brain-map route.
  Acceptance: unit tests for worker message protocol and force-config application; mount/unmount ×10 leaves no WebGL context-lost errors and no detached worker (test hook counters); 500-node fixture renders with stable positions (deterministic seed for tests).
  Commit: feat(graph): worker-simulated pixi graph engine

- [x] 5. LOD, labels, clustering, and force panel
  3-level zoom LOD per research spec (Far/Mid/Near as defined in Scope); grid-cell label selection (degree-weighted, one per cell) with text-fade-threshold slider; force parameter HUD panel (collapsible, persisted); community-detection supernode collapse (louvain, folder fallback) at Far zoom for >3,000-node graphs (visual aggregation only, expand-on-click, no re-layout).
  Acceptance: unit tests for grid label selection determinism and LOD thresholds; Playwright zooms through the 3 levels asserting label-count bands and badge visibility at Near; panel values persist across reload; a 3,500-node synthetic fixture shows supernodes at Far and raw nodes when expanded.
  Commit: feat(graph): lod labels clustering and force panel

- [x] 6. Neuron glow shader layer
  Rebuild glow on per-node `glowIntensity` attributes with time-uniform pulse (shader or additive glow sprites — document choice), ~1.5s exponential decay, afterglow tint, additive edge propagation for touched edges; 100ms event coalescing; drift overlays (red rings, red dashed broken-evidence edges) rendered in the same pass; realtime feed wiring unchanged.
  Acceptance: deterministic test hook injects a scripted event stream — assertions on intensity state machine (pulse→decay→afterglow), coalescing under a 50-events/s burst (single batched update per window, no re-layout calls), and cross-workspace isolation intact (existing realtime tests stay green).
  Commit: feat(graph): shader neuron glow and drift overlays

- [x] 7. Dashboard shell and HUD restyle
  Full-bleed graph with Ink & Seal HUD: repo/metric chips, **hub-nodes Top-5 chip (most-connected nodes, click-to-focus — G2)**, live activity feed (click-to-focus kept), legend, CI banner, empty/scanning states — all tokenized, both themes; onboarding-in-graph-area animation restyled.
  Acceptance: existing dashboard tests green with updated selectors; Playwright screenshot evidence for dark and light; every HUD number still click-throughs to its evidence surface (navigation tests).
  Commit: feat(dashboard): ink-and-seal hud restyle

- [x] 8. Remaining screens restyle
  Findings (+detail drawer), harness, evidence detail graph (tokens-themed; note renderer choice), receipts (in-toto viewer), progress (todo board + timeline), library, settings (mcp/ai/privacy), stats, auth, not-found — restyled to tokens in both themes, Korean-first strings from todo 3; verified/inferred badges use the semantic tokens everywhere.
  Acceptance: existing feature tests green; Playwright walks each screen in both themes without unthemed-color lint violations; evidence screenshots per screen.
  Commit: feat(ui): restyle all screens to ink-and-seal

- [ ] 9. Performance and regression verification
  Perf smoke: 500-node fixture frame budget (document measurement method; p95 simulated frame < 16.7ms), graph-route bundle size budget (<450KB gz or documented exception with follow-up); full vitest suite + full Playwright suite green; axe-core contrast checks on dashboard/findings in both themes (AA for text on bg/surface).
  Acceptance: perf + bundle reports committed as evidence; all suites green; contrast report shows no AA failures for standard text.
  Commit: test(ui): perf bundle and a11y gates

- [ ] 10. Handoff artifacts
  `docs/design-tokens.md` (final token table for the marketing-site restyle), updated screenshots in README, CHANGELOG entry, evidence index for this phase.
  Acceptance: docs build/lint green; README shows current dark-theme dashboard screenshot.
  Commit: docs(ui): phase 2a handoff artifacts

## Final verification
- F1: full vitest (244+) and Playwright suites green on main after merge.
- F2: hardcoded-hex lint, unthemed-state sweep, and string-centralization checks pass repo-wide.
- F3: perf smoke + bundle budget + axe contrast evidence present and within budgets.
- F4: guardrail suites from Phase 1 (scope-fidelity, security, plan-compliance) still pass untouched.

## Session protocol
Same as `IMPLEMENTATION_GUIDE.md` §4 — one wave per session, todo checkboxes + evidence per todo, end sessions green. Branch: `phase2a/ui-rebuild`, merge to main at Wave 4 completion after F1–F4.
