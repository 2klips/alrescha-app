# Phase 4 · Wave D · todo 19 — digests, dismissal, and one sentence for an absent description

**Date:** 2026-09-06 · **Scope:** `packages/core/src/progress/dashboard.ts`,
`packages/core/src/inspection/dashboard.ts`,
`packages/core/src/enrich/prose-summary.ts`,
`packages/core/src/brain/artifact-card.ts`, `packages/core/src/index.ts`,
`packages/mcp/src/{graph-tools,data-brain,hosted}.ts`,
`apps/web/lib/progress/progress-report.ts`,
`apps/web/lib/inspection/inspection-report.ts`,
`apps/web/lib/strings/progress.ts`,
`apps/worker/src/postgres-analysis-store.ts`,
`supabase/migrations/202609060008_screen_views.sql` (new),
`supabase/migrations/202609060009_finding_dismissal.sql` (new),
`tests/{progress-digest,screen-views,finding-dismissal,prose-absence}.test.ts`
(new), `tests/helpers/database.ts`, `tests/artifact-card.test.ts`,
`packages/mcp/src/hosted.test.ts`,
`apps/web/lib/inspection/inspection-report.test.ts`.

**This todo is a bundle of six.** ⑵, ⑶'s data layer, ⑷, ⑸ and ⑹ are done
with tests; ⑴ and the React components are not. The boundary is stated at the
bottom rather than blurred.

## ⑵ What moved since you last looked

The board answers "where does everything stand". Someone opening it after two
days is asking a different question, and had to reconstruct the answer from a
timeline that starts at the newest entry and never says where their last
visit was.

`digest{today, thisWeek, sinceLastVisit}` counts the timeline in three
windows. `sinceLastVisit` is **null** when this member has never opened the
screen — a full-history window presented as news would tell a first-time
viewer that everything ever recorded happened since they last looked.

The digest's `refs` are collected **from the entries it counted**, so it can
never name a node the timeline does not mention. That is the acceptance
criterion, and it is a property of the construction rather than a check
somebody has to remember.

`attention{stale, blocked}`: in-progress and untouched for seven days, and
blocked with the reason whoever blocked it wrote. Both lists are oldest
first — the thing that has waited longest is the thing to look at, and an
id-sorted list buries it. A blocked item nobody explained carries
`NO_STATED_BLOCKER` rather than an empty string: that is the case worth
surfacing, not the case worth hiding.

`workspace_screen_views` stores the one fact this needs, **per member** — two
people on one workspace have different last visits. `touch_screen_view`
returns the previous value *before* writing the new one; a screen that
stamped first would read its own stamp and report that nothing had happened,
every time.

**The `full` copy said too much.** It read "기록된 요구사항과 todo 모두 출처
있는 완료 증거를 가집니다" — calling `implements` edges (name matches, tier
`reference`) and checked boxes "완료 증거". Corrected to say what the state
actually is: linked and marked complete, and neither is execution.

## ⑷ A dismissal that stays dismissed

`findings.status` has allowed `dismissed` since the first migration and
nothing ever wrote it. Three things were wrong at once, and fixing any one
alone would have left it pointless:

- **No writer.** `dismiss_finding` is `security invoker` — a definer function
  here would let any caller dismiss any workspace's findings, which is
  exactly the operation someone would want to do quietly to a tenant that is
  not theirs. A member may change four columns and no others
  (`grant update (status, dismissed_at, dismissed_by, dismissed_reason)`); a
  blanket grant would have handed them the title, the confidence and the
  evidence grade.
- **The verdict was stored and never read.** `apply_successful_judgment`
  raised confidence and severity from the AI's answer and ignored the answer
  itself, so a `rejected` judgment left the finding open with *higher*
  confidence than before. It now dismisses, with the model's explanation as
  the reason, and never overwrites a decision a person already made.
- **Re-analysis undid it.** `reconcileFindings` set `status = 'open'` on
  every finding it re-derived. The rule reproducing again is not news to
  whoever dismissed it — it is why they dismissed it.

A reason is required by a CHECK constraint, because a dismissal with no
reason is indistinguishable from a finding nobody looked at. A `resolved`
finding cannot be dismissed: resolved is the stronger statement (the rule
stopped reproducing) and overwriting it with an opinion would lose a fact.

Two consequences followed and are fixed here. `FindingsDelta.openTotal`
counted the analysis's inputs, so a dismissed re-derivation would have made
the receipt claim an open finding the board does not show — it counts the
table now. And `/app/inspection` showed only open findings, so a dismissal
made a finding *vanish*; it gets its own `dismissed` section, because a
decision that cannot be looked at again is a disappearance rather than a
decision.

