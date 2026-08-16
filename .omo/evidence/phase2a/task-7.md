# Phase 2A · Task 7 — Dashboard shell and HUD restyle

Commit: `feat(dashboard): ink-and-seal hud restyle`
Branch: `phase2a/ui-rebuild`

## What this task actually did

Two things at once, because they are the same change: the Wave-2 graph engine was
mounted on a route for the first time, and the dashboard chrome around it was
rebuilt as an Ink & Seal HUD over a full-bleed graph.

### 1. The engine is on `/`

`apps/web/app/ui/dashboard-screen.tsx` now renders `BrainMapStage` instead of the
SVG `GraphCanvas`. `GraphCanvas` survives only on `/graph` (evidence detail),
which the plan keeps on the simpler renderer.

Realtime → renderer bridge, exactly as Wave 2 specified:

```
glowFromRealtime(realtime, clock)       → BrainMapStage glow
glowAfterglowNodes(realtime.pulses, …)  → BrainMapStage afterglow
```

`lib/realtime/access-events.ts` was not touched. The workspace and
revoked-token filtering the realtime suite already proves therefore applies to
the glow layer unchanged — a cross-workspace read still cannot light a node.

### 2. Full-bleed graph, translucent HUD (WORK_SPEC §5.2-①)

The composition is CSS-only: `.arr-proof-panel` spans every column and row of
`.arr-workspace`, `.arr-graph-stage` spans every cell of that panel, and heading,
controls and CI banner are stacked in the same grid area rather than above it.
The repo rail, inspector and activity feed are placed back into their own cells
on top, at 82% surface opacity with `backdrop-filter`. **Markup order is
unchanged**, so screen-reader order and every existing role/label selector still
hold.

The dashboard was the last surface still painted from the legacy `--arr-*`
landing palette with `color-scheme: light` hard-coded — i.e. it did not respond
to the theme toggle at all. All 131 `var(--arr-*)` references in `globals.css`
were mapped onto the semantic tokens and the `--arr-*` block was deleted from
`tokens.css`.

| legacy | semantic | legacy | semantic |
| --- | --- | --- | --- |
| `--arr-ink` | `--text` | `--arr-blue` | `--accent` |
| `--arr-muted` | `--muted` | `--arr-blue-soft` | `--tint-accent` |
| `--arr-line` | `--line` | `--arr-coral` | `--danger` |
| `--arr-polar` | `--bg` | `--arr-mint` | `--verified` |
| `--arr-paper` | `--surface` | `--arr-amber` | `--inferred` |

### 3. Hub-nodes Top-5 chip (REVIEW_EXTERNAL_PROJECTS G2)

`topHubNodes()` in `lib/dashboard/graph-model.ts` — degree-ranked, id-tiebroken,
isolated nodes excluded (a chip that leads nowhere is not a chip). Clicking one
selects the node and flies the camera to it, the same gesture the activity feed
uses.

## Decisions

**A DOM hit layer, not canvas hit-testing.** WebGL has no accessibility tree and
no click targets. `BrainMapStage` renders one transparent button per node
(`data-node-id`, labelled `<label> · <type> · <grade>`), and `BrainMap` parks
each one over its painted node at 10Hz using the renderer's own screen
transform. One layer serves pointer, keyboard, assistive technology and the e2e
suite. Capped at `HIT_TARGET_LIMIT = 600` by degree; the renderer still paints
every node. Positions are rounded to whole pixels — an unrounded write keeps
nudging the element forever once the simulation cools, and a target that never
stops moving can never be clicked.

**`--verified` stays on evidence (OQ-003 check).** Reviewed every mint→green
mapping on the dashboard. Kept `--verified`: the CI-evidence banner, the
implementation-coverage metric, `.arr-grade.verified`. Moved to `--accent`: the
"Live" indicator and the activity dot, which are chrome, not grades.

**Legend swatches now come from the node tokens with distinct shapes (OQ-004).**
requirement = square (`--node-requirement`), code = circle (`--node-code`),
test = dashed circle (`--node-test`). Amber `test` and amber `inferred` are
still the same hue per ADR-009-3, but they are no longer only distinguished by
colour. Same treatment on the hub chips.

**HUD panels are separate stacking contexts.** The force card and the metric
evidence card live inside the graph plate, so a card tucked into a screen corner
paints *under* the rail or the inspector however high its z-index. Both are
parked in the clear channel between them (force card bottom-right, capped at
`min(20rem, calc(100% - 12rem))` with internal scroll so a short viewport cannot
grow it up into the controls strip; evidence card top-left).

## Bugs this task found in the Wave 2 engine

Both were invisible until the engine ran in a browser, because Wave 2 tested it
with an injected fake backend and no React tree.

1. **The engine was rebuilt on almost every frame.** `BrainMap`'s mount effect
   listed `onLodChange` as a dependency, and the stage passes a fresh inline
   closure on every render — so every LOD/label report tore down the worker and
   the GPU context and started the layout again. The page was effectively
   unresponsive. Callbacks are now read through a ref and the effect has an
   empty dependency list. LOD reporting and hit-layer sync share one 100ms tick.

