# Graph density — `.`

Measured 2026-09-05 by `scripts/measure-graph-density.ts` against the
working tree, resolver generation 3, link scope
`full`. Scan took 5140 ms. These are
measurements of the deterministic scan only: nothing here involved credits,
AI output, or the database.

Directory nodes and their `contains` edges are **not** counted here: the scan
plan does not carry them, because `apply_repository_scan` derives the
hierarchy from the stored paths so that both ingest paths cannot disagree
about it (Phase 4 Wave A todo 3). Add them from the database, or from the
artifact paths below, when comparing against a density target that includes
the hierarchy layer.

| Measure | Value |
| --- | --- |
| Nodes (file artifacts) | 736 |
| Code files | 481 |
| Edges (structure links) | 3060 |
| Distinct connected pairs | 2122 |
| Average degree (edges) | 8.32 |
| Average degree (distinct pairs) | 5.77 |
| Nodes with no link | 8.6% |
| Code files with no link | 10 |
| Triangles | 1349 |

Edges by relation:

| Relation | Count |
| --- | --- |
| imports | 1127 |
| references | 1023 |
| calls | 571 |
| tests | 339 |

Edges by tier:

| Tier | Count |
| --- | --- |
| resolved | 2489 |
| reference | 571 |

Edges by resolution method — `alias-resolution`, `barrel-resolution` and
`test-import` did not exist before resolver generation 2, so their counts are
the links this repository's graph previously had no way to draw:

| Method | Count |
| --- | --- |
| module-resolution | 842 |
| path-exists | 723 |
| import-binding | 570 |
| test-import | 339 |
| barrel-resolution | 261 |
| basename-owner | 231 |
| doc-link | 69 |
| alias-resolution | 24 |
| name-match | 1 |

Degree histogram (distinct neighbours per node):

| Degree | Nodes |
| --- | --- |
| 4-7 | 223 |
| 2-3 | 181 |
| 8-15 | 129 |
| 1 | 95 |
| 0 | 63 |
| 16-31 | 38 |
| 32+ | 7 |

Artifacts by classification:

| Classification | Count |
| --- | --- |
| code_metadata | 479 |
| doc | 132 |
| schema | 45 |
| spec | 19 |
| style | 19 |
| config | 18 |
| todo_progress | 13 |
| adr | 5 |
| agents | 2 |
| claude | 2 |

Highest degree:

| Node | Neighbours |
| --- | --- |
| `spec/OPEN_QUESTIONS.md` | 103 |
| `packages/core/src/index.ts` | 46 |
| `apps/web/lib/dashboard/graph-model.ts` | 45 |
| `spec/BUILD_PLAN_PHASE4.md` | 43 |
| `packages/core/src/ingest/repository-scanner.ts` | 41 |
| `tests/helpers/database.ts` | 41 |
| `apps/web/lib/auth/current-user.ts` | 32 |
| `.omo/evidence/naming-cleanup.md` | 30 |
| `apps/web/lib/supabase/server.ts` | 30 |
| `apps/worker/src/run-local.ts` | 29 |
