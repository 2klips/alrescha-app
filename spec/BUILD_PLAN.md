# specproof - Work Plan (v3.3, Data Brain + assurance SaaS)

> **v3.3 (ADR-006):** positioning is "solo vibe coders **and teams**" (MVP ships solo; team UI is the top post-MVP item). New-project onboarding tells users to push to GitHub first; public repos still get a private-to-owner workspace. Adds to MVP: a **progress dashboard** (progress %, todo board, recent-work timeline) fed only by TODO-doc parsing + a structured `log_progress` format (≤150 tokens/call target, no verbose journaling, no per-turn reminders); a **harness dashboard** (inventory of skills/rules/plugins/MCP configs with per-agent load status + the existing lint tables, one screen); a **personal library** (save/browse harness assets across projects — import-via-PR is Phase 2); and a **`query_brain` structured-query MCP tool**.

> **v3.1 (ADR-004):** the main dashboard is a full-bleed second-brain graph with HUD; a deterministic data index serves agents over MCP (`search_index`/`get_artifact`); MCP read calls emit access events that make graph nodes glow like neurons in realtime. Assurance (drift findings, receipts) stays as the paid differentiator, integrated as node badges and HUD panels.
> **v3.2 (ADR-005):** the knowledge system is named the **Data Brain** — evidence-graph DB + LLM-Wiki layer (crosslinks/backlinks + `inferred` summaries, on-demand only) + data index + on-demand MCP serving — built as "the most efficient project-specific DB". Its one claim ("same task, higher accuracy, fewer tokens") must be PROVEN by a mandatory **A/B efficacy benchmark** (todo 20, gate F5): same tasks run by the same agent with vs without the Data Brain, measuring graded accuracy and token usage. All efficiency claims anywhere cite this report only.

> Supersedes v2 (local-CLI assurance, archived at `.omo/plans/archive/docshub-local-cli-assurance-v2-REFERENCE-for-phase2.md`) and v1 (hub-first web SaaS, archived at `.omo/plans/archive/docshub-web-saas-hub-first-REFERENCE-for-phase2.md`). Governing decisions: `planning.md` ADR-001 + ADR-002 + **ADR-003** (2026-08-09). Market evidence: `RESEARCH_UPDATE_2026-08-09.md`. Reuse the archives: v1 for infra patterns (GitHub App, workers, credits), v2 for engine semantics (drift rules, receipts, verified/inferred).

## TL;DR (For humans)
DocsHub Phase 1 is a **GitHub-first assurance web SaaS** for solo vibe coders: connect a repository once via GitHub App, and **every push gets analyzed automatically** — the server scans specs, ADRs, and agent-instruction docs plus code metadata, and the web dashboard shows **where the code has drifted from what the docs promise**, requirement by requirement, with source-span evidence and honest `verified` vs `inferred` labels. Agents plug into a **DocsHub-hosted MCP server** (2026-07-28 stateless) to fetch on-demand context packs and findings — static context files carry only a minimal index (ETH-compliant), proposed via PR only.

**What you'll get:** GitHub App install + webhook-driven scans, a deterministic-first drift engine (missing-implementation / missing-test / stale-doc / contradicting-instructions / orphan-doc / unproven-claim), CI test-report ingestion for `verified` test evidence, a web dashboard (repo health, findings, instruction lint with token costs, evidence graph, receipts), commit-linked in-toto-shaped receipts, hosted MCP with per-user tokens, credit-billed + BYOK AI-judgment steps, and opt-in pilot instrumentation.

**Why this approach:** Assurance is the whitest space among 21 researched competitors (Tessl $125M proves WTP; nobody tracks requirement→implementation→test per commit). "Push to GitHub → analyzed" removes all install friction for vibe coders (no CLI, no workflow YAML). The engine is deterministic-first, so server COGS stays low; AI judgment alone is credit-billed (hybrid decision) or BYOK.

**What it will NOT do (Phase 1):** No local CLI (Phase 2), no team workspaces (schema is team-ready, UI is solo), no direct/autonomous repo writes (advisory PR proposals only), no skill marketplace or security scanning of skills, no always-loaded generated context, no payment provider integration (internal credit ledger only), no support for Git providers beyond GitHub.

**Effort:** XL
**Risk:** High - private-repo trust and data boundaries, webhook/job reliability, requirement-extraction noise, honest verified/inferred separation, hosted-MCP auth, and credit-safe AI jobs are all load-bearing.
**Decisions locked (do not relitigate):** assurance-first MVP; GitHub App + server analysis + web dashboard + hosted MCP (ADR-003); advisory-only writes; CI-report-based test evidence; load-on-demand context core; solo-first; $20-anchor pricing later (internal credits only in Phase 1); MCP 2026-07-28 stateless; verified-vs-inferred policy; in-toto-shaped receipts.

---

> TL;DR (machine): XL greenfield Next.js + Supabase/Postgres SaaS; GitHub App webhook ingestion; deterministic drift engine over docs+code metadata; CI test-report ingestion; solo-tenant web dashboard with findings/graph/receipts; hosted stateless MCP; credit-reserved AI-judgment jobs with BYOK; advisory-only PR proposals; provenance-mandatory findings; no local CLI, no teams UI, no external billing.

