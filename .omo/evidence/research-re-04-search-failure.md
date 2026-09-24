# RE-04 — the first post-deploy `search_index` failure, classified

**Date:** 2026-09-24 · **Base:** `47b32d2` (main, exact; web production
since 2026-09-23 23:24 KST) · **Worktree:** `research/re-04-search-failure`
· Fix `faa151a`.

No migration, no new tool, no production read or write. Catalogue 21 tools
/ 3,141 tokens, unchanged.

## What was observed

From deployment Codex's record (`.omo/evidence/phase4/re04-b01-rollout-2026-09-23.md`
in the shared root) — one read token, each call once, no retry:

| call | elapsed | result |
| --- | ---: | --- |
| `search_index` | 10,915 ms | HTTP 200, **tool error**, classifier `other_error` / `unclassified` |
| `get_artifact` default | 7,486 ms | pass |
| `get_artifact` opt-in | 8,961 ms | pass |
| `get_neighbors` (file) | 5,871 ms | pass, 0 symbol nodes |
| `impact_of` (file) | 6,169 ms | pass, `lower-bound` |

Read-only `EXPLAIN` of the edge RPC's first page: `Limit → Index Scan using
edges_pkey`, SELECT 2.299 ms, whole RPC 123.248 ms; all-tenant edges =
pilot edges = 11,833. Later cursors, the revision fence and the hosted
`service_role` context were not measured. No response body was kept.

## What `search_index` does that the other four do not

All five load the workspace through the same shared read. After it, only
`search_index` goes back to the database:

| tool | symbol-layer read |
| --- | --- |
| `search_index` | `symbolHitsFor` → `loadSymbolNeighborhood(hit files)` **every call with a symbol-name match** |
| `get_neighbors`, `impact_of`, `trace_path` | `withSymbolLayer` — only for ids the shared read does not know; a file id is known, so none (the record's "0 symbol nodes" agrees) |
| `get_artifact` | none |

`loadSymbolNeighborhood` put every symbol of every named file into one
`symbol_edges` request as an `or` over two inline lists
(`source_node_id.in.(…)`, `target_node_id.in.(…)`). PostgREST filters travel
in the URL; postgrest-js form-encodes each comma as `%2C`, so each symbol
costs 58 characters of URL.

## Classification

| # | candidate | how it would surface | standing |
| --- | --- | --- | --- |
| F1 | the search's `symbol_edges` request longer than the gateway accepts | text body such as `URI too long` → `MCP symbol edge query failed: URI too long`: no code, no "timeout" | **leading** — reproduced locally for the handoff's own query form; not observed in production |
| F2 | statement timeout in the shared read | `canceling statement due to statement timeout` | unlikely — the classifier recognises it, and the same read passed four times within 46 s |
| F3 | gateway 5xx or network failure in any read | `TypeError: fetch failed`, or an HTML body | not excluded — postgrest-js retries a GET on 503/520/network up to three times (1 s, 2 s, 4 s), so elapsed time cannot separate F3 from F1 |
| F4 | output schema validation | `Output validation error` | excluded — `search_index` declares no output schema |
| F5 | platform timeout | HTTP 504 | excluded — HTTP 200 with a tool result |
| F6 | client-side abort | `AbortError` | excluded — no timeout or signal on the MCP path |
| F7 | the ranking throwing on production data | a `TypeError` | not excluded, no evidence — pure code, covered by fixtures |
| F8 | edge RPC on a later cursor or under the fence | `MCP edge page query failed: …` | not specific to search — the same shared read passed four times in the same 46 s |
| F9 | `revision_of` / `read_repository_basis` | — | excluded as a source — both are read without throwing |

## F1, reproduced without production

The pilot workspace is this repository. `docs/reports/re-04-search-failure.probe.mjs`
runs a full local scan, the local projection the SQL is tested against, the
real `searchWorkspaceIndexPage`, and `symbolHitsFor`'s file selection, then
asks the real postgrest-js builder how long the request URL is. Nothing is
sent.

Scan of the `47b32d2` tree: 1,005 artifacts, 350 files with symbols, 2,597
symbols (production had 2,589 after its full scan). The barrel files carry
most of them: `packages/core/src/index.ts` 485, `packages/mcp/src/index.ts`
135, `packages/mcp/src/store.ts` 82.

| query | files with a matching symbol | symbols read | edge request URL |
| --- | ---: | ---: | ---: |
| `createHostedMcpEndpoint` | 2 | 143 | **8,568** |
| `searchWorkspaceIndexPage` | 2 | 161 | **9,612** |
| `prepareChange` | 2 | 144 | **8,626** |
| `SupabaseMcpStore` | 1 | 1 | 332 |
| `impactOf` | 1 | 24 | 1,666 |
| `search` | 1 | 26 | 1,782 |
| `store` | 14 | 167 | **9,960** |
| `symbol` | 10 | 844 | **49,226** |
| `edge` | 15 | 979 | **57,056** |
| `receipt` | 10 | 699 | **40,816** |
| `auth` | 7 | 590 | **34,494** |
| `검색` | 0 | 0 | — (no hit at all) |

The symbol handoff asked the check to search for one export name. Any export
name re-exported by `packages/mcp/src/index.ts` brings that barrel's 135
symbols along, which is why a single name crosses 8,000.

Where the gateway refuses is **not published** by Supabase. postgrest-js
2.112.2 warns past 8,000 characters (`urlLengthLimit`), and a public report
shows `{ message: 'URI too long\n' }` for an 800-id `in` filter
([postgrest-js#423](https://github.com/supabase/postgrest-js/issues/423)).
So which of the bold rows actually fail in production is unknown — but the
recommended query form sits above the library's own line, and the common
words sit far above any common limit.

## The fix (`faa151a`)

1. **Search reads what a hit shows.** `symbolHitsFor` calls the new
   `loadFileSymbols`: the hit files' own symbols, in the workspace, no edge,
   no hop. One request per sixty files; a search page names at most 100. The
   shared rule `selectFileSymbols` keeps the neighbourhood's caps and order,
   and both stores use it.
2. **Every symbol-layer id list is batched.** The neighbourhood read and the
   map's halo (`/api/map/symbols`) ask sixty ids at a time, four requests in
   flight, and merge to exactly what one ordered, limited query kept
   (`firstRowsById`). No request passes 4 KB whatever the file.
3. **A failed read says what it was.** Every store error now leads with the
   HTTP status and a PostgREST or SQLSTATE code:
   `[HTTP 414] MCP file symbol query failed: URI too long`. The label names
   the read; the text after the first `: ` is the upstream's and should not
   be kept. A response with no status (test doubles) keeps the old form.

Probe, same queries after the fix: the search makes **one** `symbols`
request per query, 290–696 characters; a neighbourhood or halo edge request
is at most **3,754** characters, in `ceil(symbols / 60)` batches (17 for
`edge`).

## Verification

Run in the worktree, 2026-09-24:

| command | result |
| --- | --- |
| `pnpm lint` | clean, `--max-warnings=0` |
| `pnpm typecheck` | root + 6 projects, clean |
| `pnpm test` at `faa151a` | **212 files / 1,984 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts` | PASS, 12 boundaries, 389 files |
| catalogue (`change-brief-contract.probe.mjs`) | 21 tools / 3,141 tokens, ratchet 3,150 |

