# Task 17 evidence — credit-safe AI judgment and BYOK

Date: 2026-08-13

## Delivered

- Vendor-neutral judgment contract in core with OpenAI and Anthropic worker adapters.
- Zod-validated judgment payloads for drift verdict confirmation, requirement disambiguation, and contradiction confirmation.
- Successful judgments persist their payload and upgrade finding confidence atomically while remaining `inferred`; inferred-only severity is capped at medium.
- Worker jobs reuse the existing idempotent reservation, settlement, refund, and retry flow. Schema-invalid and exhausted-credit jobs terminate without a charge.
- AES-256-GCM BYOK envelopes persist only ciphertext, IV, authentication tag, provider, and key version. BYOK jobs reserve zero credits.
- Owner-only `/app/settings/ai` view for credit balance, usage ledger, BYOK status, key replacement, and exhausted-credit guidance.
- Safe invalid-attempt diagnostics store a payload digest and Zod issue paths, never the raw provider response or API key.

## Acceptance evidence

| Criterion | Result |
| --- | --- |
| Provider dispatch | pass; mocked OpenAI Responses and Anthropic Messages boundaries validate URL, auth header, model, request shape, and parsed result |
| Reservation, settlement, and refund | pass; successful platform job settles once and terminal invalid output refunds its reservation |
| Schema rejection without charge | pass; invalid payload is rejected, safely recorded by digest/issues, and restores the original balance |
| Retry without double charge | pass; retry reuses the same reservation and produces one settlement ledger event |
| BYOK bypass | pass; encrypted workspace key is decrypted only at provider load and the job creates no credit-ledger event |
| Confidence upgrade rules | pass; confidence can increase, evidence grade remains `inferred`, and high/critical inferred severity is capped at medium |
| Never flips to `verified` | pass; core schema and database constraints reject `verified` judgment payloads |
| Atomic payload before severity update | pass; database function records the judgment before applying confidence/severity in one transaction |

## QA scenarios

| Scenario | Result |
| --- | --- |
| Ambiguous contradiction judgment | pass; mocked worker run stores one inferred payload, updates the candidate, and settles the ledger once |
| Exhausted credits | pass; worker rejects the judgment with `Judgment paused: credits unavailable. Add credits or configure BYOK, then retry.` and deterministic analysis remains available |
| AI settings component | pass; balance, used credits, ledger, BYOK status, secret replacement, and exhausted-credit guidance render in component tests without exposing a stored key |
| In-app browser on `/app/settings/ai` | blocked by local prerequisite; route returned `Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, so no successful browser-render claim is made |

## Security and external prerequisites

- `OPENAI_API_KEY` availability was confirmed without printing it. The ignored `.env.local` file is not staged or committed.
- No paid live-provider request was made. Provider HTTP boundaries use deterministic mocks in the acceptance suite.
- Local BYOK registration additionally requires a random 32-byte base64 `BYOK_ENCRYPTION_KEY`.
- Browser QA additionally requires a configured local Supabase publishable key and backend.
- Provider contracts follow the official [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) and [Anthropic Messages API reference](https://platform.claude.com/docs/en/api/messages).

## Verification commands

| Command | Result |
| --- | --- |
| `pnpm test` | pass; 37 files, 159 tests |
| `pnpm lint` | pass; zero errors |
| `pnpm typecheck` | pass; root and all workspace packages |
| `pnpm build` | pass; Core, MCP, Worker, and Next.js production build including `/app/settings/ai` |
| `git diff --check` | pass |
