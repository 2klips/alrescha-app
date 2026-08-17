# Changelog

Notable changes to `arr-app`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project has no released
versions yet, so entries are grouped by delivery phase.

Per-todo evidence lives under `.omo/evidence/` — see
[`.omo/evidence/phase2a/INDEX.md`](.omo/evidence/phase2a/INDEX.md) for this
phase.

## [Unreleased]

### Phase 2B — 등록 플로우 · Data Brain v2 · 점검 · 팀 (2026-08-17)

Plan: `spec/BUILD_PLAN_PHASE2B.md` (15 todos, all delivered). Governing
decisions: ADR-011 (team privacy), ADR-012 (interval-based claims), ADR-013
(scope boundary redefinition — local ingest allowed metadata-only, team
surfaces gated on the ADR-011 negative suite). Per-todo evidence:
`.omo/evidence/phase2b/`.

#### Added

- **Registration flow**: repository-by-URL onboarding; per-commit analysis
  cards (`/commits` — status derived from job rows, findings delta from
  receipts, failure reasons verbatim); `arr push` local ingest CLI
  (`packages/cli`) that scans locally with the shared deterministic scanner
  and uploads **metadata only**, enforced by a strict schema that rejects any
  body-shaped field, authenticated with workspace MCP tokens.
- **Single persistence path**: `apply_repository_scan` SQL function — the
  worker (GitHub) and the local-ingest route persist scans through the same
  atomic implementation, so the two paths cannot produce different graphs.
- **Run lifecycle** (OQ-014): the job queue now writes `runs.status` /
  `started_at` / `completed_at` (claim → running; last terminal job →
  failed > cancelled > succeeded), unblocking the pilot stats screen.
- **Data Brain v2**: five ID-first MCP graph tools (`search_nodes`,
  `get_neighbors`, `trace_path`, `get_node_content`, `impact_of`) plus
  `route_query` (deterministic simple-vs-multi-hop routing with reasons and a
  fallback); measured token-efficiency techniques behind on/off flags
  (id-first −14.2% tokens on the dry-run fixture; defaults gated on recall);
  scanner extensions — rationale comments as first-class graph nodes with
  provenance edges (the first production `edges` writer), Python/Go symbol
  extraction (tree-sitter pending OQ-015), handoff/session files classified
  as `todo_progress`.
- **Inspection dashboard** (`/inspection`): six widgets, each with a source
  label and an explicit "증거 부족" empty state; npm-audit ingestion (a
  collector, provably not a scanner); `inferred`-labelled document summaries;
  an append-only ruled-out history.
- **Teams on ADR-011**: roles owner/admin/member/viewer with an invitation
  lifecycle and an exhaustively tested capability matrix; opt-in local-first
  prompt capture (double opt-in enforced by a BEFORE trigger even against
  service-role writes, raw text only behind a separate per-member switch,
  consent invisible to the team, deletion immediate); prompt coaching with a
  deterministic anti-shell floor and no-charge-on-failure; VIBE index v0
  whose metrics render **only** with an adopted Goodhart-gate verdict — the
  published gate file is all-pending, so none render today; the executable
  harness-injection experiment (112-trial grid, verdicts published as
  pending until real models run).
- **Accessibility/layout debt paid** (todo 14): the canvas hit layer is one
  roving-tabindex stop with arrow-key traversal (was up to 600 tab stops)
  and is now inside the axe audit scope; the HUD force/evidence panels moved
  into a workspace-grid channel, deleting the fragile passage constants.

#### Known limits

- `/auth/*`·`/app/*` contrast verification (OQ-008) still needs a live
  Supabase project — blocked on that human prerequisite, tracked in
  `spec/OPEN_QUESTIONS.md`.
- Benchmark v3 (600 trials), the VIBE injection run (112 trials), and the
  real-model technique A/B await API credits; every pre-registration is
  frozen and digest-locked.

### Phase 2A — full UI rebuild: Ink & Seal + graph-first (2026-08-16)

Plan: `spec/BUILD_PLAN_PHASE2A_UI.md`. Governing decisions: ADR-009 §3 (Ink &
Seal design system) and §8 (UI rebuild), plus
`spec/RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` for the renderer stack.

**Presentation and the graph engine only — no features were added or removed.**

#### Added

- **Ink & Seal design tokens** (`apps/web/app/styles/tokens.css`) as the single
  source of colour for both the DOM chrome and the WebGL renderer: semantic
  surface/text/status/node tokens, dark as `:root`, light ("paper") under
  `[data-theme="light"]`. A typed accessor (`apps/web/lib/theme/tokens.ts`)
  hands the same values to Pixi at runtime.
