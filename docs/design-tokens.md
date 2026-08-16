# Ink & Seal — design token reference

**Source of truth:** [`apps/web/app/styles/tokens.css`](../apps/web/app/styles/tokens.css).
That file is the only place in the app allowed to contain a literal colour;
everything else (stylesheet, components, the Pixi/WebGL renderer) reads these
custom properties. Enforced by the `arr/no-hardcoded-hex` ESLint rule and by
`tests/design-tokens.test.ts`.

**Why this document exists:** the marketing site (`2klips/arr`) is restyled
separately and needs the app's final palette. This is that handoff. Copy the
values, keep the semantic names, and honour the usage rules in §4 — those are
what make the two properties look like one product.

Governing decision: `spec/DECISIONS-ADR.md` ADR-009-3, with one documented
divergence recorded in §3.2 and `spec/OPEN_QUESTIONS.md` OQ-009.

Theme mechanics: **dark is the default** (`:root`). Light ("paper") is opt-in
via `[data-theme="light"]` on `<html>`, stamped by an inline boot script before
hydration so there is no flash of the wrong theme. First visit honours
`prefers-color-scheme`; after that the stored choice wins.

---

## 1. Typography

| token | value |
| --- | --- |
| `--font-sans` | `"Pretendard Variable", Pretendard, "Pretendard Fallback", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-mono` | `"IBM Plex Mono", "IBM Plex Mono Fallback", ui-monospace, SFMono-Regular, Consolas, monospace` |

Two families, no others. Pretendard Variable carries body and headings; IBM Plex
Mono carries **numbers, code, SHAs, log lines and token counts** — anything the
reader might compare digit by digit.

Both are self-hosted; no CDN. Pretendard ships as the vendored **dynamic unicode
subset** (92 `unicode-range` slices) rather than one 2.0MB file, so a page pulls
only the ranges its copy actually uses — measured at 285.1KB on the heaviest
route (see `.omo/evidence/phase2a/task-9.md`, OQ-002).

Layout shift is handled by two fallback `@font-face` blocks with metric
overrides measured from the shipped woff2 (`head.unitsPerEm`, `hhea.*`), not by
guesswork:

| fallback | ascent-override | descent-override | line-gap-override |
| --- | --- | --- | --- |
| `Pretendard Fallback` | `95.215%` | `24.121%` | `0%` |
| `IBM Plex Mono Fallback` | `102.5%` | `27.5%` | `0%` |

Both use `font-display: swap`.

---

## 2. Surfaces and text

| token | dark | light ("paper") | role |
| --- | --- | --- | --- |
| `--bg` | `#0B0E14` | `#FAF7F1` | page ground |
| `--surface` | `#141926` | `#FFFFFF` | cards, panels, rails |
| `--surface-2` | `#1B2233` | `#F3EFE7` | raised/active rows, nested surfaces |
| `--code-bg` | `#0F1420` | `#F3EFE7` | code blocks and snippets |
| `--line` | `#232B3D` | `#E3DDD0` | default border |
| `--line-strong` | `#35405A` | `#CFC6B4` | emphasised border, dividers |
| `--text` | `#E8ECF4` | `#20242E` | body and headings |
| `--muted` | `#8A94A8` | `#5B6272` | secondary text, labels |
| `--faint` | `#848EA2` | `#666C7B` | the dimmest text still allowed |

`--faint` is a floor, not a free dimming knob: it is defined as *the dimmest
colour that still clears WCAG AA on every surface it can land on*. Do not go
below it for text. For genuinely decorative dimming use `--line` / `--line-strong`.

---

## 3. Identity and status

### 3.1 The ADR-009-3 palette

These are the product's colours. Use them for **fills, graph node colours,
dots, rings, tints and borders** — and for text in the dark theme.

