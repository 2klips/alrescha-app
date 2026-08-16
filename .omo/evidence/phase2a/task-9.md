# Phase 2A · Task 9 — Performance, bundle, and a11y gates

Commit: `test(ui): perf bundle and a11y gates`
Branch: `phase2a/ui-rebuild`

Measurement host: AMD Ryzen 7 9800X3D (8C/16T), 61.6GB RAM, Node v24.14.0,
Windows 11 (10.0.26200), Chromium via `@playwright/test` 1.62.1.
Every number below is from a run on this machine; nothing here is estimated.

---

## 1. 500-node frame budget

`tests/graph-perf.test.ts` (5 cases). Reproduce with:

```
npx vitest run tests/graph-perf.test.ts --reporter=verbose
```

### Method (the plan asks for this to be documented)

A frame in this app is three pieces of work:

1. the **d3-force tick**, which runs in the simulation Web Worker at ~30Hz and
   never touches the compositor (`lib/graph/simulation.worker.ts`);
2. **`buildRenderFrame()`**, the pure main-thread frame plan — the only piece
   whose cost scales with node count on the UI thread, and the hot spot flagged
   in the Wave 3 handoff (O(nodes) CPU, fresh node/edge/label arrays per frame);
3. the **Pixi/WebGL draw**, which is GPU work and is not measurable headlessly.

The suite measures (1) and (2) with `performance.now()` around each call on the
500-node fixture (`createFixtureGraph(500)` laid out by `runForceLayout`, seed 7
— 500 nodes / 493 edges), after 60 warm-up frames, over 240 measured frames. The
camera pans and zooms across all three LOD bands each frame and the glow map is
rebuilt from scratch every frame, so nothing is memoised away and the label
grid, badge pass, edge pass and glow lookups are all exercised. Piece (3) is
covered in the browser by `tests/e2e/brain-map.spec.ts`, which asserts the
canvas renders and that ten mount/unmount cycles leak no WebGL context.

### Result

| measurement | n | p50 | **p95** | max | mean | budget |
| --- | --- | --- | --- | --- | --- | --- |
| `buildRenderFrame(500)` | 240 | 0.215ms | **0.385ms** | 2.061ms | 0.252ms | 16.7ms (60fps) |
| `buildRenderFrame` + Far-zoom community collapse | 240 | 0.158ms | **0.267ms** | 1.364ms | 0.187ms | 16.7ms |
| worker force tick + transferable encode | 120 | 0.689ms | **1.113ms** | 1.569ms | 0.741ms | 33.3ms (30Hz) |

**p95 = 0.385ms against a 16.7ms budget — 43× of headroom.** The worst single
frame in the whole run (2.061ms) is still 8× inside budget. The per-frame
allocation the handoff flagged is real but is not the constraint at this size.

A fourth case guards the actual regression risk rather than the current number:
frame cost from 125 → 500 nodes grew **×2.56** (0.053ms → 0.135ms p50) where a
quadratic lookup would give ×16. That is the assertion that will fail if someone
puts an `array.find()` inside the node or edge pass, long before the 16.7ms
budget would notice.

Not measured: GPU raster time, and behaviour above 3,000 nodes (where supernode
collapse changes the shape of the work). The collapse path *is* measured here at
500, which is the size the plan specifies.

---

## 2. Graph-route JS bundle budget

`scripts/measure-route-bundle.ts`. Reproduce with:

```
pnpm --filter @specproof/web build
node --import tsx scripts/measure-route-bundle.ts
```

### Method

The Wave 3 handoff is right that this had to be invented: Next 16 builds with
Turbopack, which prints no per-route size table, and `.next/build-manifest.json`
lists only the shared root chunks — no static manifest says which chunks an App
Router route pulls in. So the chunk **set** is discovered empirically and the
**sizes** are computed deterministically:

1. serve the production build with `next start` on a free port;
2. drive headless Chromium to the route and record every JavaScript URL the page
   actually requests, tagged by phase —
   - `document`: `<script src>` present in the server-rendered HTML,
   - `load`: everything fetched by the `load` event,
   - `idle`: everything fetched by network idle **plus a 2.5s settle**, which is
     where the `dynamic(ssr:false)` Pixi chunks land;
3. resolve each URL to its file under `apps/web/.next/static` and compress it
   with `zlib.gzipSync` at the default level (6, what a CDN serves), reporting
   brotli alongside.

