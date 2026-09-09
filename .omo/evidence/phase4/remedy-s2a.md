# Phase 4 · Codex remedy S2a — losing no provenance between the database and the agent

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-01 #4 / P0-D
on todos 8 and 22. Todo 8 fixed the same loss on the **display** side; this is
the MCP side. **Scope:** `packages/mcp/src/{store,graph-tools,hosted}.ts`,
`packages/mcp/src/index.ts`, `apps/web/lib/mcp/supabase-store.ts`, the MCP and
Supabase-store tests, and two fixture files.

## One vocabulary had four copies, and three had drifted

The node and relation vocabularies lived as unions in `store.ts` and were
re-typed by hand in three more places: the Supabase decoder's `isRelation`
guard, the hosted `NODE_TYPE_SCHEMA`, and the hosted `RELATION_SCHEMA`. By the
end of Wave A′ every copy was behind, and the consequences were live:

| Copy                            | Missing                              | Consequence                                                                 |
| ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `isRelation` (Supabase decoder) | `defines`, `modifies`, `queries`     | **every database-family edge dropped before an agent could see it** (436 here) |
| `RELATION_SCHEMA` (hosted)      | `defines`, `modifies`, `queries`     | the same edges would have failed output validation                          |
| `NODE_TYPE_SCHEMA` (hosted)     | `db_object`, `section`               | a table or a decision node would have failed output validation              |

The remedy predicted this exactly — "route/handles 등 타입을 확장하고 있으므로
old allowlist를 기준으로 별도 enum을 복제하지 마라" — and it happened inside a
single wave anyway. `MCP_NODE_TYPES`, `MCP_EDGE_RELATIONS`,
`MCP_EDGE_FAMILIES` and `MCP_EDGE_TIERS` are now arrays in `store.ts`; the
types derive from them and every consumer reads them.
`packages/mcp/src/hosted.test.ts` pins the schemas against the arrays, so a
value added to the graph fails a test instead of a live request.

## An edge now carries the reason it exists

`McpEdgeData` was `{id, relation, sourceNodeId, targetNodeId}` and
`GraphEdgeRef` was even less — the family, the tier, the confidence and the
reason were dropped between the database and the tool answer. "These two files
are connected" arrived with no way to ask how anyone knows.

Both now carry `family`, `tier`, `confidence` and a `provenance` of
`{method, reason, span}`. The decoder invents nothing: a writer that stated no
tier gets `null`, not a plausible `resolved` — that dressing-up is what the
remedy forbids. Storage direction stays `sourceNodeId`/`targetNodeId`
whichever way a traversal walked the edge.

The one derived edge (a requirement and the document it was read from) says so
in its own provenance rather than passing as stored.

## Exclusion is now different from absence

`contains` is still outside the MCP vocabulary — 875 containment edges would
bury every `get_neighbors` answer they appeared in, and the flag that makes
them safe is todo 22's. But it used to be excluded *silently*: an agent asking
"what is this file connected to" got an answer with no folders in it and no
way to know folders were never on the table.

`McpRepositoryData.edgeOmissions` records what the decoder left behind and
why; `collectNeighbors` merges them into a `NeighborhoodResult.omissions` and
`get_neighbors` returns them. An empty list means the view carried everything
the store held. It never means "there is nothing else".

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(151 files, 1,245 passed, 1 skipped — 8 more than S1),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
324 files).

- `apps/web/lib/mcp/supabase-store.test.ts` — a `queries` edge arrives with
  its family, tier, confidence and span intact; two `contains` edges arrive as
  one omission entry with a count rather than as nothing; a row with a
  nonsense family and an invented tier decodes to `null`, not to a guess.
- `packages/mcp/src/hosted.test.ts` — the output enums accept every value the
  source arrays hold and still reject `contains`; a full edge and a
  provenance-less derived edge both validate.
- `packages/mcp/src/graph-tools.test.ts` — every edge in a neighbourhood has a
  family, a tier and either a reason or a span; omissions pass through; the
  derived edge is labelled and explains itself.

## Not verified here

- **The row cap is still open, and it is the bigger half of R-01.** None of
  the `loadWorkspace` selects sets a limit or an order, so PostgREST's default
  1,000 rows applies to an arbitrary, unordered subset. This repository stores
  5,213 edges and 760 artifacts: an agent asking `query_brain` a negative
  question (`withoutRelations: ["tests"]`) is answered from a fifth of the
  edges and told "none". That is S2b — bounded, ordered reads with `hasMore`,
  a targeted read that finds the 1,001st artifact, batch per-ID results, and
  the path-in-two-repositories ambiguity.
- **No live PostgREST.** The decoder tests drive a fake query builder, so the
  cap itself is asserted nowhere yet.
- **`impact_of` and `trace_path` outputs** were not extended with provenance;
  they return node ids and paths, and the edge shape they would carry is
  todo 22's `confidence`/`bound` contract.
- **Playwright** (no Docker daemon).

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
