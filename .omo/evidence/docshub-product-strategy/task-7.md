# Task 7 evidence — background worker and credit lifecycle

Date: 2026-08-10

## Delivered

- `apps/worker` Postgres adapter and one-job orchestration boundary with typed handlers and heartbeat callback.
- Postgres enqueue/claim/heartbeat/finish/cancel/reap functions. Claims use `FOR UPDATE SKIP LOCKED`, bounded leases, tenant filtering, priority, and exponential retry availability.
- GitHub webhook ingestion now atomically inserts the normalized delivery, creates one run, and enqueues idempotent scan + analyze jobs.
- Per-workspace enqueue windows and configurable rate limits.
- Monthly grant/top-up-ready append-only ledger with job reservation, settlement, refund, idempotency keys, available-balance checks, per-job caps, and monthly caps.
- Deterministic scan/analyze credit cost fixed at zero by enqueue validation and a database CHECK constraint.
- Worker/credit functions revoked from public, anon, and authenticated roles; only `service_role` receives execute access.

## Acceptance evidence

| Command | Result |
| --- | --- |
| `pnpm test -- worker-credit apps/worker/src/worker.test.ts` | pass; 11 queue/worker/credit tests |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass across root and 5 checked workspace projects, including worker |
| `pnpm test` | pass; 56 tests in 10 files |
| `pnpm build` | pass; core, MCP, worker DTS/ESM, and Next production build |

Acceptance coverage proves:

- A queued job can be claimed once; a worker scoped to workspace A never claims workspace B.
- Only the active claimant can heartbeat.
- Failures stop at `max_attempts`; cancellation is idempotent and late completion is ignored.
- Duplicate webhook delivery creates one delivery, one run, and exactly two zero-credit deterministic jobs.
- Duplicate enqueue does not consume rate-limit capacity; new work beyond the cap is rejected.
- Successful judgment reserve → settle leaves exactly one debit; terminal failure/cancel reserve → refund returns the balance and cannot double-refund.
- Scan/analyze nonzero credit requests fail; failed judgment net charge is zero.
- Per-job and monthly workspace credit caps reject excess reservations.

## Deferred environment-only verification

The SQL migration runs from scratch in isolated PostgreSQL-compatible PGlite and exercises every state transition. A live Supabase/Postgres multi-connection contention soak is not possible without the Phase B database environment. Production connection/lease soak remains deployment verification; queue correctness does not depend on an external queue service.
