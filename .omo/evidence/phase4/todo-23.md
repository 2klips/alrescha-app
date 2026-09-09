# Phase 4 · Wave E · todo 23 — what the answers weigh

**Date:** 2026-09-06 · **Scope:**
`supabase/migrations/202609060011_session_telemetry.sql`,
`packages/mcp/src/{hosted,store,index}.ts`,
`apps/web/lib/mcp/supabase-store.ts`, `packages/mcp/src/hosted.test.ts`,
`tests/session-telemetry.test.ts`, `tests/team-privacy.test.ts`,
`tests/helpers/database.ts`, `docs/PRIVACY.md`, `spec/OPEN_QUESTIONS.md`.

Todo 22 measured the catalogue — the payload a session pays before it asks
anything. This is the rest of the bill, and until now nothing recorded it:
`access_events` knew which tool ran and which nodes it touched, never how
much came back. Todo 24's savings meter built on that gap would have been an
estimate presented as a measurement.

## Two meters, because they answer different questions

**What we served** is measurable here. `access_events.response_chars` is the
length of the serialised result the server handed back; `estimated_tokens` is
a **generated** column at a fixed 4 chars/token, so the assumption belongs to
the schema and no writer can report a ratio of its own. A test asserts that
inserting `estimated_tokens` directly is refused.

**What the agent paid** is not. Only the model's own usage numbers know what
a call cost after prompt caching, and only the client can see them — so
`session_usage_reports` exists, opt-in and counters only, stored *beside* the
served bytes rather than instead of them.

An unmeasured call is **null, not zero**, on both sides. `usage_daily` carries
`served_measured_calls` next to `served_calls` for exactly that reason: "0
characters because nobody measured" and "0 characters because the answer was
empty" are different facts and the view refuses to average them together.

## Measured

Per-call sizes on the four-artifact fixture, as recorded (the wire, including
the `structuredContent` duplicate the compat pass has not yet retired):

| call | chars | est. tokens |
|---|---|---|
| `search_index` | 276 | 69 |
| `resource:overview` | 451 | 113 |
| `resource:receipts-summary` | 488 | 122 |
| `resource:context-packs` | 503 | 126 |
| `resource:findings` | 614 | 154 |
| `query_brain` | 812 | 203 |
| `resource:artifacts` | 851 | 213 |
| `get_findings` | 990 | 248 |
| `get_artifact` (one path) | 1,659 | 415 |
| `request_context_pack` | 3,059 | 765 |

This is the first number that supports todo 22's flow sentence rather than
asserting it: the ID-first entry point is the cheapest call on the server and
the pack is eleven times its size.

The catalogue cost of adding the tool, measured by the ratchet that todo 22
left behind: **20 tools / 2,704 tokens → 21 tools / 2,890**. The ratchet
caught it in the same session, and the contract test now holds 2,900.

## The payload is carried twice, and the meter says so

`response_chars` counts `JSON.stringify(result)` — the JSON text block *and*
the structured copy of the same payload. A meter that counted one of them
would advertise a saving nobody received. When the real-client compat pass
retires the duplicate (todo 22's open item), this is the number that will
show it.

## Where the wiring is guarded

The event is emitted before the payload exists — it names the nodes the
handler resolved — so `emitAccessEvent` returns a sizer and `toolResult`
calls it, synchronously, in the same tick that the dispatch is queued in. Two
tools deliberately emit no event and so record no size: `record_prompt`
(ADR-004 — the prompt store never mixes with this one) and `record_ruled_out`
(no touched nodes). `report_session_usage` joins them for a third reason: a
meter that logged its own traffic would make a session look more expensive
for having been measured.

That leaves 18 of 21 tools plus all five resources measured, and the guard
against a forgotten call site is a test: every recorded event must carry
`responseChars > 0` and an `estimatedTokens` that follows from it.

## Consent, and one switch rather than two

`workspaces.pilot_instrumentation_enabled` already gates the pack metrics and
already carries a recorded consent timestamp. Session usage is the same class
of data — numbers about how the product was used — so it reuses that switch.
Two switches for one class would be two things to consent to and one of them
would drift.

The gate is a BEFORE trigger, so **service role cannot write around it**
(asserted). `report_session_usage` checks the same condition first and
returns `not_enabled` instead of raising: telemetry that can fail an agent's
session costs more than it measures. A client-supplied repository id is a
request, not a claim — a foreign id answers `unknown_repository` and writes
nothing.

## Retention keeps its promise by construction

`usage_daily` is computed from rows rather than maintained beside them, so
pruning removes the days it summarised — asserted end to end: two rows in,
one day in the view, `prune_expired_access_events()` returns 2, view empty.
The prune function now sweeps both tables under the same
`access_event_retention_days`, and the existing pg_cron job calls the same
function name, so nothing needs rescheduling.

## R-01 and the two-path tenant check

Read observations must never bump a revision — a read that invalidates its
own fence makes the fence meaningless. Asserted: writing an access event and
a usage report leaves `repositories.data_revision` and
`workspaces.memory_revision` exactly as they were.

`usage_daily` is the first view in this schema and it is `security_invoker`,
so the base tables' RLS is the access rule rather than a re-implemented
check. Both paths are tested, as the 보완 requires: a member sees only their
own workspace, a non-member sees nothing, and a **service-role reader sees
both** — which is the assertion that says that caller must still scope by
workspace itself.

## ADR-011

The one string this table accepts is a model identifier, and a CHECK forbids
whitespace so a sentence cannot be smuggled through it. The Zod schema on the
tool and the SQL CHECK are pinned to each other by reading
`pg_get_constraintdef` and comparing it to `MODEL_IDENTIFIER_PATTERN.source`,
then running the same samples through both. `tests/team-privacy.test.ts`
extends its "the two stores never mix" invariant to the new tables: the only
text columns in `session_usage_reports` and `usage_daily` are ids and the
constrained model.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
— 168 files, 1,458 passed, 1 skipped —
`node --import tsx scripts/verify-scope-boundaries.ts` PASS (12 boundaries,
341 files). `docs/PRIVACY.md` updated for both meters and the shared
retention.

## Not done

- **No production run.** Every number above is from PGlite and the in-memory
  store. G2 is closed, so no hosted MCP session has written a
  `response_chars` yet and no agent has ever called `report_session_usage`.
- **`/app/stats` does not read `usage_daily`.** The view exists and is
  tenant-safe; the per-repository savings meter that consumes it is todo 24,
  and no screen changed here.
- **The 4 chars/token ratio is an assumption on real text** — fixed in the
  column, not validated against a tokenizer. **OQ-060** says so and says what
  would settle it; nothing may call the derived token number a measurement
  until then.
- **The tool costs 186 catalogue tokens for workspaces that never opt in.**
  Measured, and recorded as **OQ-061** rather than fixed by guesswork — a
  catalogue that changes shape per workspace gives "what tools does this
  server have" more than one answer.
- **No hook receiving path.** The plan allows a lightweight tool *or* a hook;
  todo 22 ⑶'s snippets do not exist, so the tool is the only door.
- **Playwright e2e unrun** (no Docker on this machine), as for every wave
  since A.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
