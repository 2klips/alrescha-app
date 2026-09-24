# RE-04 — search cost and Korean search quality, measured and changed one element at a time

**Date:** 2026-09-24 · **Base:** `488c0c4` (main, exact; web production since
2026-09-24 10:42 KST) · **Worktree:** `research/re-04-search-cost`

| commit | change |
| --- | --- |
| `8aeec4d` | read past PostgREST's row cap instead of calling a capped read complete |
| `5c50036` | ask for the read basis alongside the tables, not after them |
| `1928cd4` | rank search by the index's neighbour cache and read no edges for it |
| `60a01f1` | let search match the section headings every read already carries |
| `3ed705e` | route file-path questions to search, and name only tools that exist |
| `20dee3e` | the probe and the emulator the numbers below come from |

No migration, no worker change, no new tool, catalogue unchanged, no
production read or write, no benchmark run.

## How it was measured

`docs/reports/re-04-search-cost.probe.mjs`. The pilot workspace is this
repository, so its data can be rebuilt without production: the probe exports
`488c0c4` with `git archive`, runs a full scan, and projects the plan through
the production SQL (`apply_repository_scan`) into PGlite with every
migration. The real `SupabaseMcpStore` and the real hosted endpoint serve the
calls through `tests/helpers/postgrest-pglite.ts`, which turns supabase-js
requests into SQL, serialises rows the way PostgREST does, and applies
PostgREST's `db-max-rows` (1,000, Supabase's default and
`supabase/config.toml`'s). `--code` runs another checkout on the same data,
so every "before → after" below is the same dataset.

Dataset: 1,010 artifacts, 1,010 index entries, 1,588 non-symbol graph nodes,
8,097 edges, 92 sections, 2,606 symbols.

What the numbers are and are not:

- **Portable:** requests, rows, bytes, and the *depth* — the longest chain of
  requests that wait for one another. Depth is measured by adding 100 ms to
  every request (an assumption) and dividing the extra wall time by it.
- **Relative only:** PGlite and CPU times on one laptop.
- **Not measured:** network, the hosted database, cold starts, and every table
  a scan does not write — summaries, concepts, findings, evidence, receipts
  and memory are empty here. Authentication is bypassed; production adds two
  sequential requests (token lookup, owner check) before every call.

Quality corpora, drawn from the tree so no one chose the answers: 40 exported
identifiers (declared in one non-barrel file), 40 unique file names, 40
Korean document titles (two Hangul words of each Markdown H1), and 40
questions from the Korean section headings the read carries. A case scores
the rank of the file the question names in a 100-row page.

## What one call cost at 488c0c4

| | requests | bytes | depth |
| --- | ---: | ---: | ---: |
| `search_index` | 20–21 | 4.69–4.97 MB | 7–8 |
| `get_artifact`, `get_neighbors`, `impact_of` (file) | 20–23 | 4.69–4.73 MB | 7 |

Of a search's 4.7 MB, the four edge pages were **3.62 MB (76%)** and the
longest chain; `index_entries` 723 KB, `artifacts` 246 KB, `graph_nodes`
130 KB. Ranking CPU was 3–8 ms: the time is in the read, not the ranking.

## A defect found on the way: the server's row cap

PostgREST answers with at most `max_rows` rows and says nothing about it.
Every bounded read asked for 2,001 rows so that a 2,001st could say "there
are more"; at a 1,000 cap it never comes, and the read called itself
complete. With the cap emulated, the base read kept **1,000 of 1,010** index
entries and artifacts with coverage `complete`. One file-name question of 40
came back empty because its file was among the ten. Ids sort by time, so in
production the ones dropped are the **newest** files.

Circumstantial production evidence: the map asks for 2,000 nodes and drew
exactly `data-layout-nodes=1000` on 2026-09-23 and 2026-09-24, while the pilot
has some 1,600. The hosted setting itself was not read.

Fixed in `8aeec4d`: every table of the workspace read, the receipt summaries
and the symbol reads go through `readByIdPages` — an exact count on the first
page, then pages after the last id until the rows are in hand. A table under
the cap is still one request; the tenant predicate is on every page.

## Candidates, one at a time

| # | candidate | measured | decision |
| --- | --- | --- | --- |
| 1 | page past the row cap | 1,000 → 1,010 entries read; 1 empty question → 0; +3 requests, +48 KB | **adopted** (`8aeec4d`) |
| 2 | read the basis alongside the tables | depth −1 for every tool; requests and bytes unchanged | **adopted** (`5c50036`) |
| 3 | search without any connectivity | 76% fewer bytes, but hit@1 68 → 60 of 80, first hit changed in 19 of 84 | rejected |
| 4 | edges for the rerank by relation, ids only (no migration) | ~135 B a row instead of ~540, but `references` alone is 4 pages at the cap: depth unchanged | rejected |
| 5 | rerank on the index's neighbour cache; search reads no edges | search 4.7–5.0 → 1.1–1.4 MB, depth −2 to −3; 76 of 80 ranks identical, four one place apart | **adopted** (`1928cd4`) |
| 6 | larger edge pages | the RPC clamps `row_budget` to 2,000 server-side | needs a migration — proposed |
| 7 | match the section headings the read carries | Korean decision-record questions 0 → 40 of 40 | **adopted** (`60a01f1`) |
| 8 | index document headings at scan time | simulated: Korean titles 0 → 39/40 in the top 5, 40/40 in the top 20 | needs worker + migration + rescan — proposed |
| 9 | token lookup and owner check in one request | depth −1 for every tool, but it is the authentication path | deferred: its own review |
| 10 | Korean–English alias table | not evaluated | after 8: titles cover most of the gap, and an alias list is a product vocabulary |

