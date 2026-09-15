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

> **정정(2026-09-07):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제 상태는 [e2e-debt.md](e2e-debt.md)에 있다.

---

## 2026-09-12 — the map snapshot exists; the live-fire is still owed

### The snapshot (`tests/e2e/map-verified.spec.ts`)

The spec the 2026-09-07 note said nobody had written. It seeds a workspace
through `apply_repository_scan` (the drifted-demo fixture, 15 files), then
writes the recorded Actions run through the **production writer** —
`PostgresAnalysisStore.reconcileCiEvidence`, the call the analyze job makes,
over a direct connection to the local Supabase — and reads the real stage.

Asserted, in order:

- **before any evidence, zero `verified` hit targets** on the painted map,
  and the fixture's test file is `inferred` — the scan's import-derived
  `tests` edges promote nothing (ADR-001), live rather than in a model test;
- after the write (`written 1, supporting 1, removed 0`), **exactly two
  nodes are `verified`**: the evidence node itself and the test file its
  `tests` edge reaches — asserted as the set of node ids, not a count, so a
  third promotion has to name itself; the code the test imports stays
  `inferred`; the inspector's badge says `verified`;
- both themes, 1440×900: `todo-18/map-verified-dark.png`,
  `todo-18/map-verified-light.png` (the selected node is the test file, the
  inspector lists the evidence node beside it).

One thing the first run taught: the evidence node is a node on the map — it
carries the grade too, and the spec's first draft expected one verified hit
and found two. The assertion now names both, which is the right shape.

### The pilot live-fire (G2) — skipped, with the exact reason

Checked again today with the App's own view of the two installed
repositories:

| repository | workflows | runs | artifacts on the newest run |
| --- | --- | --- | --- |
| `2klips/alrescha-app` | 0 | 0 | — |
| `2klips/LostArk_Scheduler` | 1 (`CI`) | 248, newest 2026-08-23 | 0 |

Unchanged since 2026-09-06. The collector reads junit/lcov/istanbul reports
from a run's **artifacts**, so neither repository can produce an evidence row
however many times it is analysed — and the 2026-09-12 live run of todo 16
confirms it from the other side: the analyze job ran on `2klips/alrescha-app`
at `1eb4de7` and wrote 0 evidence rows, correctly.

Two things close the gate, and both are outside this repository's tree:

1. a CI step on a pilot repository that uploads its test report
   (`actions/upload-artifact` with the JUnit or Vitest JSON output);
2. test names that carry the requirement code (`REQ-…`) — the only signal
   `ingestCiTestReports` reads. This repository's own suite has none
   (OQ-064: 0 of 99 statements carry a code), so adding CI here alone would
   still yield 0 rows. `LostArk_Scheduler` is the better candidate; whether
   its tests name requirements is unknown.

The checkbox stays open on that item alone. Everything else the acceptance
lists is met: the database-level path (2026-09-06), the map snapshot (today),
and the standing assertion that nothing is `verified` without execution
evidence — now held on the live canvas as well as in the model.

---

## 2026-09-14 — the file is the evidence; the repository has a CI to be read

**Scope:** `packages/core/src/evidence/ci-reports.ts`,
`packages/core/src/index.ts`, `apps/worker/src/ci-evidence.ts`,
`apps/worker/src/analysis-job.ts`, `.github/workflows/ci.yml` (new),
`.gitignore`, `tests/ci-evidence.test.ts`, `tests/ci-workflow.test.ts` (new),
`tests/ci-evidence-persistence.test.ts`, `apps/worker/src/analysis-job.test.ts`,
`tests/e2e/map-verified.spec.ts`. No migration.

### What was actually blocking the live-fire

