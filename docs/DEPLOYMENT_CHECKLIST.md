# Pilot deployment checklist

Production has been live since 2026-08-27. Every box below was reconciled against
the running deployment on **2026-09-03, 14:00–14:20 UTC** with read-only probes;
a box is ticked only where that probe produced evidence. The full measurement log,
including the queries and their output, is at
[`.omo/evidence/phase2c/followup-deployment-checklist.md`](../.omo/evidence/phase2c/followup-deployment-checklist.md).

Unticked boxes are genuinely open, and each one says what is missing.

## Before deploy

- [x] Pin reviewed Node, pnpm, dependency lockfile, Supabase, and hosting versions.
      Node `>=22` engine against worker `v22.23.2`, `pnpm@9.0.0`, committed
      `pnpm-lock.yaml`, Supabase `major_version = 17` against production
      PostgreSQL `17.6`, Fly image `deployment-01M1H7G6E1AY8DNRX26JVD44HA`.
      No CI enforces `--frozen-lockfile`; the gate is run by hand (see OQ-026).
- [ ] Back up the database and test restoration in a non-production project.
      **Open.** Neither the backup schedule nor a restore rehearsal is verifiable
      without the Supabase dashboard, and no restore has been rehearsed. This is
      the highest-value remaining operations item.
- [x] Apply migrations through `202608100009_release_hardening.sql`; verify `security_audit_events`, `workspace_security_rate_limits`, and GitHub revocation functions.
      40 migrations applied, latest `202609020002_requirement_judgment_enqueue.sql`.
      Both tables exist; `revoke_github_installation`,
      `record_security_audit_event`, `consume_workspace_security_limit`,
      `audit_scan_job_request`, and `prune_expired_access_events` all present.
