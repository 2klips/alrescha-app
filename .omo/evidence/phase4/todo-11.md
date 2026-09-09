# Phase 4 · Wave B · todo 11 — dragging a node, and forces that mean something

**Date:** 2026-09-07 · **Scope:** `apps/web/lib/graph/node-size.ts` (new),
`apps/web/lib/graph/{simulation-protocol,force-simulation,worker-runtime,position-buffer,engine,render-frame}.ts`,
`apps/web/lib/dashboard/graph-model.ts`, `apps/web/app/ui/brain-map.tsx`,
`tests/graph-drag.test.ts` (new),
`tests/{graph-engine,graph-perf,graph-lod}.test.ts`,
`tests/e2e/brain-map.spec.ts`.

## Every spring pulled equally hard

The layout had one strength and one distance for every link. But the graph
carries eight edge families, and the whole reason `edges.family` exists is
that the same relation means different things depending on who wrote it. A
co-change is a hint; an import is a wire. Laying them out identically is the
map asserting a relationship nobody measured.

`LINK_FAMILY_FORCES` gives each family a strength and a distance, applied as
a **ratio to the `structure` baseline** — whose numbers are exactly the old
defaults. Two consequences worth stating:

- **A repository with no family data lays out pixel-for-pixel as it did
  before.** Every demo fixture is in that state, and the test asserts the two
  produce identical buffers rather than merely similar pictures.
- **The sliders still mean what they say.** Moving `linkStrength` scales the
  whole spread instead of flattening it, because the table is relative.

`statistical` is weakest and longest, `hierarchy` shortest and slack — a file
belongs *in* its folder, but containment is not a dependency and must not
out-pull one. The test asserts the ordering by measuring where a two-node
graph actually settles, not by reading the table back.

**One pair, one spring — the strongest family wins.** Two files joined by both
an import and a co-change are wired together; letting the weaker claim decide
would file a real dependency under "they tend to change at the same time".
Asserted in both edge orders, so it is not an accident of iteration.

## Drag

`pin`/`unpin`/`reheat` join the wire protocol. A pin carries its point rather
than asking the worker to track one, and a pin without a finite point is
refused: `fx = NaN` fixes a node at nowhere and takes the rest of the layout
with it.

A pin is also a reheat. A drag that nothing responds to is a picture with one
node stuck to the cursor; the graph has to follow, which is the feedback that
makes it feel like a thing rather than an image.

**The dragged node is under the pointer now, not next frame.** The worker
answers at 30Hz and the interpolation then eases toward that answer, so the
position is also held on the main thread. The held map is rebuilt each read
rather than written into the stored one — `at()` is compared by identity to
decide whether anything moved, and writing through would make a settled graph
look unchanged while a node is dragged across it.

Releasing hands the node back to the physics from wherever it was left. It is
not a pin-on-drop: the test measures the node **while held** (it is at the
pointer) and again after release (the layout has reclaimed it).

**A drag is not a click.** Releasing over a node used to select it. A
capture-phase handler swallows the click when the press moved.

## Collision

`forceCollide` with the renderer's own radius curve, two iterations. The curve
moved to `lib/graph/node-size.ts` so the layout and the paint share one
definition — a collision force with its own idea of node size separates nodes
to a distance the paint then covers up.

## Two gesture bugs found by writing the tests

**The pointer left the map and the drag froze.** Events stop bubbling to the
viewport once the pointer is outside it, so a node dragged toward the edge
stopped tracking while the hand kept going. Fixed with pointer capture — and
the browser probe that found it showed the node sitting at a *constant*
offset, which is what sent me looking at event delivery rather than at the
arithmetic.

**Capturing on the press broke clicking.** Pointer capture redirects the
following `click` to the capturing element, so the accessibility layer's own
button never saw it: plain clicks stopped selecting and double-clicks stopped
opening a node, because both had quietly become drags of zero distance. Two
e2e specs caught it. Capture now waits for the first *movement*, which is when
it is actually needed.

A press on an accessibility target also picks up the node that target stands
for. Without that the top 200 nodes would have been the only ones that could
not be dragged — the mirror image of the defect todo 10 fixed for clicking.

## Verification

- `tests/graph-drag.test.ts` — 12: pin holds while the graph follows, release
  returns the node, an unknown slot is ignored, a pin wakes a settled layout,
  the protocol refuses a pin that names nowhere, the runtime wakes on all
  three messages, a correlation settles further out than a dependency,
  containment closest, family-free data is byte-identical, collision keeps
  two nodes at least their painted diameter apart, and the held position wins
  over the worker's
- `tests/graph-engine.test.ts` — 49, including a check that **every family the
  graph model knows has a force**, so a new one cannot silently fall back to
  the baseline
- `tests/e2e/brain-map.spec.ts` — 16, two new: dragging a node moves it and
  not the camera, and a press on background pans without picking anything up
  (asserted by every node shifting by the *same* vector)
- `npx vitest run` — 176 files, 1,589 passed, 1 skipped
- `npx playwright test` — 146 passed, 1 skipped
- `pnpm lint`, `pnpm typecheck`, `verify-scope-boundaries` — clean

## Still open

- **Nothing stays pinned.** The plan's protocol has the verbs; the product has
  no "pin this node here" gesture, only drag-and-release. Todo 13 owns the
  pins that persist.
- **`GRAPH_EDGE_FAMILIES` and `MCP_EDGE_FAMILIES` are two lists.** They agree
  today and nothing checks that they still will. The app's list gained a
  runtime form here; wiring it to the package's is a small follow-up.
- **The family table is a judgement, not a measurement.** The numbers came
  from the plan and the ordering is defensible, but nobody has looked at a
  1,260-node scan and asked whether `doc` at 120 is right.