## ⑶ The detail was already stored

`findings.provenance` has carried `{reason, spans, suggestedAction,
evidenceLinks}` since the analyze job first ran, and the screen read a title
and a severity — enough to know something is wrong and not enough to do
anything. The loader selects them and the view model carries them, field by
field: a malformed span or a non-string evidence link is dropped on its own
rather than costing the whole finding. Anything but the stored word
`verified` reads as `inferred`, because a grade is a claim about execution
evidence and a malformed row does not get the benefit of the doubt.

## ⑸ Two blind spots on the timeline

A commit row named a sha with nowhere to take it; it links to
`/app/commits#<sha>` now. And **a local scan showed nothing at all** —
`alrescha push` writes no receipt (ADR-015 §7) and the timeline is built from
receipts, so a repository maintained entirely through the CLI had an empty
ledger while its graph was updated daily. The product looked broken to the
users doing the most work. It is a `local-scan` entry, not a commit: calling
it one would file "graph only" and "analysed" under a single label.

## ⑹ Write tools leave a trace

`log_progress` and `record_note` changed the workspace and emitted no access
event, so the live map never lit for them and the telemetry counting what a
session did counted only its reads. Both emit now, with the nodes they named.
`record_prompt` stays silent on purpose — a separate store with separate
consent, and the glow stream must never carry prompt text (ADR-004).
`record_ruled_out` also stays silent: it writes to the inspection log, not
the graph, and the plan does not list it.

## 보완 R-02 — one absence, one sentence

The freshness rule runs at the store boundary, so prose written for an older
blob never reaches a reader. It reaches them as `""`, and an empty string
with no explanation reads as "this file has nothing to say" — which an agent
acts on differently than "nobody has described this yet" or "the description
is out of date".

`summaryAbsence(state)` is the one sentence, in `prose-summary.ts` beside
`summaryState`. Three surfaces take it from there: the shared artifact card
(which had grown its own copy), `get_node_content`'s new `contentAbsence`,
and `search_index`'s new `excerptAbsence`. The test asserts all three equal
`summaryAbsence(state)` for each of `missing`, `stale` and `unknown`, and
that the three states get three different sentences — otherwise one sentence
for all of them would pass and say nothing.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces),
`node --import tsx scripts/verify-scope-boundaries.ts`, `npx vitest run` —
numbers in the session report.

New: `tests/progress-digest.test.ts` (12) for the windows, the ref property,
the ordering, the required blocked reason and the two timeline entries;
`tests/screen-views.test.ts` (7) on real PostgreSQL for read-then-stamp,
per-member isolation, per-screen separation and the RLS refusals;
`tests/finding-dismissal.test.ts` (12) on real PostgreSQL for the writer, the
required reason, the resolved refusal, the cross-tenant answer, survival
across re-analysis, and all four judgment verdicts;
`tests/prose-absence.test.ts` (5) for the three surfaces. Extended:
`packages/mcp/src/hosted.test.ts` (+1) and
`apps/web/lib/inspection/inspection-report.test.ts` (+4).

**One test-harness gap closed.** The PGlite bootstrap created schema `auth`
without granting `usage` or `execute` on `auth.uid()` to `authenticated`.
Policies worked because RLS expressions run as the table owner; a
`security invoker` function body does not. Supabase grants both, so the
harness was under-modelling production — it grants them now.

## Not done

- **⑴ is untouched.** The inspector's file summary and the shared card are
  live from S5, but the concept summary, the module card and the concept MCP
  exposure are not built. It is the one numbered item with no work in this
  commit, and it is a bundle of its own.
- **No React component work.** ⑶'s data reaches the view model and no
  component renders `detail`, the digest, the attention list or the dismissed
  section; ⑷ has no dismiss button. Every one of those has its contract and
  its data now, which is the half that can be tested here.
- **The e2e acceptance is unrun.** Playwright two-theme axe, the Korean-first
  sweep and the live `/app/progress` · `/app/inspection` runs over a real
  scan all need Docker, which this machine does not have.
- **`touch_screen_view` writes during a page load.** It is a stamp, not a
  mutation of anything a reader sees, and it is deliberately outside
  `data_revision` (OQ-051) so a read cannot invalidate its own fence. Whether
  a server component is the right place for it is a Next.js question nobody
  has ruled on here.
- **The digest counts, it does not summarise.** `sinceLastVisit` says how
  many entries; saying *what happened* in a sentence is an AI surface and
  this todo is the zero-credit bundle.