| token | dark | light | meaning |
| --- | --- | --- | --- |
| `--brand` | `#FF5A45` | `#D6402E` | Arr vermilion; also `danger` |
| `--verified` | `#3DDC97` | `#1E8A5E` | execution-backed evidence |
| `--inferred` | `#F5B84A` | `#B07A14` | AI-inferred evidence |
| `--info` | `#6C9EFF` | `#3B6FDB` | information, graph blue; also `accent` |

Derived aliases in the same family: `--accent` → `--info`, `--danger` →
`--brand`, and the legacy names `--ok` → `--verified`, `--warn` → `--inferred`,
`--broken` → `--danger`.

### 3.2 AA-safe text siblings (read this before restyling the marketing site)

The light values above **fail WCAG AA when they carry small text.** Measured on
paper white: `--verified` 3.77–4.33:1, `--inferred` 3.25–3.72:1, `--brand`
3.95–4.53:1, `--info` 4.08–4.68:1 — all below the 4.5:1 body-text threshold.
An axe-core audit of `/findings` in light theme returned 22 violations from
exactly these pairings (9–11px mono badges).

ADR-009-3 fixes the palette and this repo does not relitigate it, so the app
added darkened **text-only** siblings instead. The identity colour still paints
every node, dot, ring, tint and border; only text switches.

| token | dark | light | worst-case AA |
| --- | --- | --- | --- |
| `--brand-text` | = `--brand` | `#C43A2B` | 4.59:1 |
| `--verified-text` | = `--verified` | `#177A52` | 4.65:1 |
| `--inferred-text` | = `--inferred` | `#8F6310` | 4.62:1 |
| `--info-text` | = `--info` | `#3766CA` | 4.68:1 |

Aliases: `--accent-text`, `--danger-text`, `--ok-text`, `--warn-text`,
`--broken-text`.

In dark these are plain aliases — the base colours already clear 4.95:1 — so a
single `var(--verified-text)` is correct in both themes.

> **Marketing site: apply the same split.** Any place the site sets small text
> in vermilion, green, amber or blue on a light background needs the `-text`
> value, or it inherits the same AA failure. This tension is open as OQ-009; if
> the planning session decides to change the ADR light values instead, both
> properties should move together.

### 3.3 Contrast pairs for filled controls

| token | dark | light |
| --- | --- | --- |
| `--on-brand` | `#0B0E14` | `#FFFFFF` |
| `--on-accent` | `#0B0E14` | `#FFFFFF` |
| `--on-verified` | `#0B0E14` | `#FFFFFF` |

---

## 4. Graph node colours

ADR-009-3 assigns one colour per artifact type. They are **aliases, not new
values** — the same token drives the DOM legend and the WebGL renderer, which is
what keeps the map and its key in sync.

| token | alias of | node type |
| --- | --- | --- |
| `--node-doc` | `--info` | document |
| `--node-requirement` | `--brand` | requirement |
| `--node-code` | `--verified` | code |
| `--node-test` | `--inferred` | test |

Note that `inferred` evidence and `test` nodes therefore share amber; they are
distinguished by shape and label, never by colour alone (OQ-004).

---

## 5. Composed roles

Built with `color-mix()` from the tokens above, so they follow the theme
automatically. Reproduce these formulas rather than flattening them to hex.

| token | definition | use |
| --- | --- | --- |
| `--panel` | `color-mix(in srgb, var(--surface) 94%, transparent)` | HUD cards over the graph |
| `--panel-soft` | `color-mix(in srgb, var(--surface) 88%, transparent)` | lighter overlay chrome |
| `--shadow-color` | `#000000` (dark) / `#20242E` (light) | shadow base |
| `--panel-shadow` | `color-mix(in srgb, var(--shadow-color) 32%/14%, transparent)` | 32% dark, 14% light |
| `--tint-accent` | `color-mix(in srgb, var(--accent) 10%, transparent)` | info backgrounds |
| `--tint-verified` | `color-mix(in srgb, var(--verified) 10%, transparent)` | verified backgrounds |
| `--tint-inferred` | `color-mix(in srgb, var(--inferred) 10%, transparent)` | inferred backgrounds |
| `--tint-danger` | `color-mix(in srgb, var(--danger) 12%, transparent)` | danger backgrounds |

