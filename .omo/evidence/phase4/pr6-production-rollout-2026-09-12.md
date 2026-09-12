# PR #6 production rollout — rolling failure window and null-SHA scan refusal

Date: 2026-09-12 UTC
PR: <https://github.com/2klips/alrescha-app/pull/6>
Merge commit: `c846a7d3de6de98d5245b8c3a320b309ee380d9b`

## Pre-merge production confirmation

The read-only queries from
`.omo/evidence/phase4/null-sha-scan-requests-2026-09-12.md` were executed
inside the Fly worker using its existing `DATABASE_URL`. No connection value,
payload, token, delivery ID, job ID, or receipt ID was printed or copied.

- Null-SHA webhook deliveries: 6; first `2026-09-09T15:08:35.923Z`, last
  `2026-09-12T04:08:17.773Z`.
- Jobs at the null SHA: 12 over the same interval; 6 permanently failed scans
  and 6 succeeded analyzes.
- Receipts at the null SHA: 6; first `2026-09-09T15:10:00.085Z`, last
  `2026-09-12T04:11:00.829Z`.

This confirms the mechanism described in the design evidence: deleted-ref
pushes created scan/analyze pairs, and each analyze issued a receipt at a
commit that does not exist.

## Merge and web deployment

- PR #6 was `MERGEABLE` with a successful Vercel preview and was merged at
  `2026-09-12T10:23:16Z`.
- Vercel production status for `c846a7d` became `success` at
  `2026-09-12T10:23:42Z`.
- Smoke: `https://arr-app-web.vercel.app/` returned 200;
  `/api/mcp` GET returned 405, the expected result for the POST-only endpoint.

## Database migration and remediation

- Pre-deploy production ledger ended at
  `202609110015_containment_join_shape.sql`.
- The checksum-ledger migration runner applied exactly
  `202609120001_null_sha_scan_guard.sql` at
  `2026-09-12T10:24:05.052Z`.
- Postcondition: both `public.ingest_github_webhook_event` and
  `public.enqueue_backfill_scan` have the null-SHA guard in their installed
  function bodies.
- Because the preflight found receipts, all 6 null-SHA receipts were updated to
  `status = 'invalidated'`; remaining non-invalidated null-SHA receipts: 0.
- The optional withdrawal of the 6 failed scan rows was not run. The rows remain
  as incident history and will age out of the seven-day health window without
  changing `permanentFailureWarn = 5`.
- No rows were deleted and no applied migration file was changed.

## Worker deployment

- Deployed `main@c846a7d` from the repository root using
  `flyctl deploy --remote-only`.
- Fly release: v16, created `2026-09-12T10:24:49Z`.
- Image: `arr-worker:deployment-01M2AJB8XZQH13QKQWZ2XA483W`.
- Active NRT machine reached `started`; standby reached `stopped`; the active
  process logged `worker local-635 draining 1 workspace(s) across 4 loop(s)`.
- Previous rollback image: v15,
  `arr-worker:deployment-01M2AC51SPG2H92ZPGJ08GZGHT`.
- Permanent failures created after this rollout: 0.

## Production `ops:health`

Executed the PR #6 version of `scripts/ops-health.ts` inside the Fly worker
with the worker's production `DATABASE_URL` after the merge scan/analyze queue
drained:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 85 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 6 job(s) failed permanently in the last 7 days (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.1h old (warn above 24h).
status: warn
```

The result matches the hand-off inference: the 2026-09-02 coaching failure is
outside the new window, while the six null-SHA scan failures are still inside
it. With no withdrawal, the check should recover as those rows age out, around
2026-09-16 through 2026-09-19. This is an expected window calculation, not a
new measurement.

## Local release gates

Run on `main@c846a7d` after the merge:

- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed across the root and all workspace projects.
- `pnpm test`: 181 files passed; 1,642 tests passed, 1 pre-existing platform
  test skipped.

## Known unchanged gap

`reject_job` can terminate a job at `attempt_count = 1/3`, so that row does not
meet the current `attempt_count >= max_attempts` definition of a permanent
failure. This rollout does not change that behavior; it remains a recorded
follow-up rather than part of PR #6.
