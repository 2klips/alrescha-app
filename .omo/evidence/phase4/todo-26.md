# Phase 4 · Wave F · todo 26 — symbols become nodes, behind hierarchical loading

**Date:** 2026-09-21 · **Scope:** `supabase/migrations/202609210001_symbol_nodes.sql`
(new), `packages/core/src/ingest/{code-links,repository-scanner,local-ingest,symbol-identity}.ts`,
`packages/mcp/src/{store,local-workspace,graph-tools,hosted}.ts`,
`apps/web/lib/mcp/supabase-store.ts`, `apps/web/lib/map/{workspace-map,symbol-layer}.ts`,
`apps/web/app/api/map/symbols/route.ts`, `apps/web/lib/graph/{symbol-halo,render-frame,engine,pixi-backend}.ts`,
`apps/web/app/ui/{symbol-halo-loader,brain-map,brain-map-stage}.tsx`,
`apps/web/app/app/(shell)/map/map-screen.tsx`, `apps/web/lib/home/journey.ts`,
`apps/worker/src/postgres-doc-store.ts`, `scripts/adr-guardrails.ts`, the
fixture `fixtures/symbol-heritage/`, and the tests named under Verification.
Plan: [`BUILD_PLAN_PHASE4.md`](../../spec/BUILD_PLAN_PHASE4.md) todo 26;
decision: OQ-031 ⑴ (hierarchical LOD loading), now taken.

## The claim

A symbol has been metadata since Phase 1 — a name and a span in
`artifacts.exported_symbols`, flattened to names in `index_entries`. OQ-031
recorded why it stayed that way: promoted naively, this repository's ~1,300
exports would blow through the map's 2,000-node budget and the MCP read
budget on day one. The plan's answer (R5 §2.1 ③, "symbol level" design,
adopted for its loading discipline only) is what shipped: **a symbol is a
node with an identity, and no default read carries it.** It arrives when a
caller names it or looks at its file, as a neighbourhood or a halo, never
as a layer over the galaxy.

## What exists now

### Rows and nodes, derived in SQL

`apply_repository_scan` derives the symbol layer from the artifact rows it
has just written, after every other hub — the same rule as directories
(ADR-013: a property of the stored data cannot be a place where two ingest
paths disagree). One row in `public.symbols` per distinct
`symbol_stable_key(path, container, kind, name)` found in a file's
`exported_symbols`; one `graph_nodes` row of kind `symbol`, labelled by the
name; the span, the owning artifact and the engine (ADR-014) on the row.
`distinct on (stable_key)` folds an overloaded function's several
declarations into one symbol. A scan that no longer finds an identity in a
file it re-read deletes its node (cascades take the row and the edges); a
removed file's symbols lose their nodes before the file does, because the
row cascades from the artifact but the node cascades from nothing. A
rescan of the same tree keeps every node id.

The key is `md5(path|container|kind|name)`, not the plan's sha1: every
PostgreSQL has md5, pgcrypto is not one of them, and an identifier is not
a checksum anyone forges. `packages/core/src/ingest/symbol-identity.ts`
computes the same string; `tests/symbol-nodes.test.ts` pins the two equal
on real rows. `container` is reserved for members and empty for every
symbol the scanner records today, which are top-level exports.

### Two relations, in their own table

`declares` (file → symbol, family `hierarchy`, one per symbol) and
`extends` (symbol → symbol, family `structure`) live in
`public.symbol_edges`, shaped like `edges` — provenance with the artifact
and the span, confidence by tier, the FK cascades — and deliberately not
in `edges`. Rule 3 of the migration's header: every reader of `edges`
(the map's eight family queries, the MCP edge page, the neighbour cache,
the doc skeleton's relation counts, the home page's edge count) goes on
seeing exactly what it saw. A relation added to `edges` would have had to
be excluded in each of them, and the day one exclusion was forgotten the
default read would carry the layer.

`extends` is resolved by the scanner (`resolveSymbolLinks`) from the
parse's new heritage record: for an exported class or interface, the bases
as written. A local name is this file; an imported binding is the module
the import pass attributed it to, followed through a barrel; a member of a
whole-module binding (`base.Named`, `models.Model`) is that name in that
module; Python bases resolve through `from x import B` at the `reference`
tier as Python imports do. A base that is not an exported symbol anywhere
in the tree — a private class, a package outside the repository, a
mixin call — is not a link. `implements` is not `extends` and is not
recorded. The plan carries `symbolLinks` (defaulted for a CLI built before
this wave); the SQL joins both ends to the symbol rows that exist.

`fixtures/symbol-heritage/` is the pilot's shape in miniature: a barrel
with a named and a star re-export, a namespace import, a same-file base, a
non-exported base, an `implements`, and a Python package extending
through a `from` import. Eight `extends` edges come out, each attributed
with its method and tier, and `FromHidden extends Hidden` produces none.

### Nothing loads it by default — and that is asserted

