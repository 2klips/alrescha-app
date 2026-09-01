# Alrescha desktop design system

**Version:** F1 / 1.0

**Status:** Implementation contract

**Applies to:** Desktop widths 1280, 1440, and 1920

**Does not apply to:** A future dedicated mobile product

## 1. Product thesis

Alrescha is a developer evidence workspace. Its audience is engineers and agent operators deciding whether a requirement, code change, test, and claim genuinely support one another. The primary page job is to trace evidence quickly, then inspect the selected relationship without losing graph context.

Direction: **repository clarity, constellation context**.

- GitHub/Primer supplies shell structure, density, semantic tokens, and interaction discipline.
- Alrescha supplies the evidence model, relationship language, and graph behavior.
- The interface is not a GitHub trademark clone. It does not reuse GitHub branding, Octicons, or Primer packages.
- One aesthetic risk only: the selected evidence path becomes a precise, inspectable `Evidence trace`. Everything around it stays quiet.

## 2. First-pass concepts

### A. Repository shell — selected

```text
┌─ global header · 56 ─────────────────────────────────────────────────────┐
├─ workspace / repository identity · 48 ──────────────────────────────────┤
├─ Overview  Map  Commits  Findings  Library  Settings · 40 ─────────────┤
├─ graph toolbar · 44 ──────────────────────────────┬─ inspector · 336–400┤
│                                                   │                      │
│                  evidence plot                    │ selected evidence    │
│                                                   │ details/activity     │
│                                                   │                      │
└───────────────────────────────────────────────────┴──────────────────────┘
```

Why selected: matches the user's GitHub reference, preserves graph width at 1280, and limits navigation to three stable horizontal layers. The inspector occupies layout space instead of covering relationships.

### B. Permanent app sidebar — rejected

```text
┌─ header ─────────────────────────────────────────────────────────────────┐
├─ 240 nav ─┬─ context strip ───────────────────────────┬─ 360 inspector ─┤
│           │ graph toolbar + graph                    │                 │
└───────────┴──────────────────────────────────────────┴─────────────────┘
```

Why rejected: recreates F0's competing-navigation problem and leaves too little 1280px plot width. Local side navigation remains allowed only inside settings, library, or another route that needs a tree/list-detail pattern.

## 3. Desktop layout contract

| Token                        | Value                       | Use                                       |
| ---------------------------- | --------------------------- | ----------------------------------------- |
| `--shell-header-h`           | `56px`                      | Global product actions                    |
| `--shell-context-h`          | `48px`                      | Workspace/repository identity and actions |
| `--shell-tabs-h`             | `40px`                      | Primary route navigation                  |
| `--workspace-toolbar-h`      | `44px`                      | Graph/list controls                       |
| `--layout-page-max`          | `1280px`                    | Reading and settings pages                |
| `--layout-readable-max`      | `80ch`                      | Long-form prose                           |
| `--layout-local-nav`         | `240px`                     | Optional route-local navigation only      |
| `--layout-inspector`         | `clamp(336px, 24vw, 400px)` | Selected evidence details                 |
| `--layout-page-padding`      | `24px`                      | 1280/1440 pages                           |
| `--layout-page-padding-wide` | `32px`                      | 1920 pages                                |

Workspace behavior:

- At 1280, open inspector is 336px; graph region remains at least 944px before internal borders.
- At 1440, inspector is 360px. At 1920, inspector caps at 400px.
- Closing the inspector returns its width to the plot. Opening it never overlays the canvas.
- Force settings move to a 320px anchored popover opened from the toolbar.
- Activity becomes an inspector tab or dedicated route, not a permanent bottom overlay.
- Graph pages may opt out of the 1280px content cap; ordinary pages may not.
- Sticky header height feeds `scroll-padding-top`; focused content cannot hide behind chrome.

Semantic regions:

```text
skip link -> header -> repository nav -> main -> optional aside -> status/live region
```

## 4. Color system

Raw values remain legal only in `apps/web/app/styles/tokens.css`. Components consume semantic custom properties. Light and dark use identical component geometry.

