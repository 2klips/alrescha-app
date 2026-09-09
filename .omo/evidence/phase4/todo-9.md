# Phase 4 · Wave B · todo 9 — the camera

**Date:** 2026-09-07 · **Scope:** `apps/web/lib/graph/camera.ts` (new),
`apps/web/lib/graph/engine.ts`, `apps/web/app/ui/brain-map.tsx`,
`apps/web/app/ui/brain-map-stage.tsx`,
`apps/web/app/ui/brain-map-stage.test.tsx`,
`apps/web/lib/strings/dashboard.ts`, `apps/web/app/styles/shared.css`,
`tests/graph-camera.test.ts` (new), `tests/graph-engine.test.ts`,
`tests/e2e/brain-map.spec.ts`.

## The map had a camera and no camera model

The wheel handler multiplied `scale` and left `x`/`y` where they were. That
zooms about the world origin, so the thing you aimed at slid away from the
pointer — measured in the browser at **92px of drift over four notches**,
against a node whose hit target is 20px across. You could not zoom in on
anything; you could only zoom in and then go looking for it again.

Three other things followed from having no model:

- **Every step landed instantly.** A cut reads as the map *changing*; a
  movement reads as the map *moving*, and only one of those tells a viewer
  that what they are looking at is the same graph.
- **The projection lived in three places** — `render-frame`, the hit-layer
  sync, and the gesture handlers. They agreed because nobody had changed one
  of them yet.
- **The worker's `settled` message was parsed and dropped.** "The layout has
  converged" arrived on every run and reached nothing.

## What it is now

`lib/graph/camera.ts` holds the arithmetic, pure and clock-free, so the feel
of the gesture is testable in node with no canvas and no GPU. The projection
is stated once and the hit layer now reads it from there.

**Cursor-anchored zoom.** `zoomAt` keeps whatever is under the point exactly
where it is. The test asserts that invariant — project the world point back
after the zoom and it lands on the same pixel — rather than the numbers one
implementation happens to produce. At a scale bound it returns the camera
unchanged: a wheel that cannot zoom any further must not pan as a
consolation prize.

**A glide, not a lerp.** `approachCamera` closes `1 - exp(-dt/tau)` of the
gap, so 300ms of glide is 300ms whether the machine is running at 30fps or
144fps. A per-frame fraction makes the same gesture twice as slow on half the
frame rate, which is how a map ends up "feeling sluggish on my laptop" with
nothing measurable wrong. Three runs of the same 300ms in 2, 10 and 60 steps
agree to nine decimal places, because an exponential composes exactly.

Scale eases **geometrically**: halfway between 0.5× and 2× is 1×, not 1.25×.
Linear easing makes the second half of every zoom-out crawl.

The glide **arrives**, by identity rather than by closeness. An asymptote
would repaint the map every frame for the rest of the session.

**A drag is direct.** Easing a wheel step reads as movement; easing a drag
reads as lag, because the pointer is already telling the viewer where the map
should be. A drag also cancels an in-flight glide, so the view cannot be
pulled out from under the hand.

**Fit to view.** `fitToView` frames the bounding box — the extent, not where
the crowd is — and answers `null` for an empty set rather than pointing a
camera at nothing. A graph with no extent (one node, or several in one place)
keeps the scale it had: inventing a zoom level for a graph with no width
would be a number with no source. There is a control on the stage, and the
first automatic fit happens when the layout settles, **only for someone who
has not moved the camera themselves** — doing it to someone who has just
panned somewhere would be the map taking the wheel.

**`settled` is consumed.** The engine tracks it and clears it on anything
that restarts the layout — new positions, new forces, new data. The stage
publishes `data-settled`, which is what the browser tests now wait on instead
of sleeping for a second and hoping.

## Ownership, stated

While the map is mounted the component owns the camera: gestures move a
target and the loop eases the engine toward it. The loop stops writing the
moment it arrives, so `engine.setCamera` from anywhere else is adopted rather
than fought. `focusNode` keeps its jump-there semantics for direct callers;
the mounted map uses the new `cameraForNode` and glides, and both read the
same arithmetic rather than two copies that happen to agree.

## Verification

- `tests/graph-camera.test.ts` — 18, the invariants above
- `tests/graph-engine.test.ts` — 47, including `settled` through every restart
  and `cameraForFit`/`cameraForNode` computing without moving
- `tests/e2e/brain-map.spec.ts` — 12, three of them new: the layout announces
  it settled, zoom holds its anchor (2.5px tolerance, the hit layer's own
  rounding), and fit brings a graph dragged off-screen back inside
- **The e2e was checked against the defect**: reverting the wheel handler to
  the old scale-only form fails it at 92px. A test that has never seen the
  bug it guards is a test nobody has checked.
- `npx vitest run` — 174 files, 1,562 passed, 1 skipped
- `npx playwright test` — 142 passed, 1 skipped
- `pnpm lint`, `pnpm typecheck`, `verify-scope-boundaries` — clean

## Still open

- **Momentum.** A drag that ends with velocity stops dead. Obsidian carries
  it; whether that is wanted here is a design question, not an oversight.
- **Keyboard camera.** Zoom and pan are pointer-only. The hit layer's arrow
  keys walk nodes and the camera follows selection, so the map is reachable —
  but a keyboard user cannot frame a region.
- **Pinch.** `touch-action: none` is set and no pinch handler exists. Desktop
  web is this track's scope (AGENTS.md), so it is deferred rather than
  missing.
