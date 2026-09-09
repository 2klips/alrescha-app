# Phase 4 · Wave A · todo 1 — implements edges, code anchors, untested-code

**Date:** 2026-09-04 · **Scope:** `packages/core` (rules, progress dashboard),
`apps/worker` (analyze job + Postgres store),
`apps/web` (map loader, graph model, progress report, MCP store, strings),
`packages/mcp` (finding contract), `supabase/migrations/202609040002_finding_code_anchor.sql`.

## What could not be answered before

1. **Requirement coverage was not low, it was unmeasurable.** `reconcileRequirements`
   wrote requirement nodes and rows and no edge at all, so every requirement was
   an isolated node. `/app/progress` divided zero by ninety-nine and printed
   "0%", which reads as "nothing is implemented".
2. **No finding could sit on a code node.** A finding anchors on the span that
   raised it, and five of the six rules read documents. A repository whose risk
   lives in code had an empty risk view however bad its state was.
3. **No rule fired without a document.** All six required a spec, ADR or
   instruction file, so the target user's repository — README, TODO, code —
   produced nothing.
4. **`get_findings` answered the wrong question.** No default status, so
   resolved history came back with open work, and the severity sort compared
   strings: `critical` after `high`, `low` above `medium`.
5. **MCP flattened finding provenance.** The store recognised
   `{sourceArtifactId, span}` and otherwise collapsed the row to `{reason}` —
   and the analyze job writes neither shape, so every production finding
   reached an agent as "deterministic stale-doc rule" with no path or line.

## What was measured

Full local scan of this repository (resolver generation 2, `mode: "full"`):

| Measure                            | Value                                |
| ---------------------------------- | ------------------------------------ |
| Artifacts / code artifacts         | 499 / 473                            |
| Paths with an incoming `tests` edge | 171                                  |
| Findings, total                    | 213 (was 110 without `untested-code`) |
| — of those, carrying a code anchor | 108                                  |
| — of those, `verified`             | **0**                                |
| `untested-code` firings            | 103 (21.8% of code artifacts)        |
| Requirements extracted             | 127                                  |
| `implements` links / distinct targets | 8 / 6                             |

Fixture firings, pinned as snapshots in `tests/assurance-rules.test.ts`:

- `fixtures/drifted-demo` — `src/api/health.ts`, `src/audit.ts`. Not
  `src/session.ts` (same-named test **and** a `tests` edge), not
  `tests/session.test.ts`, not `vitest.config.ts`.
- `fixtures/layout-variants/monorepo-aliases` — 6 of 7 files; the package
  barrel `packages/core/src/index.ts` is excluded as a module entry point.
- `fixtures/layout-variants/next-fastapi` — 5 files across both languages;
  `backend/app/api/routes.py` and `frontend/lib/format.ts` are covered by
  `tests` edges, `__init__.py` and `components/index.ts` are entry points.

### The estimate this corrects

R5 §2.5 estimated ~120 `implements` edges for this repository. The measured
number is **8** over 127 requirements. The derivation is the one the
`missing-implementation` rule already used — a camelCase token in the
requirement statement whose declaring file is unambiguous — and this
repository's specs mostly cite paths, class names and method names rather than
top-level exports. A path-reference variant was measured before being dropped:
it added 4 links. Requirement coverage therefore leaves "not measured" and
lands at a low percentage that reads as a coverage rate when it is a link
rate; both the widening and the label are recorded as **OQ-045**.

One derivation change was worth its keep on its own: a symbol re-exported by a
barrel used to make the name ambiguous, which is most of a monorepo's surface.
Preferring the declaring file (`kind !== "export"`) takes this repository from
743 to 1,234 unambiguously owned names out of 1,246.

## What is deliberately not claimed

- **No `verified` promotion.** `implements` edges are `reference` tier at
  confidence 0.6 with `method: "symbol-owner"`; `untested-code` is `inferred`,
  severity `low`, confidence 0.6. `SUPPORTING_RELATIONS` promotes a target only
  when the *source* is execution evidence, and a requirement is not — asserted
  directly in `tests/workspace-map.test.ts` ("implements edges never promote a
  node to verified") and repository-wide by the measurement above (0 verified
  findings).