Candidate 5 in detail. The rerank bonus only reorders inside a tier (≤ 50
under a 100-point gap), and it walked every edge the read carried. The index
entries already carry each file's neighbour cache (code and document links),
and the read already carries the entries. Against the edges, on the same
questions: identifiers hit@1 34 → 32, paths 34 → 35; hit@5 and hit@20 no
worse; the four changed ranks move by one place, two up and two down. The
cache is also never cut short, where the edge read stops at 8,000 rows and
production has 11,833. After the change the ranking is the same with or
without edges in the workspace (checked on the pilot: identical pages).

## Result — 488c0c4 → 20dee3e, same data

| call | depth | requests | bytes | wall p50 (local) | wall at 100 ms/request |
| --- | ---: | ---: | ---: | ---: | ---: |
| `search_index` export name | 8 → **5** | 21 → 20 | 4.74 → **1.17 MB** | 180 → 65 ms | 1,013 → 597 ms |
| `search_index` word | 7 → **4** | 20 → 19 | 4.69 → **1.12 MB** | 179 → 65 ms | 908 → 486 ms |
| `search_index` broad word | 8 → **5** | 21 → 20 | 4.97 → **1.40 MB** | 192 → 68 ms | 1,032 → 607 ms |
| `search_index` Korean | 7 → **4** | 20 → 19 | 4.69 → **1.12 MB** | 168 → 51 ms | 902 → 471 ms |
| `get_artifact` | 7 → 6 | 23 → 26 | 4.69 → 4.74 MB | 166 → 188 ms | 892 → 811 ms |
| `get_artifact` + brief | 7 → 6 | 23 → 26 | 4.69 → 4.74 MB | 176 → 200 ms | 917 → 817 ms |
| `get_neighbors` (file) | 7 → 6 | 20 → 23 | 4.69 → 4.74 MB | 175 → 189 ms | 910 → 812 ms |
| `impact_of` (file) | 7 → 6 | 22 → 25 | 4.73 → 4.78 MB | 205 → 223 ms | 940 → 850 ms |

The graph tools read more rows now (the ten the cap used to drop, plus a
count), so their local wall rose ~20 ms while their depth fell by one.

| corpus (40 each) | hit@1 | hit@5 | hit@20 | MRR | empty |
| --- | --- | --- | --- | --- | --- |
| identifiers | 34 → 32 | 40 → 40 | 40 → 40 | 0.925 → 0.900 | 0 → 0 |
| file names | 34 → 35 | 38 → 39 | 39 → 40 | 0.890 → 0.916 | 1 → 0 |
| Korean document titles | 0 → 2 | 0 → 2 | 0 → 3 | 0 → 0.052 | 40 → 21 |
| Korean section headings | 0 → 40 | 0 → 40 | 0 → 40 | 0 → 1.000 | 40 → 0 |

The section corpus is drawn from the headings the change matches, so its
40/40 says those headings became searchable, not that search got better at
something independent. Ranking CPU went from 3–6 ms to 4–9 ms p50 (the
neighbour pairs and the section map); it was never where the time was.

## Korean: where the gap is

A document's headings are never indexed. The scanner parses them, but the
plan carries none and the SQL writes `index_entries.headings = '{}'`; the
search key is path, name, classification and symbols. Nothing Korean a
document says about itself reaches search except the ADR/OQ/G/MT section
headings (88 of the pilot's 92 are Korean), which `60a01f1` uses. Document
titles need candidate 8: the plan carries each Markdown file's H1–H2, the
SQL writes them, and a rescan fills existing rows — a worker deploy, a
migration and a rescan, none of which this change makes. Simulated on the
local database: Korean titles hit@5 39/40, hit@20 40/40; identifiers
unchanged; file names MRR 0.916 → 0.898.

## Also fixed

- **Tools that do not exist.** The snippet `/app/settings/mcp` hands a user
  for CLAUDE.md/AGENTS.md said `search_nodes` and `get_node_content`;
  `routeQuery` recommended `search_nodes`. Both merged away in todo 22. A test
  now holds every tool either names against the served catalogue.
- **`routeQuery` and file paths.** "README 파일 경로가 뭐야?" went to the
  graph because "경로"/"path" was read as a walk. Used by the databrain
  benchmark's routed arm only, not by the hosted server.

## Verification

Run in the worktree at `20dee3e`, 2026-09-24:

| command | result |
| --- | --- |
| `pnpm lint` | clean |
| `pnpm typecheck` | root + 6 projects, clean |
| `pnpm test` | **216 files / 2,007 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts` | PASS, 12 boundaries, 390 files |
| catalogue (`change-brief-contract.probe.mjs`) | 21 tools / 3,141 tokens, ratchet 3,150 — unchanged |

2,007 = 1,984 at `488c0c4` (this kind of run) + 23 new: 6 row cap, 6
emulator, 1 basis order, 1 store without edges, 1 hosted search without
edges, 1 ranking independent of edges, 5 section search, 2 catalogue
guidance. The router's five new questions sit in its existing tagged test.
A working-tree run in an isolated worktree — **not a commit's CI**; the
branch is not pushed.

Red first, each time: the row-cap test (5 of 15 entries read, coverage
complete), the basis-order test, the edges-false store tests, the "ranks the
same whatever edges" test, the section tests, the router's file-path cases
and the catalogue test all failed before their change and pass after it.
One existing test changed its fixture, not its assertions: the connectivity
rerank now expresses "b is in the seed's neighbourhood" in the index's
neighbour cache, where the rerank reads it.

## Not verified

- Production: latency, bytes, the hosted `max_rows` value, and whether the
  pilot's newest files are the ones missing from search today.
- Tables a scan does not write, so production bytes per call are larger than
  these by whatever summaries, concepts, findings and receipts add.
- The map reads through the same cap (`workspace-map.ts`); not changed here.
