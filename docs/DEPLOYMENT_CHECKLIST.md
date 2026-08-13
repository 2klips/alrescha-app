# Pilot deployment checklist

## Before deploy

- [ ] Pin reviewed Node, pnpm, dependency lockfile, Supabase, and hosting versions.
- [ ] Back up the database and test restoration in a non-production project.
- [ ] Apply migrations through `202608100009_release_hardening.sql`; verify `security_audit_events`, `workspace_security_rate_limits`, and GitHub revocation functions.
- [ ] Configure server-only secrets: `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_INSTALL_STATE_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `BYOK_ENCRYPTION_KEY`.
- [ ] Configure public values: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] If platform AI judgment is offered, configure `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`; otherwise keep the provider option disabled.
- [ ] Confirm the GitHub App callback and webhook URLs use HTTPS and subscribe to `push`, `check_run`, `workflow_run`, and `installation`.
- [ ] Confirm GitHub permissions match the [security checklist](./SECURITY_CHECKLIST.md).

## Automated gate

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

- [ ] Verify the seeded demo completes without GitHub credentials or credits.
- [ ] Send a signed `installation.deleted` fixture; confirm scans pause, pending jobs cancel, and reconnect guidance renders.
- [ ] Exercise repository-selection rate limiting and verify a safe `429` with no partial selection.
- [ ] Confirm `/app/settings/privacy` and `/app/stats` are reachable by an authenticated pilot user.

## Scheduled and operational work

- [ ] Schedule `select public.prune_expired_access_events();` daily with a service-role database job.
- [ ] Monitor webhook 4xx/5xx, queue depth, stale leases, provider failures/refunds, and audit-write failures without logging payloads or secrets.
- [ ] Alert on repeated invalid webhook signatures and cross-tenant/RLS errors.
- [ ] Keep rollback application and migration steps ready; never roll back by deleting user data.

## Pilot release record

- [ ] Record commit SHA, migration version, environment, operator, UTC deployment time, test output, and evidence paths.
- [ ] Record known limitations: metadata-only pilot, solo workspace, advisory PR permission opt-in, and 30-day access-event retention.
- [ ] Run the recruitment baseline below before describing any measured outcome.
