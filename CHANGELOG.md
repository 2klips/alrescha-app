# Changelog

Notable changes to `arr-app`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project has no released
versions yet, so entries are grouped by delivery phase.

Per-todo evidence lives under `.omo/evidence/` — see
[`.omo/evidence/phase2a/INDEX.md`](.omo/evidence/phase2a/INDEX.md) for this
phase.

## [Unreleased]

### Phase 2C — 실물 기동: 실데이터 배선 · 실기 연동 · 동결 실험 · 배포 (2026-08-31)

Plan: `spec/BUILD_PLAN_PHASE2C.md` (11 todos, all delivered — the last
remainder, the judge/coach/pack runners, closed on 2026-08-31 with `pack`
held as a reserved kind under OQ-021). Governing decisions:
ADR-013 (scope boundaries), ADR-014 (symbol provenance), ADR-015 (assurance
from server-observed evidence only). Per-todo evidence:
`.omo/evidence/phase2c/`.

#### Added

- **Real-data wiring (Wave 1)**: Supabase loaders for `/inspection` and
  `/team` plus the authed `/app/*` screens — empty workspaces render
  "insufficient evidence", never demo fixtures; `record_ruled_out` MCP tool
  persists ruled-out hypotheses append-only (UPDATE/DELETE rejected at the
  schema level); live auth screens pass axe AA in the e2e suite.
- **Live GitHub pilot (Wave 2)**: install → push → webhook (signature
  verified) → scan → analyze → commit card `assurance=full` → verified
  receipt — first locally, then re-run end to end in production (`00d8f27`).
  The pilot surfaced real defects fixtures could not: the scan-plan jsonb
  encoding bug (fixed with a seam regression test), the missing worker
  entrypoint (`run-local.ts`), and the then-missing analyze handler + receipt
  issuance (implemented with digest verification and tamper detection).
- **Frozen experiments (Wave 3, executed under the Phase 3 plan)**: benchmark
  v3 attempt 4 is the valid release — 600/600 trials, interval gates MET on
  all three scopes (pooled accuracy Δ +8.69pp [3.86, 13.43], tokens −67.39%
  [63.67, 70.19]); site accuracy claims restored (`743ff8d`). VIBE injection
  112 trials: V1 adopted, V5/V6 rejected, the rest pending (OQ-020 —
  unobservable in a QA-shaped harness). Coaching charged through the credit
  ledger with refund-on-failure and idempotent retries proven on a real DB.
- **Worker runners completed (todo 5 close-out, 2026-08-31)**: the judgment
  runner is registered on its existing store; the coaching runner gained its
  missing stack — Anthropic/OpenAI coaching providers with the deterministic
  ceilings carried in-prompt, a BYOK-aware loader, and
  `PostgresCoachingJobStore` persisting valid rubrics onto
  `prompt_records.rubric` and schema-invalid outputs into the append-only,
  never-billed `prompt_coaching_attempts` log
  (`202608310001_prompt_coaching.sql`). The `pack` kind turned out to have no
  producer or semantics anywhere — held as a reserved kind that fails loudly,
  pending OQ-021.
- **Judge/coach enqueue surfaces (same-day follow-up)**: `/app/inspection`
  gained a live-only judgment panel (open findings → `AI 확정`), `/app/team` a
  personal coaching panel over the viewer's OWN records only, with the graded
  rubric flowing back into the team view's coaching card. Both buttons call
  security-definer SQL (`202608310002_judgment_coaching_enqueue.sql`) that
  owns the rules the UI must not be trusted with: open-only findings and the
  §14 kind mapping, ADR-011's own-author + raw-consent checks, BYOK-zero /
  credits pricing (10 and 1), and one job per target via idempotency keys —
  proven by seven service-role database tests.
- **Retry after terminal failure (2026-09-02)**: a repeat request after a
  `failed`/`cancelled` judgment or coaching job now mints the next key
  generation (`…:r1`, `…:r2`) — a fresh job with its own reservation and
  settlement — while live and succeeded attempts still resolve to the
  existing job. Coaching queue rows carry only the record id: the worker
  reads the raw prompt text at run time through a live raw-sync consent
  (ADR-011), and the inspection/team panels show each target's latest job
  state (처리 중 · 완료 · 이전 시도 실패 — 다시 요청).
- **Requirement disambiguation surface (2026-09-02)**: the third §14 judgment
  kind gets its enqueue path — `/app/inspection` lists active requirements
  with the latest verdict (중의적 · 명확 · 요구사항 아님 + explanation) and hands
  each to `enqueue_requirement_judgment_job`, which sends the strict request
  with a neutral baseline (0.5 / low), the statement and its source as
  context, and the same retry generations; requirements themselves are never
  rewritten — the judgment row is the deliverable.
- **Requirements persisted (OQ-023 ⑴, 2026-09-02)**: the analyze job now
  writes the requirements it extracts as graph rows — a `requirement` node
  plus a `requirements` row keyed to its spec artifact, with a content-derived
  ULID-shaped id so re-analysis converges — and marks requirements the
  documents stop stating as `superseded` rather than deleting them. This
  fills the map's requirement layer, MCP requirement data and the
  disambiguation panel, all of which were structurally empty in production.
