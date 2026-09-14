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

> **정정(2026-09-07):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제 상태는 [e2e-debt.md](e2e-debt.md)에 있다.


---

## 2026-09-14 — the screens catch up with the model (⑵ ⑶ ⑷ rendered, dismissal has a button)

**Scope:** `apps/web/app/ui/{progress-dashboard,inspection-view}.tsx`,
`apps/web/app/app/(shell)/inspection/{actions,page}.tsx`,
`apps/web/lib/strings/{inspection,progress}.ts`,
`apps/web/app/styles/screens/{inspection,progress}.css`,
`apps/web/lib/inspection/fixtures.ts`, `tests/e2e/inspection-dismiss.spec.ts`
(new), `tests/e2e/{inspection,progress}.spec.ts`,
`apps/web/app/ui/{progress-dashboard,inspection-view}.test.tsx`.

The 2026-09-06 pass stopped at the view model: `digest`, `attention`, the
finding `detail` and the `dismissed` section were computed and typed, and no
component read any of them — `apps/web/app` had no `dismiss` in it. This
closes that gap. Nothing new is computed on a screen; every number and
sentence below comes from the model the earlier pass tested.

### `/app/progress` — what moved, and what is stuck

Three windows under the metrics: today, the last seven days, and since this
member last opened the screen. The third is the one that needed a decision:
a viewer with no visit record does not get a zero, because "nothing since
your last visit" and "you have never been here" are different facts and the
model already distinguishes them with `null`. The window says so in a
sentence (`data-total="never-visited"`). Each window shows the total the eye
lands on first, the split (진행 · commit · 해소), and up to six of the refs
the counted entries named.

Below it, the attention list: stale in-progress items and blocked items,
oldest first as the model orders them. A blocked item's reason is whoever
blocked it, in their words; a checkbox nobody explained carries the model's
`NO_STATED_BLOCKER` marker, which the screen renders as `사유가 기록되지
않았습니다` with `data-stated="false"` rather than an empty line — the case
worth surfacing, not the case worth hiding. Stale items show the label and
their last change date; the screen never prints an English sentence from
the model.

### `/app/inspection` — the detail, and a decision that stays visible

Every finding row that carries stored provenance now shows it: the spans
(`docs/auth.md:12`), the rule's confidence beside its evidence grade (a
deterministic rule is `inferred`; the badge says so), the reason, the
suggested action, the evidence nodes. A row without provenance shows
nothing extra — the demo's `finding-claim` proves the block is absent, not
empty.

The `제외한 문제` widget is the eighth on the board. It lists dismissed
findings with their detail and their reason, and it is the one widget whose
empty state is not `증거 부족`: a board with no dismissals is not short of
evidence, so the `Widget` learned an `emptyCopy` and the demo's empty state
still counts seven insufficient widgets.

The dismiss control lives in the live-only judgment panel beside each open
finding's `AI 확정` button: a reason input (`required`, ≤400 chars) and
`제외`. `dismissFinding` runs `dismiss_finding` as the signed-in member —
security invoker, so RLS decides what this person may touch and the
database insists on the reason — and echoes the function's own status words
(`already-resolved`, `not-found`) as a status line instead of a stack
trace. The reason is checked before any client is created.

### Verification

- `tests/e2e/inspection-dismiss.spec.ts` (new, live workspace): a finding
  seeded the way the analyze job writes it → its detail is on the screen
  (`spec.md:3`, `확신 50%`, the action) → the reason is typed into the
  product's form → `?dismiss=done` → the finding is in the dismissed board
  with the reason and the count, gone from the open list and the judgment
  panel → the row reads `status: dismissed`, `dismissed_by` = this user,
  `dismissed_reason` = the typed text. Screenshot
  [`todo-19/inspection-dismissed.png`](todo-19/inspection-dismissed.png).
- `inspection.spec.ts` (demo): eight widgets with sources, the dismissed
  reason visible, `docs/auth.md:12` on the findings widget; the empty state
  still says 증거 부족 in exactly seven. `progress.spec.ts` (demo): the third
  window is `never-visited`, the blocked todo is listed with the reason its
  event stated.
