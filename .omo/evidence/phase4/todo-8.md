# Phase 4 · Wave A′ · todo 8 — section nodes and the density gate

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/ingest/section-links.ts` (new),
`repository-config.ts` (`sectionTokens`), the scan plan and its strict schema,
`supabase/migrations/202609060002_section_nodes.sql`,
`apps/web/lib/dashboard/graph-model.ts` (`NODE_SHAPE`, `DISPLAY_RELATIONS`),
`apps/web/lib/map/workspace-map.ts`, the display maps, `packages/mcp`
(`section`), `apps/web/lib/mcp/supabase-store.ts`,
`tests/graph-density.test.ts` and `tests/section-nodes.test.ts` (new).

## Sections: the decision becomes a node

A repository that writes its decisions down gives them names — `ADR-013`,
`OQ-041`, `MT-7` — and then cites those names everywhere: in other specs, in
evidence logs, in `WHY:` comments. Every one of those citations was pointing
at a string. The declaring heading is now a node, and everything that names
the token hangs off it.

**One home per token.** A token can be declared twice — `## ADR-013 — OQ-013
판정` in the decision record and `# ADR-013 구현 — 스코프 경계 교체` in an
evidence log both open with it — and two homes for one decision is worse than
one home in the wrong file. A `homeRank` derived from the heading alone picks
between them: `TOKEN — title` outranks `TOKEN 산문…`, then a shallower
heading, then the path. `apply_repository_scan` compares the same way, so a
worse-ranked declaration in a later scan never evicts a better one.

A heading that merely *cites* a token — `## Wave 2 — GitHub App 실기 완주
_(G2)_` — declares nothing: the rule is that the heading text starts with the
token and the token is followed by whitespace or nothing. `# ADR-002 — 코어
설계` declares; `# ADR-002와의 관계` does not.

`.alrescha.json` extends the prefix set with **literal prefixes**, never
patterns: that file comes from the repository being scanned, and a regex from
there would run over every document in the tree (OQ-054).

### What was measured

This repository, from the scan plan:

| Measure                       | Value                          |
| ----------------------------- | ------------------------------ |
| Declaring headings            | 86 (ADR 21 · OQ 60 · MT 3 · G 2) |
| **Section nodes**             | **73** (after one-home ranking) |
| **Citation edges**            | **526** (document 444 · rationale 82) |
| Documents that cite one       | 105                            |
| Distinct tokens cited         | 91                             |
| Citations of a token no heading declares | 59 — every one a `G\d+` gate |

The 59 unresolved citations are the honest case: this repository names gates
`G3`–`G14` in prose and declares only `G1` and `G2` with a heading. The SQL
join drops them rather than inventing a node for a gate nobody wrote down.

Highest cited: `ADR-013` 44, `ADR-011` 37, `ADR-015` 26, `ADR-009` 25.

## The four-shape grammar

`NODE_SHAPE` in `graph-model.ts` states which shape each node kind gets —
leaves circle, containers ring, a URL diamond, a table square — as **data**.
Wave B todo 12 owns the texture sprite pool that draws it; stating the grammar
in the data layer is what keeps the renderer, the legend and the overview from
each inventing one.

## The gate

`tests/graph-density.test.ts` runs against the **database**, not the plan,
because half of what the galaxy is made of (the hierarchy, the routes) is
derived in SQL and never appears in a plan at all.

### Where each threshold applies — and why not on the fixtures

`BUILD_PLAN_PHASE4`'s numbers were measured on *this repository*, so that is
where they are asserted:

| Repository / fixture      | Nodes | Edges | Avg degree | Orphans (non-directory, contains excluded) | Triangles |
| ------------------------- | ----- | ----- | ---------- | ------------------------------------------ | --------- |
| **this repository**       | **1,253** | **5,213** | **8.32** | **47 / 1,111 = 4.2%** | **2,533** |
| `fixtures/drifted-demo`   | 27    | 19    | 1.41       | 12 / 17 = 70.6%                            | 0         |
| `next-fastapi`            | 34    | 47    | 2.76       | 6 / 22 = 27.3%                             | 3         |