Sizes therefore do not depend on the dev server's compression settings, and the
chunk set is whatever the browser really asked for. Tiers are cumulative. The
script exits non-zero if the `idle` tier of any route exceeds the budget.

### Result — budget met, no exception needed

| route | tier | chunks | raw | **gzip** | brotli |
| --- | --- | --- | --- | --- | --- |
| **`/` (dashboard / brain map)** | document | 11 | 524.4KB | 160.2KB | 138.3KB |
| | load | 11 | 524.4KB | 160.2KB | 138.3KB |
| | **idle (Pixi included)** | 30 | 1432.2KB | **411.3KB** | 354.9KB |
| `/graph?node=req-auth` | idle | 11 | 799.0KB | 224.2KB | 189.3KB |
| `/findings` | idle | 10 | 767.6KB | 211.8KB | 178.6KB |

**The graph route is 411.3KB gz at the tier that includes Pixi — inside the
450KB budget with 38.7KB to spare.** The plan's phrase is "initial dashboard JS
bundle for the graph route (Pixi included)", and `idle` is the honest reading:
`dynamic(ssr:false)` means Pixi does not block first paint, but it is requested
unprompted on mount, so a user on the dashboard does download it. The
render-blocking half is only 160.2KB gz.

Reconciling with the Wave 3 handoff's "574.1KB gz across every route combined":
that figure summed all 41 client chunks in the build. 30 of them are reached
from `/`; the rest belong to other routes.

Headroom is real but not large. The three heaviest chunks on `/` are 70.8KB
(idle), 69.9KB (document) and 34.5KB (document) gz; the 19 lazy chunks past
`load` total 251.1KB gz. If Pixi grows or another heavy client dep lands on this
route, this budget is the first thing that will break.

### Outside the JS budget (recorded for OQ-002)

| route | CSS | fonts |
| --- | --- | --- |
| `/` | 2 files, 28.7KB gz (128.1KB raw) | 12 woff2 subsets, 285.1KB |
| `/graph` | 2 files, 28.7KB gz | 11 woff2 subsets, 260.0KB |
| `/findings` | 2 files, 28.7KB gz | 7 woff2 subsets, 156.8KB |

This closes **OQ-002**. The dynamic-subset strategy ships 285.1KB of font on the
heaviest route versus 2.0MB for the single `PretendardVariable.woff2` that
`next/font/local` would force — ~7× better on first visit, and each screen pulls
only the unicode ranges its Korean copy actually uses. The choice stands;
OQ-002 is marked resolved with a suggestion to amend the plan's wording.

---

## 3. axe-core contrast audit (AA, both themes)

`tests/e2e/a11y-contrast.spec.ts` — 4 cases, dashboard × findings × dark × light.
Reports written to `.omo/evidence/phase2a/task-9/axe-contrast-*.json`.

Only axe's `color-contrast` rule is enabled: the wider ruleset covers structural
a11y this restyle did not touch, and mixing it in would bury a contrast
regression. The WebGL canvas and its transparent DOM hit layer are excluded —
axe reads computed CSS, and a transparent button over a canvas has no computable
background (it reports `incomplete`, not a failure). Node labels are painted by
Pixi and are outside axe's reach entirely; the LOD unit tests cover those.

### First run — 33 real AA failures

| theme | screen | violations |
| --- | --- | --- |
| dark | dashboard | 0 |
| light | dashboard | 0 |
| dark | findings | **11** |
| light | findings | **22** |

The dark failures were all one token: `--faint #5A6478`, measuring **2.57:1** on
the `.highlighted` code row and 2.94:1 on `--surface`, used for code line
numbers and `.chain-index`.

The light failures were `--faint #8A8F9E` (2.82–3.23:1) **plus the ADR-009-3
palette itself** on paper white: `--verified #1E8A5E` 3.77–4.33:1,
`--inferred #B07A14` 3.25–3.72:1, `--brand #D6402E` 3.95–4.53:1,
`--info #3B6FDB` 4.08–4.68:1, all carrying 9–11px mono badge text.

### Fix — in the tokens file, nothing suppressed

`--faint` is a derived token (OQ-003 invented it), so it was simply raised to
clear AA on every surface in both themes:

| token | before | after | worst-case ratio |
| --- | --- | --- | --- |
| `--faint` (dark) | `#5A6478` (2.57:1) | `#848EA2` | **4.63:1** |
| `--faint` (light) | `#8A8F9E` (2.82:1) | `#666C7B` | **4.58:1** |