2. **Remounting raced two Pixi inits on one canvas.** The canvas was a JSX
   element React keeps across mounts; React StrictMode (and HMR, and returning
   to the route) starts a second `Application.init()` on a canvas that already
   has a context. Chromium logged `Could not retrieve shader source (WebGL
   context may be lost)` continuously. The canvas is now created and removed by
   the effect, so every mount gets its own context.

## Tests

Unit (`pnpm test`): **369 → 382**, all green.

- `tests/graph-engine.test.ts` — 4 cases for `engine.focusNode`: fixture position
  before the first frame, simulated position after it, unknown id returns false
  and does not move the camera, and focusing never increments `layoutRestarts()`.
- `tests/dashboard.test.ts` — 3 cases for `topHubNodes` (ranking, id tiebreak,
  isolated nodes excluded).
- `apps/web/app/ui/brain-map-stage.test.tsx` — 6 cases: hit-target capping and
  determinism, plus SSR through `renderToStaticMarkup`. **Verified the Wave-2
  concern**: `next/dynamic(ssr:false)` under plain `react-dom/server` keeps the
  `aria-label`, `data-canvas-nodes` and every `data-node-id`, and emits no
  `<canvas>`.

Browser (`npx playwright test`): 30 passed, 2 failed — both pre-existing and both
needing a running Supabase (`release-hardening.spec.ts:8`, `pilot-flow.spec.ts:264`).
Wave 4 owns those.

**OQ-005 discharged.** The Playwright criteria todos 5 and 6 deferred now run on
the real canvas, in `tests/e2e/brain-map.spec.ts`:

| Criterion (todo) | Test |
| --- | --- |
| 3 LOD bands + label-count bands (5) | zooms near → far → mid → near; far labels ≤ `FAR_HUB_LABEL_LIMIT`, mid > far; HUD status text matches the stage |
| force-panel persistence (5) | slider value and collapsed state survive a reload, and the value reaches `localStorage` |
| glow burst behaviour (6) | replay lights nodes, then the lit set empties on its own (pulse → decay → afterglow → idle) |
| WebGL disposal (4) | 10 × mount/unmount over route changes with no context-lost, shader or worker error on the console |
| node reachability | one hit target per fixture node, all 15 present |
| hub chip focus (7) | chip click marks both the chip and the node target pressed |

`tests/e2e/dashboard-hud.spec.ts` covers todo 7's own criteria: all four HUD
metrics open their own provenance and close again, the rail links resolve, the
HUD is translucent and re-themes (computed styles, not screenshots), and narrow
viewports stack the HUD instead of floating it.

Migrated selectors (the SVG hooks the old renderer exposed no longer exist):

| was | now | files |
| --- | --- | --- |
| `.graph-node.pulse, .graph-node.decay` | `[data-testid=brain-map-stage][data-glow-active]` | `live-graph.spec.ts` |
| `[data-node-id='req-auth'] .node-core` | `[data-testid=brain-map-hits] [data-node-id='req-auth']` | `live-graph.spec.ts` |
| `getByTestId("evidence-graph-canvas")` on `/` | `getByTestId("brain-map-stage")` | `app-shell`, `dashboard`, `release-hardening`, `pilot-flow` |

`evidence-graph-canvas` still exists and is still asserted on `/graph`, which
keeps the SVG renderer.

### Note on `page.mouse.wheel`

It hangs against this page: the viewport cancels the wheel to zoom instead of
scrolling, and Playwright waits for a scroll that never happens. The zoom helper
dispatches a `wheel` event on `.brain-map-viewport` instead, which runs the
app's own listener.

## Gates

| Gate | Result |
| --- | --- |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | 382 passed (63 files) |
| `pnpm --filter @specproof/web build` | pass — Turbopack resolves `new Worker(new URL("./simulation.worker.ts", import.meta.url), {type:"module"})` with no config change |

### Bundle observation for Wave 4

Client chunks after `next build`: 41 files, 1.91MB raw / **574.1KB gzip total
across every route**. Pixi is split over 8 lazy chunks totalling **~125KB gzip**,
reached only through the `import("../../lib/graph/pixi-backend")` inside the
`dynamic(ssr:false)` component — it is not in the initial payload. Turbopack
prints no per-route table, so Wave 4 needs its own measurement method for the
"graph route < 450KB gz" budget; the numbers above are a floor, not that figure.

## Screenshots

`.omo/evidence/phase2a/task-7/` — regenerated by
`tests/e2e/dashboard-hud.spec.ts`:

- `dashboard-dark.png`, `dashboard-dark-glow.png`
- `dashboard-light.png`, `dashboard-light-glow.png`
- `dashboard-light-scanning.png` (blocked state)
- `dashboard-dark-mobile.png` (420px — stacked HUD)
