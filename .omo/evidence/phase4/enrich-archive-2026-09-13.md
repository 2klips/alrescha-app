# The enrich job reads its pending files from the archive too

**Date:** 2026-09-13 · **PR:** <https://github.com/2klips/alrescha-app/pull/14>, commit `ed9115b` · **Trigger:** OQ-067 ⑴, chosen by the user after PR
#12's rollout: the scan and the analysis read their bodies from one archive
per pass since `c38dc08` (`.omo/evidence/phase4/scan-archive-fetch-2026-09-12.md`);
the enrich job still read one `contents` body per pending file. **Boundary:**
production was neither read nor changed; no enrich job was run anywhere —
running one spends credits or a BYOK key, which is not this lane's to
spend. **Branch:** `claude/enrich-archive` on `main@d8e4c1b`. **Scope:**
`apps/worker/src/enrich-job.ts` (+ test), `apps/worker/src/run-local.ts`,
`docs/DEPLOYMENT_RUNBOOK.md` (§6, §10.1 wording), `spec/OPEN_QUESTIONS.md`
(OQ-067 ⑴ closed). No core, web, SQL, dependency or source-class change.

## What the enrich job read, and why it is different from the analysis

`summarizePendingFiles` reads every pending file — every artifact whose
summary cache no longer matches its blob — once, at the commit it was *last
seen* at (`artifacts.last_seen_commit_sha`), then clips it, hands it to the
provider, and drops it. A first enrich after a connect is every artifact,
all at the scan's head (a "370-file batch" in the code's own words); after
incremental pushes it is the changed files, each at the commit that changed
it. So, unlike the analysis, the pending set can span commits, and the
archive is per commit.

The rule this settles on: the job counts the pending files by their
last-seen commit and announces the **largest group** — its commit and its
size — before the first read. The worker fetches that commit's archive when
the group is worth one request (`ARCHIVE_WORTHWHILE_READS`, 32, the same
threshold the analysis uses). Files in the group are served from the
archive; files last seen at another commit are read per file, exactly as
every file was. Nothing guesses that a file's body at one commit equals its
body at another.

## The change

- `enrich-job.ts` — `EnrichSourcePreparer` (`{ commitSha, reads,
  repositoryId, workspaceId } → release`), optional on `EnrichJobInput`
  (the three internal passes now share that one input type);
  `dominantCommit(pending)` picks the largest last-seen group;
  `summarizePendingFiles` calls the preparer once before its loop and
  releases in `finally`, so a read that throws (a dead token, a limit)
  still drops the archive before the retry. A module job (todo 8) reads no
  source and asks for nothing; an empty pending set asks for nothing.
- `run-local.ts` — the analysis's inline preparer becomes
  `archiveSources(sourceFor, kind)`, shared by `analyze` and `enrich`; the
  log line is the same shape: `enrich @<sha> <reads> bodies (archive:
  <files> files, <KiB> KiB)` or `(archive fallback: <reason>)`. The
  `analyze` line is unchanged.
- `GitHubRepositorySource` is untouched: the archive, its caps, the lazy
  inflate, the fallbacks and the rate-limit throw are what PR #12 shipped
  and production verified.

## Red, then green

`apps/worker/src/enrich-job.test.ts` (+3): the preparer is told the
dominant commit and its count (`3 @bbbbbbb` for three files at one commit
and one at another) before the first read, and released after the last,
with the odd file still read at its own commit; a read that throws still
releases and persists nothing; an empty pending set and a module job ask
for nothing. Against `main` the three fail (the option does not exist there).
The worker suite: 17 files, 136 passed. Whole suite: see "Gates".

## Gates (branch tip)

| gate                                                          | result                                     |
| ------------------------------------------------------------- | ------------------------------------------ |
| `pnpm lint`                                                   | clean                                      |
| `pnpm typecheck` (root + every workspace)                     | clean                                      |
| `pnpm test`                                                   | 189 files, 1,741 passed, 1 skipped         |
| Prettier `--check` on every changed file                      | clean                                      |
| `scripts/verify-scope-boundaries.ts`                          | PASS, 12 boundaries, 363 files             |
| `git diff --check`                                            | clean                                      |

## Not measured here, and why

No enrich job ran. An enrich pass calls the AI provider for every pending
file and is paid for by credits or by a BYOK key; running one to watch a
log line would spend the user's money for a number the tests already pin.
The mechanism the enrich job now shares — the archive request, the lazy
inflate, the release — is the one production verified for the analysis on
2026-09-12 (`pr12-production-rollout-2026-09-12.md`: `analyze @c38dc08 316
bodies (archive: 1,221 files, 21,686 KiB)`, counter change 3 over the
whole full-pass window). The enrich line will appear on the next enrich the
user triggers; that is the production observation to record, not one to
manufacture.

## Rollout — for the Codex lane

**What to deploy:** the worker (`fly deploy` from the repository root after
the merge). **No migration, no web change, no environment variable.**
Rollback: the previous image, or `SCAN_ARCHIVE_FETCH=off` — the same
switch turns the enrich archive off with the others.

1. Merge with a merge commit; `fly deploy`; expect v20. The merge push
   queues the usual incremental pair; let it land — its `analyze @… bodies
   (archive: …)` line shows the shared preparer still works.
2. Do **not** trigger an enrich to verify. On the next enrich the user runs
   (settings → AI → enrich pass, or a BYOK workspace's own), the worker log
   shows `enrich @<sha> <N> bodies (archive: …)` when N ≥ 32, and nothing
   new below that. Record that line when it appears.
3. `pnpm ops:health` unchanged: queue 0 once the pair lands, no new
   failure, the historical WARN until its window passes.

## Left open

- OQ-067 ⑵ (the threshold and caps against a larger repository) and ⑶
  (incremental scans with many changed files) — unchanged.
- The analysis and the enrich each fetch their own archive; a pair that
  runs scan → analyze → enrich downloads it up to three times. Holding it
  across jobs is the memory trade OQ-067 already declines at pilot scale.