- [x] Configure server-only secrets: `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_INSTALL_STATE_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `BYOK_ENCRYPTION_KEY`.
      Presence proved functionally, never by reading a value: 35 of 35 webhook
      deliveries answered `200` (secret present, HMAC verifying), the 2026-08-27
      installation completed through the signed-state callback, and server-side
      reads render. `BYOK_ENCRYPTION_KEY` is deliberately absent — the pilot ships
      no BYOK path, so it is not required (see OQ-027).
- [x] Register a **dedicated GitHub OAuth App for sign-in** (OQ-017: Settings → Developer settings → OAuth Apps; authorization callback = `<SUPABASE_URL>/auth/v1/callback`) and configure `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`. Never reuse the GitHub App's client credentials for the Supabase provider — the minimal-permission App cannot serve `/user/emails`, and widening it violates the permission guardrail.
      The Supabase authorize endpoint redirects to GitHub with a client id that
      **differs** from the GitHub App's client id, scope `user:email`, callback
      `<SUPABASE_URL>/auth/v1/callback`. OQ-017 option ⑴ is in force in production.
- [x] Configure public values: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
      Anonymous `/app/*` requests redirect to `https://arr-app-web.vercel.app/auth/login`
      and the authenticated screens render, which all three values gate.
- [x] If platform AI judgment is offered, configure `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`; otherwise keep the provider option disabled.
      Both set on the worker. A production judgment succeeded on 2026-09-02 via
      Anthropic `claude-sonnet-5`.
- [x] Confirm the GitHub App callback and webhook URLs use HTTPS and subscribe to `push`, `check_run`, and `workflow_run`.
      Webhook URL `https://arr-app-web.vercel.app/api/github/webhooks`,
      `insecure_ssl = 0`, secret set. Subscribed events are exactly
      `check_run`, `push`, `workflow_run`. The callback URL is not exposed by the
      API; the 2026-08-27 installation audit event proves the HTTPS callback ran.
      `installation` is **not** in that list on purpose: GitHub delivers the
      `installation` event to every GitHub App by default and it cannot be
      subscribed manually, so this item's earlier wording asked for something no
      operator can do. The handler for it exists and is tested.
- [x] Confirm GitHub permissions match the [security checklist](./SECURITY_CHECKLIST.md).
      Measured `{actions: read, checks: read, contents: read, metadata: read}` —
      exactly `GITHUB_READ_ONLY_PERMISSIONS`, with `pull_requests` absent. The one
      installation is `repository_selection: selected` and not suspended.

## Automated gate

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

- [x] Verify the seeded demo completes without GitHub credentials or credits.
      `tests/e2e/release-hardening.spec.ts` — "fresh user completes the seeded
      demo repository journey".
- [x] Send a signed `installation.deleted` fixture; confirm scans pause, pending jobs cancel, and reconnect guidance renders.
      Signed fixture in `tests/github-app.test.ts` ("degrades safely when GitHub
      deletes an installation"), cancellation and single-audit in
      `tests/release-hardening.test.ts`, reconnect guidance in
      `tests/e2e/release-hardening.spec.ts`. Not replayed against production: it
      would revoke the live installation.
- [x] Exercise repository-selection rate limiting and verify a safe `429` with no partial selection.
      `tests/release-hardening.test.ts` covers the durable limiter. The route
      consumes the limit **before** `connectSelectedRepository`, so a `429`
      cannot leave a partial selection behind.
- [x] Confirm `/app/settings/privacy` and `/app/stats` are reachable by an authenticated pilot user.
      Both rendered for the signed-in pilot account on 2026-09-03: the privacy
      screen shows the credits policy, and `/app/stats` shows the measurement-off
      state with its opt-in control.

## Scheduled and operational work

- [ ] Schedule `select public.prune_expired_access_events();` daily with a service-role database job.
      **Migration ready, production apply pending.**
      `supabase/migrations/202609030001_prune_access_events_cron.sql` enables
      `pg_cron` and schedules `alrescha_prune_access_events` at 18:17 UTC daily,
      guarded so a database without `pg_cron` applies it as a no-op. Production
      reports `pg_cron` available and not yet installed. Applying it needs the
      operator's `.env.migrate`; nothing has aged past retention yet, so the first
      real deadline is **2026-09-26** (the single access event dates from
      2026-08-27).
- [x] Monitor webhook 4xx/5xx, queue depth, stale leases, provider failures/refunds, and audit-write failures without logging payloads or secrets.
      `pnpm ops:health` (`scripts/ops-health.ts`) judges the seven signals the
      database can see and exits non-zero when any is not ok; it reads counts and
      timestamps only. Rejected webhooks never reach storage, so their 4xx/5xx
      rates are a console watch. Both halves are written up as
      [runbook §10](./DEPLOYMENT_RUNBOOK.md).
- [x] Alert on repeated invalid webhook signatures and cross-tenant/RLS errors.
      Runbook §10.2 names where each appears (GitHub Recent Deliveries and Vercel
      logs for repeated `401`; Supabase Postgres logs for `permission denied` and
      `row-level security`) and §10.3 records what alerting exists without new
      credentials. A paid alerting pipeline is deferred to OQ-025.
- [x] Keep rollback application and migration steps ready; never roll back by deleting user data.
      Runbook §10.4: Vercel Instant Rollback, `flyctl deploy --image <previous>`,
      and forward-only migrations. The applied-checksum guard in
      `scripts/migrate.ts` is documented as a safety feature, not an obstacle.

## Pilot release record

- [x] Record commit SHA, migration version, environment, operator, UTC deployment time, test output, and evidence paths.
      See the table below.
- [x] Record known limitations: metadata-only pilot, solo workspace, advisory PR permission opt-in, and 30-day access-event retention.
      See "Known limitations" below.
- [ ] Run the recruitment baseline below before describing any measured outcome.
      **Open.** No external participant has been recruited; the pilot is the
      operator's own workspace, so no baseline has been captured. The script is
      [`PILOT_RECRUITMENT.md`](./PILOT_RECRUITMENT.md) — this checklist has no
      baseline section of its own, which the wording used to imply.

### Release record — 2026-09-03

| Field                | Value                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment          | production                                                                                                                                         |
| Web + hosted MCP     | Vercel `arr-app-web.vercel.app`. Verified against `main` at `2bd34bb` (Vercel `success`); `233195a` landed at 14:09 UTC mid-window, also `success` |
| Worker               | Fly.io `arr-worker` v13, image `deployment-01M1H7G6E1AY8DNRX26JVD44HA`, region `nrt`. Superseded by v14 at 14:32 UTC, after this window            |
| Database             | Supabase `mzowdsczwaesmfbxzjzw` (ap-northeast-2), PostgreSQL 17.6                                                                                  |
| Migration version    | `202609020002_requirement_judgment_enqueue.sql` (40 applied)                                                                                       |
| Repository           | `2klips/alrescha-app`                                                                                                                              |
| Operator             | `2klips`                                                                                                                                           |
| Verified at          | 2026-09-03 14:00–14:20 UTC                                                                                                                         |
| Gate at verification | `pnpm lint` clean, `pnpm typecheck` clean, `pnpm exec vitest run` 1055 passed / 1 skipped across 141 files, on `68be681` plus this reconciliation  |
| Observed state       | 1 installation (active), 1 repository, 35 accepted push deliveries, 35 receipts, 76 jobs (75 succeeded / 1 refunded provider failure)              |
| Evidence             | [`.omo/evidence/phase2c/followup-deployment-checklist.md`](../.omo/evidence/phase2c/followup-deployment-checklist.md)                              |
| Prior records        | `.omo/evidence/phase2c/wave-4-todo-9.md`, `.omo/evidence/phase2c/followup-live-receipts.md`                                                        |

### Known limitations

- **Metadata-only pilot.** Evidence storage holds graph metadata, spans, and
  receipts. Raw source bodies are fetched transiently for analysis and never
  persisted.
- **Solo workspace.** One workspace, one owner, one selected repository. Team
  surfaces exist behind role checks but have no second member in production.
- **Advisory PR permission is opt-in.** `pull_requests:write` is off. The
  minimal-index PR proposal is the only repo-write path and stays unavailable
  until the operator widens the installation deliberately.
- **30-day access-event retention.** `workspaces.access_event_retention_days` is
  30 in production. Until the prune schedule above is applied, that ceiling is
  enforced by the function but not by any scheduler.
- **No platform AI judgment without keys.** Deterministic scans cost zero
  credits; judgment requires platform credits, and a failed provider response is
  refunded rather than charged (verified in production on 2026-09-02).
- **No CI.** The automated gate runs on the operator's machine.