Legacy aliases kept for older rules: `--ink` → `--text`, `--panel-strong` →
`--surface`.

---

## 6. Measured contrast

WCAG 2.2 relative luminance, computed from the values above. Every text token
against every surface it can land on. The threshold for body text is **4.5:1**;
`tests/design-tokens.test.ts` fails the build below it.

### Dark

| token | value | on `--bg` | on `--surface` | on `--surface-2` | on `--code-bg` |
| --- | --- | --- | --- | --- | --- |
| `--text` | `#E8ECF4` | 16.31 | 14.82 | 13.40 | 15.54 |
| `--muted` | `#8A94A8` | 6.33 | 5.75 | 5.20 | 6.03 |
| `--faint` | `#848EA2` | 5.86 | 5.32 | 4.82 | 5.58 |
| `--brand-text` | `#FF5A45` | 6.26 | 5.68 | 5.14 | 5.96 |
| `--verified-text` | `#3DDC97` | 10.93 | 9.93 | 8.98 | 10.41 |
| `--inferred-text` | `#F5B84A` | 10.89 | 9.89 | 8.95 | 10.37 |
| `--info-text` | `#6C9EFF` | 7.33 | 6.66 | 6.02 | 6.99 |

### Light ("paper")

| token | value | on `--bg` | on `--surface` | on `--surface-2` | on `--code-bg` |
| --- | --- | --- | --- | --- | --- |
| `--text` | `#20242E` | 14.51 | 15.52 | 13.53 | 13.53 |
| `--muted` | `#5B6272` | 5.72 | 6.11 | 5.33 | 5.33 |
| `--faint` | `#666C7B` | 4.91 | 5.26 | 4.58 | 4.58 |
| `--brand-text` | `#C43A2B` | 4.93 | 5.27 | 4.59 | 4.59 |
| `--verified-text` | `#177A52` | 4.98 | 5.33 | 4.65 | 4.65 |
| `--inferred-text` | `#8F6310` | 4.96 | 5.30 | 4.62 | 4.62 |
| `--info-text` | `#3766CA` | 5.02 | 5.36 | 4.68 | 4.68 |

The light column has far less headroom than the dark one. Treat 4.5:1 as the
hard floor it is — a further lightening of `--surface-2` or a further dimming of
any text token puts the light theme under AA.

---

## 7. Rules that come with the tokens

1. **No literal colours outside `tokens.css`.** Lint-enforced in the app; adopt
   the same rule on the site so drift is impossible rather than merely
   discouraged.
2. **Semantic names, not colour names.** Use `--verified`, never "the green" —
   the two themes disagree about which green.
3. **Every state is themed.** Badges, banners, snippets, empty states, error
   surfaces, charts. A screen that does not repaint when `data-theme` flips has
   a hardcoded colour in it.
4. **Colour is never the only signal.** `verified` / `inferred` labels stay
   visible as text everywhere; amber means two different things (§4) and the
   difference is carried by shape and label.
5. **Small text uses the `-text` sibling** in light theme (§3.2).
6. **Mono for numbers.** Counts, percentages, SHAs, token costs, timestamps.

## 8. Verification available to copy

| gate | file |
| --- | --- |
| no colour literal outside the tokens file | `tests/design-tokens.test.ts`, `tools/eslint-rules/no-hardcoded-hex.js` |
| every semantic token resolves in both themes | `tests/design-tokens.test.ts` |
| every text token clears AA on every surface | `tests/design-tokens.test.ts` (`token contrast`) |
| axe-core AA audit, 2 screens × 2 themes | `tests/e2e/a11y-contrast.spec.ts` |
| every screen repaints when the theme flips | `tests/e2e/screens-theme.spec.ts` |
| no flash of the wrong theme on load | `tests/e2e/theme.spec.ts` |