## Scope
### Must have
- Next.js + TypeScript monorepo (pnpm): web app, `packages/core` (engine), `packages/mcp` (hosted MCP service); vitest + Playwright; strict TS.
- Supabase auth + **solo workspace** tenancy with RLS; schema designed team-ready (workspace/member tables exist, UI and invites do not).
- Postgres domain model with provenance-mandatory typing: repositories, artifacts, requirements, evidence, graph edges, findings, receipts, runs/jobs, credit ledger, MCP access tokens, GitHub installation state — every edge/finding carries relation type, confidence, source artifact, and source span or explicit reason (NOT NULL).
- GitHub App integration: minimal read-only permissions (contents:read, checks:read, actions:read, metadata) plus optional pull-requests:write solely for advisory index-PR proposals with the permission explained in UI; installation flow, repo selection, webhook signature verification, event normalization, idempotent ingestion.
- Background worker queue for scan/analyze/judge/pack jobs: enqueue/claim/retry/cancel/idempotency keys, tenant isolation, rate limits, webhook-triggered runs, credit reservation/settlement/refund; no credit-consuming job runs synchronously in request handlers.
- Repo scanner over the GitHub API: classify AI-facing artifacts (AGENTS.md root+nested, CLAUDE.md/`.claude/rules/`, SKILL.md folders, `.cursor/rules`, specs, ADRs, TODO/progress docs) and code metadata (paths, exported symbols, spans, digests); raw file contents are fetched transiently for analysis and **not stored by default** — persisted state is docs, metadata, summaries, spans, digests.
- Markdown/frontmatter/link parser (remark/unified): headings, frontmatter, links, task lists, ADR sections, acceptance-criteria blocks, MUST/SHOULD statements, byte/line spans, recoverable diagnostics.
- Requirement extractor: deterministic extraction first (task lists, acceptance criteria, ADR decisions, MUST/SHOULD) with spans; AI-assisted extraction is always labeled `inferred` and never auto-trusted.
- Evidence probes: path/glob existence and exported-symbol presence from scanned metadata (TS compiler API for ts/js, regex-probe fallback with confidence downgrade for other languages); **CI test-report ingestion** from GitHub Actions (JUnit XML / vitest/jest JSON artifacts and check runs) mapped to requirements — test evidence is `verified` only when backed by a parsed report from a run on the analyzed commit; absent CI reports downgrade to `inferred` with a visible explanation.
- Drift rules engine producing typed findings: `missing-implementation`, `missing-test`, `stale-doc`, `contradicting-instructions`, `orphan-doc`, `unproven-claim`; severity + confidence + evidence links + suggested next action; `inferred`-only chains cap at medium severity.
- Harness dashboard (ADR-006): one screen combining ⑴ an **inventory** of discovered harness assets — skills (SKILL.md), rules/instructions (AGENTS.md, CLAUDE.md, `.claude/rules`, `.cursor/rules`), plugin/MCP config files — each with path, which agents load it (per loading rules), always-loaded flag, token cost, linked findings, and a "save to library" action; ⑵ the instruction lint tables: per-file/per-turn always-loaded token cost (tokenizer assumptions labeled), duplication/overlap report, pairwise contradiction candidates with dual spans.
- Progress dashboard (ADR-006, token-frugal by design): progress % (requirement coverage + todo checkbox completion, sources labeled), a todo board (parsed from TODO/progress docs + `log_progress`-created items; open/in-progress/done/blocked), and a recent-work timeline (structured `log_progress` events newest-first alongside commits/finding resolutions). Data sources are ONLY doc parsing + structured events — no AI-invented progress. The logging format (`{task, status, summary≤200chars, refs?}`, ≤150 tokens/call target) ships in the skill/minimal-index as a "once per task unit" instruction — never per-turn reminders, never narrative journaling.
- Personal library (ADR-006, MVP = save/browse only): workspace-global store of harness assets saved from the harness dashboard (type, source repo/path/commit, content snapshot, tags; search + tag filter). Import-into-new-project (PR generation), Data Brain template transplant, and team sharing are Phase 2; public marketplace remains a non-goal.
- Web dashboard (solo): onboarding (sign in → install App → select repo → first scan), then a **graph-centered main dashboard (ADR-004)**: full-bleed force-directed second-brain graph (requirements↔docs↔code↔tests; zoom/pan/drag/search; type and evidence-grade filters; clustered default for large repos, no hairball; canvas/WebGL renderer allowed if React Flow can't hold 60fps at 500+ nodes) with HUD overlays — repo/metric chips top-left, **live agent-activity feed** right (synced to glow, click-to-focus camera), legend + CI banner bottom — plus drift badges on nodes/red dashed broken-evidence edges, and **realtime neuron-glow pulses driven by MCP access events** (2–3s decay, overlapping waves, afterglow for recent activity); plus findings list + detail (spans, evidence chain, verified/inferred labels, next actions), instruction lint view, evidence detail graph (local depth-2 provenance inspection, entered via node double-click), document inventory (light), receipts view, credit usage view.
- **Data Brain (ADR-005):** the per-repo knowledge system combining ① the evidence-graph DB, ② an **LLM-Wiki layer** (deterministic crosslink/backlink graph per document, plus optional judgment-job `inferred` summaries and related-doc caches used ONLY in on-demand serving), ③ the deterministic search index (`index_entries`: title/path/heading/tag/symbol keys + graph-neighbor cache, ranking exact > title/heading > path/symbol > graph proximity; embedding column reserved for Phase 2), and ④ on-demand MCP serving — rebuilt incrementally per analysis at zero credit cost (except optional summaries).
- **Efficacy benchmark harness (ADR-005, mandatory):** a scripted, reproducible A/B harness proving the Data Brain claim — ≥12 pre-registered tasks × 3 trials (implementation / question-answering / drift-judgment types, each with objective grading: test pass, answer manifest, findings manifest) run by the same model+prompt agent in arm A (repo checkout only), arm A′ (naive full-doc dump), and arm B (Data Brain via MCP); measures graded accuracy, input+output tokens, tool calls, wall time; emits a JSON + Markdown report committed to the repo. Hypothesis gate: accuracy non-inferior (+5pp target) AND ≥30% token reduction; on miss, iterate the Data Brain (ranking/pack selection/wiki links) and re-run — results are published as-measured either way, and every efficiency claim in product or marketing cites this report.
- Access events + realtime channel: every read MCP tool/resource call records (token id, tool name, target node ids, ts) into `access_events` fire-and-forget (a logging failure must never fail the tool response) and broadcasts on the workspace realtime channel for dashboard glow; **no prompt or task text stored**; retention 30 days Free / unlimited Pro.
- Receipts: per-analysis append-only records in in-toto Statement shape (subjects = commit SHA + artifact digests; predicate = findings snapshot, verdicts, tool version; `signatures: []` in Phase 1) with a verify endpoint that recomputes digests and flags staleness/tampering.
- Hosted MCP server on the **2026-07-28 stateless spec**: per-user scoped access tokens; resources for project overview, artifact inventory, findings, receipts summary, context packs; tools `request_context_pack`, `get_findings`, `log_progress`, `record_note`; `server/discover`; cacheable lists with `ttlMs`; Streamable HTTP transport; **must not use Sampling/Roots/Logging or protocol sessions**; tools never mutate the repo.
- On-demand context packs: graph-driven doc selection with reading order, omitted-doc rationale, token estimates, target-agent formatting (Claude Code/Codex/Cursor/generic); **minimal-index PR proposal**: a bounded ≤30-line DocsHub-managed section in AGENTS.md (+ CLAUDE.md `@AGENTS.md` wrapper) pointing agents at the hosted MCP, delivered only as a PR the user merges — never inlining doc bodies, never touching content outside managed markers.
- AI-judgment layer: provider abstraction (no vendor hard-coded in core; Anthropic + OpenAI adapters), credit reservation/settlement/refund per job, schema-validated (zod) outputs stored as `inferred`, no charge for failed/invalid outputs, BYOK mode (user keys, encrypted at rest, never logged) bypassing credits; judgments upgrade finding confidence but never to `verified` without execution evidence.
- Internal credit ledger (no external billing): monthly grants, manual/admin top-up records, reservation, settlement, refund, idempotency, per-workspace caps; sources typed so paid billing can attach later without ledger rewrite.
- Opt-in pilot instrumentation: tokens per pack vs naive full-dump baseline, findings opened/resolved across receipts, scan durations, MCP pack requests; "not enough evidence" empty states; no fabricated deltas.
- Drifted-demo fixture repo (importable GitHub fixture + recorded API fixtures) seeded with every finding type and an expected-findings manifest; used by tests, Playwright QA, and the onboarding demo.
- Agent-executed validation suite: unit/integration tests (parser, extractor, probes, rules, receipts, credits, webhook normalization, RLS), MCP contract tests, and Playwright browser QA for onboarding, dashboard, findings, graph, receipts, and MCP setup flows.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No local CLI, no team UI/invites, no external payment provider, no Git providers beyond GitHub, no skill marketplace, no security scanning of skills (platforms own it), no autonomous or direct repo writes — the only repo write path is the advisory index PR proposal.
- No storage of raw private source code by default; transient analysis fetches only, with the boundary documented and tested.
- No always-loaded generated context, no doc-body inlining into AGENTS.md/CLAUDE.md, no auto-generated repo overviews in static files (ADR-002/ETH constraint).
- No opaque AI-only graph edges or findings; nothing `verified` without execution evidence (parsed CI report / probed artifact on the analyzed commit); `inferred` labels visible in every surface including MCP payloads.
- No exact token-savings or performance-improvement claims without instrumentation baselines; estimator outputs always carry stated assumptions.
- No deprecated MCP features (Sampling/Roots/Logging, protocol sessions); no MCP tool that writes to GitHub.
- No unscoped GitHub permissions; every requested permission is minimal and explained in UI at request time.
- No credit charge for vendor-fault failures or schema-invalid AI outputs; no double-charging (idempotency enforced).
- No suppressing type/lint/test failures or weakening tests to green the build.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for parser, requirement extractor, evidence probes, CI-report ingestion, drift rules, token estimator, receipts (schema + verify), webhook normalization/idempotency, credit ledger, RLS/tenancy, MCP resources/tools, AI-judgment schema handling, and index-PR proposal logic. Tests-after for UI layout/visual states, with Playwright browser QA for all user-facing flows.
- Frameworks: Vitest + Testing Library; Playwright for browser flows; API route tests via Next.js handlers; database tests against local Supabase/Postgres or isolated test schema; MCP contract tests via the official TS SDK test client over Streamable HTTP.
- Contract tests: zod schemas for findings, requirements, evidence, receipts (in-toto Statement shape), webhook payload normalization, credit ledger events, AI-judgment payloads, and MCP tool/resource responses; schema-invalid AI payloads must be rejected, recorded, and un-charged.
- Fixtures: `fixtures/drifted-demo/` repo + expected-findings manifest + recorded GitHub API/webhook/Actions-artifact fixtures so the full pipeline tests run offline and deterministic.
- Evidence: `.omo/evidence/docshub-product-strategy/task-N.ext` for each todo, using the todo number in place of `N`; final verification evidence under `.omo/evidence/docshub-product-strategy/final/`.

### Reference ledger
Use these stable reference IDs in todos. If an implementation worker needs newer API syntax, re-query the official docs before coding and record the result in the task evidence.
- R1 Decision log: `planning.md` (ADR-001/002/003) and market evidence `RESEARCH_UPDATE_2026-08-09.md`
- R2 GitHub App permissions: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- R3 GitHub webhooks: https://docs.github.com/en/webhooks/webhook-events-and-payloads
- R4 GitHub contents/commits/pulls APIs: https://docs.github.com/rest/repos/contents , https://docs.github.com/rest/commits/commits , https://docs.github.com/en/rest/pulls/pulls
- R5 GitHub Actions artifacts + check runs APIs: https://docs.github.com/en/rest/actions/artifacts , https://docs.github.com/en/rest/checks/runs
- R6 MCP 2026-07-28 spec (stateless core, transports, auth): https://modelcontextprotocol.io/specification/2026-07-28/changelog and https://blog.modelcontextprotocol.io/posts/2026-07-28/
- R7 MCP TS SDK: https://github.com/modelcontextprotocol/typescript-sdk
- R8 AGENTS.md convention: https://agents.md/ ; Claude Code memory/CLAUDE.md: https://code.claude.com/docs/en/memory
- R9 Codex skills/AGENTS.md: https://learn.chatgpt.com/docs/build-skills ; Cursor rules/skills: https://cursor.com/docs/context/rules
- R10 in-toto attestation (Statement/predicates): https://github.com/in-toto/attestation
- R11 Agent Trace (Phase-2 bridge target): https://github.com/cursor/agent-trace
- R12 Anthropic context engineering (progressive disclosure): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- R13 ETH context-file study (design constraint): https://arxiv.org/abs/2602.11988 ; SkillsBench: https://arxiv.org/abs/2602.12670
- R14 Next.js docs: https://nextjs.org/docs ; Supabase docs: https://supabase.com/docs
- R15 React Flow: https://reactflow.dev/learn
- R16 remark/unified: https://unified.js.org/ ; TS compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- R17 Token counting: https://developers.openai.com/cookbook/examples/how_to_count_tokens_with_tiktoken
- R18 JUnit XML: https://github.com/testmoapp/junitxml ; vitest reporters: https://vitest.dev/guide/reporters
- R19 Archived plans: `.omo/plans/archive/docshub-web-saas-hub-first-REFERENCE-for-phase2.md` (infra patterns), `.omo/plans/archive/docshub-local-cli-assurance-v2-REFERENCE-for-phase2.md` (engine semantics)

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 0: Bootstrap, ADR port + guardrails, fixture repo.
- Wave 1: Auth/tenancy, domain model, GitHub App + webhooks, worker/credit foundation.
- Wave 2: Scanner, parser, extractor + drift rules, evidence probes + CI ingestion.
- Wave 3: Web surfaces — onboarding/dashboard, findings + receipts, graph view.
- Wave 4: Hosted MCP, context packs + index PR, AI judgment + credits.
- Wave 5: Instrumentation, efficacy benchmark, hardening/onboarding/release.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2,3,4,5 | none |
| 2 | 1 | 6,10,11,15,16 | 3 |
| 3 | 1 | 8,10,11,12 | 2 |
| 4 | 1 | 5,6,12 | 2,3 |
| 5 | 1,4 | 6,7,9,13,17 | 2,3 |
| 6 | 2,4,5 | 7,8,12,16 | none |
| 7 | 5,6 | 8,11,17 | none |
| 8 | 3,6,7 | 10,11,12 | 9 |
| 9 | 5 | 10,16 | 8 |
| 10 | 2,3,8,9 | 13,15,16 | 11 |
| 11 | 2,3,7,8 | 13,18 | 10 |
| 12 | 3,4,6,8 | 13,14,19 | none |
| 13 | 5,10,11,12 | 14,18,19 | none |
| 14 | 12,13 | 19 | 15 |
| 15 | 2,4,5,7,10 | 16,17,19 | 14 |
| 16 | 2,6,9,10,15 | 17,18,19 | none |
| 17 | 5,7,15,16 | 18,19 | none |
| 18 | 3,11,13,16,17 | 19 | none |
| 19 | 12,13,14,15,16,17,18,21,22 | final | 20 |
| 20 | 3,15,16,17 | final | 19 |
| 21 | 5,9,15 | 19 | 20,22 |
| 22 | 4,5,8,13 | 19 | 20,21 |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Bootstrap monorepo, tooling, and repo-native agent docs
  What to do / Must NOT do: pnpm workspace with the Next.js app, `packages/core`, `packages/mcp`; TypeScript strict, vitest, Playwright, tsup for packages; root AGENTS.md + CLAUDE.md wrapper (`@AGENTS.md`); `.env.example`. Must not add production dependencies without recording why; must not scaffold a marketing site.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 2,3,4,5
  References: R1, R8, R14.
  Acceptance criteria: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm exec playwright test --list` pass; `pnpm dev` serves the app shell.
  QA scenarios: happy Playwright opens `/` and sees the app shell; failure unknown route shows the not-found surface. Evidence `.omo/evidence/docshub-product-strategy/task-1.md`.
  Commit: Y | chore(repo): scaffold docshub saas monorepo

- [x] 2. Port decisions into repo ADRs and machine-checkable guardrails
  What to do / Must NOT do: Copy ADR-001/002/003 into `docs/adr/` with decision/status/consequences; add guardrail tests for banned patterns (deprecated MCP capabilities, raw-code persistence outside allowlisted transient paths, doc-body inlining in index templates, repo-write calls outside the PR-proposal module, network calls in core without injection). Must not paraphrase decisions in ways that weaken constraints.
  Parallelization: Wave 0 | Blocked by: 1 | Blocks: 6,10,11,15,16
  References: R1, R6, R13.
  Acceptance criteria: `pnpm test -- adr-guardrails` validates ADR files and banned-pattern scans pass.
  QA scenarios: happy guardrail suite green; failure fixture importing MCP sampling fails with a specific message. Evidence `.omo/evidence/docshub-product-strategy/task-2.md`.
  Commit: Y | docs(adr): record github-first assurance decisions

- [x] 3. Build the drifted-demo fixture repo and recorded API fixtures
  What to do / Must NOT do: `fixtures/drifted-demo/` TS project (spec.md, two ADRs, AGENTS.md + nested, `.cursor/rules`, one SKILL.md, TODO.md, code + vitest tests) seeded with every finding type plus an expected-findings manifest (types, spans); recorded GitHub API tree/contents/webhook/Actions-artifact fixtures for offline deterministic pipeline tests; a JUnit/JSON test-report artifact fixture. Must not exceed a size that keeps e2e under 30s.
  Parallelization: Wave 0 | Blocked by: 1 | Blocks: 8,10,11,12
  References: R1, R3, R5, R18.
  Acceptance criteria: manifest schema test passes; fixture tests run producing the report artifact; recorded fixtures replay through the normalization layer.
  QA scenarios: happy fixture pipeline replay end-to-end offline; failure manifest referencing a nonexistent span fails validation. Evidence `.omo/evidence/docshub-product-strategy/task-3.md`.
  Commit: Y | test(fixtures): add drifted demo repo and recorded github fixtures

- [x] 4. Implement auth and solo-workspace tenancy
  What to do / Must NOT do: Supabase auth, personal workspace auto-provisioned per user, RLS policies, server-side authorization helpers; workspace/member tables schema-ready for teams but no invite/team UI. Must not rely on client-only checks; must not expose any cross-tenant read path.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5,6,12
  References: R14.
  Acceptance criteria: database tests prove user A cannot read/mutate user B's workspace, repos, findings, receipts, tokens, or ledger; route handlers return 401/403 correctly.
  QA scenarios: happy Playwright signs up and lands in a personal workspace; failure direct API access to another workspace's repo returns 403. Evidence `.omo/evidence/docshub-product-strategy/task-4.md`.
  Commit: Y | feat(auth): add tenant-safe solo workspaces

- [x] 5. Create the typed domain model and migrations
  What to do / Must NOT do: Postgres schema + zod domain types for repositories, artifacts, requirements, evidence, edges, findings, receipts, runs/jobs, credit ledger, MCP tokens, GitHub installations, **index_entries (search keys + graph-neighbor cache, reserved embedding column), and access_events (token id, tool, target node ids, ts — no prompt text)**; provenance (source artifact + span or reason) and confidence NOT NULL on edges/findings; stable ULIDs; migrations runner. Must not store raw code bodies by default; must not design tables that preclude team expansion.
  Parallelization: Wave 1 | Blocked by: 1,4 | Blocks: 6,7,9,13,17
  References: R1, R10, R14.
  Acceptance criteria: migration-from-scratch test verifies schema, indexes, FKs, RLS; inserting an edge without provenance fails at zod and SQL layers.
  QA scenarios: happy seed script builds a mini evidence graph; failure cross-tenant FK insert fails. Evidence `.omo/evidence/docshub-product-strategy/task-5.md`.
  Commit: Y | feat(data): add evidence-graph domain schema

- [x] 6. Add GitHub App installation and webhook ingestion
  What to do / Must NOT do: GitHub App with minimal read-only permissions (contents:read, checks:read, actions:read, metadata) + optional pull-requests:write requested separately with UI explanation; installation flow, repo selection, installation-token handling, webhook signature verification, event normalization (push, check_run/workflow_run completion), idempotent ingestion. Must not request write/admin scopes beyond the PR-proposal permission; must not process unverified webhook payloads.
  Parallelization: Wave 1 | Blocked by: 2,4,5 | Blocks: 7,8,12,16
  References: R2, R3, R4.
  Acceptance criteria: integration tests with recorded webhook fixtures verify signature handling, idempotency, normalized event records, and permission-scope assertions.
  QA scenarios: happy Playwright completes mocked installation and sees the selected repo pending first scan; failure invalid signature returns 401 and writes nothing. Evidence `.omo/evidence/docshub-product-strategy/task-6.md`.
  Commit: Y | feat(github): connect repositories through github app

- [x] 7. Build background worker and credit lifecycle foundation
  What to do / Must NOT do: Worker queue for scan/analyze/judge/pack jobs with enqueue, claim, heartbeat, bounded retry, cancel, idempotency keys, tenant isolation, rate limits, webhook-triggered runs; internal credit ledger with monthly grants, admin top-up records, reservation, settlement, refund, per-workspace caps; deterministic jobs (scan/analyze) consume no credits. Must not run credit-consuming jobs synchronously in request handlers; must not double-charge on retry.
  Parallelization: Wave 1 | Blocked by: 5,6 | Blocks: 8,11,17
  References: R1, R3, R17.
  Acceptance criteria: tests prove single-claim, bounded retries, safe cancel, idempotent duplicate webhooks, tenant isolation, rate limiting, reservation→settlement/refund correctness, and zero charge on failed jobs.
  QA scenarios: happy push event enqueues scan+analyze and completes with ledger untouched; failure worker crash mid-judgment refunds the reservation. Evidence `.omo/evidence/docshub-product-strategy/task-7.md`.
  Commit: Y | feat(worker): add credit-safe background jobs

- [x] 8. Implement the GitHub-API repo scanner and artifact classifier
  What to do / Must NOT do: Scan selected repo trees via the GitHub API at a given commit: classify AI-facing artifacts (AGENTS.md root+nested, CLAUDE.md/`.claude/rules/`, SKILL.md, `.cursor/rules`, specs, ADRs, TODO/progress docs) and code metadata (paths, exported symbols via TS compiler API on transiently fetched content, spans, digests); incremental rescan by digest/commit diff; persist metadata only. Must not persist raw file bodies by default; must not follow submodules outside the repo; must skip binaries/oversized files with reason.
  Parallelization: Wave 2 | Blocked by: 3,6,7 | Blocks: 10,11,12
  References: R4, R8, R9, R16.
  Acceptance criteria: scanner over recorded fixtures classifies every artifact per manifest with correct types/paths/digests; rescan of an unchanged commit touches zero rows; a storage-boundary test proves no raw code body lands in any table.
  QA scenarios: happy fixture repo scan reports expected counts; failure oversized file skipped with recorded reason. Evidence `.omo/evidence/docshub-product-strategy/task-8.json`.
  Commit: Y | feat(ingest): scan repositories via github api

- [x] 9. Implement Markdown/frontmatter/link parser
  What to do / Must NOT do: remark/unified pipeline extracting headings, frontmatter, wikilinks/relative links, task lists, ADR sections, acceptance-criteria blocks, MUST/SHOULD sentences, with byte/line spans and recoverable diagnostics. Must not use ad hoc regex where the AST serves; must not lose span fidelity.
  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 10,16
  References: R16.
  Acceptance criteria: fixtures cover malformed Markdown, nested lists, mixed link styles, large docs; every element carries a span verified against source bytes.
  QA scenarios: happy structured JSON for fixture spec; failure malformed doc yields diagnostics, not a crash. Evidence `.omo/evidence/docshub-product-strategy/task-9.json`.
  Commit: Y | feat(parser): extract markdown structure with spans

- [x] 10. Implement requirement extractor and drift rules engine
  What to do / Must NOT do: Deterministic requirement extraction (task lists, acceptance criteria, ADR decisions, MUST/SHOULD) with spans; drift rules producing the six finding types with severity, confidence, evidence links, suggested next action; `inferred`-only chains cap at medium severity; AI-assist hooks stubbed until todo 17. Must not emit a finding without provenance; must not double-report the same span.
  Parallelization: Wave 2 | Blocked by: 2,3,8,9 | Blocks: 13,15,16
  References: R1, R13.
  Acceptance criteria: rules over the fixture reproduce the expected-findings manifest exactly (type, span, severity) with zero unexplained extras.
  QA scenarios: happy full scan→extract→check pipeline on fixtures; failure removing a fixture test flips the right requirement to missing-test incrementally. Evidence `.omo/evidence/docshub-product-strategy/task-10.json`.
  Commit: Y | feat(assurance): detect spec-code drift with provenance

- [x] 11. Implement evidence probes and CI test-report ingestion
  What to do / Must NOT do: Evidence probes for path/glob existence and symbol presence from scanned metadata (regex fallback downgrades confidence with reason); ingest GitHub Actions artifacts (JUnit XML, vitest/jest JSON) and check runs for the analyzed commit, mapping test cases to requirements via naming/annotation conventions; report-backed evidence on the same commit is `verified`, everything else `inferred` with a visible "connect CI reports" explanation. Must not execute repo code; must not mark anything `verified` from AI reasoning or stale-commit reports.
  Parallelization: Wave 2 | Blocked by: 2,3,7,8 | Blocks: 13,18
  References: R5, R16, R18.
  Acceptance criteria: probes + report ingestion over fixtures produce evidence records matching the manifest; a report from a different commit is rejected as `verified` evidence with a stated reason.
  QA scenarios: happy artifact fixture ingested and linked; failure malformed JUnit rejected with diagnostics, no partial writes. Evidence `.omo/evidence/docshub-product-strategy/task-11.json`.
  Commit: Y | feat(evidence): ingest ci test reports as verified evidence

- [x] 12. Build onboarding and the graph-centered main dashboard
  What to do / Must NOT do: App-first onboarding (sign in → install GitHub App with permission explanations → select repo → first-scan progress rendered in the graph area) landing on the **full-bleed second-brain graph** (force-directed; zoom/pan/drag/search; node-type and evidence-grade filters; clustered default above a node threshold; canvas/WebGL renderer allowed for 60fps at 500+ nodes) with HUD overlays: repo/metric chips top-left (unresolved findings, impl coverage, test coverage, always-loaded token cost — each click-through to its evidence surface), legend + CI-evidence banner bottom, and drift badges (red ring on nodes with open findings, red dashed broken-evidence edges). The live-activity feed and glow layer land in todo 14. Must not put users through a marketing page; must not render an unfiltered hairball by default; must not show any number that cannot navigate to its evidence.
  Parallelization: Wave 3 | Blocked by: 3,4,6,8 | Blocks: 13,14,19
  References: R1, R14, R15.
  Acceptance criteria: component/route tests cover loading, empty (pre-scan animation), scanning, scanned, failed-scan, permission-error, no-CI-evidence, and large-repo clustered states; graph interaction tests cover search/filter/local-focus; a perf smoke test bounds frame time on a 500-node fixture.
  QA scenarios: happy Playwright onboards with mocked GitHub and sees the fixture graph with drift badges and working HUD chips; failure mocked permission error shows a recovery path. Evidence `.omo/evidence/docshub-product-strategy/task-12.png`.
  Commit: Y | feat(dashboard): add graph-centered main dashboard

- [x] 13. Build findings, instruction lint, and receipts surfaces
  What to do / Must NOT do: Findings list + detail (type/severity filters, source spans rendered against fetched content, evidence chain with verified/inferred labels, suggested next action); instruction lint view (always-loaded token cost table with tokenizer assumptions, duplication/overlap, contradiction pairs with dual spans); receipts view (in-toto-shaped records, verify action, staleness flags). Must not hide `inferred` labels anywhere; must not render receipt verdicts without digest verification state.
  Parallelization: Wave 3 | Blocked by: 5,10,11,12 | Blocks: 14,18,19
  References: R1, R8, R9, R10, R17.
  Acceptance criteria: tests verify filters, span rendering, label visibility, lint table assumptions, and receipt verify states; receipt schema validates against the in-toto Statement model.
  QA scenarios: happy Playwright walks a seeded finding to its evidence and receipt; failure tampered receipt fixture shows a tamper flag. Evidence `.omo/evidence/docshub-product-strategy/task-13.png`.
  Commit: Y | feat(findings): surface drift findings lint and receipts

- [x] 14. Build the live-activity glow layer and evidence detail graph
  What to do / Must NOT do: (a) **Realtime neuron glow**: subscribe the main dashboard to the workspace realtime channel; on each access event pulse the touched nodes (2–3s decay) and animate flow along touched edges, batch-render overlapping events as waves, keep afterglow on recently-touched nodes; add the HUD **agent-activity feed** (tool name, target, relative time) synced to the glow with click-to-focus camera. (b) **Evidence detail graph** (`/graph`, entered via node double-click): local depth-2 view with provenance inspection (span, confidence, grade on edge select), orphan toggle, click-through to findings/docs. Must not drop tool-response latency for event logging (fire-and-forget), must not display events from other workspaces, must not show edges without provenance on hover/detail.
  Parallelization: Wave 3 | Blocked by: 12,13 | Blocks: 19
  References: R1, R14, R15.
  Acceptance criteria: realtime tests deliver a simulated access-event stream and assert pulse state-machine transitions (pulse → decay → afterglow), feed ordering, cross-tenant isolation of the channel, and batching under a 50-events/s burst; UI tests verify local-graph computation and provenance display; pixel checks verify nonblank canvas desktop/mobile.
  QA scenarios: happy a scripted MCP client session makes the fixture graph glow while the feed lists each call and clicking a feed item focuses the node; failure a burst of events stays smooth (no per-event re-layout) and a revoked token's events never appear. Evidence `.omo/evidence/docshub-product-strategy/task-14.png`.
  Commit: Y | feat(graph-ui): add live agent glow and evidence detail view

- [x] 15. Implement the hosted MCP server and data-index tools
  What to do / Must NOT do: `packages/mcp` service on the 2026-07-28 stateless spec over Streamable HTTP with per-user scoped access tokens (created/revoked in settings UI); resources (overview, artifact inventory, findings, receipts summary, context packs) and tools (**`search_index(query, type_filter?)` over `index_entries` with the ranking rules, `query_brain(filter)` for deterministic structured queries over types/statuses/relations (e.g. "requirements without test evidence"), `get_artifact(path|id)` with graph-neighbor summary**, `request_context_pack`, `get_findings`, **structured `log_progress({task, status, summary, refs?})` validating the ADR-006 format**, `record_note`); `server/discover`; cacheable lists with `ttlMs`; tenant isolation on every call; **every read tool/resource call emits an access_event (fire-and-forget) onto the workspace realtime channel**. Must not use Sampling/Roots/Logging or sessions; must not expose repo-mutating tools; must not leak cross-tenant data through caching; must not let event logging failures fail the tool response; must not store prompt/task text in events.
  Parallelization: Wave 4 | Blocked by: 2,4,5,7,10 | Blocks: 16,17,19
  References: R6, R7.
  Acceptance criteria: contract tests via the SDK client validate every resource/tool schema, discover output, ttl behavior, token auth, revocation, tenant isolation, and absence of banned capabilities.
  QA scenarios: happy MCP client with a settings-issued token fetches findings for the fixture repo; failure revoked token returns auth error; cross-tenant resource request denied. Evidence `.omo/evidence/docshub-product-strategy/task-15.md`.
  Commit: Y | feat(mcp): serve context and findings over hosted stateless mcp

- [x] 16. Implement context packs and the minimal-index PR proposal
  What to do / Must NOT do: Graph-driven pack builder (task input → doc selection, reading order, omitted-doc rationale, token estimates with assumptions, target-agent formatting) exposed in web + MCP; minimal-index writer generates a bounded ≤30-line DocsHub-managed AGENTS.md section (+ CLAUDE.md `@AGENTS.md` wrapper) pointing at the hosted MCP, delivered **only as a PR proposal** via the optional pull-requests:write permission; markers idempotent. Must not inline doc bodies or generated overviews into static files; must not touch content outside managed markers; must not commit to any branch directly.
  Parallelization: Wave 4 | Blocked by: 2,6,9,10,15 | Blocks: 17,18,19
  References: R4, R8, R12, R13, R17.
  Acceptance criteria: pack for a fixture task selects expected docs under budget with ranked omissions; PR-proposal test produces a correct branch+PR via mocked GitHub and is byte-idempotent on regeneration; guardrail proves no doc-body inlining or direct-commit path exists.
  QA scenarios: happy user triggers index PR from settings and sees the diff-only proposal; failure missing pull-requests permission shows a grant-or-copy-manually path. Evidence `.omo/evidence/docshub-product-strategy/task-16.md`.
  Commit: Y | feat(context): compose on-demand packs and advisory index pr

- [x] 17. Implement the AI-judgment layer with credits and BYOK
  What to do / Must NOT do: Provider abstraction (Anthropic + OpenAI adapters, none hard-coded in core) running judgment jobs (drift verdict confirmation, requirement disambiguation, contradiction confirmation) through the worker with credit reservation/settlement/refund; zod-validated outputs stored as `inferred` with payload records; judgments upgrade confidence but never to `verified`; BYOK mode (keys encrypted at rest, never logged) bypasses credits; credit usage view in settings. Must not charge for failed/schema-invalid outputs; must not auto-apply severity changes without recording the judgment payload.
  Parallelization: Wave 4 | Blocked by: 5,7,15,16 | Blocks: 18,19
  References: R1, R12, R17.
  Acceptance criteria: mocked-provider tests verify dispatch, reservation/settlement/refund, schema rejection without charge, retry without double-charge, BYOK bypass, and confidence-upgrade rules; a judgment can never flip evidence to `verified`.
  QA scenarios: happy judgment run resolves an ambiguous contradiction candidate and ledger settles once; failure exhausted credits disables judgment jobs gracefully with top-up guidance while deterministic analysis keeps working. Evidence `.omo/evidence/docshub-product-strategy/task-17.md`.
  Commit: Y | feat(ai): add credit-safe judgment layer with byok

- [x] 18. Add opt-in pilot instrumentation and stats
  What to do / Must NOT do: Opt-in per workspace: tokens per pack vs naive full-dump baseline, findings opened/resolved across receipt chain, scan durations, MCP pack-request counts; stats page + JSON export; "not enough evidence" empty states. Must not enable by default; must not fabricate deltas from single data points; must not send data to third parties.
  Parallelization: Wave 5 | Blocked by: 3,11,13,16,17 | Blocks: 19
  References: R1, R12, R17.
  Acceptance criteria: stats over a seeded receipt chain compute documented metrics; single-receipt state renders insufficient-evidence; opt-in gate tested.
  QA scenarios: happy stats after three fixture analyses shows trends; failure stats before opt-in prompts for consent. Evidence `.omo/evidence/docshub-product-strategy/task-18.png`.
  Commit: Y | feat(stats): measure assurance impact per workspace

- [x] 19. Harden security/privacy, onboarding copy, and pilot release checklist
  What to do / Must NOT do: Finalize permission explanations, data-boundary/privacy UI (metadata-only storage, transient fetches, BYOK key handling), rate limits, audit logging of repo-touching actions, GitHub-revoke degradation, error states, seeded demo-repo onboarding path, deployment checklist, pilot recruitment script with baseline metrics capture. Must not ship private-repo access or credit-consuming jobs without clear permission and retention disclosure; must not include savings claims without linking to the user's own stats.
  Parallelization: Wave 5 | Blocked by: 12,13,14,15,16,17,18 | Blocks: final
  References: R1, R2, R3, R4.
  Acceptance criteria: security checklist, privacy copy, deployment checklist, and pilot script exist; full automated + Playwright suites pass; revocation test degrades safely.
  QA scenarios: happy fresh user completes the demo-repo journey end-to-end; failure user revokes the GitHub installation and the app degrades with guidance. Evidence `.omo/evidence/docshub-product-strategy/task-19.png`.
  Commit: Y | chore(release): prepare pilot-ready saas

- [x] 20. Build the Data Brain efficacy benchmark harness and run it
  What to do / Must NOT do: Scripted A/B harness (Claude Agent SDK or scripted MCP client): load a pre-registered task manifest (≥12 tasks × 3 trials over `fixtures/drifted-demo/` plus at least one realistic-scale repo; task types: implementation with test-pass grading, question-answering with answer-manifest grading, drift-judgment with findings-manifest grading), run arm A (repo checkout only), arm A′ (naive full-doc dump), arm B (Data Brain via `search_index`/`get_artifact`/context packs) with the same model and prompts; record graded accuracy, input+output tokens (model-reported), tool calls, wall time per trial; emit deterministic JSON + a human-readable Markdown report (model/version/tokenizer assumptions stated) committed under `benchmarks/`; wire a `pnpm bench:databrain` entry point. Must not cherry-pick tasks or trials, must not aggregate away failed trials, must not hard-code arm-specific prompt advantages, must not present results anywhere without linking the full report.
  Parallelization: Wave 5 | Blocked by: 3,15,16,17 | Blocks: final
  References: R1, R12, R13, R17.
  Acceptance criteria: harness tests verify task loading, grading functions (test-pass, answer-manifest, findings-manifest), per-arm isolation (B cannot leak into A), token accounting from model responses, and report generation; a mocked-model dry run produces a complete report; one real run is executed and its report committed with all trials included.
  QA scenarios: happy `pnpm bench:databrain --dry-run` completes with mocked models and full report structure; failure a task without a grading manifest is rejected at load, and a mid-run provider failure marks the trial failed without corrupting the report. Evidence `.omo/evidence/docshub-product-strategy/task-20.md`.
  Commit: Y | feat(bench): prove data brain accuracy and token gains

- [x] 21. Build the progress dashboard and token-frugal logging format
  What to do / Must NOT do: Parse todo items from TODO/progress docs (checkbox state, spans) into `todos`; extend `log_progress` handling to create/update todo items and feed a recent-work timeline; build `/progress`: progress % (requirement coverage + todo completion, sources labeled), todo board (open/in-progress/done/blocked, each item linked to its span or event), recent-work timeline (events newest-first with commits and finding resolutions); ship the logging format in the skill/minimal-index as a "once per task unit" instruction. Must not fabricate progress from AI inference; must not require narrative journaling or per-turn logging; must not exceed the ≤150-token/call format target in the shipped instruction; must not show a progress number whose source is not labeled.
  Parallelization: Wave 4 | Blocked by: 5,9,15 | Blocks: 19
  References: R1, R8, R17.
  Acceptance criteria: parser tests map fixture TODO docs to todo items with spans; log_progress contract tests validate the format schema (status enum, summary length) and todo linkage; dashboard tests cover empty/partial/full states and source labeling; a token-count test proves the shipped format instruction + one example call stays within the documented budget.
  QA scenarios: happy a scripted MCP session logs three task updates and Playwright sees the board and timeline update with correct states; failure a log_progress call with an oversized summary is rejected with a typed error and no partial todo write. Evidence `.omo/evidence/docshub-product-strategy/task-21.png`.
  Commit: Y | feat(progress): add todo board and frugal work logging

- [ ] 22. Build the personal library (save/browse)
  What to do / Must NOT do: `library_items` flows: "save to library" from the harness dashboard captures type, source (repo/path/commit), content snapshot, and tags; `/app/library` lists items workspace-globally with search and tag filters and shows source provenance; deleting an item never touches the source repo. Must not implement import-into-project, PR generation, team sharing, or any public/marketplace surface; must not store items without source provenance.
  Parallelization: Wave 4 | Blocked by: 4,5,8,13 | Blocks: 19
  References: R1, R2.
  Acceptance criteria: RLS tests prove library items are workspace-private; save captures an immutable snapshot even after the source file changes (digest recorded); UI tests cover save, search, tag filter, and provenance display; scope tests prove no import/PR path exists.
  QA scenarios: happy Playwright saves a fixture SKILL.md from the harness dashboard, finds it in the library by tag, and sees its source commit; failure saving the same asset twice dedupes by digest with a clear notice. Evidence `.omo/evidence/docshub-product-strategy/task-22.png`.
  Commit: Y | feat(library): save and browse harness assets

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: run `pnpm test -- plan-compliance adr-guardrails evidence-coverage job-lifecycle credit-reconciliation` and `pnpm exec tsx scripts/verify-plan-coverage.ts .omo/plans/docshub-product-strategy.md`. PASS means every Must Have maps to at least one test or browser-QA artifact, every Must NOT has a negative assertion (incl. no-raw-code-storage, no-inlining, no-deprecated-MCP, advisory-only writes, verified/inferred separation, no-charge-on-failure), every todo evidence path exists, and the script exits 0. FAIL otherwise. Evidence `.omo/evidence/docshub-product-strategy/final/plan-compliance.md`.
- [ ] F2. Code quality review: run `pnpm lint && pnpm typecheck && pnpm test -- rls auth parser extractor probes rules receipts worker credit webhook mcp github-permissions pr-proposal` plus `pnpm exec tsx scripts/security-audit.ts` (webhook forgery, token/key handling, tenant isolation, transient-fetch boundary, injection in span rendering). PASS means all exit 0 with no high/critical findings. FAIL otherwise. Evidence `.omo/evidence/docshub-product-strategy/final/code-review.md`.
- [ ] F3. Real manual QA: run `pnpm exec playwright test tests/e2e/pilot-flow.spec.ts --project=chromium --trace=on`. PASS means Playwright signs up, installs the mocked GitHub App with permission explanations, selects the fixture repo, watches the first scan, inspects health/findings/lint/graph/receipts, issues an MCP token and fetches a context pack via MCP client, triggers the index PR proposal, runs a judgment job with credit settlement, checks stats opt-in, and verifies a receipt — without assertion failure. FAIL otherwise. Evidence `.omo/evidence/docshub-product-strategy/final/browser-qa.png` plus trace transcript.
- [ ] F4. Scope fidelity: run `pnpm test -- scope-fidelity` and `pnpm exec tsx scripts/verify-scope-boundaries.ts`. PASS means no local CLI, team UI, external billing, non-GitHub providers, marketplace, skill security scanning, direct/autonomous writes, raw-code persistence, always-loaded generated context, deprecated MCP features, or unsupported savings claims are reachable in MVP fixtures. FAIL if any forbidden path is present or uncovered by a negative test. Evidence `.omo/evidence/docshub-product-strategy/final/scope-fidelity.md`.
- [ ] F5. Efficacy benchmark report (ADR-005): verify `benchmarks/` contains a committed report from a real (non-dry-run) execution of todo 20's harness covering every pre-registered task and trial, with per-arm accuracy/token/tool-call/time tables and stated model/tokenizer assumptions. PASS means the report is complete, reproducible (`pnpm bench:databrain` re-runs), and every efficiency claim surfaced in the app or README links to it; if the hypothesis gate (accuracy non-inferior AND ≥30% token reduction) is unmet, PASS additionally requires a documented iteration plan and honest as-measured presentation — claims may never exceed the report. FAIL if the report is missing, partial, cherry-picked, or contradicted by product copy. Evidence `.omo/evidence/docshub-product-strategy/final/efficacy-benchmark.md`.

## Commit strategy
- Conventional commits, one logical slice per todo; do not auto-commit unless the user explicitly authorizes commits in the execution phase.
- Final release notes must state: assurance-first positioning, GitHub-first flow, data boundary (metadata-only persistence, transient fetches), verified-vs-inferred policy, standards conformance (MCP 2026-07-28 hosted, in-toto-shaped receipts, AGENTS.md advisory index), credit/BYOK model, and open Phase-2 items (local CLI, teams, direct/autonomous writes, Sigstore signing, Agent Trace bridge, skill-analysis expansion — see R19).

## Success criteria
- A solo vibe coder can sign up, connect a GitHub repo in one App install, and land on a full-bleed second-brain graph of their project after the first scan — and see their first provenance-backed drift finding as a badge on that graph, with zero local installation.
- When their coding agent reads data through the hosted MCP (`search_index`, `get_artifact`, context packs), the touched nodes glow like neurons in realtime and the HUD activity feed lists each call; events never leak across workspaces and never contain prompt text.
- `search_index` returns ranked, path-addressable results over the fixture repo per the documented ranking rules, and deterministic index rebuilds consume no credits.
- The Data Brain efficacy benchmark has run for real and its committed report shows, task by task, how arm B (Data Brain) compares to baselines on graded accuracy and tokens — and every efficiency number the product or site shows traces to that report.
- The progress dashboard shows todo state and a recent-work timeline sourced ONLY from parsed docs and structured `log_progress` events (every number's source labeled), the shipped logging format stays within its token budget, and the harness dashboard lists every fixture skill/rule/config with per-agent load status.
- A harness asset can be saved to the workspace-private personal library with full source provenance and found again by search/tag — with no import/PR/marketplace path reachable.
- Analysis over the fixture reproduces the expected-findings manifest exactly, and every finding in any repo carries a source span or explicit reason plus an honest `verified`/`inferred` label — in web and MCP surfaces alike.
- Test evidence is `verified` only when a CI report from the analyzed commit backs it; repos without CI reports see a clear explanation and downgraded confidence, never silent fake certainty.
- Receipts form a commit-linked, tamper-evident chain in in-toto Statement shape, verifiable from the dashboard and ready for Phase-2 signing without migration.
- Agents (Claude Code, Codex, Cursor, generic MCP) can authenticate to the hosted MCP with a user-issued token, fetch an on-demand context pack with reading order and omissions, and log progress — while static context files never grow beyond the bounded PR-proposed index.
- Deterministic scans/analyses consume no credits; AI-judgment jobs reserve/settle/refund credits correctly, never charge for failures, and BYOK bypasses credits entirely.
- The only repo write ever produced is the advisory index PR; guardrail suites (no raw-code storage, no inlining, no deprecated MCP, tenant isolation, no-charge-on-failure) all pass.
- Pilot instrumentation can compare context size, findings resolution, and pack usage before any savings claim is made.
