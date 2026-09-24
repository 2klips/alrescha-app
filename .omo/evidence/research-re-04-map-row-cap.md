# RE-04 map — the map past PostgREST's row cap

**Date:** 2026-09-24 · **Base:** `1aa7bd0` (the tip of
`research/re-04-search-cost`, local and unpushed, on main `488c0c4`) ·
**Worktree:** `research/re-04-map-row-cap` @ `../re-04-map`

| commit | change |
| --- | --- |
| `834ea60` | the PostgREST emulator reads the map's request shapes |
| `1324dd9` | every map read pages past the row cap; budgets and truncation notes kept |
| this commit | the probe below and this record |

No migration, no worker change, no MCP tool or catalogue change, no
production read or write, no token.

## The defect

PostgREST answers with at most `max_rows` rows and says nothing about it;
Supabase's default and `supabase/config.toml`'s is 1,000. The map screen has
four reads, and each asked for more than that in one request:

| read | asked for | what a 1,000-row server handed back |
| --- | --- | --- |
| `loadWorkspaceMap` (`/app/map`) | 2,000 nodes, artifacts and satellites; up to 6,000 edges per family; findings, tokens and `implements` edges with no limit | the first 1,000 of each |
| `riskRowQueries` (the HUD's risk chip, shared with `/app/inspection`) | every artifact, every `calls`/`imports`/`tests` edge, every finding, every `ci` evidence row | the first 1,000 of each |
| `readSymbolLayer` (`/api/map/symbols`, the halo) | 5,001 symbols and 20,001 edges per 60-id batch — one past each budget, to report it | 1,000, and never the row past the budget, so a halo over budget said nothing |
| the module card (`/api/map/inspect`) | 2,000 files and 6,000 `imports`/`calls` edges of the repository | the first 1,000 of each |

Nothing downstream could tell: the map drew the thousand as the workspace,
the HUD called a 10-of-23 coverage "100%", and the halo's truncation note
waited for a row the server never sent. Production drew exactly
`data-layout-nodes=1000` on 2026-09-23 and 2026-09-24 (the RE-04 B-01 and
search rollout records). That was circumstantial; the probe below reproduces
it on the pilot's own data.

## What changed

- `apps/web/lib/supabase/row-pages.ts` (RE-04's): `readByIdPages` is
  unchanged in behaviour; its loop is shared with a new
  `readByPositionPages`, and each page request now also says its `offset`.
- `apps/web/lib/supabase/table-pages.ts` (new): `readRowsById` and
  `readRowsByPosition` put the rule behind one call over a supabase-js
  client — exact count on the first page, the caller's `narrow` (the tenant
  or repository predicate) on every page, and a first page that is the
  request the read made before.
- `loadWorkspaceMap`: every read whose budget exceeds the cap, or has none,
  pages: `graph_nodes`, `artifacts`, `rationales`, `requirements`,
  `evidence`, `concepts` (2,000), `agent_assertions` and the legacy edges
  (6,000), the eight families (1,000–6,000), and — reading every row, as
  before — open findings, tokens, repositories and the HUD's `implements`
  edges. The hub reads (100–400), the feed and the scan completions (20)
  are within the cap and stay one request each.
- `riskRowQueries`: the four reads with no budget page; the co-change top
  500 and the latest audit stay one request.
- `readSymbolLayer`: symbols page by position in the halo's own order
  (path, line, name, then id), edges by id per batch; the +1 budgets and
  their truncation notes are as they were.
- `/api/map/inspect`: its three reads move to
  `apps/web/lib/map/module-rows.ts` (`readModuleCardInputs`), paged, so the
  route stays a handler and the reads can be tested.

### Why id order, and where not

`graph_nodes` and `artifacts` read in `(created_at, id)` order so their
2,000-row pages agree row for row (R4 §3.7): an artifact's id is its node's
id. Paging needs a key a page can continue after. Both now read in `id`
order, which keeps the agreement by construction — the key is the same
value in both tables — and keeps the budget's meaning: ids are ULIDs
`generate_ulid()` mints from `clock_timestamp()` as each row is written, so
id order is write order, the created-at order the budget kept, short of two
writers at once or a millisecond boundary. Tested at the real cap with 2,100
files written by two transactions: the 2,000 kept are the first 2,000 by
`(created_at, id)`, none `unknown`. The satellites (`rationales`,
`requirements`, `evidence`, `concepts`) were unordered; id order makes them
agree with the node page too.

Two reads keep an order of their own and page by position instead:
`file_co_changes` has no id and its budget keeps the strongest pairs
(`change_count desc`, then the table's key), and the halo's symbols are
placed by their order. Position is only as steady as the rows between two
requests; a display read survives that until the next load.

`repositories` pages by id and is put back newest-created first, the order
`currentRepository` breaks ties by.

## Red before the fix

`tests/workspace-map-row-cap.test.ts`, the real loaders through the real
client as the signed-in owner under row security, over `drifted-demo` as
`apply_repository_scan` projects it plus 23 rows seeded into each table a
scan leaves empty. Emulated cap 10 — no smaller than any read the loaders
leave as one request (the 10 directories).

| case | before | after |
| --- | --- | --- |
| the map a capped server holds | 10/119 nodes, 9/88 edges, 10/15 artifacts, 10/23 concepts, rationales, requirements and open findings, coverage 10/10 "100%" of 23/23, revoked tokens 5/11, risk ranked 9/14 | equal to the uncapped map, deep |
| every read, request by request | rows short of the uncapped read | every read returns what it returns uncapped; uncapped, every read is one request; budgets within 1,000 stay one request; the workspace on every page |
| co-change pairs | 8/23 | 23/23, pages in `change_count.desc,…,path_b.asc` |
| the node budget at the real cap (2,100 files) | 1,000 | 2,000, none unknown, the oldest 2,000, pages `[1000, 1000]`; the risk read's files `[1000, 1000, 100]` |
| a file's halo, cap one below its symbols | 2 of 3 edges | equal to uncapped |
| a halo over budget at the real cap (5,001 symbols) | 1,000 symbols, no note | 5,000, note `{symbols, 5000}`, in line order |
| the module card's rows | 10/15 files | equal to uncapped |

## Measured on the pilot's own data

`docs/reports/re-04-map-row-cap.probe.mjs`: `488c0c4` exported with
`git archive`, scanned, projected by `apply_repository_scan` into PGlite with
every migration, read through the emulator at `max_rows` 1,000 as the
signed-in owner. "Before" is `1aa7bd0` (`--code ../re-04-cost`), "after" this
branch, on the same data. Dataset: 1,588 non-symbol nodes, 1,010 files, edges
by family doc 2,896 · structure 2,771 · hierarchy 1,138 · evidence 587 ·
database 580 · route 125, 2,606 symbols.

| | before | after |
| --- | ---: | ---: |
| nodes drawn (stored 1,588) | **1,000** | 1,588 |
| edges drawn (uncapped 8,097) | 1,867 | 8,097 |
| files (`counts.artifacts`) | 1,000 | 1,010 |
| HUD risk: files ranked (uncapped 622) | 614 | 622 |
| model JSON the page serialises | 868 KB | 3,054 KB |
| requests | 35 | 46 |
| rows / bytes read | 8,872 / 2.46 MB | 15,488 / 4.43 MB |
| longest chain of sequential requests | 2 | 5 |
| module card rows (stored 1,010 files, 2,616 edges) | 1,000 / 1,000 (one request each) | 1,010 / 2,616 in 6 requests, chain 3 |
| halo of the largest file (485 symbols) | 485, 10 requests, chain 4 | unchanged |

The chain is measured with 1,000 ms added per request (well above PGlite's
own time, so its queueing stays out); it is the code's, not a latency. The
three added links are the risk map's `calls`/`imports`/`tests` edges, read
to the end in four pages. The map's local wall time roughly doubled (≈100 →
≈190 ms, one laptop, relative only). The "before" module-card row is by
construction — the probe cannot call a read that lived inside the route.

Not measured: the hosted `max_rows` (still not read), network and hosted
database time, the browser's frame time drawing 1,588 nodes and 8,097 edges,
and the page's encoded payload (model JSON is a proxy). Tables a scan does
not write are empty in the probe.

## Checks

`pnpm lint` clean · `pnpm typecheck` root + 6 projects clean · `pnpm test`
219 files / 2,026 passed / 1 skipped (base `1aa7bd0`: 216 / 2,007 / 1; the
difference is the 19 new tests). No existing assertion changed.

## Left open

- The chain grows by three round trips on the pilot. The risk edges could
  page in parallel once the count is known, or take a budget — a choice for
  whoever owns the HUD's risk chip.
- The map now serialises about 3 MB of model on the pilot where it
  serialised 0.87 MB. The budgets were set for this; nothing measured them
  at this size in a browser.
- `/app/inspection`'s own document and todo reads, `/app/progress`'s
  requirement, `implements` and todo reads and home's token read still take
  one request each.
- The MCP store's private `#pages` does what `readRowsById` does; the two
  could share it once RE-04 cost is merged.