1,984 = 1,965 (local run at `5e217f6`, whose tree `47b32d2` merged
unchanged; main CI counted 1,966 passed there, and one test is skipped
locally) + 19 new: 5 URL, 5 batching, 5 store, 3 file-symbol rule, 1
hosted. A working-tree run in an isolated worktree — **not a commit's CI**;
the branch is not pushed.

New tests: `apps/web/lib/mcp/symbol-read-url.test.ts` (the real supabase-js
client over a small PostgREST emulator that refuses URLs past 8,000; the
barrel's neighbourhood equals the in-memory rule's), `apps/web/lib/supabase/id-batches.test.ts`,
and additions to `supabase-store.test.ts`, `symbol-layer.test.ts` and
`hosted.test.ts`. One existing test changed: the RE-02 "reads the layer for
the files it answers with" spy now watches `loadFileSymbols`; the ids it
asserts are unchanged, and it also asserts the neighbourhood is never read.

**Red check:** with the five changed source files restored to `47b32d2` and
the tests kept, 14 fail (13 new and the retargeted RE-02 test); restored,
all pass. The ones that pass on both are the batching helper's own tests
(a new, standalone module) and the characterisation test that shows the old
request being refused.

## Not verified

- **The failing request itself.** Its query, response and status were not
  kept. F1 is the leading explanation; F3 and F7 are not excluded.
- Supabase's actual URL limit — so which queries failed before the fix.
- The 5.9–9.0 s the shared read takes per call. Unchanged here; that is the
  original RE-04 cost work.
- The map's `symbols` request for more than sixty files in one call: not
  batched (the client asks for one file per request); at the route's cap of
  200 files it is about 6 KB.

## Observations for the original RE-04 work (not acted on)

- **Korean queries.** `검색` found nothing, though seven Markdown headings in
  this repository contain it (e.g. `# Claude → Codex 인계 — RE-02 검색
  정확성·상한`). Tokenising keeps Hangul (`\p{L}`) and ranking uses
  `includes`; the gap is what is indexed. In the local projection a `doc`
  entry's title is its file name and it carries **0 headings**, so its
  Korean title is not searchable at all. Whether the SQL writes the same
  was not checked here.
- `/app/commits` selects `receipts.summary` for up to 50 runs — the same
  column B-01 took out of the MCP read. Outside MCP; not changed.