The `text > muted > faint` emphasis order still holds (5.00 / 4.63 dark,
6.11 / 5.33 / 4.58 light) and is now asserted.

The four status colours are **ADR-009-3 locked values and were not changed**.
Instead, `tokens.css` gained AA-safe text-only siblings, aliases of the base
colour in dark and darkened in light:

| token | light value | worst-case ratio |
| --- | --- | --- |
| `--brand-text` | `#C43A2B` | 4.59:1 |
| `--verified-text` | `#177A52` | 4.65:1 |
| `--inferred-text` | `#8F6310` | 4.62:1 |
| `--info-text` | `#3766CA` | 4.68:1 |

Plus derived aliases `--ok-text` / `--warn-text` / `--broken-text` /
`--accent-text`. Graph node colours, severity dots, drift rings, tints and
borders still read the ADR values, so the palette's identity is untouched — only
small text switches to the darker sibling. Rules changed in `globals.css`:
`.app-header nav a[aria-current]`, `.commit-chip`, `.grade-badge.{verified,
inferred,broken}`, `.severity-label.{high,critical,medium,low}`,
`.suggested-action > span`. Recorded as **OQ-009** because it is a genuine
tension with ADR-009-3 that the planning session should rule on (the marketing
site inherits the same palette).

### Second run — clean

| theme | screen | violations | incomplete | passing nodes |
| --- | --- | --- | --- | --- |
| dark | dashboard | **0** | 45 | 28 |
| light | dashboard | **0** | 45 | 28 |
| dark | findings | **0** | 0 | 71 |
| light | findings | **0** | 0 | 71 |

**Honest note on the 45 `incomplete` results on the dashboard.** These are not
passes. axe could not compute a background for them: 38 because the element
contains an inline SVG icon (every lucide-bearing chip and rail entry), 6
because the title band uses a background gradient, 1 because the text is too
short to classify. They are all token-driven surfaces, and the browserless token
test below covers the same pairings arithmetically — but axe did not confirm
them, and this report does not claim it did.

### Browserless companion gate

`tests/design-tokens.test.ts` gained a `token contrast (WCAG 2.2 AA)` suite that
parses `tokens.css`, resolves `var()` aliases and computes WCAG 2.2 relative
luminance directly. It asserts every text token clears 4.5:1 against `--bg`,
`--surface`, `--surface-2` and `--code-bg` in both themes, that the emphasis
ramp stays ordered, and that filled controls clear 3:1 on their own fill. This
fails the instant a *token* stops being legible, without waiting for some screen
to happen to use that pairing. The ratio function itself is calibrated against
black-on-white = 21:1.

---

## 4. Full suites

### vitest — 416 passed / 64 files (was 404 / 63)

```
pnpm test
 Test Files  64 passed (64)
      Tests  416 passed (416)
```

+12: 5 in `tests/graph-perf.test.ts`, 7 in the new `token contrast` suite.
No pre-existing test was changed, skipped or weakened. `pnpm lint`
(`--max-warnings=0`) and `pnpm typecheck` are green.

### Playwright — 49 passed / 49 (was 40 passed, 1 red, 1 flake)

Three consecutive full runs, two of them from a **cold** dev server with
`apps/web/.next/dev` deleted first: 49/49 every time.

+7 cases: 4 axe contrast, 3 HUD-geometry regressions.

#### The pre-existing red is genuinely fixed, not weakened

`tests/e2e/release-hardening.spec.ts:8` expected `h1 = specproof/drifted-demo`
after the seeded-demo onboarding. The handoff attributed the break to `a16acaa`;
tracing the h1 through the actual history shows otherwise:

| commit | dashboard `<h1>` |
| --- | --- |
| `0f00bfb` … `a16acaa` … `7ed6106` | `{model.repo}` |
| **`e0057dc`** feat(web): rebrand homepage as Arr | `Project proof map` ← broke here |
| `3b96d17` … `1fc9433` | `{DASHBOARD.title}` |

So `e0057dc` (pre-Phase-2A) dropped the connected-repo identity out of the page
heading, leaving every workspace with an identical h1. Two e2e specs then wanted
different text from the same element (`app-shell.spec.ts:11` wants
`DASHBOARD.title`, `release-hardening.spec.ts:8` wants the repo).

