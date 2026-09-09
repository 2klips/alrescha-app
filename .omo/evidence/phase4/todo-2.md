# Phase 4 · Wave A · todo 2 — every text file is a note, documents link

**Date:** 2026-09-05 · **Scope:** `packages/core` (classification, doc links,
repository config, shared ignore list), `packages/cli` (shared ignore list),
`apps/web` (map classification, ingest schema), `apps/worker` (family on
implements edges), `supabase/migrations/202609050001_notes_and_edge_families.sql`,
`scripts/measure-graph-density.ts`, `scripts/verify-scope-boundaries.ts`.

## What the graph could not contain before

1. **Most of the repository was not in it.** `classifyArtifactPath` knew eight
   path shapes; a `README.md`, a migration, a stylesheet and a `package.json`
   returned null and got no node. 40% of this repository's tracked files had
   nowhere to be (R5 §2.2 D5).
2. **Prose pointed at code and nothing read it.** The rules engine walked the
   same inline-code nodes to decide whether a reference had gone stale, then
   dropped them — so a document and the file it describes shared no edge
   (R4 §3.8 ③).
3. **The two ingest paths disagreed about what a repository is.** The CLI
   skipped `.omo`, which git tracks; the GitHub path did not. The same commit
   produced different artifacts depending on how it was ingested (ADR-013).
4. **Every edge looked alike to a reader.** Read limits, force strength and
   draw policy have to be decided per family (R5 §2.5), and the table had no
   column to decide them from.

## What was measured

Full local scan of this repository, resolver generation 3
(`scripts/measure-graph-density.ts . --mode full`), report:
[`graph-density-2026-09-05.md`](graph-density-2026-09-05.md).

| Measure                  | todo 0 (gen 2) | todo 2 (gen 3) |
| ------------------------ | -------------- | -------------- |
| Nodes                    | 502            | **730**        |
| Edges                    | 1,994          | **3,032**      |
| Distinct connected pairs | 1,104          | **2,096**      |
| Average degree (pairs)   | 4.40           | **5.74**       |
| Nodes with no link       | 9.2%           | **8.4%**       |
| Triangles                | 546            | **1,328**      |

New artifacts by classification: doc 130 · schema 44 · style 19 · config 18.
New edges: `references` **996** — doc→file 657, doc→doc 339; by tier 765
resolved / 231 reference; by method 698 `path-exists`, 231 `basename-owner`,
67 `doc-link`. 125 of 171 documents carry at least one link.

The plan's Wave A band was ~3,200 edges at ~5.9 average degree; the edges and
the degree are there, the node count is not, because directory nodes (todo 3)
and the hub families (Wave A′) are what the remaining ~340 nodes are.

### The acceptance number, stated both ways

doc→file is **657 with `.omo/evidence` in scope, 187 without**. The criterion
(≥300) is met only because evidence logs are scanned — which is exactly what
OQ-043 decided and asked to be measured. The links are real (every target
resolves against the tree), the way out exists (`.alrescha.json ignore`, this
todo), and the way to fold them on screen is Wave B's layer toggle. Recorded
as **OQ-048** rather than quietly enjoyed.

R5 §1.2's estimate for this repository was doc→file 973 and doc→doc 90. The
measured shape is different in both directions because it counted *mentions*
and this counts *relationships*: one edge per (document, target) pair whatever
the mention count, and a markdown link to a note counts as doc→doc.

## What is deliberately not claimed

- **No new grade, no promotion.** Document links are `resolved` (the path
  exists) or `reference` (a unique basename), never `verified`; an ambiguous
  name yields no edge at all. Asserted per case in `tests/doc-links.test.ts`.
- **No document text anywhere.** A `DocLink` carries `kind`, `method`,
  `sourcePath`, `span`, `targetPath`, `tier` — asserted by key list — and the
  matched token is dropped after resolution. `scripts/verify-scope-boundaries.ts`
  now fails the build on `docText`/`documentBody`/`excerptText`-shaped payloads,
  re-proved by planting one (`tests/scope-fidelity.test.ts`).
