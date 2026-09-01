# Alrescha legacy identifier removal

**Date:** 2026-09-01

**Agent:** Codex

**Start SHA:** `d6df9bc`

**Result:** Complete

## Outcome

Alrescha is now the only active product identifier. The implementation repository moved from `2klips/arr-app` to [`2klips/alrescha-app`](https://github.com/2klips/alrescha-app), and the local `origin` follows the new address.

## Removed compatibility surfaces

- Removed the CLI `arr` bin and `ARR_SERVER_URL`, `ARR_TOKEN`, and `ARR_MCP_URL` fallbacks.
- Removed legacy theme, sidebar, graph-panel, prompt-log, managed-index, receipt, export, and ESLint aliases.
- Kept negative compatibility tests proving old inputs are ignored or rejected.
- Updated active fixtures, repository copy, GitHub expectations, and assurance digests to `2klips/alrescha-app`.
- Added `202609010001_alrescha_repository_identity.sql`; it changes only `repositories.full_name`, preserving repository IDs and relations.

## Database result

Preflight measurement on the configured database found 0 receipts, 0 legacy `arr` receipts, and 0 rows for either implementation-repository address.

The first migration attempt exposed a pre-existing ledger mismatch: the database had all 37 prior versions in `supabase_migrations.schema_migrations`, while the custom runner consulted only its empty private checksum ledger. The runner now validates the standard Supabase version/name, backfills the private checksum ledger, and records new migrations in both ledgers. `202609010001_alrescha_repository_identity.sql` then applied successfully; the immediate rerun reported `Database already current.`

## External resources

- GitHub: renamed `2klips/arr-app` to `2klips/alrescha-app`; the separate planning/marketing repository `2klips/arr` was not changed.
- Vercel: unchanged. No local Vercel CLI, token, cached authentication, or `.vercel` project link was available, so the current project identity could not be verified safely. The deployed hostname and receipt predicate remain compatibility contracts.
- Fly.io: unchanged. Fly app names have no in-place rename operation; changing `arr-worker` requires a new app, secrets/config migration, deployment validation, and deliberate cleanup of the old app. No Fly CLI or environment token was available.

## Verification

- Alias/removal regression set: 10 files, 81 tests passed.
- Migration-focused set: 2 files, 9 tests passed.
- `pnpm typecheck`: passed across the workspace.
- Configured DB migration: applied once; idempotent rerun passed.
- Chromium desktop regression on isolated port 3100: app shell, 404, onboarding, revoked-installation recovery, and library provenance — 5 passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm test`: 134 files passed; 985 tests passed, 1 skipped.
- `pnpm build`: core, CLI, MCP, worker, and all 29 Next.js routes built successfully.
- `pnpm exec tsx scripts/verify-scope-boundaries.ts`: 12 boundaries, 298 files, 0 forbidden paths.
- `pnpm format:check` and `git diff --check`: passed repository-wide.

## Preserved user work

- Existing modified `.omo/evidence/**` files were excluded from staging.
- Untracked `docs/brand/**` exploration was excluded from staging.
- Historical specs, ADRs, old logs, immutable receipt predicate URI, deployment hostnames, applied migration filenames, and private `.arr-*` CSS selectors were not bulk-rewritten.

## Remaining external decisions

- Rename the Vercel project only after authenticated project inspection confirms the project and hostname impact.
- Migrate `arr-worker` only as an explicitly approved Fly new-app rollout with secrets, traffic, rollback, and old-app retention decisions.
