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

---

## Completed — 2026-09-13: the five, and the panel on `/app/map`

**Scope of this pass:** `apps/web/lib/graph/{simulation-protocol,force-simulation,worker-runtime,engine,render-frame,pixi-backend,graph-panel-settings,domain-anchors,layout-store}.ts`,
`apps/web/app/ui/{graph-force-panel,graph-layer-toggles,layout-warmup,brain-map-stage,brain-map,dashboard-screen}.tsx`,
`apps/web/app/app/(shell)/map/map-screen.tsx`, `apps/web/lib/dashboard/graph-model.ts`,
`apps/web/lib/map/workspace-map.ts`, `apps/web/lib/strings/dashboard.ts`,
`apps/web/app/styles/screens/map-hud.css`,
`tests/{graph-display,graph-layout-store}.test.ts` (new), `tests/graph-visibility.test.ts`,
`apps/web/app/ui/graph-force-panel.test.tsx`, `tests/e2e/map-panel.spec.ts` (new),
`tests/e2e/brain-map.spec.ts`.

The boundary the first pass drew — "what the map draws" done, "the panel
that drives it" not — is closed. Everything below is visual or a start
condition; nothing restarts the layout, and the tests say so each time.

### ⓐ Warm start — the layout is remembered per commit

`lib/graph/layout-store.ts` keeps a settled layout in IndexedDB under
`layout:<workspace>:<commit>` and pins under `pins:<workspace>` (a pin is a
person's decision about a node and outlives the next push). The encoding
and its refusals are pure and tested: a record of another version, a
truncated buffer, a stray non-finite is not a layout, whole — a half-warm
start is a layout nobody chose. IndexedDB is behind a three-method
interface; the tests hand in a map, and a browser that refuses IndexedDB
falls back to memory rather than failing to render.

The positions travel to the worker in the `start` message as a
transferable `Float32Array` (`NaN` for nodes the saved layout never saw —
those start on the spiral as before), and the worker begins at the reheat
temperature (`WARM_START_ALPHA` = 0.3) rather than from 1: the saved
layout only has to absorb what changed. `useLayoutWarmup` reads storage
*before* the stage mounts (a stage mounted cold and then told about the
saved positions would restart), with a 1.5s deadline after which the map
starts cold — what it did before, never worse. The stage says which it
was: `data-warm-start`. The browser spec asserts the first visit is cold,
that the settle wrote a record with a position for every node in the
layout, and that the reload mounts warm.

### ⓑ The force panel on `/app/map`

The same `GraphForcePanel`, in the same popover pattern the demo has: a
toolbar button, a `dialog`, focus to the close button on open, Escape back
to the button. The LOD readout in it is the stage's own (`hudLod` was
already being set on this screen and never read). And with the panel came
the thing the first pass had only done on the demo: **filtering on
`/app/map` is now visibility** — the stage takes the whole graph plus
`visibleNodeIds`, so a keystroke in the workspace search box no longer
restarts the layout. The earlier co-change and concept switches became two
of the seven layers, keeping their test ids.

### ⓒ Obsidian parity

`GraphPanelSettings` grew `showOrphans`, `showArrows`, `nodeSize`,
`linkThickness`, `localGraphDepth`, `groups` and `presets`, each clamped
and validated from storage the way the sliders were (a group's colour must
be one of six renderer tokens; eight groups, eight presets, the oldest
makes room). Every one is applied in `buildRenderFrame`, so the engine's
`setDisplay` is a `touch()`, not a restart — asserted.

- **Orphans** are judged on the *whole* graph's degrees: a node whose only
  neighbour is filtered out is out of view, not an orphan. The DOM hit
  layer hides exactly what the canvas hides, and the browser spec computes
  the orphan set from the stage's own edge list and asserts the count.
- **Arrows** are one filled triangle per directed edge at the target's rim,
  sized in screen pixels, one `fill` per style group (the same batching as
  the strokes). A containment line and a co-change correlation have no
  direction worth asserting and get none.
- **Node size / link thickness** multiply the radius and the stroke; the
  arrowhead stops at the scaled rim (`RenderEdge.targetRadius`). Visual
  only — the collision force keeps the renderer's default curve, so the
  physics do not change under a display slider.
