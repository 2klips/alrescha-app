# Phase 4 — the suite states its time bound

**Date:** 2026-09-18 · **Scope:** `vitest.config.ts`,
`tests/test-bounds.test.ts` (new). No application code, no assertion, no
migration. Asked for by the user after Codex's 2026-09-18 report as "one
small PR".

## What kept happening

Twice in a week a real-migration PGlite test crossed vitest's 5s default on
a GitHub-hosted runner and passed on re-run:

| Date       | Test                                                                                   | Runner  | Re-run | Local |
| ---------- | -------------------------------------------------------------------------------------- | ------- | ------ | ----- |
| 2026-09-15 | `tests/scanner-extensions.test.ts` (rationale node + handoff todos)                    | 5.09s   | passed | ~1s   |
| 2026-09-18 | `tests/alrescha-repository-identity.test.ts` (address change without an id change)     | 5.04s   | 4.31s  | 1.09s |

Both build their database inside the test function
(`createTestDatabase([...])`), so the migration cost counts against the
test's own bound rather than a hook's. The first was given a stated bound of
its own; the second showed that doing so one test at a time only moves the
next failure.

Each occurrence costs more than a re-run. The evidence rule of 2026-09-14
grades a file `verified` only when its report passed as a whole, so the
failed attempt's artifact took every one of the pilot's 203 verified files
to `unknown` until the re-run's artifact replaced it — Codex observed
`supporting 0` and then 203 on 2026-09-18. A flaky bound on `main` flips the
map.

## What the runner actually costs

From the passing `vitest-junit` artifact of main CI run 35341039386
(`683a0d6`, attempt 2), read with a small script in the session scratchpad:

| Measure                                         | Value          |
| ----------------------------------------------- | -------------- |
| Files · cases                                   | 203 · 1,879    |
| Sum of file times (hooks included)              | 1,303s         |
| Cases at or above 3s                            | 260            |
| Cases at or above 4s                            | 132            |
| Slowest case with a bound of its own            | 63.85s (`graph-density`) |
| Slowest file                                    | 84.6s (`graph-density`, 6 cases) |

A migrated database alone is 4–5s on the runner against ~1s locally. The
default was not a margin; it was the median-plus-noise of the class.

## The change

`vitest.config.ts` states `testTimeout` and `hookTimeout` at **60,000ms** —
the value the suite's own stated bounds most often use (35 occurrences of
`60_000` across the tests). A test that states a larger bound of its own
(`databrain-benchmark`: 120s) keeps it. Nothing else in the config moved.

Why one bound in the config and not in the database helper: the helper
(`tests/helpers/database.ts`) is also imported by a Playwright spec
(`tests/e2e/pilot-flow.spec.ts`), and vitest's `vi.setConfig` only exists
inside a vitest worker. The config is the one place that reaches every file
and nothing else.

Why this is a bound and not a weakened test: none of the repository's speed
claims live in a timeout. The claims are explicit elapsed-based assertions
inside the tests that make them (`directory-nodes` "stays cheap past the
join cliff", `github-read-throttle`'s deferral margin, the density gate) and
they are untouched. A timeout exists to fail a hung test; a test that runs
for a minute is hung on any machine this suite runs on.

`tests/test-bounds.test.ts` pins two things: the config states both bounds,
and a test that states nothing of its own actually runs under it
(`task.timeout` is what the runner resolved at collection —
`options.timeout ?? runner.config.testTimeout`). Removing the lines from the
config fails the pin; so does a return to the defaults by any other route.

## Verification

- `pnpm lint` clean · root `tsc --noEmit` clean · `verify-scope-boundaries`
  PASS (12 boundaries, 382 files) · `git diff --check` clean · prettier
  clean on both files.
- `tests/test-bounds.test.ts` + the two tests that timed out on CI: 3 files
  / 38 passed locally.
- Full suite under the stated bound: 204 files / 1,880 passed / 1 skipped,
  119s on this machine (the new file is the +1; its two cases the +2).
- On `main` after the merge (`e470abd`, 2026-09-21, Codex): CI run
  35603279080 succeeded at attempt 1 with no re-run — 204 files, 1,881
  cases, test step 389s. The pilot re-analysed the head at 0 credits and
  the worker logged `ci evidence 204 row(s), 204 supporting, 0 removed`:
  the new pin file is the 204th verified file.

## Not done, on purpose

- The three per-test bounds stated last week (`scanner-extensions`,
  `markdown-parser`, the throttle margin) stay as they are; they equal or
  explain the global value and removing them is churn.
- The rule question this exposed — whether a passing file inside a failed
  run should keep `verified` — is a product decision next to OQ-072 and is
  not opened here; the user has not asked for it.
- No investigation of *why* the runner is 4–5× slower than this machine.
  The bound is stated against what was measured, not against a theory.
