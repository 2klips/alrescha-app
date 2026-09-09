# Phase 4 · Codex remedy S2b — bounded reads that say what they carried

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-01 / P0-B on
todos 21 (negative queries) and 22 (loader split). **Scope:**
`packages/mcp/src/{store,data-brain,hosted}.ts`,
`apps/web/lib/mcp/supabase-store.ts`, and their tests.

## Every workspace read was unordered and uncapped

None of `loadWorkspace`'s thirteen selects set a `limit` or an `order`. That
is not "no limit" — PostgREST answers with at most `max_rows` and says
nothing, so the store received an **arbitrary, unordered thousand rows** and
presented them as the whole graph. This repository stores 5,213 edges and 760
artifacts.

Every read now orders by `id` and asks for one row more than it will use:
getting that row back is an observation that there are more, not a guess.
`McpWorkspaceData.coverage` names the tables that ran out. Raising `max_rows`
was the alternative the remedy rejected — it moves the cliff without telling
anyone where it is.

The tenant predicate is part of this: the first attempt at the rewrite
replaced `.eq("workspace_id", …)` with the order and limit instead of adding
them, which would have made every read cross-tenant. The test asserts that
each bounded read still carries it.

## A negative answer is only as good as the read behind it

`query_brain(filter: {withoutRelations: ["tests"]})` means "which files have
no test". With a truncated edge read, every node past the budget looks
unconnected, and the honest answer to "which of these have no test" is *not a
list*.

`queryWorkspaceBrain` now returns `{coverage, nodes}`. The filter still runs —
a partial answer beats no answer — but when the `edges` or `graph_nodes` read
ran out **and** the query asks about relations, coverage is `partial` and
names which filter it cannot establish. A query that asks nothing about
relations is unaffected by the same truncation: coverage is about the
question, not only about the read.

## A file the user names is a lookup, not a search

`get_artifact` filtered the budgeted workspace load, so on a repository past
the budget the file was simply not in the answer. `McpStore.findArtifacts`
queries the database for that id or path directly; `getWorkspaceArtifact`
takes the matches and uses the workspace read only for the neighbours, which
still carry the budget and say so.

Both readers now decode an artifact row through one `artifactData` function,
so there is one freshness rule (S1) rather than a second one for the lookup.

## Two repositories can hold the same path

`src/index.ts` is not a name one project owns. The old code sorted the matches
by repository id and returned the first — a different question than the one
asked, with nothing said about having chosen. A path selector that matches
more than one repository now returns `ambiguous` with the candidates and no
artifact. An **id** selector cannot be ambiguous and still answers outright.

## A batch returns one result per input

`get_node_content(node_ids: [a, b, c, d])` used `flatMap` and dropped the
misses, so four ids could come back as three with no way to tell which had
failed — and a caller cannot retry, or report, an id it was never handed
back. Every requested id now comes back in the order asked, with
`found: false` when it did not resolve. Absent and out-of-scope are
deliberately the same answer.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(151 files, 1,255 passed, 1 skipped — 10 more than S2a),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
324 files).

- `apps/web/lib/mcp/supabase-store.test.ts` — every bounded read orders by
  `id`, asks for `limit + 1`, and still scopes by workspace; a read of
  `limit + 1` rows keeps `limit` and reports `partial` with the table; a read
  that fits reports `complete`; the lookup queries by path rather than
  filtering a page; two repositories answering to one path both come back; a
  match whose repository the principal cannot see is dropped; an empty
  selector issues no query at all.
- `packages/mcp/src/graph-tools.test.ts` — a path in two repositories returns
  `ambiguous` while an id still answers; a lookup finds an artifact the
  workspace read did not carry; a truncated edge read makes a
  `withoutRelations` query `partial`, and leaves a query that asks nothing
  about relations `complete`.
- `packages/mcp/src/hosted.test.ts` — a batch with an unknown id returns two
  entries, the second `{found: false, requestedId}`.

## Not verified here

- **No live PostgREST.** The bound is asserted against a fake query builder:
  the `limit`/`order` calls and the truncation arithmetic are pinned, but not
  that PostgREST honours them or what its own `max_rows` is on the deployed
  project. That is an operational check, and the remedy says so.
- **Cursors and paging.** A truncated read reports itself; it does not offer a
  `nextCursor` to continue. That is S3, together with the keyset ordering,
  the byte and depth budgets, and the RPC.
- **Nothing re-reads on `partial`.** The UI loader
  (`apps/web/lib/map/workspace-map.ts`) has its own budgets and was not
  touched; only the MCP store reports coverage today.
- **Page-to-page consistency** (OQ-053): a read that pages will need a
  revision fence or an immutable generation, and neither exists. Nothing here
  claims a snapshot.
- **`get_findings`, `search_index` and `request_context_pack`** consume the
  same workspace read and do not surface its coverage yet.
- **Playwright** (no Docker daemon).

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
