# Todo 13's remaining five: warm start, the panel on `/app/map`, Obsidian parity, domain anchors, style/config layers

## Objective and acceptance

Close the five items `.omo/evidence/phase4/todo-13.md` listed as not done
on 2026-09-07: IndexedDB coordinate warming keyed by commit, the force
panel on `/app/map`, Obsidian option parity (groups, orphans, arrows, node
size / link thickness, local graph depth, view presets, pins), the
forceX/forceY domain anchor slider (≤ 0.05, default off), and the `style`
and `config` layers. Acceptance per the plan: each proved by tests, no
layout restart from a display change, demo-route assertions kept.

## Starting state and isolation

- Start SHA: `c0d8aea` (`origin/main` after PR #16 and Codex's rollout
  record), branch `phase4/wave-b-todo-13`.
- Web only: no migration, no worker change, no dependency change. Desktop
  web only, as before.

## What changed

- `lib/graph/layout-store.ts` (new) — IndexedDB-backed layout and pin
  persistence behind a three-method interface; pure encode/decode with
  whole-record refusal; memory fallback.
- `app/ui/layout-warmup.ts` (new) — reads the saved layout and pins before
  the stage mounts (1.5s deadline, then cold); saves on settle and on pin
  changes.
- `lib/graph/simulation-protocol.ts`, `force-simulation.ts`,
  `worker-runtime.ts` — `initialPositions` (transferable, `NaN` = unknown)
  and per-node `anchors` on the start message; warm starts begin at the
  reheat alpha; `domainAnchorStrength` in `ForceConfig` with `forceX`/`forceY`
  registered only above zero.
- `lib/graph/domain-anchors.ts` (new) — one anchor per Data Brain area on
  a circle, from `graphNodeArea`.
- `lib/graph/render-frame.ts` — seven layers (`config`, `style` by the
  node's classification), `availableLayers`, `nodeHiddenByLayers`,
  `edgeHiddenByLayers`; display settings (orphans, arrows, node size, link
  thickness, groups) applied in the frame; `RenderEdge.arrow`/`targetRadius`.
- `lib/graph/pixi-backend.ts` — arrowheads, one fill per style group.
- `lib/graph/engine.ts` — `setDisplay`, `pinNodeAt`/`unpinNode`/`pinnedNodes`,
  warm start and pins on the first start message.
- `lib/graph/graph-panel-settings.ts` — display options, local depth,
  groups (≤ 8, six tokens) and presets (≤ 8) with clamping; reset keeps
  presets.
- `app/ui/graph-force-panel.tsx` — sections: forces (+ domain anchor),
  display, groups editor, presets. `app/ui/graph-layer-toggles.tsx` (new) —
  shared toggles, absent layers disabled with a reason.
- `app/app/(shell)/map/map-screen.tsx` — filter = visibility (whole graph
  - `visibleNodeIds`), layer toggles replacing the two ad-hoc switches
    (test ids kept), the force panel popover, the pin toggle in the inspector,
    warm-up gating and saves.
- `app/ui/dashboard-screen.tsx` — shared toggles, depth setting.
- `lib/map/workspace-map.ts`, `lib/dashboard/graph-model.ts` —
  `GraphNode.classification` from the artifact row.
- `lib/strings/dashboard.ts`, `styles/screens/map-hud.css`.

## Screens touched

`/app/map` (toolbar: seven layer toggles, 레이아웃 설정 popover; inspector:
이 노드 고정; stage: `data-warm-start`, `data-pinned-count`), `/map` (shared
toggles with disabled absent layers; panel sections; presets).

## Verification

- vitest: `tests/graph-display.test.ts` 13, `tests/graph-layout-store.test.ts`
  9, `tests/graph-visibility.test.ts` 20, `graph-force-panel.test.tsx` 7.
  Full `pnpm test`: 194 files / 1,796 passed / 1 skipped.
- Playwright: `tests/e2e/map-panel.spec.ts` 6/6, `tests/e2e/brain-map.spec.ts`
  all green including the two new tests; full suite: 166 passed / 1 skipped / 0 failed.
- `pnpm lint`, `pnpm typecheck`, `scripts/verify-scope-boundaries.ts` PASS,
  `git diff --check` clean.

## Left open

The zoom hitch from todo 12, canvas edge hit-testing (arrows are painted
only), groups as paint rather than filter, and pruning of per-commit
layout records. Details in `.omo/evidence/phase4/todo-13.md`.
