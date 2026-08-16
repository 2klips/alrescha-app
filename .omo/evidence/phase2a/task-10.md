# Phase 2A · Task 10 — Handoff artifacts

Commit: `docs(ui): phase 2a handoff artifacts`
Branch: `phase2a/ui-rebuild`

Four deliverables: the token reference the marketing site needs, refreshed
README screenshots, a CHANGELOG entry, and the evidence index for the phase.

---

## 1. `docs/design-tokens.md` — the marketing-site handoff

The plan asks only for "a reference listing the variables". A bare list would be
a trap here, because the values alone are not enough to restyle `2klips/arr`
correctly — the light palette has a caveat that will silently reintroduce
accessibility failures if it is copied naively. So the document carries the
values **and** the rules that make them work:

| section | content |
| --- | --- |
| 1 | typography — both families, the self-hosting decision, and the measured fallback metric overrides |
| 2 | surfaces and text, both themes |
| 3.1 | the ADR-009-3 identity palette |
| **3.2** | **the AA-safe `-text` siblings and why small text must use them in light theme** |
| 3.3 | contrast pairs for filled controls |
| 4 | graph node colours as aliases, and the amber collision (OQ-004) |
| 5 | composed roles as `color-mix()` formulas, not flattened hex |
| 6 | measured contrast — every text token against every surface, both themes |
| 7 | the six rules that come with the tokens |
| 8 | the verification suites, so the site can copy the gates as well as the values |

§3.2 is the part that matters most for the handoff. `--verified #1E8A5E`,
`--inferred #B07A14`, `--brand #D6402E` and `--info #3B6FDB` measure 3.25–4.68:1
on paper white — below AA for body text. Any place the marketing site sets small
text in those colours inherits the same failure the app just fixed. The document
says so explicitly and points at OQ-009 in case the planning session prefers to
change the ADR values instead, in which case both properties move together.

§6 is computed from the shipped `tokens.css`, not transcribed, and matches the
`token contrast` suite that gates the app.

## 2. README screenshots

The README had **no** screenshot before this task. It now opens with the
dark-theme dashboard and links the light one.

Rather than commit an image nobody can reproduce, the capture is a script:
`scripts/capture-readme-shot.ts`.

```
pnpm --filter @specproof/web build
node --import tsx scripts/capture-readme-shot.ts
```

It starts `next start` on a free port against the **production** build (so the
image shows what a user sees, not a dev overlay), shoots at 1600×900 with
`deviceScaleFactor: 2`, and — importantly — waits for the Pixi `<canvas>` plus a
6s simulation settle before shooting. Without that wait the graph is caught
mid-layout and the picture is a pile of dots at the origin.

Output: `docs/images/dashboard-dark.png` (375KB),
`docs/images/dashboard-light.png` (404KB). Both regenerated at the end of this
wave, so they carry the Wave 4 token corrections and the restored repo line in
the heading.

The README also gained: the product blurb corrected from "SpecProof" to "Arr", a
pointer to `docs/design-tokens.md`, a Phase 2A status line, links to the
CHANGELOG and the evidence index, and the footer changed to "© 2026 Arr".
Deeper naming debt is catalogued in OQ-010 and deliberately not touched here.

## 3. `CHANGELOG.md`

Created (the repo had none). Loosely Keep a Changelog, grouped by delivery phase
since nothing is released yet. The Phase 2A entry covers Added / Changed /
Fixed, then a **Verification** block with the real numbers (416 vitest, 49
Playwright, frame p95 0.385ms, 411.3KB gz, 0 axe violations) and a **Known open
questions** block naming the six OQs still open at the end of the phase.

Two entries under *Fixed* are worth the reviewing session's attention because
they are defects this wave discovered rather than caused: the 4px HUD clearance,
and pre-hydration interactions being silently discarded in the e2e suite.

## 4. `.omo/evidence/phase2a/INDEX.md`

Maps all ten todos to their commit SHA and evidence file, the four final gates
to their F-files, the deliverables that live outside `.omo/`, the exact commands
to reproduce every measurement, and a status table for OQ-002 … OQ-010 as of the
end of the phase.

The OQ table is deliberately blunt about what did **not** get done: OQ-006
(canvas keyboard access — the hit layer was excluded from the axe run and
traversal cost at 600 targets was never measured) and OQ-008 (`/auth/*` and
`/app/*` unreachable, so their contrast is unverified) are marked as open with
the reason, not quietly carried forward.

---

## Acceptance

> "docs build/lint green; README shows current dark-theme dashboard screenshot."

- `pnpm lint` clean at `--max-warnings=0` (the new script is linted like any
  other source file; there is no separate docs build in this repo).
- `pnpm typecheck` green.
- `pnpm test` — 416 passed / 64 files, unchanged by this todo.
- README shows `docs/images/dashboard-dark.png`, captured from the production
  build at the tip of this branch.

## Files

| file | what |
| --- | --- |
| `docs/design-tokens.md` | new — the token reference and its usage rules |
| `docs/images/dashboard-dark.png`, `dashboard-light.png` | new — README screenshots |
| `scripts/capture-readme-shot.ts` | new — regenerates those screenshots |
| `CHANGELOG.md` | new — Phase 2A entry |
| `.omo/evidence/phase2a/INDEX.md` | new — phase evidence index |
| `.omo/evidence/phase2a/final/F1.md` … `F4.md` | new — final verification rulings |
| `README.md` | screenshot, token-doc pointer, status line, Arr naming |
| `spec/BUILD_PLAN_PHASE2A_UI.md` | todo 10 checkbox |
