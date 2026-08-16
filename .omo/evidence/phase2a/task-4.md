# Phase 2A · Task 4 — Graph engine core: worker simulation + Pixi renderer

**Commit:** `feat(graph): worker-simulated pixi graph engine`
**Governing spec:** `spec/BUILD_PLAN_PHASE2A_UI.md` todo 4,
`spec/RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` §5-① (stack + simulation/render split).

## What landed

| Artifact                                | Path                                             |
| --------------------------------------- | ------------------------------------------------ |
| Wire protocol (pure, validated)         | `apps/web/lib/graph/simulation-protocol.ts`      |
| graphology model + deterministic d3-force | `apps/web/lib/graph/force-simulation.ts`       |
| Worker body (testable without a Worker) | `apps/web/lib/graph/worker-runtime.ts`           |
| Worker entry                            | `apps/web/lib/graph/simulation.worker.ts`        |
| Frame interpolation (30Hz → display Hz) | `apps/web/lib/graph/position-buffer.ts`          |
| Render plan (pure)                      | `apps/web/lib/graph/render-frame.ts`             |
| Lifecycle + leak counters               | `apps/web/lib/graph/engine.ts`                   |
| Pixi v8 WebGL adapter                   | `apps/web/lib/graph/pixi-backend.ts`             |
| Client mount (rAF, theme, resize)       | `apps/web/app/ui/brain-map.tsx`                  |
| SSR-safe stage (`dynamic ssr:false`)    | `apps/web/app/ui/brain-map-stage.tsx`            |
| Tests (31)                              | `tests/graph-engine.test.ts`                     |

Dependencies added to `apps/web` (exact pins, matching repo style):
`pixi.js 8.19.0`, `graphology 0.26.0`, `graphology-communities-louvain 2.0.2`,
`d3-force 3.0.0`, `@types/d3-force 3.0.10` (dev).

## Architecture — why it is shaped this way

The acceptance criteria require unit-testable evidence of *no leaks* and *stable
positions*, neither of which is observable through a real Worker or a real GPU in
vitest. So the engine is split into three layers:

1. **Pure layers** (protocol, force layout, worker runtime, position buffer, render
   plan) — no DOM, no GPU, no Worker. These carry every decision worth asserting.
2. **Lifecycle layer** (`engine.ts`) — owns exactly two disposable resources and
   counts them (`readEngineCounters()`), with both injected as factories.
3. **Adapters** (`pixi-backend.ts`, `brain-map.tsx`) — thin, no decisions.

Determinism comes from two places, both required: seeded golden-angle start
positions (so no two nodes coincide on tick 0) *and*
`simulation.randomSource(mulberry32(seed))`, which replaces d3-force's
`Math.random` jiggle. Without the second, a 500-node layout is not reproducible.

Positions cross the wire as a transferable `Float32Array` (`[x0,y0,x1,y1,…]`);
the worker allocates a fresh buffer per frame and hands ownership over, so no
structured clone of the node array ever happens. Links are index pairs — no
strings after `start`.

## Acceptance criteria → tests

| Criterion (todo 4)                        | Test in `tests/graph-engine.test.ts`                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| worker message protocol                   | "rejects malformed host messages…", "rejects worker messages that are not a real position frame", "round-trips positions…", "start message indexes links and drops dangling or self edges" |
| force-config application                  | "a config message reheats the simulation and changes the geometry", "a longer link distance pushes connected nodes further apart", "setConfig on a live layout reheats it", "clamps force parameters…" |
| mount/unmount ×10, no lost context, no detached worker | "mount and unmount ten times leaks no worker, backend or GPU context" (asserts `{backendsCreated:10, backendsDestroyed:10, contextLosses:0, workersCreated:10, workersTerminated:10}`) |
| disposal completeness                     | "disposal is idempotent and silences the worker channel" (post-dispose frames are dropped, `stop` is the last message, `paint()` is a no-op) |
| 500-node fixture with stable positions    | "a 500-node fixture lays out identically on every run" (two runs, seed 42, identical maps), "seeded start positions never coincide", "the layout spreads nodes instead of piling them on the origin" |

## Test hooks exposed (for Wave 3 / todo 6 / todo 9)

- `readEngineCounters()` / `resetEngineCounters()` — `{ backendsCreated, backendsDestroyed, contextLosses, workersCreated, workersTerminated }`.
- `recordContextLoss()` — called by the Pixi adapter's `webglcontextlost` handler.
- `engine.frame()` — the full render plan for the current instant *without* painting;
  every visual assertion (colour, radius, dash, ring, glow) can be made on it.
- `engine.framesReceived()`, `engine.ready()`, `engine.positions()`.
- `createGraphEngine({ now })` — injectable clock for deterministic interpolation.

## Renderer choice notes

- **Glow is an additive-blend sprite layer, not a custom fragment shader.** The
  research spec lists it as the cheap Pixi-native option; it also survives a theme
  flip without shader recompilation, and per-node intensity is a tint/alpha write,
  so a burst never re-uploads geometry. (Todo 6 drives `RenderNode.glow`.)
- **Theme flips do not repaint WebGL.** `brain-map.tsx` runs a `MutationObserver`
  on `data-theme` and calls `engine.setPalette(readRendererPalette())`. Node and
  edge colours are re-resolved every frame from the palette; the only style Pixi
  caches across frames is the label colour, refreshed in `setPalette`.
- **No hex literal anywhere in the engine.** Colours are resolved only through
  `resolveColor(palette, token)`; a missing token falls back through `text` to `0`
  rather than inventing a colour (asserted).

## Deliberately out of scope this todo

The dashboard route still renders the existing SVG `GraphCanvas`. Wiring the Pixi
stage into `/` is todo 7 (dashboard shell + HUD restyle), which owns the selectors
and the e2e specs that currently assert `.graph-node.pulse` and
`[data-node-id] .node-core`. Swapping the renderer here would have broken those
without the HUD work that replaces them. `BrainMapStage` is ready to drop in; see
`.omo/evidence/phase2a/task-6.md` for the full public API.

React Flow was already absent from the brain-map path (the previous renderer was
hand-rolled SVG), so "React Flow removed" required no change.

## Gate

`pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm test` ✓ — 59 files, 321 tests
(290 baseline + 31 new), no regressions.
