# A full pass reads the repository as one archive

**Date:** 2026-09-12 · **Trigger:** the first classified GitHub 403s this
installation produced, both `primary-rate-limit; rate limit 0/5000 core` —
one on the local live run of PR #11
(`.omo/evidence/phase4/repository-canonical-name-2026-09-12.md`, "Live
run"), one in production during PR #11's rollout
(`.omo/evidence/phase4/pr11-production-rollout-2026-09-12.md`, deferred
330 s, both jobs landing on attempt 2). **Boundary:** production was neither
read nor changed; no pacer, concurrency dial, failed row, threshold or
migration was touched. **Branch:** `claude/scan-archive-fetch` on
`main@0283dc0`, commit `4831bcd`; **PR:**
<https://github.com/2klips/alrescha-app/pull/12>. **Scope:** `apps/worker/src/github-repository-source.ts`
(+ test), `apps/worker/src/repository-scan.ts` (+ test, new),
`apps/worker/src/analysis-job.ts` (+ test), `apps/worker/src/run-local.ts`,
`apps/worker/src/github-archive-scan.test.ts` (new),
`docs/DEPLOYMENT_RUNBOOK.md` (§6 variable, §10.1 paragraph),
`spec/OPEN_QUESTIONS.md` (OQ-067), `.omo/evidence/phase4/todo-16/` (the live
measurement, re-taken). No core, web, SQL or dependency change: `fflate` was
already the worker's, for Actions artifacts.

## What the budget was spent on

A GitHub installation has 5,000 REST requests an hour, shared by every
process that mints its tokens — the production worker and a local run alike.
Against that:

| pass                        | requests before                                                     | pilot (`2klips/alrescha-app`, 1,217 tracked files) |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| full scan (connect, rescan) | 1 tree + 1 `contents` per scanned file (+ ≤200 barrel reads)        | ~1,200                                             |
| analyze (every pair)        | 1 `contents` per document and per test file (`assuranceSourceRequired`) | ~290                                           |
| incremental scan (push)     | 1 tree + 1 per changed file                                          | a handful                                          |

Three full pairs in one hour — the merge-push pair, the picker backfill and
the LostArk recovery on 2026-09-12 — were the whole budget by themselves,
before the local live run added a fourth. PR #9's deferral made that a wait
rather than a failure; this makes the wait unnecessary at pilot scale.

## The change

**One request for every body.** `GitHubRepositorySource.prefetchArchive(sha)`
fetches `GET /repos/{owner}/{repo}/zipball/{sha}` — one request against the
budget; the download it redirects to on `codeload` is not counted — keeps
the archive *compressed* in memory, indexes its entries by repository path
(dropping GitHub's `<owner>-<repo>-<sha>/` root, directories, and entries
over the scanner's own 1 MiB file cap), and answers `fetchContent` for that
commit by inflating the one entry asked for. `release()` drops it. A path
the archive lacks, or another commit, is read per file exactly as before, so
a 404 still reads as a 404.

**Who asks for it.** `runRepositoryScan` asks before a *full* pass (a
connect, a rescan, a resolver upgrade) and releases in `finally`; an
incremental pass reads what a push changed per file. The analysis job gains
an optional `prepareSources({ reads, … })` told how many bodies it is about
to read, and the worker asks for the archive when that is at least
`ARCHIVE_WORTHWHILE_READS` (32); the reads are released in `finally` too.
The CLI's local source has no archive and is untouched.

**When it steps aside.** Every fallback is a reason in the worker's log line
and per-file reads, never a failed job: `SCAN_ARCHIVE_FETCH=off`, an archive
over 64 MiB compressed (`readBounded` stops at the cap), bytes that are not a
zip, a 404 or a 5xx on the archive request. A *rate limit* on the archive
request is thrown instead — the per-file reads would meet the same limit,
and PR #9's deferral is the right answer.

**Memory.** The first cut inflated every entry up front; the pilot's archive
is 21.5 MiB compressed and would be several times that inflated, on a
512 MiB machine running up to four passes side by side. The shipped cut
keeps only the compressed bytes and inflates one entry per read (a central-
directory walk per read, microseconds for a thousand entries).

**Transience.** The bodies live in process memory between prefetch and
release and are written nowhere — the same promise the per-file reads make
(WORK_SPEC §3-3). The guardrail scanners pass unchanged.

## Red, then green

`apps/worker/src/github-repository-source.test.ts` (+10),
`apps/worker/src/repository-scan.test.ts` (7, new),
`apps/worker/src/analysis-job.test.ts` (+2),
`apps/worker/src/github-archive-scan.test.ts` (1, new) — 20 cases; every one
fails against `main` (the methods and the dependency do not exist there).
What they pin:

- one request fetches every body and later reads make none; a missing path
  and another commit go per file; release returns reads to per file; an
  entry over the cap is left to a per-file read; over the byte cap, not a
  zip, or 404 → a reason and per-file reads, nothing thrown; a primary
  limit on the archive request is thrown with its kind; switched off, no
  request;
- a full pass prefetches before the first body and releases after the plan
  is stored, on failure too; an incremental pass never asks; a resolver
  upgrade counts as full; the fallback is reported beside the rows; a source
  without the method scans as before;
- the analysis announces its read count before the first read and releases
  after the last, on failure too;
- **the drifted-demo fixture scanned through the archive produces the plan
  the per-file reads produce, to the byte, in 2 requests instead of 1 + N.**

`tests/github-read-throttle.test.ts` (PR #9's queue/source/store path) and
`tests/repository-scanner.test.ts` pass unchanged: their scripted GitHub
answers the archive request 404 and the pass falls back to per-file reads.

## Live run — the measurement

`tests/e2e/connect-backfill-live.spec.ts` against the real GitHub App on the
pilot, local docker Supabase, the local worker (`run-local.ts --once`,
concurrency 1), twice: once on the first cut (every entry inflated up
front), once on the shipped cut (compressed, inflated per read). The
worker's own summary lines, as the spec records them:

```text
# run 1 — first cut; two full pairs in one worker run
scan @80a99cb full (archive: 1,208 files, 21,558 KiB) → 62 rows
analyze @80a99cb 289 bodies (archive: 1,208 files, 21,558 KiB)
scan @0283dc0 full (archive: 1,216 files, 21,588 KiB) → 19 rows
analyze @0283dc0 291 bodies (archive: 1,216 files, 21,588 KiB)

# run 2 — shipped cut; one full rescan pair (t2fv-live.json as committed)
scan @0283dc0 full (archive: 1,216 files, 21,588 KiB) → 1 rows
analyze @0283dc0 291 bodies (archive: 1,216 files, 21,588 KiB)
```

Run 1 landed two full pairs — the pair PR #9 had deferred at `80a99cb` and
the connect's new pair at the merge head `0283dc0` — in one worker run; run
2, on a workspace already at that head, measured the full rescan the spec
falls back to:

| measurement (from the queue call)            | before: todo-16 live run, per-file reads (`1eb4de7`) | run 1 (two pairs) | run 2 (one pair, shipped) |
| -------------------------------------------- | ---------------------------------------------------- | ----------------- | ------------------------- |
| structure ready at the head                  | 151 s                                                | 29 s              | 12.3 s                    |
| map visible                                  | 157.5 s                                              | 35.9 s            | 18.8 s                    |
| worker idle (scan + analyze)                 | 157.6 s                                              | 36 s              | 18.9 s                    |
| GitHub requests per pair against the budget  | ~1,200 (scan) + ~290 (analyze), from the file counts | 2 + 1 (+ CI)      | 2 + 1 (+ CI)              |

The "before" column is a different commit and included the CI-evidence
reads too; it is the last measurement the same spec took, not a controlled
A/B. The request column is derived from the code paths and the file counts
above, not from GitHub's counters. Production's own timings under per-file
reads the same afternoon: scan 52 s, analyze 3 min 0 s
(`pr11-production-rollout-2026-09-12.md`, attempt 2 after the deferral).

The spec's rename assertions from PR #11 passed again on both runs (the
inventory seeded under a stale label converged on the canonical name). The
`todo-16/` measurement and screenshots were re-taken by run 2 and are
committed with the code they measure.

## Gates (branch tip)

| gate                                                          | result                                     |
| ------------------------------------------------------------- | ------------------------------------------ |
| `pnpm lint`                                                   | clean                                      |
| `pnpm typecheck` (root + every workspace)                     | clean                                      |
| `pnpm test`                                                   | 189 files, 1,738 passed, 1 skipped         |
| Prettier `--check` on every changed file                      | clean                                      |
| `scripts/verify-scope-boundaries.ts`                          | PASS, 12 boundaries, 363 files             |
| `git diff --check`                                            | clean                                      |

## Rollout — for the Codex lane

**What to deploy:** the worker (`fly deploy` from the repository root, after
the merge). **No migration, no web change, no environment variable** — the
archive is on by default; `SCAN_ARCHIVE_FETCH=off` (a Fly secret, so a
restart) is the rollback switch short of redeploying the previous image.

1. Merge the PR with a merge commit. The merge push queues an incremental
   pair for `2klips/alrescha-app` on v18 (per-file reads, a handful of
   requests); let it be.
2. `fly deploy`. Expect v19 with a new image; `fly status` shows the
   machine on it; no HTTP port, as ever.
3. **Corrected after the rollout (Codex, 2026-09-13 KST):** the home's
   `다시 스캔` sends no `mode`, and `enqueue_repository_rescan` then picks
   *incremental* when the stored resolver generation is current — so one
   click exercises the analysis archive (`analyze @sha N bodies (archive:
   …)`) but not the full-scan archive. A full pass in production comes from
   an existing full-backfill path: re-selecting the repository once in the
   picker (`mode=full`, 0 credits). Codex verified both paths separately
   (`pr12-production-rollout-2026-09-12.md`); the home button is not to be
   changed to full on the strength of this correction (OQ-068). For the
   full pass, in `fly logs -a arr-worker` expect, filtered to these lines:

   ```text
   scan @<sha> full (archive: ~1,2xx files, ~21,6xx KiB) → N rows
   analyze @<sha> ~29x bodies (archive: ~1,2xx files, ~21,6xx KiB)
   ```

   and the pair `succeeded` on attempt 1. Both SHA columns of the repository
   equal the head afterwards. If a line says `(archive fallback: …)`, the
   pass still lands per file; record the reason.
4. Budget check, read-only, from inside the worker (the installation token
   path is the worker's; the numbers are counters, nothing sensitive): before
   and after step 3, `GET /rate_limit` with an installation token, or simply
   note that no `403 primary-rate-limit` line appears in the window. The
   expectation is that a full pair no longer moves `x-ratelimit-remaining`
   by more than a few units.
5. `pnpm ops:health`: unchanged — the 14 historical permanent failures until
   the window passes, queue 0 once the pair lands, no new failure.

Memory: `fly status` / the machine's metrics after step 3 should show no
climb that outlasts the pass; the archive is 21.5 MiB compressed per pass
and is dropped with it.

## Not done here, and why

- **Enrich** (BYOK/credits) still reads per file; it is opt-in and paced by
  credits, and its read counts were not measured here (OQ-067 ⑴).
- **Analyze re-downloads the archive** the scan just released — 1 request
  and ~21 MiB per pair. Keeping it across the pair would save one request at
  the cost of holding the archive between jobs; not worth the memory at
  pilot scale (OQ-067).
- **Incremental scans with many changed files** stay per file (OQ-067 ⑶).
- The threshold (32) and caps (64 MiB compressed, 1 MiB per entry) are set
  from the pilot; a second, larger repository should re-check them.