- **Theme toggle** with `localStorage` persistence, `prefers-color-scheme` on
  first visit only, and an inline boot script that stamps `data-theme` before
  hydration so there is no flash of the wrong theme.
- **Self-hosted typography**: Pretendard Variable (dynamic unicode subset) and
  IBM Plex Mono, with fallback metric overrides measured from the shipped woff2
  files. No CDN, no other families.
- **New graph engine** for the brain map — graphology model, d3-force running in
  a Web Worker streaming positions as transferable `Float32Array`, Pixi.js v8
  renderer mounted with `dynamic(ssr: false)` and fully disposed on unmount.
  React Flow is gone from this path.
- **Three-level zoom LOD** (Far / Mid / Near) with degree-weighted grid-cell
  label decluttering and a text-fade threshold.
- **Force parameter HUD panel** — centre / repel / link strength, link distance
  and label fade, collapsible, persisted per user.
- **Community-detection supernodes** (louvain, folder fallback) collapsing at
  Far zoom above 3,000 nodes; visual aggregation only, expand on click, never a
  re-layout.
- **Neuron glow layer** driven by per-node `glowIntensity`: pulse → ~1.5s
  exponential decay → afterglow, additive propagation along touched edges, and
  100ms coalescing of access events.
- **Hub-nodes Top-5 chip** on the dashboard rail, click-to-focus.
- **`docs/design-tokens.md`** — the full token reference, both themes, measured
  contrast, and the usage rules, as the handoff for the marketing site restyle.
- **Gates**: hardcoded-hex ESLint rule, Korean-first string sweep test,
  500-node frame-budget suite, per-route JS bundle measurement script,
  axe-core AA contrast audit, and a browserless token-contrast suite.

#### Changed

- Every screen restyled to the token system in both themes — dashboard,
  findings (+detail), lint, harness, evidence detail, receipts, progress,
  library, settings, stats, auth, not-found.
- Dashboard is now a full-bleed graph with an overlaid HUD (repo/metric chips,
  hub chips, activity feed, legend, CI banner) instead of a panelled layout.
- All user-facing copy moved into typed string modules under
  `apps/web/lib/strings/` and swept Korean-first, keeping conventional English
  terms (Dashboard, Graph, Findings, Receipt, Data Brain, verified/inferred).
- The dashboard `<h1>` names the connected repository again alongside the proof
  map title. `e0057dc` had replaced the repo with a fixed title, which left
  every workspace with an identical heading.
- `--faint` raised in both themes to clear WCAG AA (it measured 2.57:1 on the
  code-highlight row in dark and 2.82:1 on `--surface-2` in light).
- Added AA-safe `--brand-text` / `--verified-text` / `--inferred-text` /
  `--info-text` siblings. ADR-009-3's light palette is unchanged and still
  drives nodes, dots, rings and tints; only small text uses the darker sibling.
  Open as OQ-009.

#### Fixed

- Force-panel HUD card cleared the graph controls strip by only 4px, and the
  strip's position tracks the title band's height — any copy change could put a
  control under another control. Reserve widened and locked with geometry
  assertions at three viewport sizes (OQ-007).
- E2E interactions could land before hydration on server-rendered controls and
  be silently discarded. The suite now waits for definite hydration signals, and
  a Playwright global setup compiles every route before the workers start, which
  removes the cold-dev-server race that made `live-graph.spec.ts` flaky.

#### Verification

- vitest **416 passed / 64 files** (up from 404; no existing test weakened).
- Playwright **49 passed / 49**, three consecutive runs, two from a cold server.
- `pnpm lint --max-warnings=0` and `pnpm typecheck` green.
- 500-node frame plan **p95 0.385ms** against a 16.7ms budget; worker tick +
  encode p95 1.113ms against 33.3ms.
- Graph-route client JS **411.3KB gz** including every lazy Pixi chunk, inside
  the 450KB budget (160.2KB gz is render-blocking).
- axe-core `color-contrast`: **0 violations** on dashboard and findings in both
  themes.

#### Known open questions

`spec/OPEN_QUESTIONS.md` OQ-002 … OQ-010. Still open at the end of this phase:
OQ-004 (amber carries two meanings), OQ-006 (canvas keyboard access at 600 hit
targets, unmeasured), OQ-007 (HUD corridor constants), OQ-008 (`/auth/*` and
`/app/*` unreachable without Supabase, so their contrast is unverified), OQ-009
(ADR light palette vs AA), OQ-010 (`specproof` naming still throughout the code
and user-visible demo strings).