- `buildWorkspaceMapModel` drops a `symbol` row, and `loadWorkspaceMap`
  does not ask for one (`.neq("kind", "symbol")` on the node query, so the
  layer cannot spend the 2,000-node budget). `tests/graph-density.test.ts`
  now has a census pin: this repository stores ≥1,000 symbol nodes and
  draws 0 of them; both fixtures store some and draw none.
- The hosted MCP store excludes the kind from its node read (the row
  budget again); the in-memory store strips the layer from every
  `loadWorkspace`. `tests/local-serve.test.ts` asserts the projection's
  base `edges` carry no `declares`.
- The neighbour cache (`index_entries.neighbor_ids`) never names a symbol
  id, because the symbol section runs after the cache is written and
  writes to a table the cache does not read.
- The doc skeleton's node read and the home page's node count exclude the
  kind; the doc skeleton never saw a symbol edge because there is none in
  `edges`.

### The MCP layer, by neighbourhood

`McpStore.loadSymbolNeighborhood(principal, { nodeIds })` is the one way
in: a file id yields its symbols, a symbol id itself, plus every
`declares` and `extends` that touches them and the symbols one `extends`
hop away (both directions — "what extends this" and "what does this
extend" are both in the answer). The rule is one function,
`selectSymbolNeighborhood`, that both stores hand their pool: the
in-memory store a repository's whole layer, the hosted store the rows it
fetched by id (three reads by id, never a whole-workspace one). Caps are
stated once — `SYMBOL_LAYER_LIMITS`: files 200, symbols 5,000, edges
20,000 — and reported as `truncated` entries rather than silently applied;
ids that name neither a file nor a symbol come back as `unknownNodeIds`.

The tools reach it through one helper in `hosted.ts`, `withSymbolLayer`:
`get_neighbors`, `impact_of` and `trace_path` look up any input id the
default read does not carry and merge the neighbourhood into the same
workspace the other tools read (`withSymbolNeighborhood`). So
`get_neighbors(symbol)` answers with the file that declares it and the
bases and subclasses one hop out — and the sibling symbols of the same
file are not in it, because nobody asked. `impact_of(base)` names what
extends it and the file that declares it as dependents, in both modes:
`declares` and `extends` join the dependency walk (a file depends on what
it declares; a subclass on its base), and neither appears in a view unless
a symbol was named, so a file's answer is what it was. `trace_path` crosses
from a symbol into the file graph in one hop. `search_index` attaches
`symbols: [{ name, kind, nodeId, span: "path:startLine-endLine" }]` to a
hit whose symbol names matched the query, read by neighbourhood for the
hit files only, capped at eight per file — the zero-migration item R5
§2.9 ⑹ asked for, so the caller can open the file at the span or ask
`impact_of` about the symbol without another lookup.

**The catalogue does not change.** `symbol` is not in `MCP_NODE_TYPES`
and `declares`/`extends` are not in `MCP_EDGE_RELATIONS`, because those
arrays feed the tool schemas' enums and the token ratchet, and the layer
is reached by id, not by filter. The TypeScript unions are widened
(`SYMBOL_NODE_TYPE`, `SYMBOL_EDGE_RELATIONS`) so a loaded symbol is a node
like any other. The cost is stated: a `relations` filter cannot name
`extends`; a neighbourhood that was asked for carries both relations.
`hosted.test.ts` pins 21 tools, the 3,150-token ratchet and the absence of
`symbol` from the enums.

### The map: one file's layer, as a halo

`GET /api/map/symbols?files=<id>,…` reads the named files' symbols and
their `declares`/`extends` through the session client — row security
decides, as it does for the map — with the MCP caps. The client
(`useSymbolHalo` → `SymbolHaloLoader`) asks for the selected file once
and keeps the answer twice: in memory, and in the IndexedDB the layout
warm-start already uses, under `symbols:<workspace>:<commit>:<file>`. A
new commit is a new key; nothing is invalidated, the old answer is never
read again. Storage is treated as hostile (version, shape) as the layout
is.

The halo itself is Vogel's sunflower around the owner: the i-th symbol at
angle i × golden angle, at a radius that opens by √i from three symbol
radii outside the owner, sized by the owner's radius. The symbols take no
part in the simulation — their positions are a pure function of the
owner's, recomputed each frame (`haloFor` in `buildRenderFrame`) — and
they are a Near-zoom affordance like status badges: at Mid and Far the
frame carries no item, which is the `symbolOwner` collapse the plan named,
realised as the `declares` edge read the other way rather than as a third
`hierarchyAssignment` level. Pixi draws them in a `haloLayer` between the
nodes and the rings, in the owner's colour and the four-shape grammar
(class → square, interface/type → diamond, function → circle, else ring),
pooled by index like the node sprites; the first 24 names go in the
screen-space label layer beside their item, except in the sector to the
owner's right where the file's own label is written — an item there keeps
its shape and loses its name. The spiral starts one golden angle round, so
the first item is never on that side. 64 items are drawn and the
overflow is counted, so a barrel with two hundred exports is a ring, not a
shroud. Nothing in the halo is hit-tested.

The stage exposes `data-symbol-halo` (the owner id) and
`data-symbol-count`, so a browser test states that selecting a file loaded
its layer without reading WebGL — the same idiom as `data-lod` and
`data-settled`.

### The guardrail

`raw-code-persistence` now also refuses a column or a persist call named
for a symbol's signature or docstring (`docstring text`,
`insertSymbol({ symbolSignature })`), with two negative fixtures in
`tests/adr-guardrails.test.ts`. `tests/symbol-nodes.test.ts` pins the
`symbols` table's column list against `information_schema` — name, kind,
span, engine, key, ownership, timestamps, and nothing that could hold a
body.