| Semantic token      | Light     | Dark      | Role                                     |
| ------------------- | --------- | --------- | ---------------------------------------- |
| `--bg-default`      | `#ffffff` | `#0d1117` | Main canvas/page                         |
| `--bg-subtle`       | `#f6f8fa` | `#151b23` | Header, table header, quiet grouping     |
| `--bg-inset`        | `#eff2f5` | `#010409` | Code, recessed controls                  |
| `--bg-overlay`      | `#ffffff` | `#151b23` | Popover/dialog/inspector                 |
| `--bg-hover`        | `#eff2f5` | `#1c2128` | Hover feedback                           |
| `--bg-selected`     | `#ddf4ff` | `#1c2d41` | Selected row/tab secondary cue           |
| `--fg-default`      | `#1f2328` | `#f0f6fc` | Primary text                             |
| `--fg-muted`        | `#59636e` | `#9198a1` | Secondary text                           |
| `--fg-disabled`     | `#818b98` | `#6e7681` | Truly disabled, nonessential labels only |
| `--border-default`  | `#d1d9e0` | `#3d444d` | Controls and region borders              |
| `--border-muted`    | `#e6eaef` | `#30363d` | Row dividers                             |
| `--accent-fg`       | `#0969da` | `#4493f8` | Links, focus-associated text             |
| `--accent-emphasis` | `#0969da` | `#1f6feb` | Primary action, selected indicator       |
| `--success-fg`      | `#1a7f37` | `#3fb950` | Verified                                 |
| `--attention-fg`    | `#9a6700` | `#d29922` | Inferred/pending                         |
| `--danger-fg`       | `#d1242f` | `#f85149` | Failed/refuted/destructive               |
| `--done-fg`         | `#8250df` | `#ab7df8` | Requirement/concept category when needed |
| `--focus-ring`      | `#0969da` | `#4493f8` | Two-pixel keyboard ring                  |

Contrast checks against `--bg-default`:

| Pair         | Light |  Dark |
| ------------ | ----: | ----: |
| Default text | 15.80 | 17.39 |
| Muted text   |  6.11 |  6.50 |
| Accent text  |  5.19 |  6.11 |
| Verified     |  5.08 |  7.45 |
| Inferred     |  4.87 |  7.50 |
| Failed       |  5.24 |  5.65 |

Dark primary fill `#1f6feb` with white text measures 4.63:1. Component-specific tints derive from these values with `color-mix()` inside `tokens.css`; no raw alpha values enter screen CSS.

Evidence mapping:

- `verified` -> success + solid border + check label.
- `inferred` -> attention + dashed border/edge + `Inferred` label.
- `failed/refuted` -> danger + broken/dotted edge + failure label.
- `document/info` -> accent.
- Requirements/concepts may use done purple, always paired with type text or glyph.

## 5. Typography

F1 removes Pretendard as the product-wide visual identity and stops using monospace for navigation, badges, timestamps, or ordinary counts.

```css
--font-sans:
  -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans KR",
  "Apple SD Gothic Neo", "Malgun Gothic", Helvetica, Arial, sans-serif,
  "Apple Color Emoji", "Segoe UI Emoji";
--font-mono:
  ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono",
  monospace;
```

No new font dependency. F2 removes existing Pretendard/IBM Plex Mono imports after visual and bundle verification. Tabular counts use `font-variant-numeric: tabular-nums` before monospace.

| Token             | Size/line | Weight | Use                                 |
| ----------------- | --------- | -----: | ----------------------------------- |
| `--text-body-sm`  | `12/16`   |    400 | Secondary single-line metadata only |
| `--text-body-md`  | `14/20`   |    400 | Default UI, buttons, navigation     |
| `--text-body-lg`  | `16/24`   |    400 | Long copy, README-like content      |
| `--text-title-sm` | `16/24`   |    600 | Panel/list heading                  |
| `--text-title-md` | `20/28`   |    600 | Workspace/page title                |
| `--text-title-lg` | `32/40`   |    600 | Onboarding only; never graph chrome |
| `--text-code`     | `13/20`   |    400 | Paths, SHAs, source, terminal, code |

Rules:

- Left aligned, ragged right. Long text max 80ch.
- Semantic heading order controls document structure; CSS never fakes hierarchy.
- Sentence case everywhere except immutable source identifiers.
- No UI text below 12px. No uppercase tracking as routine chrome.

## 6. Scale tokens

Spacing follows a 4px grid:

```text
2, 4, 8, 12, 16, 24, 32, 40, 48, 64px
```

- Primary dense working range: 8–24px.
- Default control height: 32px; form and primary CTA: 40px.
- Desktop pointer target floor: 32×32px. Never below WCAG's 24×24 CSS-pixel minimum.
- The 44px touch convention is deferred with the dedicated mobile product; critical desktop actions may still use 40–44px.

Radius:

| Token             | Value    | Use                            |
| ----------------- | -------- | ------------------------------ |
| `--radius-small`  | `3px`    | Small label/badge              |
| `--radius-medium` | `6px`    | Button, input, card, container |
| `--radius-large`  | `12px`   | Dialog only                    |
| `--radius-full`   | `9999px` | Avatar/pill only               |

Both themes use this scale. The former dark `0px` versus light `14px` split is removed.

Elevation:

- Normal cards, tables, inspector: border only, no shadow.
- Popover: one small shadow.
- Dialog: one large shadow plus scrim.
- Canvas nodes use rings and opacity, not glow.