Plan target for A′ was ~1,260 / ~4,000 / ~6.3 with ~7% orphans. Node count
landed within seven of the estimate; edges and degree came in higher because
the estimate predated the schema layer.

The plan said the thresholds run "on the two fixtures". They cannot, and
lowering them until they could would produce a gate that gates nothing — a
15-file demo with three imports is sparse because it is small, not because an
extractor regressed. So the fixtures get **their measured numbers pinned as
regression baselines** plus a **census of the edge families their content
implies**, which catches a broken extractor that a degree average over 34
nodes never would. Recorded as OQ-056 with the option of growing the fixture.

Node census on this repository: artifact 760 · rationale 125 · directory 142 ·
db_object 111 · section 73 · route 42. Family census: structure 1,886 · doc
1,549 · hierarchy 875 · database 436 · evidence 352 · route 115.

### The four ways a dense graph could be a lie

- **Two paths agree** — the CLI plan and the real `GitHubRepositorySource`
  produce byte-identical JSON for both fixtures (ADR-013).
- **Nothing is promoted** — a deterministic scan grades no node and no edge
  `verified`, no matter how many edges it drew (ADR-001).
- **No bodies are stored** — a distinctive line of `src/session.ts` reaches no
  column of `artifacts`, `edges`, `rationales` or `sections`. That is
  `verify-scope-boundaries.ts`'s rule checked from the data end.
- **No provenance is lost** — every edge has a family, a reason or a span, and
  **its own relation**.

## A provenance bug the gate found

`workspace-map.ts` relabelled every relation outside a hand-written display
list to `references` on the way to the screen. Since todo 3 that list had been
missing `contains`, and since todos 6 and 7 also `handles`, `defines`,
`modifies` and `queries` — so a containment, a route's handler and a table
read all reached `/app/map` as "references". This is exactly the loss the
Codex remedy's P0-D describes, and it is now one exported `DISPLAY_RELATIONS`
array feeding both the type and the guard, with the gate asserting that no
stored relation changes on the way out. Adding a relation to the database
CHECK without adding it here now fails a test instead of quietly becoming a
citation.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(150 files, 1,218 passed, 1 skipped — 17 more than todo 7),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
323 files).

`tests/graph-density.test.ts` (6 cases) and `tests/section-nodes.test.ts`
(11 cases: the declaration-versus-citation rule, the home ranking, config
prefixes, one mention per token, the self-citation, a `WHY:` comment's
citation, a citation resolving against a section this plan did not re-read,
and the full-relink sweep). The density gate: this repository against the Phase 4
target with a full node-kind and family census; each fixture against its
pinned baseline; the section-free fixture proving sections are optional;
provenance losslessness end to end; verified-promotion and stored-body
absence; and byte-identical plans on both transports.
`tests/workspace-map.test.ts` reads `sections` as the signed-in owner and gets
the demo fixture's two ADRs back, which proves the new table's grants and RLS.

## Not verified here

- **Playwright and the two-theme screenshots** the plan asks for (zoomed-out
  category labels, zoomed-in file labels). No Docker daemon, so no e2e run and
  no screenshots. Every e2e spec touched by Waves A and A′ still owes a run.
- **The four shapes are not drawn.** `NODE_SHAPE` is data with no renderer;
  the sprite pool is Wave B todo 12's, as the plan states.
- **`/app/map` TTFB** with 1,253 nodes and 5,213 edges — unmeasured. The `doc`
  family budget (6,000) now carries 1,549 edges, of which 526 are citations.
- **The repository-scale case reads the working tree**, so its numbers move
  with the repository. The thresholds have wide headroom (8.32 against ≥3,
  4.2% against ≤10%), but it is a measurement of this checkout, not a constant.
- **OQ-055**: `queries` edges are filtered against *this plan's* schema
  objects, so an incremental scan that re-reads only code files drops them.
  Sections were designed to avoid the same trap — the SQL joins against the
  persisted table — but todo 7's behaviour is unchanged here.
