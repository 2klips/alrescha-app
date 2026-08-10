# Task 6 evidence — GitHub App installation and webhook ingestion

Date: 2026-08-10

## Delivered

- Exact read-only GitHub App permission profile: `contents:read`, `checks:read`, `actions:read`, and `metadata:read`.
- Separate optional `pull_requests:write` profile and UI explanation; other write/admin permissions are rejected.
- Signed, expiring installation state; GitHub App user-token verification prevents trusting a spoofable `installation_id` callback alone.
- Repository chooser backed by verified installation repositories. Installation access tokens are short-lived, scoped to the selected repository, and never persisted.
- Raw-body HMAC-SHA256 verification with constant-time comparison before JSON parsing or database work.
- Normalization for push, completed check_run, and completed workflow_run events. Only normalized fields and a payload digest persist; raw payloads do not.
- Database uniqueness on GitHub delivery id plus duplicate-safe ingestion.

## Acceptance evidence

| Command | Result |
| --- | --- |
| `pnpm test -- github-app` | pass; 4 permission/token/onboarding/webhook integration tests |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass after route narrowing fix |
| `pnpm test` | pass; 45 tests in 8 files |
| `pnpm --filter @specproof/web build` | pass; all GitHub routes/pages compiled and enumerated |

The recorded-fixture integration replays signed push, check_run, and workflow_run payloads through the real verifier/normalizer into a migration-from-scratch database. All three normalized rows persist once. Replaying a delivery returns duplicate success without a fourth row. A bad signature returns 401 and leaves the row count unchanged. Mocked onboarding verifies installation preparation, selected-repository access revalidation, and `pending_first_scan` state.

## Design sources

- GitHub webhook validation: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- GitHub App setup URL spoofing warning: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
- Installation token scoping and one-hour expiry: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- Minimal permission guidance: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app

## Deferred environment-only verification

Live installation/OAuth callback and external GitHub API smoke tests require registered GitHub App credentials and a reachable callback URL, which are unavailable here. The complete route flow builds successfully; provider interactions are deterministic mocks/recordings. Browser-level live installation remains deployment setup work.