- **No `untested-code` precision claim.** "No test was found" is not "no test
  exists". The copy stays at R5 §4.3's "risk candidate" until the top-10
  precision bar (≥0.70, human-labelled) is measured.
- **No code body, anywhere.** The rule reads `exportedSymbols` and paths only.
  Its provenance carries the symbol's line from stored metadata and an **empty
  excerpt**, asserted per finding; `assuranceSourceRequired` is unchanged, so
  the analyze job still fetches only documents and test files
  (`apps/worker/src/analysis-job.test.ts` pins the fetch set).
- **No new billing path.** Everything here is deterministic, credit 0.

## Coverage semantics

`ProgressMetric` now carries `basis: 'measured' | 'no-links' | 'no-data'`.
Requirement coverage is `no-links` when active requirements exist and the
repository has no `implements` edge at all — percent `null`, copy
"미측정 — 구현 링크 없음". A repository that *has* links but covers none of its
active requirements still reports a measured 0%: that zero is a measurement.
The UI test that pinned the false 0% was flipped first and failed for the right
reason (`expected '0%' to be …noLinks`) before any implementation landed.

Commit entries on the progress timeline now read the receipt's own
`predicate.coverage` instead of repeating `Receipt recorded for <sha7>`. The
label says "구현 체크됨", not "구현 verified" — `implVerified` counts checked
boxes and present symbols, which is not execution evidence (WORK_SPEC §3-1,
OQ-036).

## Persistence

`202609040002_finding_code_anchor.sql`:

- `findings.target_node_id`, nullable, with a tenant-scoped FK using
  `on delete set null (target_node_id)` — only that column is nulled when the
  code node goes, because the finding belongs to its source and the tenant
  columns beside it must not be nulled.
- `findings_kind` extended with `untested-code`.
- Partial index on open findings by target.

`implements` edges are written inside the same transaction as the requirement
nodes they hang off (both endpoints are foreign keys onto them) and reconciled
the same way findings are: a link this analysis no longer derives is deleted,
scoped to edges whose source is one of this repository's requirement rows — the
concept layer's `implements` edges are untouched, asserted in
`tests/requirements-persistence.test.ts`.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(142 files, 1,102 passed, 1 skipped — 36 more than the 1,066 at todo 0),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
311 files). Two-path equivalence (`tests/local-ingest.test.ts`) is unchanged
and green.

No assertion was weakened. Four expectations were widened to a new truth, each
with a stronger positive assertion beside it:

- the fixture manifest comparison now filters to the six documented drift types
  and asserts the total equals manifest + the exactly-listed `untested-code`
  findings, so the engine's whole output is still pinned;
- removing the fixture's only test file adds two findings, not one, and the
  three `untested-code` targets are listed;
- every finding's source node is asserted per kind rather than as a blanket
  `node-spec`;
- the map's rationale node is asserted to be `rationale` **and** to share an
  area with the code file it annotates.

## Not verified here

- **Playwright.** No Docker daemon on this machine, so the e2e suite cannot
  run at all. The progress screen was checked in the browser instead against
  the dev server: `/progress` renders the demo report (요구사항 커버리지 60%,
  todo 완료율 25%), and the longer unmeasured copy was measured in place —
  `strong` right edge 607px inside a 627px card, `scrollWidth == clientWidth`,
  so it does not overflow the metric card.
- **e2e specs that still owe a run on a machine with Docker:**
  `progress-dashboard`-touching specs and the map/graph specs listed in todo 0
  (`brain-map`, `graph-facets`, `live-graph`, `workspace-map`, `dashboard-hud`),
  plus `local-ingest-card.spec.ts`.
- **`untested-code` precision and `implements` precision** — both are R5
  quality bars (≥0.70 top-10, ≥0.80 implements) needing human labelling.
- **The `unknown` node type has no production sighting**, by design: the
  loader now orders `artifacts` and `graph_nodes` by the same key so the
  fallback should never fire. todo 3's acceptance criterion (2,001 seeded
  nodes, `unknown` 0) is where that gets proven at scale.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
