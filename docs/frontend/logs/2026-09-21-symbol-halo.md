# Symbol halo on `/app/map` — 2026-09-21

Status: **built and tested locally; production after Codex's rollout** (Phase 4 Wave F todo 26).

The map's model still carries no symbol. Selecting a code or test file asks
`/api/map/symbols?files=<id>` once for that file's exported symbols, keeps the
answer in IndexedDB keyed by workspace, commit and file, and hands it to the
engine as `symbolHalo`. At Near zoom the frame places the symbols around the
file at the golden angle (Vogel's sunflower — no simulation, positions follow
the owner each frame) and Pixi draws them in a new `haloLayer` between the
nodes and the rings, in the owner's colour with the four-shape grammar; the
first 24 names go in the screen-space label layer. Below Near the frame
carries nothing — the symbols fold into their file.

| Surface                                                   | Change                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lib/graph/symbol-halo.ts`                                | `layoutHalo` / `haloFor`: golden-angle placement, draw limit 64 + overflow, Near-only, shape by kind. |
| `lib/graph/render-frame.ts`                               | `FrameInput.symbolHalo`, `RenderFrame.halo`, halo labels beside items.                                |
| `lib/graph/engine.ts`                                     | `setSymbolHalo(halo)`; a set touches the frame like a selection.                                      |
| `lib/graph/pixi-backend.ts`                               | `haloLayer` + index-pooled sprites, drawn inside the geometry block.                                  |
| `app/ui/symbol-halo-loader.ts`                            | `SymbolHaloLoader` (memory → IndexedDB → network) and `useSymbolHalo`.                                |
| `app/ui/brain-map*.tsx`, `map-screen.tsx`                 | The prop threaded to the engine; stage `data-symbol-halo` / `data-symbol-count`.                      |
| `app/api/map/symbols/route.ts`, `lib/map/symbol-layer.ts` | The read, as the signed-in member, with the MCP caps.                                                 |

Tests: `tests/graph-symbol-halo.test.ts` (placement, gating, frame, loader
cache), `tests/e2e/map-symbol-halo.spec.ts` (one request on selection, the
API's answer, none after a reload at the same commit). Desktop only; no
mobile acceptance (track rule). Evidence:
[`.omo/evidence/phase4/todo-26.md`](../../../.omo/evidence/phase4/todo-26.md).