Layer order:

```text
canvas 0 -> sticky chrome 100 -> popover 200 -> dialog 300 -> toast 400 -> skip link 500
```

Motion:

- Hover/focus color: 120ms.
- Popover/dialog enter: 200ms ease-out.
- Exit: 120ms ease-in.
- No page-load reveal, ambient pulse, parallax, spring overshoot, or button scale transform.
- `prefers-reduced-motion: reduce` removes spatial transitions; loading progress may retain subtle essential motion.

## 7. Icon contract

- Keep existing Lucide package; add no icon library.
- Sizes: 16px compact, 20px standard, 24px empty state.
- Stroke width: 1.5–2px, consistent within one component.
- Icon-only controls require accessible names and visible tooltips.
- Decorative icons are `aria-hidden="true"` and not focusable.
- No emoji as UI icons.

## 8. Evidence workspace contract

The graph is the signature, not the chrome.

Regions:

1. Workspace toolbar: view toggle, search, filters, layout settings, fit/reset.
2. Plot rectangle: bounded below toolbar and beside inspector.
3. Inspector: `Details`, `Relationships`, `Activity` tabs.
4. Accessible view: list/table toggle backed by the same selection and filters.

`Evidence trace` behavior:

- Selected node receives a two-ring emphasis; keyboard focus gets a distinct outer focus ring.
- Direct incoming/outgoing paths remain full opacity and gain arrow direction.
- Unrelated content recedes to 32–40% opacity but remains locatable.
- Verified edges are solid; inferred edges dashed; failed/refuted edges dotted/broken.
- The inspector names every relationship in text: source, relation, target, grade, provenance.
- Canvas and table share one selected node ID. Switching views preserves selection.
- Detail updates keep focus on the originating node/row and announce a short `aria-live="polite"` summary.

Density/performance:

- Default viewport shows a filtered/clustered neighborhood, not every node.
- Up to 100 visible nodes may use SVG; 101–500 stay Canvas/WebGL; above 500 requires clustering/LOD.
- Existing Pixi.js, d3-force, graphology, Web Worker, and dynamic import remain.
- No new graph or UI dependency while `/map` is at 409.4KB gzip idle payload.

## 9. Compatibility migration

F2 adds canonical tokens, then temporarily aliases current names:

| Current token         | Canonical target       |
| --------------------- | ---------------------- |
| `--bg`                | `--bg-default`         |
| `--surface`           | `--bg-overlay`         |
| `--surface-2`         | `--bg-subtle`          |
| `--code-bg`           | `--bg-inset`           |
| `--line`              | `--border-muted`       |
| `--line-strong`       | `--border-default`     |
| `--text`              | `--fg-default`         |
| `--muted`             | `--fg-muted`           |
| `--faint`             | `--fg-muted` initially |
| `--accent`/`--info`   | `--accent-fg`          |
| `--verified`          | `--success-fg`         |
| `--inferred`          | `--attention-fg`       |
| `--danger`            | `--danger-fg`          |
| theme-specific radius | shared radius scale    |

Order:

1. Add canonical values and legacy aliases in `tokens.css`.
2. Extend `tokens.ts` and token/contrast tests.
3. Migrate shared primitives and shell.
4. Migrate routes and renderer readers.
5. Remove aliases only after repository-wide exact search reaches zero consumers.

## 10. F2/F3 acceptance

- 1280×720 has no clipped navigation, toolbar, inspector, or plot controls.
- Light/dark screenshots have identical layout geometry and radius.
- No permanent panel overlays the plot.
- Text clears 4.5:1; non-text states/focus clear 3:1.
- Every keyboard focus indicator remains visible and unobscured.
- `Map` has graph and adjacency table views with shared selection.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- No raw colors outside `tokens.css`; no ad-hoc font size or radius.
- `/map` remains under 450KB gzip idle payload.
- Warm canvas-visible median does not regress more than 10% from 422ms without a recorded reason.

## 11. Two-pass self-critique

### Pass 1 — genericity

Problem: first draft copied Primer structure and palette closely enough that Alrescha could read as a GitHub skin.

Revision: retained GitHub's shell discipline but made `Evidence trace`, textual provenance, relationship direction, and graph/table parity the product signature. Removed marketing hero, green GitHub-style primary CTA, amber accent, decorative glow, and repository-file-table mimicry outside relevant list views.

### Pass 2 — implementation risk

Problem: an immediate token rename plus new font and graph-shape work would create large visual and bundle regressions.

Revision: use additive aliases; add no dependency; move to system fonts; preserve current circle-based renderer; encode evidence through rings, strokes, arrows, labels, and the table source of truth. The 32px desktop target is a deliberate density compromise while preserving the 24px WCAG floor; mobile touch optimization stays deferred.
