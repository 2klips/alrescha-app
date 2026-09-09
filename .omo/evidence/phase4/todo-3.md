# Phase 4 · Wave A · todo 3 — directory nodes, containment, and no server layout

**Date:** 2026-09-05 · **Scope:**
`supabase/migrations/202609050002_directory_nodes.sql`,
`apps/web/lib/map/workspace-map.ts`, `apps/web/lib/dashboard/graph-model.ts`
(types, B boundary), display maps and tokens, `scripts/measure-graph-density.ts`.

## What the map could not say before

1. **There was no hierarchy axis at all.** 730 files sat in one force field
   with nothing to say that forty of them are the same package. Folders are
   the cheapest hub a repository already has — every file states its own.
2. **Past 600 nodes the map said less, not more.** `clusterGraph` collapsed
   everything into fifteen `type:grade` super-nodes joined in an arbitrary
   index chain, so a repository that grew got a *worse* picture (R5 §2.2 D4).
3. **The server laid out a graph the client throws away.** The renderer
   simulates in a Web Worker; the loader still ran an O(n²) force layout on
   every request (MT-6).
4. **One 6,000-edge cap decided which half of the graph you saw.** Whichever
   family sorted first filled it.

## What was measured

Derived hierarchy over this repository's own paths (probe over the scan plan,
same rule the SQL applies):

| Measure                         | Value                           |
| ------------------------------- | ------------------------------- |
| File artifacts                  | 732                             |
| Directory nodes                 | **142**                         |
| `contains` edges                | **851**                         |
| Directories marked `package`    | 5 (plus the repository root)     |
| Nodes with the hierarchy layer  | **874**                         |

R5 §2.4 estimated ~145 directories and ~885 containment edges; the measured
tree is 142 and 851.

Server-side layout cost removed from the request path (`forceDirectedLayout`,
48 iterations, measured in isolation on this machine):

| Nodes | Time   |
| ----- | ------ |
| 502   | 58 ms  |
| 730   | 45 ms  |
| 2,000 | 336 ms |

That is CPU time on the request path, not a TTFB measurement — the honest
name for it is "the work that no longer happens per request". A real
before/after TTFB needs the local Supabase stack, which this machine cannot
run (no Docker daemon); it stays owed.

## How the hierarchy is derived

In SQL, from the artifact paths already stored, at the end of
`apply_repository_scan`. **The plan never mentions a directory** — no field,
no rows — so the GitHub path and `alrescha push` cannot disagree about the
tree the way two scanners could (ADR-013, R5 §2.3's "SQL 경로 유도"). The
byte-equality test asserts exactly that, and `tests/local-ingest.test.ts` now
compares the derived directories and containment between the two paths.

- One node per ancestor directory of a tracked file. A root-level file gets
  no parent: a folder holding the whole repository says nothing.
- `role = 'package'` when the directory holds a `package.json` or
  `pyproject.toml`, and the role changes in place when the manifest arrives
  or leaves.
- Containment is replaced wholesale each scan — it is a pure function of the
  path set, and the path set is what changed.
- A directory that stops holding anything is deleted, and the whole empty
  chain goes with it, not only its leaf.
- `family: 'hierarchy'`, `tier: 'resolved'`, `reason: 'path containment'`,
  `layoutOnly: true`. Provenance is required on every edge and containment has
  no span, so it carries the reason it exists (WORK_SPEC §3-2, OQ-037).

## Read path

- **No server-side layout.** The model ships `x: 0, y: 0` for every node,
  asserted directly.
- `MAP_CLUSTER_THRESHOLD` (600, `type:grade` collapse) is replaced by
  `MAP_HIERARCHY_FOLD_THRESHOLD` (3,000), which reports that the *client*
  should fold by hierarchy assignment. Wave B todo 12 owns the folding; the
  server no longer decides it.
- Hubs read on their own budget (`DIRECTORY_LIMIT` 300) so they never compete
  with files for the 2,000-node cap, and edges are read **one query per
  family** with per-family budgets (R5 §2.5, OQ-038). The budgets are pinned
  as a contract test. `route` and `database` have no writer until Wave A′;
  their budgets are stated now so that wave inherits a contract rather than
  inventing one.
- A `family is null` query runs beside the eight: the todo 2 migration
  backfilled every row, so it is empty on a migrated database — and visible
  rather than silently dropped if it ever is not.
- `contains` edges arrive flagged `layoutOnly`, and the test asserts no other
  family carries the flag.

## Types (the A↔B boundary, pre-committed)

`GraphNodeType += directory`, `GraphEdge += family · layoutOnly`,
`GraphEdgeFamily` over the eight families. `graphNodeArea` reads a directory's
path with a trailing slash, so `spec` files under `spec/` rather than being
read as a root-level file — pinned by comparing a folder's area with the area
of a code file inside it. A `--node-directory` token (muted, both themes)
joins the palette; the sprite itself is Wave B todo 12's.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(145 files, 1,149 passed, 1 skipped — 10 more than todo 2),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
315 files).

New coverage: `tests/directory-nodes.test.ts` (tree snapshot, convergence,
sweep of an emptied chain, role changes, provenance shape, and that the plan
cannot express a directory), the force-layout case that containment tightens a
folder's cluster radius, the 2,001-node read (`unknown` 0, nothing collapsed),
the zero-coordinate assertion, and the read-budget contract.

Two assertions were widened to a new truth, each with stronger positive
assertions beside it: the old "clusters past 600" case became three cases
(2,001 nodes keep their identity and classification, no coordinates ship,
folding is reported only past 3,000), and the family tests now name the
families they are about instead of reading every edge in the table.

## Not verified here

- **`/app/map` TTFB before/after.** Needs local Supabase; no Docker daemon on
  this machine. The removed CPU time is measured above instead.
- **Playwright**, for the same reason. The map screen reads `isClustered`,
  whose meaning changed; its copy is Wave B's to revisit when folding lands.
- **The 3,000-node fold** has no renderer behind it yet — the model reports it
  and nothing folds until todo 12.
- **Pass-through directory folding** (a folder with no files and one child) is
  not implemented. The plan assigns it to the loader; it is display-only, it
  needs the hierarchy assignment Wave B builds to be worth anything, and
  storing the faithful tree keeps MCP and the graph tools honest. Recorded as
  **OQ-049**.
- `scripts/measure-graph-density.ts` measures the plan, so its report does not
  include the hierarchy layer. The report now says so in its own header.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
