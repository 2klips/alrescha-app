# MT-3 — the first scan fetches blob bodies several at a time

Perf research mid-term wave 1, item 3 of 3. Selection and reasons:
[`midterm-wave-1.md`](./midterm-wave-1.md).

## What changed

`scanRepository` walked the sorted tree once and `await`ed one
`fetchContent` per changed blob inside that loop. On a first scan every file
is changed, so a repository of *n* files cost *n* sequential round trips to
the repository host.

Every decision that does not need the file body — submodule and symlink
skips, path classification, the tree-size skip, and the blob-sha "unchanged"
skip — already happened **before** that fetch. So the set of files that need
fetching is fully decidable without any I/O, and the loop is now three passes:

1. **classify** every entry in path order into a slot: resolved (skipped /
   unchanged / ignored) or pending-fetch;
2. **fetch** the pending bodies through `mapWithConcurrency`, eight at a time
   by default;
3. **process** the slots in path order, running exactly the post-fetch code
   that was there before.

Because pass 3 walks the original order, `artifacts`, `skipped`,
`unchangedPaths` and the `parsedLinks` insertion order come out as they always
did. `mapWithConcurrency` also returns results in input order and, on failure,
throws the **first error in input order** after settling every task — the same
error the sequential loop would have raised, with nothing left in flight.

Width is `fetchConcurrency` on `scanRepository`, clamped to `[1, 32]`, default
8, and the worker reads it from `SCAN_FETCH_CONCURRENCY`.
(`packages/core/src/ingest/repository-scanner.ts`,
`packages/core/src/ingest/concurrency.ts`, `apps/worker/src/repository-scan.ts`,
`apps/worker/src/run-local.ts`)

## Measurement

Script added for this item: `scripts/bench-scan-fetch.ts`.

```
node --import tsx scripts/bench-scan-fetch.ts --files 600 --latency 5
```

Host:

| | |
| --- | --- |
| CPU | AMD Ryzen 7 9800X3D, 8C/16T |
| RAM | 61.6 GB |
| Node | v24.14.0 |
| OS | Windows 11 (10.0.26200) |

### The assumption, stated up front

A first scan is network bound, and measuring the real thing needs GitHub App
credentials and a real repository. So the source here is a fake whose
`fetchContent` sleeps for a **simulated 5 ms** per request. That 5 ms is an
assumption, not a measurement of GitHub. What is measured is this scanner's
behaviour under it: whether the round trips overlap. A real GitHub blob fetch
is slower than 5 ms, which makes the serial cost worse than the table below,
not better.

The bench fingerprints the plan from every run and fails if any two differ, so
no number here can come from a scan that quietly did different work.

### 600 files, simulated 5 ms per request

Three runs after the change; the table quotes the median. "Before" is `HEAD`
(efcb8ad) with only the bench script added — it ignores `fetchConcurrency`
entirely, which is why its row is flat.

| requested concurrency | before | after |
| ---: | ---: | ---: |
| 1 | 9379.9 ms | 9386.2 ms |
| 2 | 9358.8 ms | 4697.7 ms |
| 4 | 9376.3 ms | 2347.4 ms |
| **8 (the shipped default)** | 9387.2 ms | **1170.0 ms** |
| 16 | 9382.0 ms | 606.1 ms |

At the shipped default that is **8.02× less wall time** for the same plan, and
the scaling is close to linear up to 16, as it should be for work that is
pure waiting.

The `concurrency = 1` row is the control: the restructured scanner takes the
same time as the old one when told not to overlap, so the three-pass shape
itself costs nothing.

### CPU-only control, same fixture, 0 ms simulated latency

| requested concurrency | before | after |
| ---: | ---: | ---: |
| 1 | 10.8 ms | 13.0 ms |
| 8 | 9.6 ms | 10.5 ms |
| 16 | 7.5 ms | 8.2 ms |

Within run-to-run noise at this scale — the classification pass, the slot
array and the promise scheduling do not measurably add to a scan whose
fetches are free. Nothing is claimed from these rows beyond "no regression".

## Tests

New file `tests/scan-fetch-concurrency.test.ts`:

- the same repository scanned at concurrency 1, 2, 8 and 32 produces
  **deep-equal plans**;
- with a source that answers later paths sooner, the plan still comes out in
  path order, and the two no-fetch skips land in the right place among the
  fetched entries;
- the fetch really overlaps at 8 and really does not at 1 (peak in-flight
  count from the source);
- a rescan where every blob sha matches issues **zero** fetches;
- when an early path and a late path both fail and the late one rejects first,
  the error that surfaces is the **early** one;
- `mapWithConcurrency` returns input order rather than completion order,
  settles every task before throwing, handles an empty list, and clamps its
  width.

The existing scanner suites (`repository-scanner`, `scanner-extensions`,
`local-ingest`, `code-links`, `assurance-rules`, `workspace-map`) are unchanged
and still pass — they are what pins the plan bytes.

## Guardrails

Bodies stay transient: they are fetched, hashed, parsed and dropped, exactly
as before. Nothing about *where* a body goes changed — only how many are in
the air at once. The "never persist raw source bodies" rule is untouched.

## Assumptions and limits

- The 5 ms per-request latency is simulated and stated with every number. No
  claim is made here about real GitHub wall time.
- Not measured: GitHub's secondary rate limiter. Eight concurrent blob reads
  per scan is modest and the width is clamped at 32, but the first production
  scan of a large repository is where this should be watched. That is what
  `SCAN_FETCH_CONCURRENCY` is for — it can be turned down to 1 without a
  deploy, and the plan is identical at any setting.
- The fixture is synthetic (600 generated files across four classifications),
  not a real repository tree.
