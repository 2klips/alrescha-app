# RE-02 — `search_index` filters before the cap, and says what it left out

**Date:** 2026-09-22 · **Base:** `5d0c709` (PR #25 head, OPEN at the time of
writing) · **Worktree:** `research/re-02-search-accuracy`
**Scope:** `packages/mcp/src/data-brain.ts`, `packages/mcp/src/hosted.ts`,
`packages/mcp/src/index.ts`, `tests/search-accuracy.test.ts` (new),
`docs/reports/research-2026-09-21.probe.re-02.mjs` (new).
Card: [execution plan RE-02](../../docs/reports/RESEARCH_EXECUTION_PLAN_2026-09-22.md).

No migration, no new tool, no new tool input, no library, no pricing change.

## The claim

Four defects in one tool shared one cause: the cap ran before the filters.

1. `searchWorkspaceIndex` cut the ranking to 20 rows and `hosted.ts` applied
   `domain_filter` to what survived. A workspace whose first twenty `auth`
   matches were all frontend answered a backend filter with **nothing** — a
   false negative that reads exactly like a true one.
2. A query with no searchable term tokenised to an empty list, and a
   conjunction over no terms is true of everything, so `!!!` returned the
   first twenty files in the workspace as though they were hits.
3. The tool schema accepts `limit` 1–100 and could not return more than 20.
4. `truncated` subtracted the page from the already-capped list, so the answer
   that dropped five backend files reported that it had dropped none.

## What changed

`searchWorkspaceIndexPage()` is now the one search path: query → type →
domain → limit, in that order. It returns `{ coverage, eligible, omitted,
results }`.

- `eligible` is the candidates **this read reached** that passed every filter.
- `omitted` is how many of those the limit left out; `hosted.ts` reports it as
  `truncated`.
- `coverage` is `partial` when the workspace read stopped at its row budget on
  a table this ranking is built from (`artifacts`, `graph_nodes`,
  `index_entries`, `memory_block_entries`), because `truncated: 0` on a capped
  read would claim to know a global count it cannot know. A cap on an
  unrelated table (`routes`) leaves it `complete`.
- A query that normalises to no token returns an empty page. A blank query
  stays a schema rejection, as it already was.
- `searchWorkspaceIndex()` remains, returning the array its five other callers
  index, capped at the unchanged default page of 20.
- `symbolHitsFor` still runs only over the files the page answers with, with
  the same 8-per-file cap, span and `nodeId`.

## Before / after on the same fixture

20 frontend + 5 backend files, all titled `auth`
(`docs/reports/research-2026-09-21.probe*.mjs`):

| case                              | before | after |
| --------------------------------- | -----: | ----: |
| `domain_filter: backend`          |      0 |     5 |
| `query: "!!!"`                    |     20 |     0 |
| `limit: 100`                      |     20 |    25 |
| `truncated` on the default page   |      0 |     5 |

The original probe is unmodified. Its `filterAfterLimit` block reproduces the
**old** call shape in JavaScript, so it still prints 0 after the fix; that
number is the defect being described, not a reading of the current path.
`research-2026-09-21.probe.re-02.mjs` calls the current path on the same
fixture.

## Verification

Run in the worktree, 2026-09-22:

| command                                                        | result                              |
| -------------------------------------------------------------- | ----------------------------------- |
| `node --import tsx docs/reports/research-2026-09-21.probe.mjs`  | `!!!` 20 → 0                        |
| `node --import tsx docs/reports/research-2026-09-21.probe.re-02.mjs` | backend 5, limit 100 → 25, omitted 5 |
| `pnpm exec vitest run` (5 focused files)                        | 5 files / 109 passed                |
| `pnpm lint`                                                     | clean, `--max-warnings=0`           |
| `pnpm typecheck`                                                | 6 projects, clean                   |
| `pnpm test`                                                     | 208 files / 1,934 passed / 1 skipped |
| `node --import tsx scripts/verify-scope-boundaries.ts`          | PASS, 12 boundaries, 388 files      |

208 = the 207 test files at `5d0c709` plus this card's one. Every pre-existing
file passed unchanged. The table above is a working-tree run in an isolated
worktree, and it does not include the uncommitted UI test files in the shared
checkout.

### Commit CI

[PR #26](https://github.com/2klips/alrescha-app/pull/26), head `6c1b262`
(implementation `2ba9c18` plus the handoff commit), base
`phase4/todo-26-symbol-nodes` — stacked on the open PR #25 so the diff is this
card's seven files:

| check                   | result  | completed            |
| ----------------------- | ------- | -------------------- |
| gate                    | SUCCESS | 2026-09-22T11:49:55Z |
| gate                    | SUCCESS | 2026-09-22T11:52:07Z |
| Vercel                  | SUCCESS | —                    |
| Vercel Preview Comments | SUCCESS | 2026-09-22T11:44:47Z |

Both CI runs on that head report `completed success`; no older commit's result
stands in for it. A later docs-only commit moves the head, so re-read the
checks before merging.

## Contract held

- `tools/list` is 21 tools within the 3,150-token ratchet
  (`hosted.test.ts`) — no input was added, so the catalogue is byte-identical.
- `search_index` gains one response key (`coverage`); `results` and
  `truncated` keep their names, and no output schema exists to widen.
- `include_excerpt: false`, `excerpt_chars`, the stale-summary block, tenant
  isolation and two repositories sharing a path are pinned in the new tests.
- No raw source body is stored or returned; provenance, freshness/CAS and the
  billing rules are untouched by this card.

## Not verified here

- No production workspace, no rescan, no hosted deployment. Every number above
  is from synthetic fixtures and the in-memory store.
- Search cost and Korean ranking quality are RE-04, not this card.
- `routeQuery`'s stale `search_nodes` naming is RE-04's separate cleanup.
