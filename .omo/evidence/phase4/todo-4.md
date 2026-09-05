# Phase 4 · Wave A · todo 4 — six domains, unit tags, and a repository's own layout

**Date:** 2026-09-05 · **Scope:** `packages/core/src/ingest/artifact-facets.ts`
(domains, conventions, `deriveArtifactUnit`), `repository-config.ts` (the rest
of `.alrescha.json`), the scan plan and its strict schema,
`supabase/migrations/202609050003_repository_layout_config.sql`,
`apps/web/lib/map/workspace-map.ts`, `graph-model.ts`, area strings, tokens and
the overview bars, `fixtures/layout-variants/next-fastapi/db/`.

## What the colour axis could not say before

1. **There were four bands and one of them was a lie.** A path outside
   `apps/web/`, `apps/`, `packages/`, `spec/`, `docs/`, `tests/` was
   `unclassified`, and `deriveBrainArea` folded it into **backend** without
   saying so — a vendored Ruby library read as server code (R5 §2.2 D5).
2. **There was no database.** 47 schema files in this repository, none of them
   with a band of their own.
3. **The conventions were this repository's.** A `frontend/` + `backend/` +
   `db/` project — the shape the target user actually has — collapsed into two
   bands, and had no way to say otherwise.
4. **Nothing said what a file *is*.** A route, a component, a server action
   and a library file were all "code".

## What was measured

Full local scan of this repository (734 artifacts):

| Area (colour axis) | Count |
| ------------------ | ----- |
| frontend           | 201   |
| tests              | 180   |
| docs               | 173   |
| backend            | 96    |
| **database**       | **47** |
| **other**          | **37** |

All six bands are populated. The 47 database files used to be backend, and the
37 `other` files used to claim to be backend as well.

| Unit tag | Count |
| -------- | ----- |
| lib      | 242   |
| test     | 180   |
| doc      | 173   |
| route    | 47    |
| schema   | 46    |
| component| 39    |
| action   | 7     |

Both axes are derived from data the scan already stored — path,
classification, and the symbol *names* the scanner persisted. No file body is
read, and no symbol signature (WORK_SPEC §3-3).

## Conventions, and what a repository can say instead

Built-in prefixes, most specific first: `apps/web/`, `client/`, `frontend/`,
`src/app/`, `src/pages/`, `ui/`, `web/`, `www/` → frontend; `api/`, `apps/`,
`backend/`, `cmd/`, `packages/`, `server/`, `services/`, `srv/`, `worker/` →
backend; `db/`, `database/`, `drizzle/`, `migrations/`, `prisma/`,
`supabase/` → database, and a `schema` classification is database wherever it
sits.

`src/` is **shared**, not unclassified: a single-app repository keeps
everything there, and putting a whole repository in `기타` is a worse answer
than a plain one. `vendor/` and friends stay unclassified and now render as
`기타` rather than as backend.

`.alrescha.json` is read in full (todo 2 landed `ignore`; this adds `layout`,
`layers.hidden`, `todoFiles`, `progressDocs`). A declared layout is checked
before the built-ins and only *adds* — a path it does not mention keeps its
conventional domain. The **parsed** config travels in the plan, never the
file's text, and `apply_repository_scan` stores it on the repository with the
commit that stated it; a plan that states nothing clears it, so a deleted
settings file cannot keep governing a repository.

## Derived once, read everywhere

`GraphNode` gains `domain` and `unit` (the A↔B interface freeze). The loader
derives them once with the repository's own conventions; `graphNodeArea`
prefers the node's own `domain` and falls back to the path conventions for
demo fixtures, which have no repository to declare anything. A screen that
re-derived the area from the path would disagree with the map about any
repository that calls its server `svc/` — that disagreement is what the
fallback ordering prevents, and a test pins both directions.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(145 files, 1,165 passed, 1 skipped — 16 more than todo 3),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
316 files).

New coverage: the three-tier fixture reads frontend/backend/database with
nothing unclassified; a declared layout overrides the conventions and only
adds; a schema file is database wherever it sits; `기타` is stated rather than
absorbed; unit derivation across all seven values, including that a `.tsx`
file exporting only helpers is a library file; the plan carries parsed config
and not the document; the database stores it with its commit and clears it
when the repository stops stating it; six bands lay out in the shared order.

Two assertions were widened to the new truth, each with a stronger positive
assertion beside it: `BRAIN_AREAS` is now asserted as the exact six-value list
rather than being read implicitly, and the fixture-domain case names which
paths land in each domain rather than only that a domain exists.

Browser-checked (dev server, `/overview`): the six area bars render with the
new Korean labels — 프론트엔드 · 백엔드 · 데이터베이스 · 문서 · 테스트 ·
기타 — and six distinct fills, from tokens only.

## Not verified here

- **Playwright** (no Docker daemon): the band view and overview e2e specs the
  acceptance criteria name still owe a run. The band layout itself is covered
  by unit tests, and the overview bars were checked in the browser.
- **`node-route` and `node-table`** are declared and unused: the node kinds
  they colour arrive with Wave A′. `node-database` and `node-other` have
  consumers today (the overview bars).
- **The `unit` tag has no renderer**: shapes and filter chips are Wave B
  todo 12's. The loader ships the tag; nothing draws it yet.
- **`layersHidden`** is stored and not acted on — a hidden layer is still part
  of the graph until Wave B has a toggle to hide it with.
- **`todoFiles` / `progressDocs`** are stored and not yet read by the todo
  parser; that wiring belongs with the todo identity work in todo 5.
