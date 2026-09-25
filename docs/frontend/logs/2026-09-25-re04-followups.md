# Home workspace lookup names its failure — 2026-09-25

Status: **built and tested locally; production after merge** (RE-04 follow-up to deployment Codex's 7074b74 production read; no push yet).

The first `GET /app` on the 7074b74 deployment returned 500 and its log said
only `Error: Personal workspace is unavailable.`; the refresh was 200.
`lib/home/journey.ts` threw that sentence whenever the `workspaces` lookup
failed and dropped the PostgREST error, so a network failure, an expired
token and a row the policy hid read the same. The message now leads with the
status and code — `[HTTP 406 PGRST116] Personal workspace is unavailable.` —
and none of the upstream text. Production shows the digest, not the message,
so nothing a visitor sees changes; the log does.

| Surface                        | Change                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/home/journey.ts` (`/app`) | The thrown message carries `responseTag(workspaceResult)`.                                                                                         |
| `lib/supabase/response-tag.ts` | The `[HTTP status code] ` rule the MCP store's `queryError` has used since RE-04, moved here so both share it; `queryError`'s output is unchanged. |

No component, style, copy or builder changed; the UI track's
`home-screen.tsx` is untouched. The same branch carries two MCP read fixes
(`graph_nodes` label read, `memory_read` coverage) that do not touch the
web screens — see
[`CLAUDE_TO_CODEX_HANDOFF_RE-04-FOLLOWUPS.md`](../../reports/CLAUDE_TO_CODEX_HANDOFF_RE-04-FOLLOWUPS.md).

Verification: `lib/home/journey.test.ts` drives the real postgrest-js with a
fake fetch (406 PGRST116, 401 PGRST303) and fails on main's bare sentence;
lint, typecheck, vitest 227 files / 2,116 passed / 1 skipped (local).
