# Phase 4 · Wave A′ · todo 7 — db_object nodes and the database family

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/ingest/schema-links.ts` (new), the scan plan and its strict
schema, `supabase/migrations/202609060001_database_objects.sql`,
`apps/web/lib/map/workspace-map.ts`, `graph-model.ts` and the display maps,
`packages/mcp` (`db_object`, `defines`/`modifies`/`queries`),
`apps/web/lib/mcp/supabase-store.ts`, `tests/helpers/github-shaped-plan.ts`
(extracted so both two-path tests share one GitHub transport).

## What the graph could not answer

"What touches the `findings` table" is a question every change to this
repository raises, and the graph had no node to ask it about. The schema was
in the tree the whole time — 41 files of it — read only as text.

## Two tiers, the resolver's reason

- **The SQL says it.** `create table/view/function` → an object and a
  `defines` edge; `alter table` → `modifies`; `references public.x(id)` → a
  foreign key from the table the statement is inside. `resolved`,
  confidence 1.
- **The code names it.** `.from('t')`, `.rpc('f')`, `__tablename__`,
  `Table('t')`, `prisma.t` → `queries` at **`reference`, 0.6**, and only for
  names this repository owns. A string that matches a table name is not proof
  the call reaches that table, and `.from("stripe_customers")` in a project
  with no such table points outside the repository — the graph says nothing
  rather than inventing a node for a table it has never seen.

Statement tracking is linear on purpose: a foreign key belongs to whichever
table was last opened above it. That is what a migration looks like, and a
parser that tried to be cleverer would need a SQL grammar the scan has no
reason to carry (ADR-014).

## What was measured

This repository, from the scan plan (746 artifacts, working tree clean):

| Measure                          | Value    | Plan estimate |
| -------------------------------- | -------- | ------------- |
| **Tables**                       | **46**   | 43            |
| **Functions**                    | **64**   | 59            |
| Views                            | 0        | —             |
| `defines` edges                  | 137      | —             |
| `modifies` edges                 | 141      | —             |
| Foreign keys (`references`)      | 66       | —             |
| **`queries` edges**              | **158**  | ≥100          |
| **Total database-family edges**  | **502**  | —             |
| Files holding a query literal    | 40       | —             |
| Distinct objects a query names   | 56       | —             |
| Schema files parsed              | 41       | —             |

46 and 64 against the plan's 43 and 59: the extra three tables and five
functions are this wave's own migrations — `directories`, `routes` and
`db_objects` plus `derive_edge_family`, `next_route_url` and their siblings.
The estimate was made before Wave A′ wrote them.

`defines` (137) exceeds the object count (110) because a migration chain
re-creates `apply_repository_scan` in every migration that touches it; each
statement is a real `defines` edge from its own file. The **object** keeps the
newest declaring file as its `source_path`, because that is where the current
definition is and that is the file a reader wants opened.

## The blind spot, stated

**A table name the code computes is not detected and cannot be.**
`.from(tableName)`, `.from(\`${schema}.${table}\`)` and `.from(TABLES["todos"])`
produce no edge: the scan reads text, and the value only exists while the
program runs. `tests/database-objects.test.ts` asserts the absence, so that a
later "clever" heuristic cannot quietly start inventing a `queries` edge out
of a variable name.

Two more limits, recorded as OQ-050 and OQ-051: identity is the bare
lower-cased name, so `public.events` and `analytics.events` would collapse
into one node in a multi-schema repository; and a `queries` edge is per file
and table, not per call site, so a file that reads a table twenty times keeps
one edge and the first line.

## Two paths, and why this one carries the name

Directories and routes are derived in SQL from the stored paths, so the plan
cannot express them and the two ingest paths cannot disagree (ADR-013). An
object's name is in the file **body**, so it has to travel in the plan —
which makes the equivalence an assertion rather than a construction:
`tests/database-objects.test.ts` scans `fixtures/layout-variants/next-fastapi`
through the CLI source and through the real `GitHubRepositorySource` (stubbed
fetch, same files) and asserts `schemaObjects` and `schemaLinks` are equal.
The GitHub transport helper moved to `tests/helpers/github-shaped-plan.ts`
so the two two-path tests share one implementation.

What travels is the name, the kind and the line. The DDL that declares a
table is a source body and stays in the file (WORK_SPEC §3-3);
`scripts/verify-scope-boundaries.ts` passes at 12 boundaries, 321 files.

## Display and MCP

The **database band already existed** (Wave A todo 4): an object's anchor path
is its declaring migration, which lands under `supabase/` — so the schema
layer paints itself into the band it belongs to with no special case. What
this todo added is the node type, the legend entry and a **square** swatch —
shape carries kind where colour already carries the band. The canvas sprite
pool that makes the square true everywhere is Wave B todo 12's.

`McpNodeType += "db_object"` and `McpEdgeRelation += defines|modifies|queries`,
with the object's declaring migration as its path — without them
`buildGraphView` would drop every database edge on the floor, the way it
dropped route edges before todo 6. Deliberately no new tool field: `impact_of`
and `get_neighbors` answer about tables through the vocabulary alone.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(148 files, 1,201 passed, 1 skipped — 11 more than todo 6),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
321 files).

`tests/database-objects.test.ts` (11 cases): the four statement forms with
quoting and schema qualifiers stripped; a foreign key's owner, span and tier;
a self-referencing table producing no edge; an object declared once across a
re-creating migration; the five query conventions; the computed-name absence;
resolution dropping an unowned target; one edge per file and table; the
fixture snapshot end to end through the database; tier, family, confidence
and provenance span for all four relations; the full-relink sweep against the
incremental one; and the two-path equality.
`tests/workspace-map.test.ts` reads `db_objects` as the signed-in owner, which
is what proves the new table's grants and RLS policy exist.

## Not verified here

- **`/app/map` in a browser.** The legend gained a `테이블·함수` entry, in
  `map-screen.tsx` — a signed-in route. The dev server answers `/app/map`
  with a 500 here (`Missing required environment variable:
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the gitignored `.env.local` is not in
  this worktree and Supabase needs a Docker daemon), so the entry is verified
  by typecheck, the Korean-copy guard and the token guard, not by a rendered
  page. The demo `/map` route does render, with the `데이터베이스` band at 0
  as its fixture has no schema — no regression from the display changes.
- **Playwright** (no Docker daemon): every e2e spec touched by Waves A and A′
  still owes a run on a machine that has one.
- **`/app/map` TTFB** before and after the schema layer — 110 more nodes and
  502 more edges on this repository, unmeasured. The `database` family budget
  (3,000) was set in todo 3 and is not yet stressed.
- **Views.** This repository declares none, so the `view` branch is covered by
  a unit case over a source string, not by a real scan.
- **A schema-heavy fixture.** `next-fastapi` has two tables and no query
  literal, so the fixture snapshot proves `defines` end to end but the
  `queries` path through the database is proved by a stated plan rather than
  by a scanned one. Todo 8's density gate re-measures the fixture; a table
  and a `.from()` are cheaper to add there, in one change, than here.