- **Test-fixture directories excluded from scanning (2026-09-02)**: nothing
  under a `fixtures/`, `__fixtures__/` or `testdata/` segment is an artifact
  any more — a spec or rule file there describes a sample repository, and the
  first persisting analyze had turned `fixtures/drifted-demo`'s synthetic
  MUST statements into 90+ live requirements. Whole-segment match only;
  previously stored fixture artifacts fall out on the next scan. Verified in
  production (14 fixture artifacts → 0, 113 → 99 requirements), which exposed
  that removing an artifact node cascades into the requirement _rows_ but
  leaves their _nodes_ orphaned; `reconcileRequirements` now sweeps
  requirement nodes that have no row.
- **Pre-rename receipts verify again (OQ-022 ⑴, 2026-09-02)**: receipts are
  read back through a stored-shape schema whose `tool.name` accepts the
  legacy `arr` next to `alrescha`; issuance stays pinned to `alrescha`, and
  `verifyInTotoStatement` now reports `toolName`. All 28 production receipts
  (12 legacy) verify against their stored digests.
- **Live receipts surface `/app/receipts` (2026-09-02)**: the workspace's own
  receipts, read through RLS and re-verified on the server against the stored
  digest — verified / tampered / invalid shown as computed, pre-rename issuers
  labelled, unreadable rows kept visible. Commit cards and the shell header now
  link here instead of the demo chain. OPEN_QUESTIONS status drift cleared
  (OQ-004 obsolete, OQ-009 → ADR-010, OQ-011 → ADR-012).
- **Perf research mid-term wave 1 (2026-09-03)**: three items off the
  2026-08-27 hot-path report, each shipped with a before/after measurement and
  a script anyone can re-run (`.omo/evidence/perf/`). MT-4 caches the graph
  frame invariants and skips idle animation frames — a settled, untouched
  3,500-node map went from 120 painted frames per 120 ticks to 0, and the
  far-zoom frame plan from 1.846 ms to 0.103 ms p50. MT-10 hoists the 22 MCP
  tool definitions out of the per-request server factory — `tools/call` 3.242
  ms → 1.415 ms p50 against an in-memory store, with no session state added.
  MT-3 fetches scan blob bodies eight at a time instead of one, cutting a
  600-file first scan from 9,386 ms to 1,170 ms at a stated simulated 5 ms per
  request, with the plan proven byte-identical at every concurrency setting.
  MT-1 had already shipped in `ef15ff5`. Selection and the eight deferred
  items: `.omo/evidence/perf/midterm-wave-1.md`; the remaining MCP
  registration cost is OQ-024.
- **Production (Wave 4)**: Supabase (Seoul) + Vercel `arr-app-web.vercel.app`
  (web, hosted MCP route, webhooks) + Fly.io `arr-worker` drain loop; receipt
  `predicateType` finalized on the production namespace together with the
  WORK_SPEC §13 reserved fields; rollback procedures documented
  (`docs/DEPLOYMENT_RUNBOOK.md`).

#### Verification (todo 11)

- vitest 935 passed / 1 skipped; Playwright e2e 120 passed — the full suite
  against a running local Supabase stack; `eslint --max-warnings=0` and
  workspace-wide `tsc --noEmit` clean; `verify-scope-boundaries.ts` PASS (12
  boundaries, 285 files, 0 forbidden paths); `adr-guardrails.ts` PASS.
  Violation-seeding self-tests are part of the vitest run
  (`tests/scope-fidelity.test.ts`, `tests/adr-guardrails.test.ts`).
- The full-suite run itself caught and fixed four latent regressions that
  the DB-less subset gates of 08-28/08-30 could not see: dark-mode AA
  contrast on highlighted code-row line numbers (now `--muted`, with a new
  composite-contrast assertion in `tests/design-tokens.test.ts`), the map
  force panel overlapping the graph controls strip and intercepting node
  double-clicks (HUD reserve 16rem → 18rem), and an ambiguous library search
  locator after the AppShell pass (scoped to the filter form).

#### Next-phase candidates

- CI artifact assurance ADR (OIDC provenance design) — deferred until a
  demand signal, per the Wave 5 note.
- Receipt detail routing from commit cards, custom domain alias once the
  registrar transfer lock clears (2026-10-25), and the OQ-019/OQ-020/OQ-021
  judgments (tree-sitter, session-shaped VIBE harness, the reserved `pack`
  kind).

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
  extraction (tree-sitter declined — ADR-014), handoff/session files classified
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

#### Post-phase decisions

- **ADR-014** (OQ-015): tree-sitter declined — an optional parser dependency
  would let the same commit yield different symbols per environment, breaking
  the ADR-013 CLI/GitHub equivalence. Artifacts now record which engine read
  them (`metadata.symbolEngine`).
- **ADR-015** (OQ-016): assurance is issued only from server-observed
  evidence, so the metadata-only local ingest path stays **graph-only** — it
  records a run but never findings or a receipt. Commit cards carry an
  `assurance` scope (`full` / `graph-only`) and say why a receipt is absent
  rather than showing an unexplained blank; a twelfth scope boundary
  (`client-submitted-assurance`) keeps the ingest path from accepting
  client-computed findings later. CI-artifact partial assurance is deferred,
  not rejected — it needs provenance attestation (OIDC) first.

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
