# Phase 2A · Task 1 — Design tokens, fonts, and theme infrastructure

**Commit:** `feat(ui): add ink-and-seal tokens, fonts, and theme base`
**Governing spec:** `spec/DECISIONS-ADR.md` ADR-009-3, `spec/BUILD_PLAN_PHASE2A_UI.md` todo 1.

## What landed

| Artifact                     | Path                                                 |
| ---------------------------- | ---------------------------------------------------- |
| Single token source          | `apps/web/app/styles/tokens.css`                     |
| Typed accessor (Pixi + DOM)  | `apps/web/lib/theme/tokens.ts`                       |
| Hardcoded-colour ESLint rule | `tools/eslint-rules/no-hardcoded-hex.js` (+ `.d.ts`) |
| Seeded violation fixture     | `fixtures/design/hardcoded-hex-sample.css`           |
| Gate + token tests (14)      | `tests/design-tokens.test.ts`                        |
| Font wiring                  | `apps/web/app/layout.tsx`                            |

## Palette (ADR-009-3, verbatim)

Dark (`:root`, default): bg `#0B0E14` · surface `#141926` · line `#232B3D` · text `#E8ECF4` ·
muted `#8A94A8` · brand `#FF5A45` · verified `#3DDC97` · inferred `#F5B84A` · info `#6C9EFF`.

Light (`[data-theme="light"]`, "paper"): bg `#FAF7F1` · surface `#FFFFFF` · line `#E3DDD0` ·
text `#20242E` · brand `#D6402E` · verified `#1E8A5E` · inferred `#B07A14` · info `#3B6FDB`.

Node types are aliases, not new colours: `--node-doc: var(--info)`,
`--node-requirement: var(--brand)`, `--node-code: var(--verified)`,
`--node-test: var(--inferred)` — enforced by a test so the renderer and the DOM can
never drift apart.

## Colour sweep

`apps/web/app/globals.css` (3,993 lines) previously held **172 hex literals and 47 `rgb()`
literals**. All are now `var(--token)` or `color-mix(in srgb, var(--token) N%, transparent)`.
Two follow-on corrections were applied by hand after the mechanical pass:

1. The old stylesheet used `--verified` (`#65b8ff`, blue) as the _chrome accent_. The Ink &
   Seal `--verified` is evidence-grade green, so chrome usages were renamed to `--accent`
   (= `var(--info)`) and only genuine evidence-grade surfaces were pointed back at
   `--verified`: `.grade-badge.verified`, `.grade-label.verified`, `.evidence-dot.verified`,
   `.legend-line`, `.graph-edge`, `.node-halo`.
2. The `.graph-grid` dot pattern was an SVG data-URI with an encoded colour (`%23233a4a`);
   it is now a `radial-gradient` on `var(--line-strong)`, so it themes with everything else.

The landing surface (`.arr-home`) kept its scoped `--arr-*` names but the values moved into
`tokens.css`, remapped onto the Ink & Seal light ramp. Its purple "inferred" (`#5f35c9`) and
teal "test" (`#068aa6`) both collapse onto `--arr-amber`, which is the ADR's colour for both
roles — the two stay distinguishable by label and shape.

## Fonts (self-hosted, no CDN)

- **Pretendard Variable** — `pretendard@1.3.9`, Korean _dynamic subset_ CSS (92 `unicode-range`
  slices) so a Korean-first page downloads only the slices it renders.
- **IBM Plex Mono** — `@fontsource/ibm-plex-mono@5.3.0`, latin 400/500/600.
- Removed: `@fontsource-variable/archivo`, `@fontsource-variable/manrope` (no longer referenced;
  ADR-009-3 allows no other families).

### Deviation from the plan's wording

The plan said `next/font/local`. That API takes one file per `src` entry and cannot express
`unicode-range`, so it would force the **2.0 MB** single-file `PretendardVariable.woff2` on
every visitor instead of the Korean subset. We self-host via the package's own stylesheet
(the pattern this repo already used for Fontsource) — same "no CDN, no layout shift" outcome,
far smaller transfer. Recorded as **OQ-002**.

### No-layout-shift evidence

`font-display: swap` on both faces, plus fallback faces whose vertical metrics are overridden
with values **measured from the shipped woff2 binaries**, not estimated. Method: parse the
WOFF2 table directory, `brotliDecompressSync` the font data, read `head.unitsPerEm` and
`hhea.ascender/descender/lineGap`.

| Font                | unitsPerEm | ascender | descender | lineGap | → override                   |
| ------------------- | ---------- | -------- | --------- | ------- | ---------------------------- |
| Pretendard Variable | 2048       | 1950     | −494      | 0       | `95.215%` / `24.121%` / `0%` |
| IBM Plex Mono 400   | 1000       | 1025     | −275      | 0       | `102.5%` / `27.5%` / `0%`    |

`size-adjust` is left at `100%` **deliberately**: the fallback resolves to a different face per
OS (Malgun Gothic / Apple SD Gothic Neo / Noto Sans KR), so a single horizontal adjustment
would be wrong on two of the three. Overriding ascent/descent/line-gap removes the line-box
height change, which is the CLS-dominant term. Stated rather than fabricated, per WORK_SPEC
guardrail 8.

## Acceptance

| Criterion                               | Result                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Lint rule fails on a seeded violation   | `tests/design-tokens.test.ts` — `RuleTester` invalid cases + CSS fixture scan (`#123456`, `#fff` detected) |
| Lint rule passes on the codebase        | `pnpm lint` clean; repo-wide scanner finds 0 literals outside the allowlist                                |
| Both themes define every semantic token | `test.each(THEMES)` walks `DESIGN_TOKENS` (24 tokens)                                                      |
| Fonts load without layout shift         | metric-override + `font-display: swap` assertions above                                                    |

`pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ **258 passed** (244 pre-existing + 14 new) ·
`pnpm --filter @specproof/web build` ✅
