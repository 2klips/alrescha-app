# Phase 4 · Codex remedy S5 — one card, and a change brief that adds no tool

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-02 / P0-A
§6.1 and §9.1, on todos 19 (prose surfaces) and 22 (workflow). **Scope:**
`packages/core/src/brain/artifact-card.ts` (new),
`packages/core/src/inspection/dashboard.ts`, `packages/mcp/src/data-brain.ts`,
`packages/mcp/src/prepare-change.ts` (new), `packages/mcp/src/store.ts`,
`apps/web/lib/mcp/supabase-store.ts`,
`apps/web/lib/inspection/inspection-report.ts`,
`tests/artifact-card.test.ts` (new).

## Three answers to one question

"What is this file" was being answered separately in three places: the map
inspector read `metadata.summary`, `get_artifact` read `metadata.summary`, the
search excerpt read `content`. Each had its own idea of what a file *is* and —
until S1 — its own idea of whether the prose still applied. Three answers is
three chances to be differently wrong.

`buildArtifactCard` is the one builder. Two rules make its output honest:

- **Source metadata and model prose are separate fields.** They used to be one
  `content` string, so a caller could not tell a stored path from a paragraph
  something generated. `summary` is a `SummaryState` (S1), carrying whether the
  prose describes this blob at all — and the card takes that state as an input
  rather than re-deriving it, so there is still exactly one freshness rule.
- **A card with no prose is still a card.** Path, kind, domain, unit, exported
  symbol names, the relations the graph holds, and whether anything tests the
  file are deterministic. A repository that has never paid for enrich gets a
  useful answer, and `missing` names what is absent instead of leaving an
  empty string to be read as "nothing to say".

Names only, never bodies: an exported symbol's name is identifier metadata,
its signature is source (WORK_SPEC §3-3).

## The two mappings, checked against each other

The screen and the agent read different row shapes, so replacing two builders
with one moves the risk to the two *mappings*. `tests/artifact-card.test.ts`
feeds equivalent rows through `inspectionArtifactCard` (the web lane) and
`getWorkspaceArtifact` (the MCP lane) and asserts the cards agree on
everything the two bases share — domain, exports, kind, path, summary state,
unit — including the case where the prose is stale, which neither side may
present as the file's description.

## A code lane in the context pack

`documentKinds` has no `code_metadata`, and casting a file into it would have
presented the deterministic facts about a file as if they were a document
somebody wrote. Code now travels as `codeCards`, its own lane, bounded by 20
cards and by whatever is left of the token budget after the prose. The
estimate is of the **serialized card** — relation counts and omissions are
payload too — and `estimatedTokens` on the pack is the sum, because a caller
pays for the whole thing (REMEDY §9.1).

## `prepareChange` registers no tool

The tool catalogue is budgeted at ≤16 and todo 22 owns where these pieces
surface. What belongs in this step is the **composition**: target card →
directional consumers (S4) → related tests → what is missing, from the card
and the read's own omissions together. It hands back *locations* — a card,
node ids and paths — and does not write prose or claim to replace reading the
source.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(154 files, 1,285 passed, 1 skipped — 7 more than S4),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
327 files).

`tests/artifact-card.test.ts` (7 cases): a file with no prose still yields
domain, unit, exports and relations with `missing` naming the gaps; a stale
summary is reported as stale rather than shown or silently dropped; exports
carry names and no signatures; **the screen and the agent produce the same
card from the same facts**, including in the stale case; and `prepareChange`
composes card, consumers and related tests, and says so when a path names no
stored artifact.

## Not verified here

- **No screen renders the card yet.** `InspectionDocumentEntry.card` and the
  MCP `card` field are the contract; `app/ui/*.tsx` and `map-screen.tsx` are
  Codex's lane and todo 19 owns the surface. The existing `summary` field is
  untouched, so nothing on screen changed.
- **The map payload does not carry cards.** Building 1,250 of them into the
  graph response would blow the ≤300KB target for no reader; the inspector
  path builds one at a time, which is where a card is actually wanted.
- **`search_index` and `get_node_content` still answer with their own
  shapes.** They respect the freshness rule (S1) but do not return a card;
  moving them is part of todo 22's tool consolidation.
- **`openTodoCount` is always 0.** The field exists because the remedy names
  todo status as part of a card, and no caller supplies it yet — todo 21 owns
  the todo query.
- **Pack cost is estimated, not measured.** `estimateTokens` is
  characters ÷ 4; no `count_tokens` call checks it, and todo 22's budget
  contract is where that belongs.
- **Module and concept prose** still use their own digest checks
  (`module-tools.ts`); folding them into this card is todo 20.
- **Playwright** (no Docker daemon).

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
