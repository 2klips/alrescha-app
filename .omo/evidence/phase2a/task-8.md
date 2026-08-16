# Phase 2A · Task 8 — Remaining screens restyle

Commit: `feat(ui): restyle all screens to ink-and-seal`
Branch: `phase2a/ui-rebuild`

## What this task actually did

Todo 8 reads as two jobs — tokenize every remaining screen, and finish the
Korean-first copy sweep. Only the second turned out to be work.

### The CSS was already done

`apps/web/app/globals.css` contains **zero** colour literals: no hex, no named
colours, no raw `rgb()`/`hsl()`. Wave 1 (todo 1) tokenized the stylesheet, and
todo 7 removed the last legacy `--arr-*` block along with the dashboard's
`color-scheme: light` pin. Every remaining screen was already reading semantic
tokens through shared classes (`.grade-badge`, `.surface-heading`, `.data-table`,
`.receipt-detail`, …).

So instead of a restyle, this todo turned the "restyled in both themes" claim
into a test — see `tests/e2e/screens-theme.spec.ts` below.

### The copy sweep

`tests/korean-strings.test.ts` carried a `PENDING_SCREENS` backlog of 20 screens
still holding inline English. That list is now **empty**. Every one of those
files — plus `apps/web/app/auth/login/sign-in-button.tsx`, which was in neither
list — moved into `CONVERTED_SCREENS`, where `findStrayLiterals` runs against it
on every test run.

New string modules under `apps/web/lib/strings/`, all exported from `index.ts`
and all policy-checked by the `korean-first copy policy` suite:

| module | export | screens |
| --- | --- | --- |
| `onboarding.ts` | `ONBOARDING` | onboarding flow (4 steps, permission scopes, errors) |
| `graph.ts` | `GRAPH` | evidence detail `/graph` |
| `harness.ts` | `HARNESS` | `/harness`, `/app/harness`, asset card, **and the server action** |
| `library.ts` | `LIBRARY` | library browser (both routes) |
| `settings.ts` | `SETTINGS` | `.ai`, `.mcp`, `.privacy`, `.connect`, `.errors` |
| `stats.ts` | `STATS` | pilot stats page + dashboard |
| `auth.ts` | `AUTH` | login, sign-in button, auth-code-error |
| `common.ts` | `NOT_FOUND` | 404 |

## Decisions

**The two duplicated harness notices now share one key.** "Saved immutable
snapshot." and "Already saved — existing digest reused." existed verbatim in
both `harness-asset-card.tsx` and `app/app/harness/actions.ts`. Translating one
would have silently desynced the demo path from the authenticated path — the
e2e suite only exercises the demo one. Both now read
`HARNESS.notices.saved` / `HARNESS.notices.duplicate`.

**Unit suffixes became functions, not fragments.** `pilot-stats-dashboard.tsx`
composed its numbers as `{n}` + `" receipts"` + `"s"`. Korean does not pluralise
and puts the unit after the number, so those are now interpolating functions on
`STATS` (`receiptCount(n)`, `findings.resolvedOpened(resolved, opened)`,
`context.reduction(percent)`, `scan.average(ms)`, …). Null states
("No trend yet", "No comparison") moved inside the functions rather than
remaining separate literals beside them.

**Identifiers are addresses, not sentences.** `specproof/drifted-demo`,
`fixtures/drifted-demo`, `/api/mcp`, `REQ-AUTH-001` and `BYOK_ENCRYPTION_KEY`
stay verbatim. They joined `TECHNICAL_TOKENS` in the test rather than
`CONVENTIONAL_ENGLISH_TERMS`, because that list is documented as "technical
vocabulary that appears verbatim in product data, not as prose" — which is
exactly what a repository path or an environment variable name is.

**Thrown errors are copy too.** The settings pages throw
`new Error("Personal workspace is unavailable.")` and similar. A user sees those
through the error boundary, so they are translated and live under
`SETTINGS.errors`.

**`packages/core` was left alone.** `pilot-stats-dashboard.tsx` renders
`report.methodology.*` from `@specproof/core/stats`. The plan forbids changes to
`packages/core`, so that text stays English and its assertion is unchanged. It
is the one visible English string left on a converted screen — see the
follow-up note below.

## Test changes

The point of centralizing copy is that assertions stop hardcoding it. Every test
below now imports from `apps/web/lib/strings` instead of repeating a literal, so
the next copy change is one file:

| test | now reads |
| --- | --- |
| `tests/e2e/dashboard.spec.ts` | `ONBOARDING.identity.cta`, `.permission.*`, `.scan.*` |
| `tests/e2e/release-hardening.spec.ts` | `ONBOARDING.identity.demoCta`, `.scan.*` |
| `tests/e2e/live-graph.spec.ts` | `GRAPH.*` |
| `tests/e2e/app-shell.spec.ts` | `NOT_FOUND.*` |
| `tests/e2e/library.spec.ts` | `HARNESS.*`, `LIBRARY.*`, `ACTION.search` |
| `tests/e2e/pilot-flow.spec.ts` | `ONBOARDING.*`, `GRAPH.heading` |
| `apps/web/app/library/library-browser.test.tsx` | `LIBRARY.*`, `HARNESS.*` |
| `apps/web/app/app/settings/**/*.test.tsx` | `SETTINGS.*` |
| `apps/web/lib/stats/pilot-stats.test.tsx` | `STATS.*` |

