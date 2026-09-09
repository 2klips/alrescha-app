# Phase 4 · Wave B · todo 13 — a filter is visibility, and a collapse is the folder tree

**Date:** 2026-09-07 · **Scope:** `apps/web/lib/graph/{render-frame,clustering,engine}.ts`,
`apps/web/lib/dashboard/graph-model.ts`, `apps/web/lib/map/workspace-map.ts`,
`apps/web/app/ui/{dashboard-screen,brain-map,brain-map-stage}.tsx`,
`apps/web/lib/strings/dashboard.ts`,
`apps/web/app/styles/screens/map-hud.css`,
`tests/graph-visibility.test.ts` (new), `tests/graph-engine.test.ts`,
`tests/e2e/brain-map.spec.ts`.

**This todo is a bundle of nine and four are done.** The boundary is at the
bottom, and it is a real one: everything here is *what the map draws*, and
what is left is *the panel that drives it*.

## Typing in the search box restarted the simulation

`filterGraph` built a new `GraphData` and the screen handed it to the canvas
as `data`. The engine's `setData` posts a fresh `start` to the worker, so
every keystroke threw the layout away and re-ran it from the seeded spiral.
Typing a filename made the map explode and re-form, letter by letter.

Where a node sits is a property of the repository. What a viewer is currently
looking for is not. So filtering is a **visibility set** now:
`engine.setVisibility(ids)` touches the frame and nothing else — no start
message, no reheat, no `layoutRestarts`. The browser test proves it the way a
viewer would notice: every node that survives a filter is within two pixels of
where it was, and `data-settled` never goes back to false.

The test was checked against the defect. Putting the filtered graph back into
`data` drops `data-layout-nodes` from 15 to 3 and the assertion fails — the
graph really was being replaced.

**Two attributes, because there are two numbers now.** `data-canvas-nodes`
keeps meaning what it says — how many nodes are drawn — and
`data-layout-nodes` is how many the layout holds. Them differing *is* the
feature.

**The accessibility layer follows visibility.** The first run of the existing
suite caught that it did not: the DOM hit targets were still built from the
whole graph, so a keyboard user could tab to a node the canvas was not
drawing. Two specs that had been asserting "filtering reduces the reachable
set" failed, correctly.

## Layers

A filter says *show me the nodes matching this*. A layer says *I am not
looking at containment right now*. They are separate controls because they
are separate questions, and turning off co-change should not clear someone's
search box. Both go through the same mechanism, so a layer costs no layout
restart either.

The plan names seven. **Five are here.** `style` and `config` are not, and
the reason is stated rather than worked around: the scanner classifies them,
but a stylesheet and a `tsconfig.json` both arrive at the map as `code`
nodes, so there is nothing on a `GraphNode` to switch off. A toggle for them
would be a control that silently does nothing.

## The collapse follows the directory tree

Louvain answers a question nobody asked. It finds communities in the *edge*
structure, so its groups are named `c7` and their membership shifts when an
import is added: a supernode that was "the auth module" last scan is a
different set of files this one, with no way for a reader to tell.

A repository already has a grouping everyone agrees on. `hierarchyAssignment`
uses it — Far groups by package (or, where a repository declares none, by the
two-deep folder), Mid by the folder a file is actually in. Both are stable
across scans and both have names a person recognises, which is what lets the
supernode **be the directory node**: its own label, its own path, and its own
ring shape rather than `c7`, "412 indexed artifacts", and whatever type it
happens to hold most of.

Louvain stays as the fallback for data with no hierarchy at all. Every demo
fixture is in that state, and grouping those by a path they do not have would
collapse the whole graph to one dot — so the test asserts the fallback is
byte-identical to what `communityAssignment` produces.

A directory is its own group, so a folder never vanishes into its parent and
then reappears as one of that parent's members.

**Merged edges say how much they stand for.** One line between two packages
can mean one import or four hundred, and drawn identically it says the same
thing about both. Width scales with `log10(count)`: four times the width at a
thousand, not a thousand times. `RAW_RENDER_NODE_LIMIT` stays at 3,000.

## Verification

- `tests/graph-visibility.test.ts` — 18 new: the filter hides without moving,
  drops edges to hidden nodes, labels nothing invisible; the hierarchy groups
  by package and by folder, is stable, falls back to communities, gives the
  supernode the folder's identity, and counts merged edges; the layers hide a
  relation without its nodes, hide a node kind with its edges, compose with a
  filter, and offer only what they can actually switch off
- `tests/graph-engine.test.ts` — 51, including **`setVisibility` leaving
  `layoutRestarts` untouched** and every surviving node in its exact position
- `tests/e2e/brain-map.spec.ts` — 18, one new: filtering in a real browser
  moves nothing, checked against the defect
- `npx vitest run` — 178 files, 1,621 passed, 1 skipped
- `npx playwright test` — 147 passed, 1 skipped
- `pnpm lint`, `pnpm typecheck`, `verify-scope-boundaries` — clean

## Not done — five of the nine

Stated plainly rather than left to be discovered:

1. **IndexedDB coordinate warming** (`initialPositions`, keyed by commit sha).
   The layout still starts from the seeded spiral on every load. Nothing here
   moves toward it; it is a separate piece.
2. **The force panel on `/app/map`.** It is still demo-only
   (`showForcePanel={false}` on the workspace map).
3. **Obsidian option parity** — Groups (search term → colour, saved),
   Orphans, Arrows, Node size / Link thickness, Local graph depth, view
   presets, pins. The pin *protocol* landed in todo 11; nothing persists one.
4. **forceX/Y domain anchor sliders** (strength ≤ 0.05, default off).
5. **`style` and `config` layers**, for the reason above — they need a
   classification on `GraphNode` that the model does not carry.

Two smaller ones I checked rather than assumed: the empty state already reads
`visibleGraph`, and toggling between the canvas and table views already keeps
the stage mounted.

**And the zoom hitch todo 12 measured is not fixed.** The hierarchy
assignment makes the collapse *deterministic*, which was the plan's ask, but
the 179ms spike is the sprite pool growing from a few dozen supernodes to five
thousand raw nodes in one frame. Keeping both draw sets warm is still open.