## Verification

Real PostgreSQL (PGlite) with every migration, the two ingest paths, the
hosted MCP server over the SDK client, and the frame builder:

- `tests/symbol-nodes.test.ts` (9): the eight resolved `extends` and the
  one refused; one row and one node per export, keyed as TypeScript keys
  them, engine on the row; `declares` one per symbol with provenance,
  `extends` with tier and confidence; the layer absent from `edges` and
  from every neighbour cache; ids kept across a rescan, a symbol dropped
  when its file stops exporting it, a removed file's symbols and nodes
  gone with no orphan node; the column census; the projection equal to
  the SQL, `extends` included; row security — the owner sees 16 symbols
  and 24 edges, another tenant none.
- `tests/local-serve.test.ts` (+2): on both layout fixtures the
  projection's symbols and symbol edges equal the SQL's, by identity.
- `packages/mcp/src/symbol-layer.test.ts` (6): the neighbourhood rule —
  file → its symbols + declarations + one hop; symbol → its file + hop;
  unknown ids reported; the files and symbols caps with their truncation
  notes; the merge lands on the right repository once and leaves an
  untouched workspace untouched.
- `packages/mcp/src/hosted.test.ts` (+7): a default read carries no
  symbol; naming one loads one hop and no more; `impact_of` a base in both
  modes; `trace_path` from a symbol into the file graph; `search_index`
  carries the span and node id; an unknown id is simply not found; the
  catalogue is what it was.
- `tests/graph-symbol-halo.test.ts` (9): golden-angle placement with
  monotone radii and no two items closer than a diameter; the shape
  grammar; the draw limit and its overflow; Near-only with an owner on
  the frame; the frame carries the halo and its labels at Near and
  nothing below; the halo follows the owner; the loader asks once per
  file per commit and answers from memory and storage after; storage
  decoding refuses a wrong version or shape.
- `tests/graph-density.test.ts` (+3 pins), `tests/workspace-map.test.ts`
  (mirror query and a symbols-off-the-map pin), `tests/adr-guardrails.test.ts`
  (+2), `tests/scope-fidelity.test.ts` unchanged and green,
  `verify-scope-boundaries` PASS over 386 files.
- `tests/e2e/map-symbol-halo.spec.ts` (passed, 32s): on the live map over
  a real scan, selecting `src/session.ts` loads its layer with exactly one
  request, the stage names the owner and a positive count, the API answers
  the same as the signed-in member with `SESSION_TIMEOUT_MS` among the
  names, and a reload at the same commit — in both themes, wheeled in to
  Near — draws the halo without a second request. The halo as drawn:
  [`todo-26/halo-light.png`](./todo-26/halo-light.png),
  [`todo-26/halo-dark.png`](./todo-26/halo-dark.png) — three exports
  around `session.ts` (a ring, a diamond, a circle), named, off the side
  the file's label takes.

Gates on the branch tip: `pnpm lint` clean · `pnpm typecheck` clean (root
+ every workspace) · `verify-scope-boundaries` PASS (12 boundaries, 388
files) · `pnpm test` 209 files / 1,920 passed / 1 skipped · `git diff
--check` clean. The local Supabase (PostgreSQL 17) took `202609210001`
with `Applied:` and no error.

## Not done, on purpose

- **Members.** Only top-level exports are symbols; `container` is empty
  on every row. Methods and properties would multiply the layer by four
  or five for this repository and need a member-aware extractor; the id
  reserves the slot.
- **Symbol-level `calls`.** OQ-031's hairball argument was about calls,
  and this todo's plan asks for `declares`/`extends` only. A call edge
  between symbols needs a resolver that knows which symbol a call site is
  *inside*, which the parse does not record.
- **A `relations: ["extends"]` filter.** Excluded with the catalogue
  reason above; a neighbourhood carries both relations regardless.
- **`get_artifact` for a symbol, and the inspector card for one.** A
  symbol node id through `/api/map/inspect` returns the generic card.
- **Halo interaction.** No hover, no click, no "+N" label for the
  overflow; the halo is the file, opened a little.
- **`web-tree-sitter`** (todo 27) is untouched; the engines and their
  provenance are what ADR-014 left them.