Negative guards were kept meaningful rather than deleted. The library specs
assert the MVP-excluded features (import into project, PR creation, team
sharing, marketplace) are absent; those regexes now match the English *or*
Korean form, so translating the page cannot quietly disarm the guard. The stats
spec's "Export JSON must not appear before consent" guard now points at
`STATS.toolbar.export`.

### Two changes to the detector itself

1. **False positive on arrow return types.** `findStrayLiterals` matched
   `=> void | Promise<void>` as a JSX text node, because the segment between the
   `>` of the arrow and the `<` of the generic contains no excluded characters.
   Added a `(?<!=)` guard. This narrows the detector to real JSX text; the
   positive control below proves it still fires.

2. **A real positive control.** The "the detector actually fires" test used to
   run against `PENDING_SCREENS` — honest while a backlog existed, a tautology
   once it emptied. It now runs against
   `fixtures/design/stray-literal-sample.tsx`, a file that deliberately inlines
   a heading, an `aria-label` and a `placeholder`, and asserts all three are
   found. A new `no screen is left unconverted` test asserts `PENDING_SCREENS`
   is empty, so re-adding a file to it is a deliberate act.

## `tests/e2e/screens-theme.spec.ts` — the both-themes walk

Ten public routes (dashboard, findings, lint, receipts, progress, harness,
library, evidence detail, onboarding, 404), each loaded in dark and again in
light. Per route and theme it asserts:

- the page paints more than a couple of distinct colours (it rendered at all);
- **no element is left on `rgb(0, 0, 0)`** — `--text` is `#e8ecf4` in dark and
  `#20242e` in light, so an exact black means some element never got a rule;
- the set of painted colours **differs between the two themes** — a screen that
  does not re-theme is a screen with hardcoded colours.

and writes `<screen>-dark.png` / `<screen>-light.png` to
`.omo/evidence/phase2a/task-8/`.

The theme is flipped through the stored preference rather than the header
toggle, because only the dashboard, the assurance screens and progress carry
one.

Two route families are excluded and recorded in **OQ-008**: `/app/*` needs a
live Supabase session, and `/auth/*` answers 500 in this environment (last
touched in `ca3a0d0`, before this phase — the theme boot script never runs, so
there is nothing to walk). Their copy conversion is still enforced file-by-file
by `korean-strings.test.ts`, and their rendering by the colocated vitest
component tests.

## Follow-ups recorded, not fixed

- **OQ-008** — the two excluded route families, and the fact that `/graph`,
  `/harness`, `/library` and `/onboarding` have no header theme toggle (they
  honour the stored choice but cannot change it). Todo 2's acceptance only
  required the toggle on three screens, so adding it elsewhere would be scope.
- Finding titles and recommended actions on `/findings` are still English. They
  come from the seeded fixture data (`lib/assurance/*`), not from a screen —
  the same category as the graph node labels ("Tenant-safe auth"), which todo 3
  also left as data. Worth a product decision, not a copy sweep.
- `report.methodology.*` on `/app/stats` is English because it lives in
  `packages/core`, which this phase must not touch.

## Gates

| Gate | Result |
| --- | --- |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | **404 passed** (63 files) — 382 after todo 7, 369 at the start of Wave 3 |
| `npx playwright test` | 40 passed, 1 failed (see below) |

### The one remaining browser failure

`release-hardening.spec.ts:8` — after the seeded-demo onboarding it expects an
`h1` reading `specproof/drifted-demo` on the dashboard. That is not copy drift
and not a theming regression: `onboarding-flow.tsx` knows which repository was
chosen, but nothing carries that choice into the dashboard, whose `h1` is the
proof-map title and whose repo chip is hardcoded to `2klips/specproof-app`. The
assertion has been failing since `a16acaa`, before this phase.

Making it pass means implementing "carry the selected repository into the
dashboard", which is a feature and out of this phase's scope; making it green by
asserting what the screen actually shows would be weakening a test. It stays red
and is handed to Wave 4.

`live-graph.spec.ts:37` fails intermittently on a cold dev server (its
`[data-canvas-nodes='5']` step on `/graph` outruns the route's first compile
under eight parallel workers) and passes on every warm run. Noted for Wave 4;
nothing in it depends on this todo's changes.

### Two failures this todo removed

Both were reported as "pre-existing, needs Supabase". Neither did.

- `pilot-flow.spec.ts:264` was failing on `/Unresolved/` and
  `"Verify receipt digest"` — copy that todo 3 had already translated without
  updating the spec. It now reads `DASHBOARD.metrics.unresolved` and
  `ASSURANCE.receipts.*` and **passes**, exercising the whole GitHub-first pilot
  journey including the hosted MCP client, credits, consent and receipt
  verification.
- `release-hardening.spec.ts:19` (revoked installation) was fixed in todo 7 by
  migrating its `evidence-graph-canvas` selector.

## Screenshots

`.omo/evidence/phase2a/task-8/` — 20 files, dark and light for each of the ten
public routes, regenerated by `tests/e2e/screens-theme.spec.ts`.