- **Local graph depth** (1–3) feeds `focusLocalGraph` on both screens.
- **Groups**: a case-insensitive substring of label or path; the first
  match paints. The swatch in the panel and the node on the canvas read
  the same token, so they agree in both themes.
- **Presets** store the view (forces, display, groups, depth, fade) — never
  the card state or the other presets. "기본값 복원" resets the view and
  keeps the presets; the demo spec saves one, resets, reloads, applies,
  removes.
- **Pins** persist. `engine.pinNodeAt` / `unpinNode` / `pinnedNodes` sit
  beside the pointer hold from todo 11; a dragged pinned node is re-pinned
  where it was dropped rather than released, and the resolved point goes
  back up through `onPinsChange` for the screen to save. Pins ride in with
  the first `start` message so a warm mount opens with them holding. The
  inspector has the toggle; the hit target carries `data-pinned`; the
  spec pins, reloads, sees it still pinned before any click.

### ⓓ Domain anchor sliders

`ForceConfig.domainAnchorStrength` (0–0.05, default 0). `domainAnchorsFor`
puts each Data Brain area on a circle at 420 layout units, in `BRAIN_AREAS`
order, from the same `graphNodeArea` the colour bands use — an anchor is
never a second opinion about where a file belongs. The worker registers
`forceX`/`forceY` **only while the strength is above zero**, so at zero the
force list is identical to before and every existing layout stays
byte-identical (asserted against a layout with no anchors at all). Anchors
travel with every start, so the slider can be turned on later without a
restart; a list that does not line up with the nodes is dropped whole.

### ⓔ `style` and `config` layers

The reason they were missing was that a `GraphNode` did not know what the
scanner had classified it as. It does now (`classification`, set by the
loader from the artifact row), and `nodeHiddenByLayers` hides by type
*or* by classification. `availableLayers(data)` says which of the seven a
graph can switch off at all; both screens offer all seven and **disable**
the ones this graph has nothing for, with the reason as the title — the
honest form of "a control that silently does nothing". On the drifted-demo
scan `config` is live (its `package.json`) and `style` is disabled; on the
demo route only `doc` is live.

### Two things the browser taught

- The first run of the new specs timed out on every click of a new
  control. Not a product defect: the toolbar's `.arr-focus` buttons and the
  legend fold away under 80rem, and Playwright's default viewport is
  exactly 1280 wide. The workspace map's other specs already ran at 1440
  for that reason; these do now too, with the reason written where the
  viewport is set.
- The first swatch tokens were `accent` and `danger`, which the screen
  stylesheet test lists as legacy palette; they are `accent-fg` and
  `danger-fg` now, and the Korean-first test rejected an English example in
  the group placeholder — it says `예: 인증, AGENTS.md`.

### Verification

- vitest: `tests/graph-display.test.ts` 13 (display options, anchors, warm
  start, engine display/pins), `tests/graph-layout-store.test.ts` 9,
  `tests/graph-visibility.test.ts` 20 (+2: classification layers,
  `availableLayers`), `apps/web/app/ui/graph-force-panel.test.tsx` 7 (+2,
  the slider count updated 5 → 9 by name). Full `pnpm test`: 194 files / 1,796 passed / 1 skipped.
- Playwright: `tests/e2e/map-panel.spec.ts` 6/6 on `/app/map` over a real
  scan (panel persists · filter = visibility · config layer on, style
  disabled · orphans exact · pin survives reload · layout saved + warm
  mount); `tests/e2e/brain-map.spec.ts` 20/20 (+2: disabled layers, preset
  round trip). Full suite: 166 passed / 1 skipped / 0 failed.
- `pnpm lint`, `pnpm typecheck`, `scripts/verify-scope-boundaries.ts` PASS,
  `git diff --check` clean.

### Still open

- **The zoom hitch todo 12 measured is still not fixed.** Nothing here
  touched the collapse/raw draw-set handover.
- **Arrows are drawn, not hit-tested**: an edge still cannot be clicked on
  the canvas (todo 10's note stands).
- **Groups colour nodes; they do not filter.** Obsidian's groups also
  count as a query source; here they are paint only.
- **Warm start keys by commit.** A repository with many commits leaves one
  record per commit; nothing prunes them yet. The sizes are far from any
  IndexedDB quota, and a prune is a small follow-up.