The 2026-09-12 note listed two conditions outside this tree: a pilot CI
step that uploads a report, and `REQ-` codes in test names. Reading the
parser again, the second was not a property of the pilot repositories but
of the code: `ingestCiTestReports` keyed everything by the requirement code
it found in a test name, so a file with no code in any name produced no
`CiRequirementEvidence`, no row, no `tests` edge — however many times CI
ran it. The first claim the 2026-09-06 note named ("the test file ran and
passed") was only ever recorded as a by-product of the second.

A third thing was checked and is not a blocker: the push webhook's analyze
runs before CI has uploaded anything and sees zero artifacts, but the
`workflow_run` completed webhook (`normalizeGitHubWebhook`,
`ingest_github_webhook_event`) enqueues another analyze for the same head
sha, and by then the artifacts exist. The App's pinned permissions already
include `actions: read`, `checks: read` and the `workflow_run` event.

### The unit of evidence is a test file (OQ-072)

`ingestCiTestReports` now returns `testFiles`: one entry per file the run
executed, as the report named it, with the requirement codes its names
carry as a **property** (`requirementIds`) rather than as the key. A file
is `verified` when every report that names it matched the analysed commit,
passed as a whole, sat under a successful check run, and every one of its
cases passed. `ciEvidenceRecords` writes one `test` row per resolved
repository path per commit (id `ci-test|sha|path`), the `tests` edge onto
the file, and a `supports` edge per code onto the requirement nodes this
analysis wrote — exactly the two claims, now independent.

Two reports that spell the same file two ways (JUnit's repository path,
Vitest JSON's runner path) resolve to one row with both artifacts as
sources, verified only if both agree.

For the recorded fixture (one requirement, one file) the row and edge
counts are unchanged, so every existing assertion — persistence, the
analyze job, the map snapshot — still holds as written. The same run with
`REQ-AUTH-002` stripped from every name now yields one row with a `tests`
edge only: the test file `verified`, the requirement `inferred`, the code
under the test `inferred` (`tests/ci-evidence-persistence.test.ts`,
`apps/worker/src/analysis-job.test.ts`).

**A skipped case is not a failure.** The JUnit parser counted `<skipped/>`
as a non-pass at the report level, which made a single `it.skip` anywhere
un-verify every file in the run — this repository's suite has exactly one.
A skip now leaves its own file `unknown` with the reason "Mapped test case
was skipped." and touches no other file. Vitest and Jest's four spellings
of "did not run" (`skipped`, `pending`, `todo`, `disabled`) are read the
same way. This is more conservative than passing a skipped case (a case
that did not run is not execution evidence) and less blunt than failing the
run over it.

The row's metadata carries `requirementCodes` (plural) and the union of
test names; the id derivation changed, and the wholesale reconcile removes
the previous shape's rows on the next analysis, so no migration.

### The repository's own CI

`.github/workflows/ci.yml` — the checklist's automated gate minus `build`
and `e2e` (OQ-026 ⑴, the split that note already called realistic):
frozen-lockfile install, lint, typecheck, the unit suite with Vitest's JUnit
reporter, and `actions/upload-artifact` of `reports/vitest-junit.xml` as
`vitest-junit`, `if: always()` — a failing run's report is evidence of what
did not pass, and the check run's conclusion is what withholds the grade.
`permissions: contents: read`; no secrets.

Vitest's JUnit `classname` is the repository-relative path, so
`resolveReportedPath` matches it without a runner prefix.
`tests/ci-evidence.test.ts` builds that exact archive shape, collects it
through `GitHubCiEvidenceSource` with a stubbed fetch, and grades the file
`verified` with `requirementIds: []`; `tests/ci-workflow.test.ts` pins the
workflow's report path, reporter flags, `if: always()`, the frozen
lockfile, the read-only permission, and the ignore rule.

Branch protection (a required check on `main`) is a GitHub setting and
stays a user decision; without it the gate reports but does not block.

### Verification

`pnpm lint` clean · `pnpm typecheck` clean (root + 6) ·
`verify-scope-boundaries.ts` PASS · `git diff --check` clean · `pnpm test`
203 files / 1,874 passed / 1 skipped. `tests/ci-evidence.test.ts` (9: the recorded
run as one file with two sources, a file with no code, a skip confined to
its file, stale commit, malformed report, the REST source, the coverage
split, a plain archive, this repository's own artifact),
`tests/ci-evidence-persistence.test.ts` (6, PGlite),
`apps/worker/src/analysis-job.test.ts` (+1), `tests/ci-workflow.test.ts`
(5). `tests/e2e/map-verified.spec.ts` 1/1 live: still exactly two
`verified` nodes (the evidence node and the test file), the code under the
test `inferred`.

### The workflow's first runs (2026-09-15)

The first run on the branch head (`32186c3`) failed two tests that pass
locally — a deferral margin that assumed under five seconds of real elapsed
time (the runner took nine) and a large-document parser check against the
5s default timeout — and still uploaded the artifact, which is the
`if: always()` behaving. Both assertions now bound by measured time
rather than a local machine's speed; the claims are unchanged. The rerun
(run `34967653890`, `855aac7`) passed: `gate` check run
completed/success, `vitest-junit` 73,719 bytes, 1,875 cases in 946s.

That artifact, downloaded and fed to the new parser with the run's check:
0 diagnostics, **203 files, 203 verified, 0 unknown**, every path
repository-relative and self-resolving. The one locally skipped case is
`skipIf(win32)` and runs on Linux, so the live-fire's expected log line at
that head is `ci evidence 203 row(s), 203 supporting`.

### Still owed: the pilot live-fire, now a procedure

Production's worker runs the previous rule, so until it is redeployed this
repository's artifact correctly yields zero rows. After the redeploy: one
`다시 스캔` (or `request_rescan`) at the head CI has already run for →
analyze collects `vitest-junit` for that sha → the worker log's
`ci evidence N row(s), M supporting` line → `/app/map` shows the test files
`verified` and every source file `inferred`. The checkbox closes on that
log line and a map screenshot, both recorded by whoever runs it
(`docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-14-ci-evidence.md`).
