# The map past PostgREST's row cap — 2026-09-24

Status: **built and tested locally; production after Codex's rollout** (RE-04, stacked on the unpushed RE-04 cost branch).

PostgREST answers with at most `max_rows` rows — 1,000 — and says nothing
about it. The map asked for 2,000 nodes and up to 6,000 edges per family in
one request each, so production drew exactly `data-layout-nodes=1000`
(2026-09-23, 2026-09-24) of a pilot with 1,588 non-symbol nodes. Every map
read whose budget passes the cap, or has none, now pages until its rows are
in hand; each keeps its budget, and the halo still reports when it hits its
own. Reads within the cap stay one request. No component, style or copy
changed: the screen draws what the loaders now hand it.

| Surface                                                    | Change                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/map/workspace-map.ts`                                 | `loadWorkspaceMap` pages its node, satellite, edge-family, finding, token, repository and `implements` reads; `graph_nodes` and `artifacts` in id order (R4 §3.7 by construction); co-changes by position. |
| `lib/inspection/inspection-report.ts`                      | `riskRowQueries` (the HUD risk chip, shared with `/app/inspection`) pages its four unbudgeted reads.                                                                                                       |
| `lib/map/symbol-layer.ts`                                  | The halo's symbols page in its own order, its edges by id; `truncated` still names a hit budget.                                                                                                           |
| `lib/map/module-rows.ts`, `app/api/map/inspect/route.ts`   | The module card's three reads, moved out of the route and paged.                                                                                                                                           |
| `lib/supabase/row-pages.ts`, `lib/supabase/table-pages.ts` | The paging rule: `readByIdPages` (RE-04) and `readByPositionPages`; `readRowsById` / `readRowsByPosition` over a client.                                                                                   |

What the screen will show on the pilot (local reconstruction at `488c0c4`,
`docs/reports/re-04-map-row-cap.probe.mjs`): 1,588 nodes and 8,097 edges
where it drew 1,000 and 1,867; the HUD ranks 622 files for risk where it
ranked 614. The model the page serialises grows from 868 KB to 3,054 KB of
JSON and the load's longest request chain from 2 to 5. Browser frame time at
this size was not measured here.

Tests: `tests/workspace-map-row-cap.test.ts` (capped map equals uncapped,
read by read; the node budget and R4 §3.7 at the real cap; co-changes; the
halo and its truncation note; the module card), emulator shapes in
`tests/postgrest-pglite.test.ts`, pager units in
`lib/supabase/{row-pages,table-pages}.test.ts`. Desktop only; no mobile
acceptance (track rule). Evidence:
[`.omo/evidence/research-re-04-map-row-cap.md`](../../../.omo/evidence/research-re-04-map-row-cap.md) ·
handoff: [`CLAUDE_TO_CODEX_HANDOFF_RE-04-MAP.md`](../../reports/CLAUDE_TO_CODEX_HANDOFF_RE-04-MAP.md).
