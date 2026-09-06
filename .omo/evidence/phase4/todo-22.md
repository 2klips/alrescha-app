# Phase 4 · Wave E · todo 22 — what a session pays before it asks anything

**Date:** 2026-09-06 · **Scope:** `packages/mcp/src/hosted.ts`,
`packages/mcp/src/repo-map.ts`, `packages/mcp/src/graph-tools.ts`,
`packages/mcp/src/index.ts`, `packages/mcp/src/hosted.test.ts`,
`tests/pagerank-repo-map.test.ts`, `spec/OPEN_QUESTIONS.md`.

**This todo is a bundle of six.** ⑴ (the catalogue diet), ⑸ (families) and
the part of ⑵ that had gone actively wrong are done with tests. ⑶, ⑷, ⑹ and
the rest of ⑵ are not started. The boundary is at the bottom.

## The measurement first

A tool catalogue is a payload every session pays for before it asks
anything, and nobody had measured this one. Measured:

| | tools | tokens |
|---|---|---|
| before | 23 | **9,995** |
| after removing every `outputSchema` | 23 | 3,501 |
| after merging three tools | 20 | 3,159 |
| after one-line descriptions | 20 | 2,664 |
| after adding the `families` filter | 20 | **2,704** |

`outputSchema` was **65%** of it — the plan estimated 62%, which was close.
It is an optional field, and dropping it costs a client that used it for
typing; the `GRAPH_EDGE_SCHEMA` constant stays exported, so the one place the
edge vocabulary is written down survives and `hosted.test.ts` still pins it
against the source arrays.

## Three tools that were two doors onto one thing

- **`search_nodes` → `search_index(include_excerpt: false)`.** It was the
  same ranking with the prose stripped — literally a projection of the same
  function — so two names for one query was a choice every caller had to make
  and nobody could make well. `include_excerpt: false` **omits** the excerpt
  and title rather than blanking them: an empty string is still a key on the
  wire, and paying for ids and paths is the whole point of the ID-first
  entry point. `limit`, `excerpt_chars` and `domain_filter` came across with
  it, and the answer says how many rows the cap left out.
- **`get_node_content` → `get_artifact(id | ids)`.** A caller holding an id
  had to know which of two tools read it. One selector now — and because the
  two readers answered different questions, a single `id` that is not an
  artifact falls through to the node reader, with `artifact: null` saying
  which one answered. The batch form keeps one result per input, in input
  order, misses included.
- **`route_query` → a sentence.** Choosing a route was a round trip spent
  deciding which round trip to spend next. `tests/query-router.test.ts` still
  holds the rule; only the tool is gone.

## The flow line was teaching removed tools

`get_graph_schema.text` carried its own copy of the workflow, and after the
merges that copy named three tools that no longer existed. That is exactly
how a second copy of a rule fails, so it is `AGENT_FLOW_SENTENCE` now — one
exported constant for the schema card, the instruction block and the
minimal-index PR. A test asserts the card names no removed tool.

That is the part of ⑵ that had become *wrong*; the full shared-constant work
(the ≤300-token instruction block, the forced-call ceiling, the Cursor
`alwaysApply` tension) is not done.

## ⑸ Families

`get_neighbors` takes a `families` filter, and `get_graph_schema` advertises
the family counts so a caller knows which bands this workspace actually has —
offering a filter for a band with no edges is how a caller learns to distrust
the answer. A band with no edges answers with none rather than with
everything, which is what an ignored filter would do, and a test says so.

## The 1,500-token bar is not reachable, and that is measured

The plan's `count_tokens ≤1,500` cannot be met on this SDK. An input schema
that is completely empty still serialises its name, its `$schema` URL and its
annotations: 259 characters, ~65 tokens. Twenty tools is ~1,300 tokens before
a single parameter; sixteen is ~1,040, leaving 460 for every input schema in
the catalogue.

So the contract test is a **ratchet at the measured value** (2,750) rather
than a bar that cannot be passed: the number can only go down, and a
regression trips it — the `families` filter cost 40 tokens and the ratchet
caught it in the same session. The arithmetic, the remaining consolidation
candidates and the upstream question are in **OQ-059**.

## `record_note` and `record_prompt`: reviewed, kept

The plan asked for a review with the spec question recorded, not a removal.
Both stay. `record_prompt` is WORK_SPEC §11's capture path and item ⑶'s hook
is what would replace it as the caller — unexposing it *now* would leave §11
with no caller at all, which is a worse state than one unused tool.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces),
`node --import tsx scripts/verify-scope-boundaries.ts`, `npx vitest run` —
numbers in the session report.

`packages/mcp/src/hosted.test.ts` grew five cases for the budgeted surface
(ID-first search omitting prose and matching the rich ranking, the result cap
and its `truncated` count, excerpt clipping, family narrowing including a
band with no edges, and the advertised family counts with the flow line);
the catalogue test now asserts the token ratchet and the tool count, and the
`route_query` case became an absence assertion.

## Not done

- **⑶ opt-in hook snippets.** No Claude Code SessionEnd or PreToolUse
  snippet, and nothing documented for Codex or Cursor. This is what would
  give `record_prompt` a caller.
- **⑷ `impact_of` confidence, bound, affected and targetRisk.** S4 already
  put `mode` and `semanticsVersion` behind an opt-in, which is the 보완's
  requirement; the confidence breakdown and `targetRisk` — which could now
  read todo 21's risk map — are not built.
- **⑹ `loadWorkspace` split.** Untouched, and the 보완's rule (do not delete
  before every caller has moved; each read reports
  `complete`/`truncated`/`unsupported`; assert the 999/1,000/1,001
  boundaries) means it is a piece of work on its own.
- **The rest of ⑵.** The ≤300-token instruction block, the "≤2 forced calls
  before the first file read" ceiling, and the Cursor `alwaysApply` tension
  are unwritten. Only the one sentence that had gone stale is fixed.
- **≤16 tools.** Twenty. The four remaining candidates are named in OQ-059
  rather than removed by guesswork — three of them are consolidations the
  plan does not ask for, and inventing them to hit a number is how a budget
  becomes a fiction.
- **`memory_read` limit** (⑴'s last clause) is not added.
- **No real-client compat pass.** The `toolResult` double serialisation stays
  until Claude Code, Codex and Cursor have been tried against it — the plan
  makes that a precondition, and this machine has run none of them.
