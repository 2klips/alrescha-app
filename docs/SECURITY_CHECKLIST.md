# Pilot security checklist

Owner: release operator. Complete before every pilot deployment and attach the checked copy to the release record.

## GitHub boundary

- [ ] GitHub App permissions equal `contents:read`, `checks:read`, `actions:read`, and `metadata:read`.
- [ ] `pull_requests:write` remains disabled unless the user explicitly enables advisory PR proposals.
- [ ] Repository selection is user-controlled, including for private repositories.
- [ ] Installation tokens are repository-scoped, short-lived, used transiently, and never stored or logged.
- [ ] Webhook HMAC verification, 1 MiB body limit, delivery deduplication, and workspace enqueue limits pass.
- [ ] An `installation.deleted` or `installation.suspend` webhook marks the installation revoked, cancels pending repository jobs, and leaves stored evidence read-only with reconnect guidance.

## Tenant and secret boundary

- [ ] RLS isolation passes for evidence, credits, MCP tokens, access events, and `security_audit_events`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, GitHub secrets, provider keys, and `BYOK_ENCRYPTION_KEY` exist only in server secret storage.
- [ ] BYOK ciphertext is stored separately; plaintext never enters job payloads, prompts, audit metadata, analytics, or application logs.
- [ ] CSP/TLS, secure cookie, CSRF origin checks, install-state signature/expiry, and least-privilege service roles are verified.

## Data and operations

- [ ] Privacy UI and [privacy policy](./PRIVACY.md) match the deployed schema: metadata-only evidence storage and transient raw-source fetches.
- [ ] Repo-touching actions emit minimal audit events: installation connection/revocation, repository selection, scan request, and advisory index PR proposal.
- [ ] Audit metadata contains identifiers and outcomes only—no raw source, prompt, access token, or provider key.
- [ ] Pilot MCP access-event retention is 30 days; `prune_expired_access_events()` runs daily.
- [ ] Deterministic scans cost zero credits. Credit-consuming judgments require explicit platform-credit or BYOK choice and show refund behavior.
- [ ] Rate-limit response is `429 rate_limited`; critical revocation webhooks are never dropped by the user-operation limiter.

## Verification

- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test:e2e` pass.
- [ ] Fresh-user seeded demo and GitHub-revocation Playwright scenarios pass.
- [ ] Evidence is captured at `.omo/evidence/docshub-product-strategy/task-19.png`.
