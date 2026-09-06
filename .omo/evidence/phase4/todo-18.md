# Phase 4 · Wave C · todo 18 — the verified grade, reached for the first time

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/evidence/coverage-reports.ts` (new),
`packages/core/src/evidence/probes.ts` (deleted), `packages/core/src/index.ts`,
`apps/worker/src/ci-evidence.ts` (new),
`apps/worker/src/{analysis-job,postgres-analysis-store,github-ci-evidence-source,run-local}.ts`,
`tests/ci-evidence-persistence.test.ts` (new),
`tests/coverage-reports.test.ts` (new), `tests/ci-evidence.test.ts`,
`apps/worker/src/analysis-job.test.ts`,
`tests/evidence-probes.test.ts` (deleted).

## A reader with no writer

`workspace-map.ts` has graded nodes since Phase 3 on a rule it stated
carefully: `verified` only where execution evidence points — a `test` or `ci`
evidence row with a `supports` verdict, or a node an edge out of one reaches.
`ingestCiTestReports` has parsed GitHub Actions reports since Phase 2C, and
`GitHubCiEvidenceSource` has fetched them.

**Nothing ever wrote an `evidence` row.** The only `insert into
public.evidence` in the repository was in a test. Every node on every live
map was `inferred` or `broken`, the receipt's `evidence.verified` counted
findings rather than evidence, and the product's central claim had no path to
being true. This is the join.

## Which claims carry the grade

Two, and they are the two the report states directly:

- **the test file ran and passed** at the analysed commit — a `tests` edge
  out of the evidence node onto the file;
- **the requirement its test name names** is supported — a `supports` edge
  onto the requirement node this same analysis wrote.

The code *under* the test is deliberately not promoted. The scan's file→file
`tests` edges are import-derived: they say a test file imports a source file,
not that the run executed it. Promoting through them would be inference
wearing an execution grade, which is the one thing ADR-001 forbids — and it
is asserted as an edge that is **not** written, on a fixture where the import
edge exists.

A report that did not verify still writes its row, with an `unknown` verdict
and sub-1 confidence. The row records what was found; the map promotes
nothing from it.

## Coverage says "measured", not "supported"

`ingestCoverageReports` reads LCOV `SF:` records and Istanbul's file keys and
keeps **only the file names**. The percentages are dropped at the parser, not
at the screen.

The reason is what a number would do to the repositories that have no CI,
which is most of them at the point they connect: a missing report is not zero
coverage, but a `0%` is read as one. "Not measured" and "measured at zero"
are different facts, and only one is true of a repository that never ran a
coverage job. The measured set is what lets todo 21's risk map grey a file
out — evidence absent — instead of reddening it.

Coverage rows are `ci`/`unknown` with **no edge**: nothing is graded by them.

## Two bugs found on the way

- **`coverage-final.json` was being read as a Vitest report.** The archive
  classifier took every `.json` as a test report, and a coverage file handed
  to `ingestCiTestReports` produces a parse diagnostic — which makes that
  function discard *the whole run's evidence*, including the reports that
  parsed. A repository uploading coverage alongside its test results would
  have lost its `verified` grade to a file that was never a test report.
  Coverage is now classified first, and a test pins the split.
- **CI report paths are not repository paths.** A report writes
  `/home/runner/work/app/app/tests/auth.test.ts`. `resolveReportedPath` takes
  the longest trailing run of segments that is a scanned path — no
  configuration, and an unmatched path resolves to `null` rather than to
  something that looks close. A report naming a file this repository does not
  have produces no row, never a dangling one.

## Failure is a repository fact, not a job failure

No collector wired, no installation (a local-ingest repository — todo 17), no
Actions, a throttled API, an unparseable report: every one of them ends the
same way, with no evidence and a completed analysis. Failing the job over any
of them would replace a missing grade with a missing analysis. The one token
the source factory already mints now serves both readers, so this costs no
extra installation call.

## Reconciliation is wholesale

An evidence row is a claim about one commit. Merging would leave the map
showing a `verified` file whose test was deleted two commits ago — the exact
failure the grade exists to prevent. The sweep names only rows this writer
produced (`metadata->>'source' = 'ci'`), so other evidence kinds are
untouched, and deleting the graph node is what removes the row and its edges
(both cascade).

## Dead code removed

`packages/core/src/evidence/probes.ts` had no caller but its own test and the
core barrel — 119 lines of a glob/path/symbol matcher nothing used. It is
gone, with `picomatch` still used by `repository-config.ts`. Its one
load-bearing assertion — that the evidence layer has no repository-code
execution path — **moved rather than died**: `tests/coverage-reports.test.ts`
now makes it over `ci-reports.ts` and `coverage-reports.ts`.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces),
`node --import tsx scripts/verify-scope-boundaries.ts`, `npx vitest run` —
numbers in the session report.

`tests/ci-evidence-persistence.test.ts` (5 cases) against real PostgreSQL,
through the real parser, the real `PostgresAnalysisStore` and the real
migrations, read back the way the map loader reads: nothing verified before
any evidence; the test file and the requirement verified after; the code
under the test still `inferred`; the row and both edges exactly as the map
reads them; the same commit twice converging on one row; and the previous
commit's evidence removed — node, row and edges — when the next analysis
finds none.

`apps/worker/src/analysis-job.test.ts` gained 8 cases for the wiring, and
`tests/coverage-reports.test.ts` (8) and `tests/ci-evidence.test.ts` (+2)
cover the parsers and the archive split.

## Not verified here

- **No live-fire run.** The plan asks for one pilot repository with Actions,
  and Wave C is gated on G2. Everything above runs against the *recorded*
  Actions fixture — real report bytes, replayed. A live installation has not
  produced a single evidence row.
- **The receipt does not report CI evidence.** Its predicate is a
  `strictObject` whose shape is the production predicate URI's contract, and
  `evidence.{inferred,verified}` still counts findings. Adding a field would
  change every receipt digest, which is a decision of its own and not one
  this todo was asked to make. The delta is logged instead.
- **Only requirement-tagged tests produce evidence.** `ingestCiTestReports`
  finds `REQ-…` codes in test names; a repository whose tests do not name
  requirements gets a parsed report and no rows. That is the existing
  contract, not something this todo narrowed — but it means the grade is
  reachable only for repositories that already write requirement ids into
  test names, which is a real adoption limit and belongs in the onboarding
  copy nobody has written yet.
- **Coverage rows have no reader yet.** They are written and nothing displays
  them; todo 21's risk map is the named consumer. They promote nothing in the
  meantime.
- **No e2e.** Docker is unavailable, so every Playwright spec Waves A/A′/C
  touched still owes a run — including a map snapshot showing a `verified`
  node, which is now producible for the first time.
