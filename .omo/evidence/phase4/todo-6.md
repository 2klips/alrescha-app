# Phase 4 · Wave A′ · todo 6 — route nodes and `handles`

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/ingest/route-links.ts` (new), the scan plan and its strict
schema, `supabase/migrations/202609050005_route_nodes.sql`,
`apps/web/lib/map/workspace-map.ts`, `graph-model.ts` and the display maps,
`packages/mcp` (`handles`, `route`, `impact_of.affectedRoutes`),
`apps/web/lib/mcp/supabase-store.ts`.

## What the graph could not answer

A user thinks in screens and endpoints. The graph had 730 files, 142 folders
and no URL at all, so "which files render `/app/map`" and "what does editing
this break, in terms a person recognises" had no answer to give.

## Two frameworks, two tiers, for the resolver's reason

- **Next.js writes the URL into the path.** Derived in SQL from the stored
  artifacts, so the plan carries no route and the two ingest paths cannot
  disagree about one (ADR-013 — the rule the directory hierarchy follows).
  `resolved`, confidence 1.
- **FastAPI and Flask write it in a decorator**, which only the body states.
  The scan reads **method, path and line** and nothing else — not the
  handler's name, not its parameters, not the decorator's other arguments —
  and the edge is `reference` at 0.6, because a router mounted under a prefix
  has a URL this cannot see (ADR-014: no import graph, no execution, no
  guessing).

A layout is not a URL of its own but serves every route beneath it, so it
`handles` each of them. Containment is by **path**, not by URL: a route
group's layout (`app/(shell)/layout.tsx`) has the same URL as the root layout
once the group is stripped, and only the directory says that `/api/health` is
outside it. The first implementation matched on URL prefixes and gave the
`(shell)` layout a handle on every API route; the test caught it.

## What was measured

This repository, from the scan plan (the SQL derives the same rule):

| Measure                          | Value |
| -------------------------------- | ----- |
| Route entry files                | 47    |
| — of those, layouts              | 5     |
| **URLs (route nodes)**           | **42** |
| **`handles` edges**              | **115** |
| Decorator routes                 | 0 (no Python service here) |

42 URLs against R5 §2.4's estimate of ~30 routes, and 115 handles against
~45 — the difference is the layout chain, which the estimate did not count.

## One rule, two implementations

`nextRouteFile` (TypeScript, for the facet and `unit` axes) and
`public.next_route_url` (SQL, for the persisted nodes) state the same rule.
That is a drift waiting to happen, and the alternative — carrying routes in
the plan — is exactly the ADR-013 problem the SQL derivation exists to avoid.
`tests/route-nodes.test.ts` runs both over the same nine paths and asserts
they agree, including the case this repository's own layout creates: the live
app sits under a second `app` segment, so `apps/web/app/app/(shell)/map/page.tsx`
is `/app/map` — the *first* `app/` is the Next root.

## The MCP half

`impact_of` gains **`affectedRoutes`**: every URL served by a file in the
impact set, plus the node itself when it is a route. "What does editing this
break" is a question about screens, so a wrong screen is worse than no screen
— a route served by something else is not in the answer, asserted directly.
The contract is shared with the budget work in todo 22.

Two vocabulary additions came with it, both narrow on purpose:

- `McpEdgeRelation += "handles"`. **`contains` is deliberately still absent**:
  885 containment edges would bury every `get_neighbors` answer they appear
  in, and the flag that would make them safe is todo 22's.
- `McpNodeType += "route"`, so an agent can ask about a URL directly. It is
  **not** added to `index_entries.entry_type`, whose CHECK keeps its six
  values until a migration widens it.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(147 files, 1,190 passed, 1 skipped — 13 more than todo 5),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
319 files).

`tests/route-nodes.test.ts`: the URL rule across app router, pages router,
route groups and non-routes; decorator parsing including Flask's `methods=`
argument and the three shapes that name no usable path; the fixture scan; the
layout chain; a decorator route's tier, verbs and provenance; the sweep of a
URL no file serves; and the TS/SQL agreement.
`packages/mcp/src/graph-tools.test.ts`: `affectedRoutes` for a file, for a
route node, and on a workspace with no routes at all.

## Not verified here

- **Playwright** (no Docker daemon): the route diamond sprite is Wave B
  todo 12's, and nothing renders a route node's shape yet — the loader ships
  the type, the label and the anchor path.
- **Decorator routes have no fixture with a real decorator.** The
  `next-fastapi` fixture's FastAPI module declares none today, so the
  decorator path is covered by unit tests over source strings and by a plan
  that states one, not by an end-to-end scan of a file with `@router.get`.
  Adding one would change that fixture's link expectations, which Wave A′
  todo 8's density gate is about to pin; it is cheaper to add both together.
- **Router prefixes.** `APIRouter(prefix="/api")` mounts a decorator's path
  under a prefix this scan does not read, so a FastAPI URL is a path fragment
  and says so by being `reference`.
