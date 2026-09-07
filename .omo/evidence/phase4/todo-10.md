# Phase 4 · Wave B · todo 10 — the pointer reaches the canvas

**Date:** 2026-09-07 · **Scope:** `apps/web/lib/graph/hit-test.ts` (new),
`apps/web/lib/graph/hit-targets.ts` (new), `apps/web/lib/graph/render-frame.ts`,
`apps/web/lib/graph/engine.ts`, `apps/web/app/ui/brain-map.tsx`,
`apps/web/app/ui/brain-map-stage.tsx`,
`apps/web/app/ui/brain-map-stage.test.tsx`,
`tests/graph-hit-test.test.ts` (new), `tests/e2e/brain-map.spec.ts`,
`apps/web/package.json` (`d3-quadtree`).

## Nodes that were painted and inert

The pointer reached a node through the DOM hit layer: one `<button>` per node,
parked over its painted position and repositioned as the camera moves. The
layer is capped, because that is a lot of DOM to write ten times a second.

The cap was 600. **A live scan of this repository produces 1,260 nodes.**

So more than half the graph was drawn and could not be clicked — and nothing
looked wrong. There was no error, no cursor change, no missing pixel. The
nodes were simply inert, and the only way to find out was to try one.

This is the reason the plan calls todo 10 a prerequisite for the data wave:
every improvement to what the scanner produces makes the unreachable fraction
larger.

## What it is now

**`lib/graph/hit-test.ts`** builds a `d3-quadtree` index over the frame the
renderer just painted, so what the pointer finds is by construction what the
eye sees. `d3-quadtree` was already in the tree as a transitive dependency of
`d3-force`; it is declared now rather than reached into.

The index is **world-space**, which is the space `RenderNode` carries and the
space the layout moves in. Panning and zooming therefore cost nothing — the
graph did not change, so the index does not. It is rebuilt only when the
painted frame changes, keyed on frame identity, which is exactly the question
that needs answering: is the picture I indexed still the picture on screen?

Three decisions worth stating:

- **A minimum reach of 10 screen pixels.** Zoomed out a node is two pixels
  across; asking anyone to hit that is asking them to fail. The minimum is in
  screen units and converted through the camera, so it holds at every zoom.
- **Ties go to the smaller node.** A leaf drawn over a hub is what the viewer
  is aiming at: the hub is reachable across the rest of its own area, and the
  leaf is reachable nowhere else.
- **A faded node is still a target.** It is on the screen. A hit test that
  skipped nodes dimmed by a focus mode would make "what I can see" and "what
  I can click" two different sets.

**Hover highlights the neighbourhood.** `render-frame` takes a
`hoveredNodeId`, lights the node and everything one edge away, and fades the
rest — nodes to α 0.22, untouched edges to 12% of their stroke. A hovered node
with no neighbours changes nothing: fading the whole graph to highlight one
dot says "nothing here is connected" far louder than it says "this is the
node", and on sparse scan data that is most of the map.

Hover and directional focus answer different questions — "what is this joined
to" versus "which way does it flow" — so hover wins while the pointer is on a
node. It is the more immediate signal and it leaves the moment the pointer
does; applying both would dim the map to the intersection of two answers,
which is almost nothing. The neighbourhood loop the focus mode had inlined is
now one exported `neighborhoodOf` with two callers.

**The DOM cap is 600 → 200, and its meaning changed.** It was a limit on what
could be clicked. It is now an accessibility budget: keyboard traversal and
assistive technology need real focusable elements, that is a list to walk, and
a list of 600 is not one. It also costs a third of the DOM writes per camera
move. The roving tabindex makes it one tab stop either way.

`HIT_TARGET_LIMIT` and `hitTargets` moved to `lib/graph/hit-targets.ts` so a
browser test can import the budget it asserts against — the root `tsconfig`
does not compile JSX, so importing them from the component was a typecheck
error that only the root project saw.

## Verification

- `tests/graph-hit-test.test.ts` — 13, including **every one of 1,260 nodes
  found by pointing at it**, correctness at three cameras, the minimum reach
  at 0.1× zoom, the small-over-hub tie, and the hover dimming
- `tests/e2e/brain-map.spec.ts` — 14, two of them new: hovering over the
  canvas publishes the node and clears it on leaving, and the DOM layer never
  claims more than the cap while the canvas answers for everything painted
- `npx vitest run` — 175 files, 1,575 passed, 1 skipped
- `npx playwright test` — 144 passed, 1 skipped
- `pnpm lint`, `pnpm typecheck`, `verify-scope-boundaries` — clean

**A test failure that was mine, not the product's.** The hover e2e first
failed because it read a node's position immediately after `data-settled`,
while the camera was still gliding to its first fit — it aimed the pointer
where the node had been. A probe in the browser showed the hover working; the
fix was to wait for the camera, which todo 9's `cameraStill` helper already
does.

**A trap worth writing down.** A whole-suite run failed 18 tests across
unrelated specs, including routes with no auth. The cause was a stale dev
server left listening on :3000 from an earlier run, which Playwright reused
and which was serving a build from before these changes. Killing it and
deleting `apps/web/.next` fixed all of them. This is the second time this
session that an environment artefact looked exactly like a product regression.

## Still open

- **Edges are not hit-tested.** Clicking a relationship still goes through the
  screen-reader list. Nothing in the plan asks for it here, but "hover an edge
  to see its provenance" is the obvious next thing a viewer will try.
- **No hover on the DOM targets.** Pointing at one of the 200 buttons sets the
  hover through the canvas path anyway (the event bubbles), so the behaviour is
  right; the button's own `:hover` ring and the canvas highlight are two
  mechanisms drawing the same idea.
- **Hover is not throttled.** A quadtree query is microseconds, and the
  repaint it triggers is the same one the camera already causes, so nothing
  measured says it needs to be — recorded because it is the first thing to
  look at if the map ever feels heavy under a moving pointer.
