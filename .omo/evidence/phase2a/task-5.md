# Phase 2A · Task 5 — LOD, labels, clustering, and force panel

**Commit:** `feat(graph): lod labels clustering and force panel`
**Governing spec:** `spec/RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` §5-① (normative
interaction spec), `spec/BUILD_PLAN_PHASE2A_UI.md` todo 5.

## What landed

| Artifact                                   | Path                                            |
| ------------------------------------------ | ----------------------------------------------- |
| LOD bands + Sigma-style grid label selection | `apps/web/lib/graph/lod.ts`                   |
| Louvain supernodes + folder fallback       | `apps/web/lib/graph/clustering.ts`              |
| Panel state, clamping, persistence         | `apps/web/lib/graph/graph-panel-settings.ts`    |
| Frame builder extended (LOD → collapse → labels) | `apps/web/lib/graph/render-frame.ts`      |
| Engine: viewport, fade slider, expand/collapse | `apps/web/lib/graph/engine.ts`               |
| Force HUD card + `useGraphPanelSettings`   | `apps/web/app/ui/graph-force-panel.tsx`         |
| Stage wiring (panel drives renderer)       | `apps/web/app/ui/brain-map-stage.tsx`           |
| Zoom/pan on the canvas                     | `apps/web/app/ui/brain-map.tsx`                 |
| Tests (25 + 4)                             | `tests/graph-lod.test.ts`, `apps/web/app/ui/graph-force-panel.test.tsx` |

## Decisions and their reasons

**LOD is keyed to rendered node size, not raw zoom.** `resolveLod` takes the
*median* node radius × 2 × scale and compares it to `{ mid: 8px, near: 18px }`.
Using the median means one enormous hub cannot drag an otherwise-distant view
into Near, and keying on pixel size keeps the bands stable when degree-scaled
radii change. This matches the research spec's "nodes below a pixel-size
threshold get no label" rule rather than inventing zoom constants.

**Label selection is a pure function returning a sorted id list.** Far = top-6
hubs; Mid = one best label per 96px screen cell; Near = everything on screen
above a relaxed floor. Ranking is degree → rendered size → id, and the id tie
break is what makes the output reproducible (asserted by feeding the same
candidates in reverse order). Sorting the result makes the selection a value,
not an iteration-order accident.

**The text fade threshold scales the size floor**, exactly like Obsidian's
single slider: `labelSizeFloor(lod, fade)`. Raising it is proven to be a strict
subset relationship, not just a smaller number (`relaxed ⊇ strict`).

**Clustering is visual aggregation, never re-layout.** The worker keeps
simulating the raw graph; `collapseGraph` runs at frame time and draws a
supernode at the *centroid* of its members. So expanding a community costs one
frame and no alpha reheat. Collapse only happens when
`nodeCount > 3,000 && lod === "far"` — at or below 3,000 the Obsidian aesthetic
wins and nothing is collapsed at any zoom.

**Supernodes cannot look healthier than their contents:** grade is the worst
member grade, `findingCount` is the sum, and merged crossing edges keep the
worst grade. Intra-community edges disappear.

**Louvain with a seeded RNG; folder fallback when louvain says nothing.**
`communityAssignment` passes `rng: mulberry32(seed)` so the assignment is
deterministic, and falls back to the first two path segments when the graph has
no edges, throws, or yields a single community (one blob would collapse the
whole repo to one dot).

**Panel persistence treats storage as hostile.** `parsePanelSettings` degrades a
corrupt, non-object, partial or out-of-range payload to the defaults, clamping
each field independently — a bad `linkDistance` must not discard a good
`collapsed`. `useGraphPanelSettings` loads on mount rather than during render,
because reading `localStorage` while rendering would be a hydration mismatch.

## Acceptance criteria → tests

| Criterion (todo 5)                                | Test |
| ------------------------------------------------- | ---- |
| grid label selection determinism                  | "the cell winner is degree-weighted and ties break deterministically", "selection is stable across repeated calls" |
| LOD thresholds                                    | "the three bands are decided by rendered node size, not raw zoom", "the median radius decides the level…" |
| label-count bands per zoom level                  | "each zoom band labels its own share of the visible nodes" (Near = every visible node; Mid ≤ visible and strictly fewer on a 500-node graph; Far ≤ 6) |
| badge visibility at Near                          | "status badges are a Near-zoom affordance only", "status badges are attached only at Near" |
| panel values persist                              | "values survive a serialize and reload round trip", "out-of-range and corrupt payloads degrade to the defaults", "a partial payload keeps the values it does carry" |
| 3,500-node fixture: supernodes at Far, raw when expanded | "the 3,500-node fixture shows supernodes at Far and raw nodes when expanded", "Far zoom renders supernodes and expansion restores the raw members" |

## Verification deferred to todo 7 — see OQ-005

todo 5's Playwright criterion cannot run in Wave 2: the stage is not mounted on
a route until todo 7, and todo 7 depends on 5 in the plan's own dependency
matrix. Every band, label count, badge and collapse assertion is therefore made
as a deterministic vitest test on the pure frame builder — a stronger guarantee
than counting labels in a canvas screenshot — and the browser pass moves to
todo 7. The selectors it needs already exist: `data-lod`, `data-canvas-nodes`,
`data-testid="graph-force-panel"`, `data-force-key="<force>"`,
`data-testid="graph-lod-status"`.

## Public API added (for Wave 3)

- `GraphEngine.setViewport(v)` / `resize(w,h)` (resize also updates the viewport),
  `setTextFadeThreshold(0…1)`, `lod()`, `expanded()`, `toggleCommunity(key)`.
- `RenderFrame.lod`, `RenderNode.badge`, `RenderNode.clusterCount`.
- `useGraphPanelSettings(): [settings, update]` — load-on-mount + save-on-change.
- `GraphForcePanel({ settings, onChange, lod?, labelCount? })` — presentational.
- `BrainMapStage({ showForcePanel })` — set false when the HUD supplies controls.

## Gate

`pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm test` ✓ — 61 files, 353 tests
(290 baseline + 31 todo 4 + 29 todo 5, plus 3 new force-panel copy strings), no
regressions.
