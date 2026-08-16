# Phase 2A · Task 6 — Neuron glow layer and drift overlays

**Commit:** `feat(graph): shader neuron glow and drift overlays`
**Governing spec:** `spec/RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` §5-① and §2
("re-layout-free real-time glow"), `spec/BUILD_PLAN_PHASE2A_UI.md` todo 6.

## What landed

| Artifact                                    | Path                                    |
| ------------------------------------------- | --------------------------------------- |
| Intensity model, coalescer, drift derivation | `apps/web/lib/graph/glow.ts`           |
| Glow + afterglow in the frame                | `apps/web/lib/graph/render-frame.ts`   |
| `setGlow` + `layoutRestarts()` test hook     | `apps/web/lib/graph/engine.ts`         |
| Additive sprites, afterglow ring, dashed drift edges | `apps/web/lib/graph/pixi-backend.ts` |
| Glow props through the client mount          | `apps/web/app/ui/brain-map.tsx`, `brain-map-stage.tsx` |
| Tests (16)                                   | `tests/graph-glow.test.ts`             |

## Rendering choice: additive sprites, not a custom fragment shader

The plan allows either ("shader or additive glow sprites — document choice").
Chosen: **an additive-blend sprite layer** (`glowLayer.blendMode = "add"`) over a
single white radial-falloff texture, tinted per node.

Reasons, in order of weight:
1. Per-node intensity becomes a `tint`/`alpha`/`scale` write on an existing
   sprite. No geometry re-upload, no uniform block rebuild — which is exactly the
   "update only the `glowIntensity` attribute" requirement.
2. A theme flip changes the tint source only. A custom shader would need
   recompilation or a uniform pass on every `data-theme` change, and the palette
   is read from CSS at runtime, not baked.
3. One texture, one draw batch. Pixi batches the sprites; a bespoke shader would
   break batching without measurable benefit at the 3,000-node target.

The time-varying part is the intensity itself (rise → exponential decay →
afterglow floor), evaluated on the CPU per frame from `lastTouchedAt`. That is a
handful of `Math.exp` calls over the *lit* nodes only, not all nodes.

## The intensity model

`glowIntensityAt(pulse, now)`:

- **rise** — linear to peak over `GLOW_RISE_MS` (120ms), so a read reads as a
  strike rather than a step.
- **decay** — `peak · e^(−(age − rise) / 1500ms)`, the ~1.5s constant the
  research spec names. Continuous at the rise/decay seam by construction.
- **afterglow** — `max(0.14 · peak, decayed)`: a residual tint on a
  recently-touched node instead of a hard cut to zero.
- **idle** — exactly 0.

`glowPeak(eventCount) = min(1, 0.55 + log2(n+1)·0.22)` — repeated reads burn
brighter but saturate, so a hot node cannot blow out the additive layer.

**The phase machine is not redefined here.** `lib/realtime/access-events.ts`
already owns pulse/decay/afterglow/idle *and* the workspace + revoked-token
filtering. `glow.ts` imports `pulsePhaseAt` and adds only the continuous
intensity, so there is one truth about when a node is lit — and the existing
realtime suite keeps guarding tenancy isolation for the glow layer for free
(asserted directly: a cross-workspace read and a revoked-token read leave
`code-pack` and `test-pack` dark).

## Coalescing

`createGlowCoalescer(100)` batches on **absolute** window boundaries
(`floor(now / 100)`), not "100ms after the first event". Absolute boundaries make
the batching independent of when a burst starts, so a scripted stream replays
identically every run. It is pull-based (`drain(now)`) rather than timer-based:
the browser drains from the rAF loop, and the test replays a 50 events/s burst
with no fake timers — producing exactly **10 batches of 5** over one second.

## Drift overlays

Derived, never stored: a node rings because `findingCount > 0`, an edge dashes
because `broken`. `driftOverlay(data)` states the rule independently of the
renderer, and the frame test asserts the frame's rings match it exactly. Ring
and dash colour is `frame.driftColor` = the `--danger` token; verified/inferred
edges keep their own token tint. Rings, dashes and glow are produced in the same
`buildRenderFrame` pass and drawn in the same Pixi frame.

## Acceptance criteria → tests

| Criterion (todo 6)                                | Test in `tests/graph-glow.test.ts` |
| ------------------------------------------------- | ---------------------------------- |
| intensity state machine pulse→decay→afterglow      | "runs the pulse to decay to afterglow to idle machine", "rises to the peak and then decays exponentially with a ~1.5s constant", "afterglow holds a residual tint instead of dropping to nothing", "intensity never increases while a node is left alone" |
| coalescing under a 50 events/s burst, one batched update per window | "a 50 events/s burst produces one batch per 100ms window" (10 batches × 5), "an open window is not drained early…", "a coalesced batch is one reducer call, and the reducer never relayouts" |
| no re-layout calls                                 | "a scripted burst updates intensities in place and never restarts the layout" (`layoutRestarts()` stays 1, zero extra worker messages, `layoutRevision` stays 0) + the negative control "replacing the graph does restart the layout, so the counter means something" |
| cross-workspace isolation intact                   | "cross-workspace and revoked-token reads never light a node"; `tests/realtime-graph.test.ts` untouched and green |
| drift overlays in the same pass                    | "rings and dashes are derived from findings and broken evidence", "the frame draws rings, dashes and glow in one pass", "edges propagate the intensity of whichever endpoint is hotter", "afterglow marks only the nodes past their decay" |

## Test hooks for Wave 3

- `engine.setGlow(intensities, afterglow?)` — in-place visual write.
- `engine.glow()` — current intensity map.
- `engine.layoutRestarts()` — must not move when glow is applied.
- `engine.frame().nodes[i].glow` / `.afterglow` / `.ring`, `.edges[i].flow` / `.dashed`,
  `frame.driftColor` — every glow and drift assertion without a canvas.
- `BrainMapStage` renders `data-glow-active="<count of lit nodes>"` for e2e.
- Bridge for the dashboard's existing realtime state:
  `glowFromRealtime(realtimeState, now)` and `glowAfterglowNodes(state.pulses, now)`.

Realtime feed wiring is unchanged — `lib/realtime/access-events.ts` was not
modified.

## Gate

`pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm test` ✓ — 62 files, 369 tests
(290 baseline + 79 new across todos 4–6), no regressions.