Fixed by putting both in the heading — `<h1>{DASHBOARD.title}<span
class="arr-proof-repo">{model.repo}</span></h1>` — which restores the repo to
the accessible name and satisfies both specs by substring match. The repo was
already in the view model and already rendered in the rail, so this is a
regression repair, not a feature addition. **No assertion was deleted or
loosened.**

#### The cold-start flake was a hydration race, not a timeout

`live-graph.spec.ts:37` did not need a longer timeout. `global-setup.ts` now
compiles every route once before the workers start, which removes the dev
server's on-demand-compile race outright. That exposed the real defect
underneath: these screens are **server-rendered**, so their controls are
visible, enabled and clickable before React attaches listeners, and an
interaction landing in that window is silently discarded when hydration commits.
That is what made `check()` on the orphan toggle and `fill()` on the force
slider intermittently no-ops. Both now wait for a definite hydration signal —
the Pixi `<canvas>` that only the `dynamic(ssr:false)` renderer can create, and
a `hydrated()` helper that waits for React's `__reactFiber$…` tag on the host
node. Verified with `--repeat-each=6`: 6/6.

#### One real layout defect found and fixed

Adding the repo line to the h1 made `force panel values survive a reload` fail
5/5 with `<button class="arr-focus"> … intercepts pointer events`. Measuring the
geometry showed why, and that it was **already broken before this change**: the
force panel's `max-height: min(20rem, calc(100% - 12rem))` assumed the controls
strip sits a fixed distance from the top of the graph plate, but the strip
actually tracks the height of the title band. At 1280×720 the clearance between
the panel's collapse button and the strip was **4px** — which is why the same
test failed 1-in-2 on the untouched Wave 3 tree too (verified by stashing).

Reserve widened to `calc(100% - 16rem)` (clearance now 26px), and
`brain-map.spec.ts` gained three cases asserting at 1280×720, 1440×900 and
1920×1080 that the two boxes do not intersect *and* that the collapse button is
actually clickable. 26px is still a tuned constant; recorded on **OQ-007** with
the structural fix (lift the HUD to a sibling of the workspace grid) as the
follow-up.

---

## Files

| file | what |
| --- | --- |
| `tests/graph-perf.test.ts` | new — 500-node frame budget, method documented in the header |
| `scripts/measure-route-bundle.ts` | new — per-route JS budget measurement, exits non-zero over budget |
| `tests/e2e/a11y-contrast.spec.ts` | new — axe-core AA contrast, 2 screens × 2 themes |
| `tests/e2e/global-setup.ts` | new — warms every route before the workers start |
| `apps/web/app/styles/tokens.css` | `--faint` raised; `--*-text` AA-safe siblings added |
| `apps/web/lib/theme/tokens.ts` | four `-text` tokens registered as semantic tokens |
| `apps/web/app/globals.css` | 6 rules moved to `-text` tokens; force-panel reserve 12→16rem; `.arr-proof-repo` |
| `apps/web/app/ui/dashboard-screen.tsx` | repo identity restored to the h1 |
| `tests/design-tokens.test.ts` | new `token contrast` suite (7 cases) |
| `tests/e2e/brain-map.spec.ts` | hydration gate + 3 HUD-geometry regression cases |
| `tests/e2e/live-graph.spec.ts` | `hydrated()` helper + 3 gates |
| `playwright.config.ts` | `globalSetup` wired |
| `package.json` | `@axe-core/playwright` + `axe-core` 4.13.0 (dev, pinned) |

## Open questions raised or closed

- **OQ-002** resolved — dynamic font subset confirmed by measurement (285.1KB vs 2.0MB).
- **OQ-003** resolved — light `--muted` passes at 5.33:1; `--faint` did not and was fixed in both themes.
- **OQ-006** still open — the hit layer was *excluded* from the axe run and keyboard traversal cost at `HIT_TARGET_LIMIT = 600` was **not** measured.
- **OQ-007** still open — 4px clearance root-caused and widened to 26px, but the constant-tuning remains.
- **OQ-008** still open — `/auth/*` (500) and `/app/*` (no Supabase) remain unreachable, so their contrast is **unverified**.
- **OQ-009** new — ADR-009-3's light palette fails AA for small text; resolved with derived `-text` tokens, needs a planning ruling.
- **OQ-010** new — `specproof` naming still throughout code, packages and user-visible demo strings.
