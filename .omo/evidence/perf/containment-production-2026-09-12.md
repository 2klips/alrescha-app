# Containment join production migration and deploy — 2026-09-12

Scope: PR #4 (`1af1c6a`, merged as `a3eb25e`) production migration, large-repository rescan, and `arr-worker` deployment decision from `docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-12.md`.

## Production database

- Connection was made inside the Fly worker with its existing `DATABASE_URL`; no credential value was printed or copied.
- The production ledger initially ended at `202609020002_requirement_judgment_enqueue.sql`; `apply_repository_scan` did not contain `scan_containment`.
- Migration runner applied 21 pending migrations in order at 2026-09-12 08:41:37–08:41:42 UTC:
  - `202609030001_prune_access_events_cron.sql`
  - `202609040001_link_recovery.sql`
  - `202609040002_finding_code_anchor.sql`
  - `202609050001_notes_and_edge_families.sql`
  - `202609050002_directory_nodes.sql`
  - `202609050003_repository_layout_config.sql`
  - `202609050004_todo_identity_and_event_scope.sql`
  - `202609050005_route_nodes.sql`
  - `202609060001_database_objects.sql`
  - `202609060002_section_nodes.sql`
  - `202609060003_artifact_summary_cas.sql`
  - `202609060004_bounded_graph_read.sql`
  - `202609060005_repository_revision.sql`
  - `202609060006_backfill_and_rescan.sql`
  - `202609060007_local_repository_rescan.sql`
  - `202609060008_screen_views.sql`
  - `202609060009_finding_dismissal.sql`
  - `202609060010_doc_pages.sql`
  - `202609060011_session_telemetry.sql`
  - `202609060012_progress_attribution.sql`
  - `202609110015_containment_join_shape.sql` at `2026-09-12T08:41:42.054Z`
- Postcondition query returned one `public.apply_repository_scan` row with `prosrc like '%scan_containment%' = true`.
- The runner emitted expected existence notices and transaction warnings from migration-contained statements, then exited after printing the complete `Applied:` list. No checksum mismatch or failed migration occurred.

## Large repository rescan

Repository: `2klips/alrescha-app`, commit `a1a38ce41bf43439e8ce05ecaab34480198ea115`.

- GitHub tree measurement: 1,170 blobs (above the requested 933-file threshold).
- Before the first full scan: 607 classified artifacts, link schema version 1, 0 `contains` edges. The zero baseline is expected because the production database received the directory-node migrations in this same batch.
- Full rescan job `01M2ACGFNXQZ2H47W63RZCR1BZ`:
  - requested mode `full`; server reason: stored resolver generation 1 vs current generation 3;
  - claimed `2026-09-12T08:42:27.503Z`;
  - succeeded on attempt 1 at `2026-09-12T08:43:22.967Z`;
  - elapsed claim-to-completion: 55.464 s;
  - worker log: `scan @a1a38ce full → 245 rows`.
- After full scan: 851 classified artifacts, link schema version 3, 972 `contains` edges.
- An unchanged incremental rescan (`01M2ACN3HGAE539R0B43RK83AE`) succeeded on attempt 1 in 0.377 s (`08:44:58.526Z`–`08:44:58.903Z`), logged 0 changed rows, and left the `contains` count at 972. This confirms the resulting edge set is stable on an unchanged rescan.

## Deployments

- Fly `arr-worker` was behind at v14 (2026-09-03) while 67 tracked files under `apps/worker`, `packages/core`, and `packages/mcp` had changed.
- Deployed from tracked `main` at `a1a38ce` using `flyctl deploy --remote-only`.
- Result: v15, image `arr-worker:deployment-01M2AC51SPG2H92ZPGJ08GZGHT`, release created `2026-09-12T08:37:20Z`; active NRT machine reached `started`, standby reached `stopped`, and the worker logged `draining 1 workspace(s) across 4 loop(s)`.
- Sequence note: a local `.env.local` URL was first mistaken for production, so the worker rollout preceded the production migration by about four minutes. The production queue was empty during that interval; database verification found zero permanent failures since the rollout. The migration then completed before either acceptance rescan was queued.
- Previous rollback image remains v14: `arr-worker:deployment-01M1KTYZKH7CM2K3WHGATB5S0D`.
- Vercel `arr-app-web`: GitHub status for `a1a38ce` was `Vercel = success` (`2026-09-12T04:08:12Z`). Smoke checks returned `/` = 200 and `/api/mcp` GET = 405, the expected POST-only route behavior.

## Operations health after verification

- OK: access-event retention, audit-write coverage (all 79 scan jobs audited), stale leases, credit reservations, queue depth (0), webhook freshness (4.6 h).
- WARN: 7 permanent failures, all predating v15. Six are scan requests with an all-zero Git tree SHA (2026-09-09–12); one is an incomplete Anthropic coaching response (2026-09-02). Permanent failures since the v15 rollout: 0.
- Overall `pnpm ops:health` equivalent result: `warn`, solely because 7 exceeds the configured threshold of 5. This pre-existing backlog should be reviewed separately; it was not caused by the containment migration or this deployment.