- vitest: `progress-dashboard.test.tsx` +4 (windows and counts, the visit
  record, stale/blocked with the unstated marker, the empty attention
  copy), `inspection-view.test.tsx` +3 (detail present and absent, the
  dismissed board apart from the open list, the empty copy). Korean-first
  and legacy-palette sweeps green.
- Two-theme axe (`a11y-contrast.spec.ts`) and the keyboard sweep — counts in
  the session report; the demo's dismissed entry and detail block are in
  the audited surface.

### Still open

- **⑴ concept summary · module card · concept MCP exposure** — the one
  numbered item with no work in this commit; next on this branch.
- The dismiss form is on the live page only. The demo route shows the board
  and the detail but cannot write, which is the correct shape for a fixture.
- `touch_screen_view` still stamps during the page load (unchanged).


---

## 2026-09-14 — ⑴ the concept layer reaches the tools, and the inspector gets its cards

**Scope:** `packages/mcp/src/{store,graph-tools,data-brain,local-workspace}.ts`,
`packages/mcp/src/concepts.test.ts` (new), `packages/mcp/src/hosted.test.ts`
(catalogue ratchet), `apps/web/lib/mcp/supabase-store.ts` (+test),
`apps/web/lib/map/inspect-card.ts` (new, +test),
`apps/web/app/api/map/inspect/route.ts` (new),
`apps/web/app/ui/inspector-card.tsx` (new), `apps/web/app/ui/brain-map-stage.tsx`
(`data-node-path`), `apps/web/app/app/(shell)/map/map-screen.tsx`,
`apps/web/lib/strings/map.ts`, `apps/web/app/styles/screens/map-hud.css`,
`tests/e2e/map-inspector-cards.spec.ts` (new), `tests/korean-strings.test.ts`,
`scripts/graph-surface-benchmark/product-surface.ts`,
`scripts/bench-graph-surface.ts`, `tests/graph-surface-v3.test.ts`.

The last numbered item. v1 todo 13 asked for the inspector's file summary,
a concept summary, a module card, and the concept layer exposed through
MCP. The first was on `/app/inspection` since S5 and never on the map's own
inspector; the other three did not exist.

### Concepts, through the tools

The concept layer has been on the map since Wave C todo 7 — `graph_nodes`
of kind `concept`, edges from them with the synthesis vocabulary — and no
tool could name it. `concept` was outside `MCP_NODE_TYPES`, and every one of
`part_of`, `uses`, `depends_on`, `produces`, `configures` and `validates`
was outside `MCP_EDGE_RELATIONS`, so the Supabase decoder reported each
concept edge as "outside the MCP vocabulary" and dropped it. A layer the
screen drew that the agent could not see.

Both vocabularies grew, in the three places the 협업 규약 names at once —
`store.ts`, the hosted zod enums (built from the arrays, so they follow),
`graph-tools.ts` — and the contract test that pins the enums to the arrays
passed unchanged. What the tools do now:

- `query_brain(types: ["concept"])` lists concepts, `status: "synthesized"`
  (a concept has no lifecycle; its status names what it is), anchored to
  their first member path like the map anchors them; a relation filter
  reaches the synthesis vocabulary by name.
- `get_neighbors` walks `part_of` and `depends_on` to and from a concept,
  and reports **no omission** for them; `trace_path` crosses a concept
  between two files it groups.
- `get_artifact(id)` on a concept id falls through to the node reader and
  answers the summary with **`contentGrade: "inferred"`** — a field a file's
  content never carries, because a file's content is not prose.
- `assert_link` and `memory_write` accept a concept as an anchor.
- The hosted store reads `concepts` in the semantic band, kind-checked
  against the `concepts_kind` CHECK; the local projection carries
  `concepts: []`, the same empty answer the hosted reader gives before
  enrich.

**The catalogue ratchet moved and said so.** `hosted.test.ts` holds the
`tools/list` token cap just above the measured value (OQ-059). One node
type and six relations, paid once per input schema that carries the
relation enum, took it 3,076 → **3,131**; the cap is 3,150 now and the
comment lists this rise beside the previous four. Growth is not forbidden;
it is made to say its price.

