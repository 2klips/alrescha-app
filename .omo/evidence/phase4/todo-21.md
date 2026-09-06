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

---

## Closing the todo (2026-09-06, second pass)

**Scope:** `packages/core/src/progress/beads.ts` (new),
`packages/core/src/progress/todos.ts`,
`packages/core/src/ingest/{repository-config,repository-scanner}.ts`,
`packages/core/src/index.ts`, `tests/todo-recognition.test.ts` (new),
`apps/web/lib/strings/inspection.ts`, `apps/web/lib/inspection/fixtures.ts`,
`apps/web/app/ui/inspection-view.{tsx,test.tsx}`,
`apps/web/app/styles/screens/inspection.css`,
`apps/web/lib/mcp/supabase-store.{ts,test.ts}`,
`tests/e2e/{inspection,a11y-contrast}.spec.ts`.

### Todo recognition — 8 of 8, where the bar was 7

The pilot measurement was that the scan recognised three of the eight
conventions teams keep tasks in, and the five it missed are the ones written
by the tools people actually use.

| Convention | Example | Before | Now |
| --- | --- | --- | --- |
| `TODO.md` | `TODO.md` | ✅ | ✅ |
| progress ledger | `docs/progress.md` | ✅ | ✅ |
| handoff/session note | `HANDOFF.md` | ✅ | ✅ |
| numbered handoff | `docs/2026-09-06-handoff.md` | ❌ | ✅ |
| spec-kit tasks | `specs/001-auth/tasks.md` | ❌ | ✅ |
| `PLAN.md` | `PLAN.md` | ❌ | ✅ |
| `BACKLOG.md` | `BACKLOG.md` | ❌ | ✅ |
| beads export | `.beads/issues.jsonl` | ❌ | ✅ |

Three decisions worth stating.

**Names are anchored at the start of the filename.** `plan` and `tasks` are
common words; a rule that matched them anywhere would have relabelled half of
`spec/`. `spec/BUILD_PLAN.md` is still a spec, `docs/planning-guide.md` is
still prose, and the test says both.

**`.beads` gets its own reader.** A beads export is JSON lines, not prose, so
reading it with the markdown parser would have produced one todo for the
whole file. The reader is 90 lines and buys the thing markdown cannot give:
identity. A checkbox is keyed by a hash of its title, so retitling it loses
the todo; a beads issue carries an id that survives a retitle, a reorder and
a move, and the test proves it by rewriting the file and finding the same
key. Beads' `blocked_by` stays out of `parentKey` — a dependency is not a
nesting, and flattening it would put a claim in the graph beads never made.

**A repository's `.alrescha.json` beats every filename rule but four.**
`todoFiles`/`progressDocs` were parsed since Wave A and never acted on; they
now classify. They do not override `AGENTS.md`, `CLAUDE.md`, `SKILL.md` or a
Cursor rule, because the instruction-cost table is built from those four and
a repository that could relabel its own always-loaded files would take them
out of its own bill.

### The risk widget

`dashboard.risk` had entries, a state and its unmeasured signals since the
first pass, and nothing rendered them. It renders now: rank, path, level
chip, the `inferred` badge, and every factor with the sentence that explains
it. Three choices:

- **The score is a `data-score` attribute, not print.** A rank answers "what
  first"; three decimal places of a weighted sum would read as a precision
  none of these signals has. The e2e reads the attribute and asserts the list
  descends, so the ordering is still checkable.
- **The cut is stated.** `상위 N개 · 전체 M개` under the list, so a truncation
  at ten is never silent.
- **`unmeasured` is a dashed grey line, deliberately unlike the level chips.**
  The demo has no coverage report, so it says so. "Measured, and clean" and
  "nobody looked" are different answers and only one is reassuring.

The demo fixture builds its map with `buildRiskMap` rather than writing
entries out, and passes the *same* audit JSON to both widgets — a risk map
calling a manifest risky beside an audit widget reporting nothing would be a
screen contradicting itself. Its clock is fixed at `2026-08-20`, because
co-change decays by age and a demo that read the wall clock would re-rank
itself every week.

e2e: `/inspection` is now in the axe contrast sweep (both themes, 0
violations) as well as `/app/inspection`, because a fresh workspace has
nothing to rank and the widget's colours would otherwise never reach axe.

### A bug the e2e caught, which nothing else could

`loadWorkspace` fires fifteen queries in one `Promise.all` and names the
answers by position. The previous commit added `todos` in the middle of the
array and left its name at the end of the destructuring, shifting every
result after it by one — so the module-summary decoder was handed a todo row
and every MCP read of a workspace holding both answered `Malformed database
row: member_digest`. No unit test held both tables at once, so nothing failed
until an end-to-end agent session ran.

Fixed, and guarded: `supabase-store.test.ts` now gives five tables a row only
they could have produced and asserts each arrives in its own field. Putting
the bug back makes that test fail with the production error, which is the
only way to know a guard guards anything.

### Verification

- `npx vitest run` — 173 files, 1,538 passed, 1 skipped
- `npx playwright test` — 136 passed, 1 skipped
- `pnpm lint`, `pnpm typecheck` (root + six workspaces) — clean
- `verify-scope-boundaries` — PASS, 12 boundaries, 351 files

### Still open

- **PageRank over the whole import graph, not per-repository.** Unchanged
  from the first pass: one repository per workspace makes it moot today.
- **The `todoFiles`/`progressDocs` distinction is not acted on.** Both feed
  one classification because the graph has one `todo` kind. What a repository
  plans to do and what it recorded doing differ in the checkbox states, not
  in what the file is — but if that turns out to matter, the setting already
  carries the answer.
