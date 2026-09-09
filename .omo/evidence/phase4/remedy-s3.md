# Phase 4 · Codex remedy S3 — a read that can be resumed, and that only the server may run

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-01 / P0-B on
todo 22 (loader split). **Scope:**
`supabase/migrations/202609060004_bounded_graph_read.sql` (new),
`packages/mcp/src/store.ts`, `apps/web/lib/mcp/supabase-store.ts`,
`tests/bounded-graph-read.test.ts` (new), the Supabase-store tests.

## What S2b could not do

S2b bounded the PostgREST reads and made a truncated answer say it was
truncated. It could not say **how to continue**, and it could not bound
anything but rows: a page of 2,000 edges with long provenance is a payload
nobody budgeted for. A repository past the cut simply lost every edge after
it, forever.

`public.read_edge_page(workspace, repository, after, row_budget, byte_budget)`
is the scoped read the remedy recommends (REMEDY §5.1–§5.2): one read-only
SELECT behind one function, returning the rows, whether more exist, and where
to resume, in a single scalar JSON.

## The rules, and why each is a rule

- **Keyset, not offset.** Pages walk `id > after` in id order. An offset
  re-reads the prefix and can skip or repeat a row when the table changes
  between pages; a keyset cannot.
- **`limit` applies to rows, before aggregation.** Aggregating first and
  slicing the array afterwards reads the whole table to return a page — the
  cost the budget exists to avoid.
- **n+1 decides `hasMore`.** The function reads one row past the budget and
  reports whether it got it. "I asked for 2,000 and got 2,000" is evidence of
  nothing, and inferring completion from it is exactly what the remedy calls
  out.
- **Bytes are budgeted too.** Rows are kept while their running serialized
  size fits, and `stoppedBy` says `bytes` or `rows`. A scalar JSON return is
  not a way to smuggle an unbounded payload past a row cap.
- **`exactCount` is null.** Counting every matching edge costs the scan this
  read is avoiding. A number nobody measured is worse than no number.

## Consistency, stated rather than implied

One SELECT is one snapshot, so a page is internally consistent. **Across pages
it is not** — PostgreSQL 17's Read Committed gives each statement its own
snapshot, so wrapping several reads in a function would not have made them one
either (REMEDY §5.3). The function claims a page, not a graph. Whether to add
a revision fence is OQ-053, and nothing here pretends it exists.

## Permission

`security invoker`, so the function can never be a way around RLS, and EXECUTE
granted to `service_role` alone. The workspace comes from the caller's
verified principal, never from a client-supplied string: SECURITY INVOKER on
its own is not a tenant boundary (REMEDY §5.5). A signed-in user reaches the
graph through RLS on the tables, not through this — and the test proves both
halves.

## The store pages through it

`loadWorkspace` reads edges through the function, following the cursor for at
most `MCP_EDGE_MAX_PAGES` (4) pages of `MCP_EDGE_PAGE_ROWS` (2,000). When the
last page still says `hasMore`, the workspace coverage reports `edges` as
truncated at 8,000. A page that claims more but returns no cursor cannot be
resumed, and stopping is the only honest move.

The function returns **column names**, not a second naming convention: the
row decoder is the one the table select feeds, and two shapes would be two
decoders. The first draft returned camelCase and omitted `repository_id` —
which decoded to an error and would have filtered every edge out of its own
repository. A test now pins the returned key set against the decoder.

## Verification

Against **real PostgreSQL** — PGlite, the same engine, with the same roles and
privileges — so the boundary cases are answers rather than assertions about a
fake query builder.

`tests/bounded-graph-read.test.ts` (11 cases):

- the returned shape matches the decoder's key set;
- a page that fits reports `complete`, `stoppedBy: null`, `exactCount: null`;
- **the boundary**: 99, 100 and 101 rows against a budget of 100 — only the
  last says `hasMore`, and it says `stoppedBy: "rows"`;
- 251 files' worth of edges walked in pages of 40: every edge seen once, in
  id order, with each cursor equal to the last row returned;
- a byte budget below the page size stops on `bytes` and still resumes;
- a cursor past the last row returns an empty page, not an error;
- a workspace the caller did not name returns nothing;
- `authenticated` cannot execute the function at all;
- and a signed-in owner still sees their edges through RLS while another
  signed-in user sees none.

`apps/web/lib/mcp/supabase-store.test.ts` adds the paging loop: the cursor is
followed until a page says there is no more, the second request resumes from
the first page's last row, the page budget stops the walk and reports
`partial`, and a cursorless `hasMore` stops rather than looping.

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(152 files, 1,269 passed, 1 skipped — 14 more than S2b),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
325 files).

## Not verified here

- **PGlite is PostgreSQL, but it is not the deployment.** The SQL semantics,
  the roles and the grants are real; PostgREST's own `max_rows`, connection
  pooling, and the RPC's behaviour over HTTP are not exercised. The RPC path
  through `supabase-js` is asserted against the fake client only.
- **Only `edges` pages.** Artifacts, findings, index entries and the rest
  still use the bounded PostgREST reads from S2b: they report truncation and
  cannot resume. Extending the function per collection is straightforward and
  deliberately not done blind.
- **No revision fence** (OQ-053). Two pages can straddle a write. The function
  says nothing about a snapshot because there is nothing true to say.
- **Cursor expiry and permission revocation between pages** are not tested:
  the cursor is an edge id with no scope or policy baked into it, so a
  revoked token fails at the next request's own authentication rather than at
  the cursor. The remedy's stronger cursor — scope, query, policy and revision
  fixed inside it — needs the fence first.
- **Depth budget.** The remedy's third budget is for graph traversal, not for
  a flat page; `get_neighbors` still bounds by depth 1–2 in TypeScript.
- **No measurement.** Query count, returned bytes and p95 before and after are
  unmeasured; the remedy asks for that comparison and it needs a deployment.
- **Playwright** (no Docker daemon).

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
