# Graph density — `.`

Measured 2026-09-04 by `scripts/measure-graph-density.ts` against the
working tree, resolver generation 2, link scope
`full`. Scan took 531 ms. These are
measurements of the deterministic scan only: nothing here involved credits,
AI output, or the database.

| Measure | Value |
| --- | --- |
| Nodes (file artifacts) | 502 |
| Code files | 476 |
| Edges (structure links) | 1994 |
| Distinct connected pairs | 1104 |
| Average degree (edges) | 7.94 |
| Average degree (distinct pairs) | 4.40 |
| Nodes with no link | 9.2% |
| Code files with no link | 20 |
| Triangles | 546 |

Edges by relation:

| Relation | Count |
| --- | --- |
| imports | 1105 |
| calls | 558 |
| tests | 331 |

Edges by tier:

| Tier | Count |
| --- | --- |
| resolved | 1662 |
| reference | 332 |

Edges by resolution method — `alias-resolution`, `barrel-resolution` and
`test-import` did not exist before resolver generation 2, so their counts are
the links this repository's graph previously had no way to draw:

| Method | Count |
| --- | --- |
| module-resolution | 828 |
| import-binding | 557 |
| test-import | 331 |
| barrel-resolution | 255 |
| alias-resolution | 22 |
| name-match | 1 |

Degree histogram (distinct neighbours per node):

| Degree | Nodes |
| --- | --- |
| 4-7 | 154 |
| 2-3 | 128 |
| 1 | 99 |
| 8-15 | 57 |
| 0 | 46 |
| 16-31 | 15 |
| 32+ | 3 |

Artifacts by classification:

| Classification | Count |
| --- | --- |
| code_metadata | 474 |
| spec | 19 |
| adr | 3 |
| agents | 2 |
| claude | 2 |

Highest degree:

| Node | Neighbours |
| --- | --- |
| `packages/core/src/index.ts` | 41 |
| `apps/web/lib/dashboard/graph-model.ts` | 34 |
| `tests/helpers/database.ts` | 34 |
| `apps/web/lib/auth/current-user.ts` | 30 |
| `packages/core/src/ingest/repository-scanner.ts` | 30 |
| `apps/web/lib/supabase/server.ts` | 28 |
| `apps/web/lib/strings/common.ts` | 22 |
| `apps/web/lib/strings/dashboard.ts` | 22 |
| `apps/web/lib/strings/settings.ts` | 20 |
| `packages/mcp/src/store.ts` | 20 |
