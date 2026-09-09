# Phase 4 · Wave A · todo 5 — todo identity, the scan wedge, and event scoping

**Date:** 2026-09-05 · **Scope:**
`packages/core/src/parser/markdown.ts` (task markers),
`packages/core/src/progress/todos.ts` (identity, truncation, nesting),
`packages/core/src/ingest/local-ingest.ts` (strict schema),
`supabase/migrations/202609050004_todo_identity_and_event_scope.sql`,
`tests/todo-identity.test.ts`, `tests/e2e/local-ingest-card.spec.ts`.

## The four failures the audit reproduced

1. **A checkbox's identity was its byte offset.** Inserting three lines above
   a list renamed every todo below it. The audit measured one id of ten
   surviving a three-line insert — and *that* one was reattached to a
   different item.
2. **`progress_events.todo_id` had no ON DELETE.** An agent that logged
   progress against a todo and then edited the document left a foreign key
   violation that failed the scan — and every scan after it. A permanent
   wedge from one ordinary edit.
3. **The 240-character title CHECK rolled back the whole scan.** This
   repository's own plan has eighteen checkbox items over 1,000 characters,
   so parsing its own checkboxes would have wedged its own ingest.
4. **`[~]`, `[/]` and `[-]` were not todos at all**, and nested items lost
   their nesting.

`findings.target_node_id` (⑸) and `edges.family` (⑹) were folded into the
todo 1 and todo 2 migrations as the plan allowed, so this file carries the
remaining five.

## What replaced them

**Identity is the title.** The source key is
`document:<path>:<sha256(normalised title)[16]>` with `#n` for a document that
repeats itself. Normalisation collapses whitespace and case, so a checkbox
that gets ticked, re-indented or re-wrapped is the same todo. The hash covers
the **whole** title, not the stored one, so two long items sharing a 240-character
prefix stay distinct.

The scan also *moves* an existing row onto its new key: a todo whose title
still matches keeps its id and its `created_at` even though the key scheme
changed under it. Production rows re-key themselves on the next scan rather
than being deleted and reinserted.

**Truncation replaces the mine.** The parser truncates to 240 characters
(the `MAX_RATIONALE_TEXT` precedent) and the CHECK stays as the backstop it
was meant to be.

**The wedge is nulled, not cascaded.** `on delete set null (todo_id)` — the
event keeps its own words and loses only the link. Losing a link is not worth
losing a repository's ingest.

**Markers and nesting.** `[~]` and `[/]` are in progress, `[-]` is blocked,
`[ ]`/`[x]` unchanged. GFM parses none of the three, so the markdown layer
reads the marker from the item's own first characters and reports it;
`todos.ts` decides what it means. `parent_key` carries the nesting the
document wrote.

**Events know their repository.** `access_events.repository_id` and
`progress_events.repository_id`, filled by a BEFORE INSERT trigger from the
node or todo the row already points at — nullable, because a call that named
no node belongs to no repository. A column only some writers remember to set
would be worse than none, and these rows are written from the MCP server, the
settings actions and SQL functions alike. Existing rows are backfilled by the
same derivation. This is the schema half of OQ-042; the loaders stay
workspace-flat until that question is decided.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(146 files, 1,177 passed, 1 skipped — 12 more than todo 4),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
317 files).

`tests/todo-identity.test.ts` states each acceptance criterion against PGlite
with the real migrations and the real `apply_repository_scan`:

- an unchanged document rescans to a byte-identical row set (delta 0);
- three lines inserted at the top preserve **every** id and `created_at`;
- a 300-character checkbox scans and stores a 240-character title;
- a logged progress event survives its todo being edited away — the scan
  succeeds, the event keeps its summary, its `todo_id` is null and its
  `repository_id` is the one it was written under;
- the four states and the nesting land in the right columns;
- an access event names its repository when it touched a node and says null
  when it touched none.

Two-path plan equivalence (`tests/local-ingest.test.ts`) still holds with the
new keys, statuses and `parentKey` in the payload.

## Not verified here

- **The live e2e gate is written but has never run.** `tests/e2e/local-ingest-card.spec.ts`
  gains "a pushed PROGRESS.md fills the live todo board": it pushes a document
  with all four markers through the real CLI and asserts one card in each of
  the four columns plus the unmeasured-coverage copy. `npx playwright test
  --list` sees it; running it needs the local Supabase stack, and this machine
  has no Docker daemon. **It owes a run**, together with every other e2e spec
  Waves A0–A4 touched.
- **`todoFiles` / `progressDocs`** are stored (todo 4) and still not read by
  `classifyArtifactPath`, so a repository that keeps its list in `BACKLOG.md`
  is not recognised yet. That is the recognition-rate half of R5 §4.4 and it
  is not in this todo's scope; it needs a decision about whether a declared
  todo file overrides the filename convention.
- **Requirement-linked todos** (`todos.requirement_id`) are untouched: nothing
  writes them, and the audit's "evidence-based done" bar (R5 §4.4) is a Wave D
  question, not a schema one.

> **정정(2026-09-09):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제
> 상태는 [e2e-debt.md](e2e-debt.md)에 있다 — 재실행 기준 **149 passed /
> 1 skipped**.
