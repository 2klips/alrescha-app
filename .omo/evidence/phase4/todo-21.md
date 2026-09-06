# Phase 4 · Wave D · todo 21 — a risk map, and a query that can ask for it

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/inspection/risk-map.ts` (new),
`packages/core/src/inspection/dashboard.ts`, `packages/core/src/index.ts`,
`packages/mcp/src/{data-brain,hosted,index}.ts`,
`apps/web/lib/inspection/inspection-report.ts`,
`tests/{risk-map,query-brain-filters}.test.ts` (new),
`tests/inspection-dashboard.test.ts`.

**This todo is a bundle.** The risk map, the `/app/inspection` widget, the
two widget bugs it uncovered, and the `query_brain` extensions are done with
tests. The saved queries, the todo-aware `query_brain(kind:'todo')`,
`log_progress`'s new fields and the `.alrescha.json` todo-file extension are
not started. The boundary is at the bottom.

## What should I look at first

`/app/inspection` could say how many findings were open and which documents
looked stale. It could not answer the question somebody opens it with,
because nothing ranked files against each other.

`buildRiskMap` ranks them on five signals, and three rules keep it from being
a number nobody can argue with:

- **Every entry states its factors, and there is always at least one.** A
  file with no factor is not in the map — not an entry scoring zero. A score
  with no factors is an opinion with a decimal point.
- **Every factor carries a checkable detail.** "3 files import or call this
  file" is something a reader can verify. A PageRank value is not, so
  importance *scores* the fan-in factor and the direct count *explains* it.
- **`grade` is always `inferred`.** None of these is execution evidence, and
  a risk map is a place to look, never a verdict (ADR-001) — asserted even at
  the top of the range.

**What does not propagate risk** (보완 R-03): fan-in reads `imports` and
`calls` reversed and nothing else. A folder containing a file, a README
naming it and a similarity edge are all real edges and none of them means
"editing this breaks that". Co-change is a separate, weaker factor with its
own name, decayed on a 90-day half-life, precisely so it is not mistaken for
a dependency.

**Absence is reported, not scored.** No coverage report and no dependency
audit are named in `unmeasured` rather than counted as clean. This is the
first consumer of todo 18's coverage rows, and it uses them to separate three
states a single boolean would have flattened: a file with a `tests` edge, a
file a coverage report executed, and a file nobody measured. The sentence
says which — "no coverage report has been read" is a different fact from "no
coverage report executed it".

## Two widgets that were lying

Wiring the map into `/app/inspection` surfaced both:

- **`drift-suspected` was unreachable.** Freshness matched a `stale-doc`
  finding's *title* against a document's path, and a stale-doc title names
  the file the document *references* — "The documented `src/auth.ts` source
  reference does not exist" — not the document that references it. Two
  strings about different files, so the state existed and never appeared.
  The finding's span says which document drifted, and todo 19 ⑶ is what put
  the span within reach. The plan called for deleting the state; making it
  correct is better and keeps a UI state the e2e already asserts.
- **Every `untested-code` finding was being dropped.** The loader discards a
  row whose kind the contract does not list, and `InspectionFindingKind`
  omitted `untested-code` — a type the assurance engine has emitted since
  Wave A todo 1. The list is `AssuranceFindingType` verbatim now.

The old test asserted the drift behaviour with a hand-written title
containing the document path — a title the engine never produces. Its fixture
carries a real span instead, and a new case pins that a title mentioning a
document is **not** enough.

**The demo fixture was leaning on the same bug**, which is how it went
unnoticed: `/inspection`'s demo produced `drift-suspected` only because its
hand-written title happened to contain `docs/auth.md`. It carries a span now,
so the demo shows what production will show rather than what the broken rule
happened to produce.

## `query_brain` can ask the new questions

- `sortBy: "risk"` ranks by the same builder the screen uses. It cannot see
  co-change — that is not part of a workspace read — so rather than quietly
  producing a different ranking it names the missing signal in
  `coverage.unanswered`. Two answers to one question is the failure this
  codebase keeps repairing; saying which signals each answer used is how the
  two stay comparable.
- `hasSummary` uses the one freshness rule: stale prose reads as *no*
  summary, because that is what every reader is served.
- `pathGlob` is segment-wise `*` and `**`, with punctuation escaped — a glob,
  not a caller-supplied regex that can backtrack over a repository's worth of
  paths (OQ-054's rule).
- `format: "table"` renders six columns and fifty rows and says how many it
  left out, so a caller narrows the filter instead of assuming it saw
  everything. Cells are single-line; the full label is in `nodes`.

The 보완's negative-query rule already held — `queryCoverage` has reported
`withoutRelations` as unanswered since the bounded-read work — and there is
now a test that says so out loud.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces),
`node --import tsx scripts/verify-scope-boundaries.ts`, `npx vitest run` —
numbers in the session report.

`tests/risk-map.test.ts` (12): the factor contract, a file with nothing
against it left off the list entirely, open findings counted from either end
with dismissed and resolved excluded, fan-in through `imports`/`calls` and
nothing else, a hub outranking a leaf on the same raw count, the three
coverage states, co-change decay over two years, an advisory landing on the
manifest, determinism under input reordering, a non-empty top ten on a
repository with no documents at all, and `inferred` at every score.

`tests/query-brain-filters.test.ts` (10) and five new cases in
`tests/inspection-dashboard.test.ts`.

## Not done

- **Saved queries.** The plan asks for four (untested code, undocumented
  modules, unimplemented requirements, top-ten risk). The filters they would
  be built from all exist now; naming and storing them does not.
- **`query_brain(kind:'todo')`.** Todos are not in `McpWorkspaceData`'s node
  set, so reading them through the brain query needs the store to carry them
  first. Untouched.
- **`log_progress`'s `todo_id`/`repository_id`/`commit_sha` and normalised
  title matching**, and the SQL/InMemory equivalence test that goes with it.
  Untouched.
- **`.alrescha.json` `todoFiles`/`progressDocs`.** The eight-fixture
  recognition target (spec-kit `tasks.md`, PLAN/BACKLOG, handoffs, `.beads`)
  is untouched, so the acceptance criterion "≥7 of 8" is unmeasured.
- **The `domain`, `unit`, `family` and `kind` filters** the plan lists beside
  the ones built here. `domain` and `unit` are already on the artifact card
  (`deriveBrainArea`, `deriveArtifactUnit`) so they are a projection away;
  `family` needs the edge families on a node, which the brain node shape does
  not carry.
- **No React component.** `dashboard.risk` has entries, a state and its
  unmeasured signals, and nothing renders them. The widget the plan says to
  replace is still the drift one — now correct, but not replaced.
- **No e2e, no axe, no Korean sweep.** Docker is unavailable.
- **PageRank over the *whole* import graph, not per-repository.** A workspace
  with two repositories ranks them in one pass. With one repository per
  workspace today it makes no difference; it would need splitting before that
  changes.