- **The rules engine did not widen.** `isDocument` was "not code", which would
  have handed every stylesheet, migration and config file to remark and made
  the analyze job fetch their bodies. It now names the seven prose
  classifications outright; `doc` is deliberately not among them (OQ-041 is
  the product decision about README-derived requirements).
- **No new credit path.** Everything here is deterministic.

## Persistence

`202609050001_notes_and_edge_families.sql`:

- `artifacts_classification` and `artifacts_kind` widened by four each.
- `edges.family` — CHECK over the eight families, index on
  `(workspace_id, repository_id, family)`, and **filled by a BEFORE trigger
  when a writer omits it**. Two relations depend on who is speaking:
  `references` is `doc` from a document, `structure` from a rationale,
  `semantic` from a concept; `implements` is `evidence` from a requirement and
  `semantic` from the concept layer. A default would have quietly filed
  concept synthesis under `structure`; the trigger derives it instead, and a
  writer that knows (this function, the analyze job) states it and pays
  nothing.
- The backfill runs the same derivation over existing rows, and
  `tests/edge-families.test.ts` proves it by migrating a database that already
  holds all six edge shapes.
- `apply_repository_scan` v7 applies `docLinks` with the same scoping the code
  links use: an incremental plan replaces the links of the documents it
  re-read, a full relink replaces all of them. The delete names artifact
  sources and `family = 'doc'`, so rationale-sourced `references` are outside
  it.

## Scan behaviour

- `LINK_SCHEMA_VERSION` 2 → **3**, so repositories stamped with the older
  generation relink in full and pick up document links instead of waiting for
  each file to change (R5 §2.2 D2).
- A full relink now re-reads **documents as well as code** — the same defect,
  one layer up. Pinned in `tests/scan-fetch-concurrency.test.ts`, which also
  pins that nothing else is re-read.
- A manifest is usually an artifact now (`package.json` is config), so the
  manifest slot carries the classification and **one fetch does both jobs**:
  the fixture scan's fetch count went from `artifacts + manifests` to
  `artifacts`, with no artifact left unread.
- `.alrescha.json` is read once before classification and its `ignore` globs
  are applied to both paths. The other fields wait for todo 4's
  `layout_config` (**OQ-047**) — storing them now would persist settings
  nothing reads.
- `DEFAULT_IGNORED_SEGMENTS` / `DEFAULT_IGNORED_PATHS` are one constant the
  scanner applies and the CLI walker reuses; `.omo` left the CLI's private
  copy, which is what closed the two-path divergence.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(144 files, 1,139 passed, 1 skipped — 37 more than todo 1's 1,102),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
314 files). Two-path equivalence (`tests/local-ingest.test.ts`) still holds and
now asserts that the equality is about something: identical `docLinks`, and a
`config` artifact present on both sides.

No assertion was weakened. Four were widened to a new truth, each with a
stronger positive assertion beside it:

- the fixture artifact manifest gained `package.json` and `tsconfig.json`,
  with digests recomputed independently from the files rather than from the
  scan output;
- `classifyArtifactPath("docs/guide.md")` is `doc` rather than null, and the
  case now also pins that the named rules still beat the generic one;
- the full-relink test asserts documents *are* re-read, and pins the whole
  fetch set instead of only what is absent from it;
- the fetch-count test states one fetch per file and that the manifests are
  among the artifacts.

## Not verified here

- **Playwright.** No Docker daemon on this machine. The screens that read
  `classification` (map, overview, facet bands) are covered by unit tests;
  `/app/map` on a real scan still owes an e2e run, together with the specs
  todo 0 and todo 1 listed.
- **The `unknown` node type still has no production sighting**, which is what
  todo 3's "2,001 seeded nodes, `unknown` 0" is for. `schema`, `style` and
  `config` artifacts render as `code` nodes until the hub families (Wave A′)
  and the `unit` tag (todo 4) give them their own shapes.
- **Scan time** grew from 531 ms to 5.3 s on this repository's full relink,
  because every document is now parsed as markdown. The fixture guard (10 s)
  holds and `tests/doc-links.test.ts` pins it, but no per-stage profile was
  taken — todo 3's TTFB measurement is the next place that matters.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
