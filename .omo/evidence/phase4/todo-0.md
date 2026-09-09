# Phase 4 · Wave A · todo 0 — link recovery

**Date:** 2026-09-04 · **Scope:** `packages/core` (resolver, scanner, ingest
contract), `packages/cli`, `apps/worker`, `apps/web` (graph engine, local
ingest store), `supabase/migrations/202609040001_link_recovery.sql`,
`scripts/measure-graph-density.ts`, `fixtures/layout-variants/`.

## What the scan could not do before

1. **Non-relative specifiers were dropped.** `resolveTypeScriptSpecifier`
   returned `null` for anything not starting with `.`, so `@alrescha/core`,
   `@/lib/x` and `from app.core.config import settings` produced no edge.
2. **Unchanged files were never re-linked.** An incremental scan parses only
   files whose blob sha moved, so a resolver improvement reached only files
   that happened to change afterwards. On a settled repository, none.
3. **The force layout counted a pair once per relation.** Two files that both
   import and call each other were two springs, and a flat link strength
   pulled a 40-neighbour hub 40 times harder than a leaf.

## What was measured

Full local scan of this repository (`node --import tsx
scripts/measure-graph-density.ts .`), resolver generation 2:

| Measure | v1 (relative only, no coverage) | v2 (this change) |
| --- | --- | --- |
| Structure links | 1,486 | 1,675 |
| Coverage (`tests`) links | 0 | 326 |
| Distinct connected pairs | 988 | 1,109 |
| Links total | 1,486 | 2,001 |

Both columns come from the same parse set, so the difference is the resolver
alone (`compare-resolvers` probe, scratch). The full-repository report is
[`graph-density-2026-09-04.md`](graph-density-2026-09-04.md): 502 nodes,
1,994 edges, average degree 7.94 by edges and 4.40 by distinct pairs, 9.2% of
nodes with no link, 546 triangles.

**The honest headline is the relink, not the aliases.** Alias, barrel and
Python-root resolution are worth +12.7% more structure links on this
repository, because this repository mostly imports by relative path. The
order-of-magnitude number in the Phase 4 research — roughly 135 structure
edges stored in production for this same tree — is a consequence of defect 2,
not defect 1. What alias resolution changes is *which* links can exist at all:
a cross-package or cross-language edge has no other source, and a Next.js app
using the stock `@/*` alias has no relative imports to fall back on.

Two fixture repositories pin that, because a repository-wide count cannot tell
a working alias resolver from a broken one at 12% of the signal:

- `fixtures/layout-variants/monorepo-aliases` — package name, subpath export,
  named barrel, `export *` barrel, tsconfig `paths`, all resolved.
- `fixtures/layout-variants/next-fastapi` — Next.js `@/*` including a
  directory import through an index barrel, plus FastAPI modules resolved
  against the `backend/` source root that `pyproject.toml` marks.

## What is deliberately not claimed

- **No `verified` promotion.** The derived `tests` relation is `reference`
  (0.6), method `test-import`. A test importing a file is not a passing run.
  Asserted in `tests/code-links.test.ts` both per-link and repository-wide.
- **No performance claim.** The scan-time regression guard (10s on the demo
  fixture) still holds, and the set-based SQL replaces a per-link loop, but no
  before/after timing is published — that needs the browser and database
  benchmarks in Wave B and Wave E (ADR-012).
- **No manifest text anywhere.** `package.json`, `tsconfig.json` and
  `pyproject.toml` are read transiently to derive alias rules and are never
  stored or uploaded. `packages/cli/src/push.test.ts` plants a sentinel in
  both a manifest body and a source body and asserts neither reaches the wire;
  `scripts/verify-scope-boundaries.ts` now fails the build on a
  `manifestText`-shaped payload.

## Determinism and equivalence

- **Two ingest paths stay equal.** Both call the same `scanRepository` over a
  `RepositorySource`, and manifests are read through that same interface, so
  the GitHub path and `alrescha push` derive identical rules from identical
  inputs (ADR-013). `tests/local-ingest.test.ts` still asserts byte-identical
  plans and identical graphs.
- **Barrel attribution does not depend on scan history.** An incremental pass
  reads back the barrels its changed files import through (bounded: 200 extra
  bodies, 4 rounds, index files and package entry points only), so the edge a
  file gets is the same one a full scan would give it. Asserted directly in
  `tests/code-links.test.ts`.
- **Manifests are re-read on every pass** — including incremental ones —
  because a partial alias table would resolve fewer specifiers than a full
  scan on the same commit. `tests/scan-fetch-concurrency.test.ts` now pins
  that: unchanged artifacts are still never re-fetched, manifests always are.

## Persistence

`202609040001_link_recovery.sql`:

- `repositories.link_schema_version` (default 1), stamped only by a full plan
  and never lowered.
- `tests` joins `imports`/`calls` in the stale-edge delete set. Evidence-
  sourced `tests` edges (a CI run supporting a file) are not artifact-sourced
  and are outside the delete.
- `linkScope: "full"` replaces the repository's artifact-sourced structure
  edges rather than only those of rescanned files — the case the old
  path-scoped delete could not express, since a relinked file emits links
  without emitting an artifact row.
- The per-link loop becomes one `insert … select … on conflict` over
  `jsonb_to_recordset`-style expansion, with `distinct on` so a plan that
  repeats a link cannot hit the same conflict row twice.

## Also fixed here

`packages/cli/src/local-source.ts` skipped `.claude/worktrees`, which holds
complete working-tree copies of the repository. A CLI scan walked into them
and reported **2,921 nodes instead of 502** for this repository. Git excludes
the directory, so the GitHub path never saw them: skipping them is what keeps
the two paths equal.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `pnpm test`
(142 files, 1,066 passed, 1 skipped), `node --import tsx
scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries, 310 files).
No test assertion was weakened; three expectations were widened to the new
truth and eleven tests were added.

## Not verified here

Playwright cannot run in this environment: the suite needs the local Supabase
stack, and no Docker daemon is installed on this machine. The map screens were
checked by hand instead — `/map` renders the demo graph with the new
deduplicated, degree-normalised springs and reports no console errors — and
the layout itself is covered by the 43 unit tests in
`tests/graph-engine.test.ts`, including the frame-budget and spread cases.
The e2e specs that touch the graph (`brain-map`, `graph-facets`,
`live-graph`, `workspace-map`, `dashboard-hud`) still need a run on a machine
with Docker before Wave B lands.

> **정정(2026-09-09):** 위 문단의 "no Docker daemon is installed on this
> machine" 전제는 틀렸다. Docker는 이 머신에 설치되어 있고, 로컬 Supabase 위에서
> Playwright 전체 스위트가 돈다 — 경위는 [e2e-debt.md](e2e-debt.md), 재실행
> 기준 **149 passed / 1 skipped**. 이 문단이 "Wave B 전에 실행이 필요하다"고
> 미뤄둔 다섯 스펙(`brain-map`, `graph-facets`, `live-graph`, `workspace-map`,
> `dashboard-hud`)은 그 실행에 포함되어 11개 테스트가 모두 통과했다.
