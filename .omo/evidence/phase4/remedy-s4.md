# Phase 4 · Codex remedy S4 — impact that means impact, without moving anyone's floor

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-03 / P0-C on
todos 21 (risk map) and 22 (impact confidence), and resolves the *how* of
OQ-052. **Scope:** `packages/mcp/src/{graph-tools,hosted}.ts`,
`tests/dependency-impact.test.ts` (new), the hosted contract test.

## The answer was proximity wearing the word "impact"

`impact_of` walked an **undirected** neighbourhood, depth 1 or 2, over every
relation, and returned it as the impact of a change. With `A imports B` and
`C imports B`, changing A reached C — and C has never heard of A. It also
travelled through a README that happened to name two files, through a folder
that happened to contain them, and through a statistical co-change.

What a change actually reaches is the set of consumers found by walking
`imports` and `calls` **backwards**, transitively. That is `mode:
"dependency-impact"`, and it is **opt-in**: the default keeps its meaning,
because an existing caller passing the same arguments must get the same answer
(REMEDY §7.3). The report now carries `mode` and `semanticsVersion` so nobody
has to guess which question was answered.

## What the walk does, and what it refuses to do

- **Backwards, over two relations.** A reverse adjacency is built once,
  target → source, restricted to `imports` and `calls`. Everything else is a
  real edge that means something other than "editing this breaks that".
- **Transitive, with a visited set.** A cycle terminates; a re-export chain is
  followed once. `D imports C imports B` puts C at distance 1 and D at 2.
- **Every candidate carries its path.** `via` is one minimal route back to the
  change, nearest edge first, with each edge's family, tier and reason intact
  (S2a). A consumer without a path back would be an assertion.
- **Tests are collected, never expanded through.** A test importing a file
  makes the test related; it does not make everything the test touches part
  of the blast radius (REMEDY §7.1, the test-terminal rule).
- **Budgets are reported, not assumed away.** `complete` is true only when the
  walk ran out of graph; `stoppedBy` says `budget` or `distance` otherwise.
  "I read to depth 2" is not "there is nothing further".
- **They are candidates.** Structural reachability is a list of things to look
  at. Only running something is evidence, and the field is named accordingly.

`omissions` rides along from S2a, so a caller can tell "no `contains` edge
here" from "this view does not carry folders".

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(153 files, 1,278 passed, 1 skipped — 9 more than S3),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
325 files).

`tests/dependency-impact.test.ts` (9 cases) is the acceptance list from R-03,
case for case:

- **shared library** — `A imports B`, `C imports B`: changing A reaches
  nothing, and changing B reaches both A and C;
- **a real chain** — `D imports C imports B` gives distance 1 and 2 with the
  path back spelled out edge by edge;
- **through a README** — a document referencing A and C connects them for the
  neighbourhood mode and **not** for dependency impact;
- **cycle** — `A→B→C→A` terminates, reaches each other node once, and does
  not make the changed node its own consumer;
- **test-terminal** — the test appears in `relatedTests` and contributes no
  further hop;
- **unresolved import** — no edge, no candidate: nothing is invented from
  proximity;
- **omissions** pass through;
- and the **compatibility case**: the default mode still says
  `related-neighborhood` with `dependencyImpact: null`, and the legacy
  `dependents`, `dependencies` and `transitiveNodeIds` are identical in both
  modes.

`packages/mcp/src/hosted.test.ts` calls the tool both ways over the real MCP
transport: the default result is labelled, and the opt-in one arrives with
`complete`, `stoppedBy` and a non-empty `via` on every candidate.

## Not verified here

- **The default has not moved**, and moving it is a separate decision with
  its own observation period (OQ-052 option ⑴, todo 22). Nothing here
  measures how the two answers differ on a real repository.
- **`queries` and `handles` do not propagate.** A code file that reads a table
  is a real dependency, and a route served by a file is a real consequence,
  but both are *projections* with their own meaning rather than hops in a
  blast radius (REMEDY §7.1). `affectedRoutes` is the one projection that
  exists; `affected{tests,docs,requirements,tables}` is todo 22's shape and is
  deliberately not front-run.
- **`get_neighbors` and `trace_path` are untouched.** Their meaning was always
  discovery, and the remedy says to leave it.
- **No confidence or bound labels.** `impact_of` returning
  `confidence{resolved,reference,…}` and `bound: exact|lower-bound` is todo
  22's item; the edges already carry their tiers, and nothing aggregates them
  yet.
- **Symbol-level impact.** A file-level consumer set says the file must be
  looked at, not which function broke. That needs symbol nodes (Wave F).
- **No measurement.** Candidate-set sizes, precision against a real change,
  and the cost of the reverse walk on this repository are all unmeasured.
- **Playwright** (no Docker daemon).
- **A pre-existing flake surfaced on the way.**
  `tests/scan-fetch-concurrency.test.ts:342` asserts the completion order of
  four `setTimeout`s 1ms apart; under the full parallel run 4ms and 5ms
  inverted once, and the case passed on a clean re-run. It is unrelated to
  this change and is flagged as its own task rather than patched here.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