**And the graph-surface v3 lock did its job.** `preregistration.v3.json`
pins the product catalogue digest `a3d56907…`; the catalogue that ships now
is `c76b6a5c…`. `tests/graph-surface-v3.test.ts` used to assert the live
digest equals the pin; it now asserts the opposite together with the
refusal — the same tool names in the same order, a different digest, and
`assertCatalogPinned` (the runner's check, now a named rule) throwing. The
published v3 report still audits against its own pin (`verify-benchmark-report.ts`
PASS, all four releases); a new run is a new pre-registration, which is
OQ-071's decision and not this todo's.

### The inspector's cards

Selecting a node on `/app/map` now fetches `/api/map/inspect?node=<id>`
and renders a card under the path. The route reads as the signed-in member
through the session client, so row security is the boundary, as it is for
the map loader; a node the policy hides is `not_found`, as it is on the map.
Fetched on selection rather than shipped with the map, because a summary
per node would multiply the map payload by the prose for a card the viewer
opens one at a time.

Three cards, each a rule that already existed, reused rather than restated:

- **A file** gets the shared artifact card — `inspectionArtifactCard`, the
  builder `get_artifact` and `/app/inspection` share — with its kind, unit
  and domain chips, its exported **names** (never a signature), a summary
  under the `inferred` badge when one was written for the blob the scan
  last saw, and otherwise the sentence for its state (missing · stale ·
  unknown), never an empty line. Under it, the **module** card: the
  import/call cluster the file sits in, from the same `deriveModuleClusters`
  and the same member digest `explain_module` compares, so the state is the
  one the tool would report — `ready`, `stale` (prose shown, and said to be
  from an older member set) or `pending` (nothing cached; the MCP tool
  generates it). A file in no cluster of two says so; that is a fact about
  the file, not a missing card.
- **A concept** gets its kind, its summary under the `inferred` badge, and
  its member files with the count.
- Any other node kind says it has no card.

`WORKSPACE_MAP.inspector.card` carries every sentence, in Korean; the
component is on the Korean-first sweep's list. The hit layer gained
`data-node-path` so a spec can name a file by path.

### Verification

- `packages/mcp/src/concepts.test.ts` (6): vocabulary, `query_brain`,
  `get_neighbors` with and without a relation filter and with no omission,
  `trace_path` through a concept, the node reader's `inferred` grade and
  its absence on a file, the write tools' anchors.
  `supabase-store.test.ts`: the concept row reaches its own field,
  kind-checked.
- `apps/web/lib/map/inspect-card.test.ts` (7): a file outside every cluster
  is null; pending / ready / stale by digest; the shared card's sorted
  exports and summary states; the concept card.
- `tests/e2e/map-inspector-cards.spec.ts`, live over the drifted-demo scan:
  `src/session.ts` shows `data-summary-state="missing"` with the missing
  sentence, its three export names and no `=`, and a **pending** module of
  two members (the file and its test — the first draft assumed the fixture
  had no cluster, and the card corrected it); a seeded concept shows its
  summary under exactly one `inferred` badge and both member files. Both
  themes audited with the card open, violations 0:
  [`todo-19/axe-contrast-map-inspector-card-{dark,light}.json`](todo-19/),
  screenshots [`todo-19/map-inspector-card-{dark,light}.png`](todo-19/).
- `map-panel.spec.ts`, `brain-map.spec.ts`, `a11y-keyboard.spec.ts`
  regression green after the hit-layer attribute; Korean-first and
  legacy-palette sweeps green; full vitest, lint, typecheck, scope
  boundaries, `git diff --check` — numbers in the session report.

### Closed, and what is left beside it

Todo 19 is complete: ⑴ here, ⑵⑶⑷⑸⑹ on 2026-09-06 with their screens on
2026-09-14. Not done, and not claimed: the concept search index entry type
(`index_entries` keeps its six-value CHECK, so `search_index` cannot rank a
concept — `query_brain` and the neighbours can reach it); the module card
reads `module_summaries` but offers no button to enqueue one (that is
`explain_module`'s job and the copy says so); the graph-surface v4
pre-registration that pins the new catalogue (OQ-071).
