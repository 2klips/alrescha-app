# Progress, inspection, home and harness past PostgREST's row cap — 2026-09-24

Status: **built and tested locally; production after Codex's rollout** (RE-04, stacked on the unpushed map row-cap branch, itself on the RE-04 cost branch).

PostgREST answers with at most `max_rows` rows — 1,000 — and says nothing
about it. The map was read past it first
([`2026-09-24-map-row-cap.md`](./2026-09-24-map-row-cap.md)); four more
screens still asked for a whole table in one request and took the answer as
all of it. Each of those reads now pages until its rows are in hand, the
workspace predicate on every page, and none gains a budget. Reads with a
budget of their own stay one request. No component, style, copy, builder or
exported row type changed: the screens draw what the loaders now hand them,
and the UI track's `home-screen.tsx` is untouched.

| Surface                                                           | Change                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/progress/progress-report.ts` (`/app/progress`)               | Requirements, `implements` edges and todos page by id. The coverage ledger is a count, so a capped page under-reported it. Todos arrive in id order (the order they were written).                   |
| `lib/inspection/inspection-report.ts` (`/app/inspection`)         | The freshness widget's documents and the todo count page by id; the risk rows were already the map's paged reads.                                                                                    |
| `lib/home/journey.ts` (`/app`)                                    | Repositories and MCP tokens page by id; repositories are put back newest-created first with the map's tie-break (`newestCreatedFirst`), so the home and the map name one current repository.         |
| `lib/harness/harness-rows.ts`, `app/app/(shell)/harness/page.tsx` | The page's reads move into the lib. Instruction files keep the database's `order by path` (its collation, which no TypeScript sort reproduces), paged by position in `(path, id)`; names page by id. |
| `lib/supabase/{row-pages,table-pages}.ts`                         | `readEveryRowByPosition`: a read by position with no budget, its later ranges ended at the first page's exact count (`PageRequest.total`). `readRowsByPosition` still refuses one.                   |
| `lib/shell/current-repository.ts`, `lib/map/workspace-map.ts`     | The map's `newestFirst` moves here as `newestCreatedFirst`, shared by the home.                                                                                                                      |

Red before the fix, under an emulated cap of 10: the ledger read 8 of 19
active requirements and 10 of 27 todos (coverage 50% where it is 74%);
inspection listed 10 of 63 documents; the home found 10 of 25 repositories
and 5 of 12 active tokens and named another current repository; the harness
drew 10 of 31 files. At the real cap, 1,000 of 1,100 todos, instruction
files and tokens.

What the pilot will show: on the local reconstruction at `488c0c4` (the map
probe's method) the documents read holds 90 rows and the harness 4 — far
under the cap — and requirements, todos and `implements` edges are written
by the analyze job, so they are empty there; an older record names 127
active requirements. So no number on these screens is expected to move on
the pilot today: the fix is for a workspace past a thousand rows. Production
counts were not read. What can move is order where none was asked for:
todos within a progress column, which came in whatever order the database
returned them, now come in id order.

Tests: `tests/screen-loaders-row-cap.test.ts` (each loader capped equals
uncapped, read by read; every page carries the workspace predicate; the
reads past the cap page and the rest stay one request; the ledger, the
harness order and the token count at the real cap), emulator shapes (`like`,
`HEAD` counts, json paths) in `tests/postgrest-pglite.test.ts`, pager units
in `lib/supabase/{row-pages,table-pages}.test.ts`, and
`lib/shell/current-repository.test.ts`. Desktop only; no mobile acceptance
(track rule). Handoff:
[`CLAUDE_TO_CODEX_HANDOFF_RE-04-LOADERS.md`](../../reports/CLAUDE_TO_CODEX_HANDOFF_RE-04-LOADERS.md).
