# Phase 4 · Wave B · todo 14 — one renderer, and a screen that stops naming its own fixture

**Date:** 2026-09-08 · **Scope:** `apps/web/app/ui/graph-canvas.tsx` (deleted),
`apps/web/app/ui/graph-detail.tsx`, `apps/web/app/(shell)/graph/page.tsx`,
`apps/web/lib/strings/graph.ts`,
`apps/web/app/styles/{base.css,screens/graph.css}`,
`apps/web/app/ui/graph-detail.test.tsx` (new), `tests/korean-strings.test.ts`,
`tests/e2e/{live-graph,a11y-contrast,app-shell}.spec.ts`.

Audit finding G14: two renderers coexisted, and the screen that used the second
one had its fixture written into it.

## Two renderers meant two answers to the same question

`GraphCanvas` was 277 lines of SVG with its own `Camera`, its own
`NODE_COLORS` keyed on evidence grade, and an 11-entry `TYPE_GLYPHS` table.
The Pixi stage answers all three of those from `render-frame.ts` — colour from
the semantic node-type tokens, shape from the node's kind, size from degree.
So the same node was a different size, a different colour and a different
shape depending on which screen you were looking at, and nothing said which
one was right.

It is gone. `/graph` mounts `BrainMapStage`, the same component the dashboard
and the workspace map mount, and the product has one renderer.

**What the screen gains, beyond consistency.** The SVG pinned the camera to the
focus node at scale 1 and let the rest of the neighbourhood fall outside a
fixed `viewBox`. The stage frames what it is holding once the layout settles,
so a depth-two neighbourhood is on screen because it was measured, not because
1000×700 happened to be big enough. It also brings the things the SVG never
had: cursor-anchored zoom, node drag with reheat, the fit-to-view button, hover
neighbourhood focus, and a roving-tabindex hit layer instead of a flat list of
sr-only buttons.

**What it costs, stated rather than discovered.** Two things the SVG could do
and the stage cannot:

1. **Clicking an edge on the canvas.** `GraphCanvas` put a pointer handler on
   every `<line>`. The inspector's edge index is the visible affordance now
   and the stage's live region keeps the assistive-technology path, so no
   route to an edge is lost — but the direct one is.
2. **Highlighting the selected edge in the drawing.** `.graph-edge.selected`
   had no equivalent in the frame plan. Selection shows in the edge index's
   `aria-pressed` and in the provenance card, not on the canvas.

Both are renderer features rather than screen features; they belong to
`render-frame.ts` if they come back.

Switching to the table view still unmounts the stage, which now costs a WebGL
context and a Worker rather than a subtree of SVG. `tests/e2e/brain-map.spec.ts`
already proves ten remounts leak no context, so this is a cost and not a leak.

## The screen stopped naming its own fixture

`GraphDetail` called `buildDashboardViewModel("scanned")` and fell back to the
literal node id `"req-auth"` — twice, once in the route and once in the
component. The demo shell has a `?state=` switch that reaches every other
screen, and this was the one it could not reach.

`?state=` is threaded through now, and the root node is derived: the route's
`?node=` if this graph holds it, otherwise the most-connected node, which is
the same `topHubNodes` ordering the dashboard's "start here" chips use. On the
`scanned` fixture that is `repository-access.ts`, not `req-auth`.

**The clustered state is the proof.** `?state=large` collapses the fixture into
supernodes and `req-auth` does not exist in it at all. Pinned to `scanned` the
route could never show it; falling back to a literal id it would have drawn an
empty graph. It draws a five-node neighbourhood.

Selection is derived from `?node=` rather than stored, for the same reason: a
node id held in `useState` keeps pointing at the neighbourhood the viewer left
when the route changes underneath it.

`/graph` is still a demo route — it is in the `(shell)` group, which is the
demo shell. A live evidence detail belongs under `/app/*` and is not this todo.

## The axe sweep gained a screen

`a11y-contrast.spec.ts` excluded `.local-graph-canvas` from every audit. That
selector matched nothing, because `/graph` was in neither surface list — but
had the route ever been added, excluding the container would have excluded the
provenance inspector standing beside it. One renderer means one exclusion:
`EXCLUDED` is `["canvas"]` now, and `/graph?node=req-auth` is audited in both
themes like any other screen.

## Dead style removed

`.graph-canvas`, `.graph-edge*`, `.graph-node*`, `.node-*` and the already-dead
`.graph-stage` wrapper are gone from `screens/graph.css`, and with them the
`@keyframes evidence-flow` and `neuron-pulse` in `base.css` that nothing else
animated — plus the `prefers-reduced-motion` rule that switched off two
animations that no longer exist. The `.local-graph-label` caption moved to the
right so it stops sitting on top of the stage's fit-to-view button, and its
copy no longer claims the layout is fixed, because it is not: it settles.

## Verification

- `apps/web/app/ui/graph-detail.test.tsx` — 7 new: the derived root is the
  most-connected node and not the retired literal, an unknown `?node=` lands
  there too, a named node roots four nodes at depth two, the clustered state
  renders instead of coming up empty, the markup is the Pixi stage and carries
  no `evidence-graph-canvas`, the hit layer speaks for every node, and the
  force panel stays off this screen
- `tests/e2e/live-graph.spec.ts` — the non-blank-pixels test now waits for
  `data-settled` and states what the canvas holds before measuring, at both
  1440×900 and 390×844. A blank first frame would have passed the old
  byte-count assertion on background alone
- `tests/e2e/a11y-contrast.spec.ts` — two new runs. `/graph?node=req-auth`
  audits clean in both themes: 38 colour-contrast passes, 0 violations, 0
  incomplete (`.omo/evidence/phase2a/task-9/axe-contrast-graph-detail-*.json`)
- `npx vitest run` — 179 files, 1,627 passed, 1 skipped
- `npx playwright test` — 149 passed, 1 skipped (was 147; the two are the new
  axe runs). The byte thresholds in the pixel test were left where they were
  and the Pixi stage clears them
- `pnpm lint`, `pnpm typecheck`, `verify-scope-boundaries` — clean

Screenshots of the settled screen — `graph-detail-settled.png` (the depth-two
neighbourhood of `req-auth`) and `graph-detail-large.png` (`?state=large`,
which this route could not reach at all before) — are in `todo-14/`. The
`screens-theme` evidence pair in `phase2a/task-8/` is captured before the
layout settles, so it shows the pre-fit camera; the ones here wait for
`data-settled`.

## Not done

1. **Edge selection on the canvas**, both the click target and the highlight
   (above).
2. **A live evidence detail.** `/graph` reads the demo fixture because the
   `(shell)` group is the demo; nothing under `/app/*` shows one node's
   neighbourhood yet.
3. The `/graph` view toggle still tears the stage down and builds it again.

## Found on the way, not fixed

`fitToView` frames node **centres** and leans on a flat 64-pixel margin to
cover the radius — its own comment says the padding is "enough that the
outermost nodes are not clipped by their own radius or their label". For an
ordinary node it is. `graph-detail-large.png` is the case where it is not: a
supernode is ~55px of radius plus a ~25px finding ring at that scale, and the
bottom-left one is cut off by the viewport edge. This is todo 9 behaviour and
`/map` has it too — nothing here changed it, but a screen showing five
supernodes at once is where it becomes visible. The fix is to grow the padding
by the largest painted radius rather than to raise the constant.
