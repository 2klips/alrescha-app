# Phase 4 · Wave B · todo 12 — render performance and the hub visual grammar

**Date:** 2026-09-07 · **Scope:** `apps/web/lib/graph/pixi-backend.ts`
(rewritten), `apps/web/lib/graph/{render-frame,lod,engine}.ts`,
`apps/web/lib/dashboard/graph-model.ts`, `apps/web/lib/map/workspace-map.ts`,
`apps/web/app/ui/dashboard-screen.tsx`, `apps/web/app/(shell)/map/page.tsx`,
`apps/web/lib/strings/dashboard.ts`,
`apps/web/app/styles/screens/map-hud.css`,
`scripts/bench-graph-browser.ts` (new),
`tests/graph-render-grammar.test.ts` (new),
`tests/{graph-lod,graph-hit-test}.test.ts`.

## The renderer

Five things were per-node or per-edge work on **every frame**, including the
frames where nothing about the graph had changed:

| was | is |
| --- | --- |
| a fresh circle path built and uploaded per node | four textures, one tinted sprite per node |
| one `stroke()` per edge — one draw call each | one stroke per style group |
| geometry rebuilt on every frame | rebuilt only when the graph or the camera moved |
| everything drawn, on screen or not | a screen-space box test skips the rest |
| a `Text` kept forever for every node ever labelled | a pool of 64, reused |

Two smaller ones came with them. **Dashes are screen units now**: a dashed
edge used to have its dash length in world units, so zooming out turned a
dashed line into a solid one and zooming in turned it into two dots.
**Device-pixel-ratio changes are tracked**: the renderer was told the ratio
once at init, so dragging the window to a second monitor left everything
painting at the wrong sharpness until something else forced a resize.

The geometry cache needed one new fact on the frame. `revision` is bumped by
every engine mutation *including* the camera, which is exactly what
`paintIfChanged` wants and exactly what a geometry cache must not use.
`geometryRevision` is the same counter minus camera moves, so panning a
settled graph now changes a container transform and touches nothing else.

## The grammar

**Four shapes.** `NODE_SHAPE` has been in `graph-model.ts` since Wave A′ with
a comment saying it would be *rendered in Wave B todo 12*. It is: circle for
leaves, ring for containers, diamond for a URL, square for a table. Colour
already carries the domain band, so shape is what lets a reader tell a route
from a file inside one band of one colour.

**The risk ring, three bands.** `low` draws nothing — a ring on every node is
a texture, not a warning, and todo 21's own rule is that a file with no risk
factor is absent from the map rather than present with a zero. Only **code**
is ringed: a requirement has no untested-ness or fan-in of its own, and
ringing one would put a judgement on a node the judgement was never about.
The legend is a separate row from the colour legend, because it is a
different axis — colour says what a node *is*, the ring says what todo 21
*thinks of it* — and its title says so.

**Status badges** finally paint. `RenderNode.badge` has carried the evidence
grade at Near zoom since Phase 2A and no backend ever drew it.

**The Far draw policy.** At Far the map is a constellation, and containment,
co-change, meaning-links and section haze drawn together at that zoom are a
grey wash over the structure they are supposed to sit behind. They are hidden
there and drawn again as soon as the zoom can tell them apart. Containment is
drawn faintly wherever it is drawn at all: `layoutOnly` has meant "a folder
pulls its files together but 885 lines would bury the imports" (OQ-037) since
Wave A, and until now it meant nothing to the renderer.

**Far labels are landmarks.** Twelve, not six, and ranked by *kind* before
degree: a package, then a route, then a directory, then whatever has the most
edges. Degree alone answers "what is busiest", which at Far is almost always
a barrel file — and the question a viewer is asking at that zoom is *where am
I*. Package-ness comes from the `role` column the directory-nodes migration
has been writing since Wave A todo 3 and that nothing had read.

