# Graph density — `.`

Measured 2026-09-05 by `scripts/measure-graph-density.ts` against the
working tree, resolver generation 3, link scope
`full`. Scan took 5290 ms. These are
measurements of the deterministic scan only: nothing here involved credits,
AI output, or the database.

| Measure | Value |
| --- | --- |
| Nodes (file artifacts) | 730 |
| Code files | 479 |
| Edges (structure links) | 3032 |
| Distinct connected pairs | 2096 |
| Average degree (edges) | 8.31 |
| Average degree (distinct pairs) | 5.74 |
| Nodes with no link | 8.4% |
| Code files with no link | 9 |
| Triangles | 1328 |

Edges by relation:

| Relation | Count |
| --- | --- |
| imports | 1126 |
| references | 996 |
| calls | 571 |
| tests | 339 |

Edges by tier:

| Tier | Count |
| --- | --- |
| resolved | 2461 |
| reference | 571 |

Edges by resolution method — `alias-resolution`, `barrel-resolution` and
`test-import` did not exist before resolver generation 2, so their counts are
the links this repository's graph previously had no way to draw:

| Method | Count |
| --- | --- |
| module-resolution | 841 |
| path-exists | 698 |
| import-binding | 570 |
| test-import | 339 |
| barrel-resolution | 261 |
| basename-owner | 231 |
| doc-link | 67 |
| alias-resolution | 24 |
| name-match | 1 |

Degree histogram (distinct neighbours per node):

| Degree | Nodes |
| --- | --- |
| 4-7 | 223 |
| 2-3 | 179 |
| 8-15 | 128 |
| 1 | 95 |
| 0 | 61 |
| 16-31 | 38 |
| 32+ | 6 |

Artifacts by classification:

| Classification | Count |
| --- | --- |
| code_metadata | 477 |
| doc | 130 |
| schema | 44 |
| spec | 19 |
| style | 19 |
| config | 18 |
| todo_progress | 12 |
| adr | 5 |
| agents | 2 |
| claude | 2 |

Highest degree:

| Node | Neighbours |
| --- | --- |
| `spec/OPEN_QUESTIONS.md` | 101 |
| `packages/core/src/index.ts` | 45 |
| `apps/web/lib/dashboard/graph-model.ts` | 44 |
| `spec/BUILD_PLAN_PHASE4.md` | 41 |
| `packages/core/src/ingest/repository-scanner.ts` | 40 |
| `tests/helpers/database.ts` | 39 |
| `apps/web/lib/auth/current-user.ts` | 31 |
| `.omo/evidence/naming-cleanup.md` | 29 |
| `apps/web/lib/supabase/server.ts` | 29 |
| `apps/worker/src/run-local.ts` | 28 |
