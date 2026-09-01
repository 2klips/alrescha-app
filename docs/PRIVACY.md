# Privacy and data boundary

Alrescha's pilot uses metadata-only persistence. Repository files are fetched transiently through a short-lived, repository-scoped GitHub installation token. Raw source and installation tokens are not stored.

## Stored

- Repository identity, branch, paths, digests, source spans, and exported-symbol metadata.
- Extracted requirements, evidence relationships, deterministic findings, parsed CI test reports, and signed receipt data.
- Job status, credit-ledger entries, MCP access events, and minimal security audit events.
- An encrypted BYOK value when a user opts in to a provider key.

## Not stored or sent by default

- Raw repository source, GitHub installation tokens, GitHub App private keys, or plaintext BYOK provider keys.
- Third-party analytics. Pilot instrumentation is off until workspace consent.
- AI inputs for deterministic scans. AI judgment runs only after explicit platform-credit or BYOK selection.

## Retention and deletion

Pilot MCP access events are retained for 30 days and pruned daily. Security audit events, evidence metadata, receipts, and credit records remain until workspace deletion for traceability. `access_event_retention_days = null` is reserved for an explicitly configured unlimited-retention plan; the pilot default is 30.

Revoking or suspending the GitHub App immediately pauses new scans and cancels queued or running repository jobs. Existing evidence remains read-only so the user can inspect prior receipts and reconnect safely. Workspace deletion cascades tenant data from the application database; provider/GitHub secrets are removed from their separate secret stores.

## BYOK and credits

BYOK keys are encrypted using `BYOK_ENCRYPTION_KEY`, never returned after save, and never written to prompts, audit metadata, or logs. Deterministic scans consume zero credits. Platform AI judgment credits are reserved before execution and refunded on provider or schema failure.

## Product-impact claims

Alrescha does not claim savings from an isolated observation or pooled customer data. Each user sees only sufficient, opt-in measurements from their workspace with methodology and JSON export at `/app/stats`.