**Labels are screen-space, and they fade.** They lived inside the camera
container, so text scaled with the zoom: at Near a filename was the width of
the screen and at Far it was a smear. And the "text fade threshold" slider
dimmed every label by a flat amount, which is a dimmer, not a fade — what a
viewer saw while zooming was labels switching on and off at a hard edge. They
ramp over a band above the size floor now, so they arrive.

## The benchmark, and what it found

`scripts/bench-graph-browser.ts` drives a real Chromium at `/map?nodes=5000`
and records the interval between `requestAnimationFrame` callbacks through an
idle period, a pan and a zoom. It states the host and the renderer string,
because wall-clock frame time on a GPU is a property of the machine and a
number without those is a rumour rather than a measurement.

It reports **dropped frames** — intervals over 1.5× the median — because a
browser presents on the display's schedule, so a p50 sitting on the refresh
interval means the renderer finished in time, not that it took that long.
What separates a map that feels smooth from one that does not is how often it
misses.

**Measured, 5,000 nodes** — AMD Ryzen 7 9800X3D · win32 10.0.26200 · ANGLE
SwiftShader (headless Chromium has no GPU here, so this is the software
rasteriser — the harder case, but it is not a GPU number and must not be
quoted as one):

```
idle   p50 16.7  p95 17.7  max  18.4   dropped  0/89
pan    p50 16.7  p95 17.9  max  19.0   dropped  0/90
zoom   p50 16.2  p95 87.5  max 179.1   dropped 32/187
```

Idle and pan hold the refresh interval with **no dropped frames at five
thousand nodes**. Zoom does not: about one frame in six is a stutter and the
worst is 179ms.

Chasing that found something worth recording. The first suspicion was the
collapse — `collapseGraph` ran on every frame at Far zoom, and none of its
four inputs depends on the camera. Memoising it is a real win and it is
measured: `bench-graph-frame.ts`'s `frame-3500-far` case goes from **0.133ms
to 0.053ms p50** (p95 0.260 → 0.072). But 0.13ms is nothing beside a 179ms
hitch, so **that is not the cause**, and the memo is kept on its own evidence
rather than on a story about the browser numbers.

What the zoom spikes actually are: crossing the Far threshold switches the
frame between a few dozen supernodes and five thousand raw nodes, and the
first frame on the raw side grows the sprite pool from nothing to five
thousand objects. It is a transition cost, once per crossing, not per-frame
waste. Fixing it means keeping the collapsed and raw draw sets warm, which is
the hierarchy work todo 13 owns.

## Verification

- `tests/graph-render-grammar.test.ts` — 13 new: all four shapes in play, the
  three risk bands and the code-only rule, the Far policy hiding and
  re-showing each family, containment at 0.08, the family reaching the frame,
  landmarks beating a 400-degree barrel file, the twelve-label limit, the
  fade ramp, and screen-space label positions
- `npx vitest run` — 177 files, 1,602 passed, 1 skipped
- `npx playwright test` — 146 passed, 1 skipped
- `pnpm lint`, `pnpm typecheck` — clean

## Still open

- **The zoom hitch.** Measured, understood, not fixed. It belongs with the
  collapse work in todo 13.
- **No GPU in the measurement.** Headless Chromium fell back to SwiftShader
  on this host. The numbers are a software-rasteriser floor; a real GPU can
  only be faster, but "can only be" is not a measurement and the report says
  which renderer it used.
- **`?nodes=` is a demo-route parameter.** It is how a five-thousand-node page
  gets in front of a browser at all, it is clamped, and `/app/map` reads a
  workspace and cannot see it. Worth knowing it exists.
- **The four textures are drawn on a 2D canvas at load.** Fine for four, but
  a fifth shape means a fifth canvas rasterisation on the main thread during
  startup.
- **Risk never reaches the map from a real workspace yet.** `GraphNode.risk`
  is plumbed and rendered; the loader does not populate it, so on live data
  every ring is absent. That is the honest state, not a bug — todo 21 builds
  the map, and joining it to the graph loader is its own piece of work.
