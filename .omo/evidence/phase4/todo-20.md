# Phase 4 · Wave D · todo 20 — a page is the face of a node

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/docs/doc-page.ts` (new), `packages/core/src/index.ts`,
`supabase/migrations/202609060010_doc_pages.sql` (new),
`tests/doc-pages.test.ts` (new), `tests/helpers/database.ts`.

**The gate.** Todo 20 is the one Wave D item behind G3 (AI credits/keys). The
deterministic half — the schema, the slug rule, the skeleton builder, the
citation validator and the conditional prose writer — is here and tested. The
`docpage` job that actually calls a model, the `/app/docs` screens and the
three MCP tools are not, and no page prose has been generated once.

## Which scopes get a node of their own

A file, a directory and a concept already *are* nodes. Giving each a second
one would double the graph and make "which node is this file" a question with
two answers, so their page attaches by `anchor_node_id`. Only `module`,
`feature` and `repo` describe something the graph has no node for, so only
those three become `graph_nodes(kind='doc_page')` — with the page row and the
node row sharing an id. A CHECK holds the two shapes apart from both
directions: an attached scope must anchor, a node scope must not.

## Address and identity are different things

The plan's slug rule — md5 over the sorted set of member **directories** — is
right for the three scopes that *are* a member set: a module gains and loses
files constantly and changes shape rarely, so hashing the files would rename
its page on every commit and break every link to it.

Building it surfaced two things the rule alone does not cover:

- **It collides for attached scopes.** Two files in one directory hash the
  same. Their address is their own identity instead — a path, a concept name
  — and the scope is inside the hash either way, so a module page and a file
  page over the same directory are two addresses rather than a conflict.
- **A slug cannot find a page whose shape just changed.** Looking a module up
  by its new slug finds nothing and creates a *second* page. `identity_key`
  is the stable half (the same `module:<smallest member>` key
  `module_summaries` already uses); the slug is the address, and when it
  moves the old one joins `previous_slugs` so a bookmarked URL still answers.

One rule, two implementations — the lesson `next_route_url` and `bestHome`
already carry — so the SQL and the TypeScript are pinned against each other
over four member sets and both scope shapes.

## Free skeleton, billable prose, conditional write

`docskeleton` joins `scan` and `analyze` as a deterministic kind: the
`jobs_deterministic_zero_credit` CHECK and `enqueue_job` both refuse a
non-zero cost for it. `docpage` joins the billable kinds beside `enrich`.

`apply_doc_page_skeletons` never touches prose. A free pass that erased paid
work would make every rescan a way to lose it, and a test says so.

`apply_doc_page_prose` is conditional on the member digest the generation
started from — the same rule `apply_artifact_summaries` has followed since
step S1 — and reports four outcomes rather than a count (보완 R-02):
`applied`, `superseded`, `missing`, `invalid`. A `superseded` result is
**not** an instruction to call the model again: re-running on every miss
would turn a busy repository into an unbounded bill, and the
no-charge/idempotent rule is what stops it. A write that cannot be made
conditional — no slug, or no digest — is `invalid` rather than applied
unconditionally.

## Citations are checked against a candidate set

The skeleton lists the nodes on the other end of every edge that touches a
member. A page may cite those and nothing else. A model that cites something
plausible and absent produces a dangling link, which is the failure that
makes generated documentation worse than none — and a neighbour the read did
not carry is dropped from the candidate set rather than offered, so the
absence cannot become a citation either.

The prose validator also refuses a code fence, a verbatim member line
(WORK_SPEC §3-3), a page under 80 or over 4,000 characters, and any line over
200. `summary_grade` is a CHECK that only accepts `inferred`: there is no
verified page.

**Backlinks are deliberately not stored.** They are a reverse lookup at read
time. Storing them would mean every new page invalidates the pages that now
point at it, and a cache that must be swept on every write is worse than a
query.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces),
`node --import tsx scripts/verify-scope-boundaries.ts`, `npx vitest run` —
numbers in the session report.

`tests/doc-pages.test.ts` (23): the slug rules and the node-scope list; the
skeleton's relation counts, citation candidates and symbol names, including a
neighbour the read did not carry; the validator's six refusals; and on real
PostgreSQL — SQL/TypeScript slug equivalence over four member sets and two
scope shapes, a module keeping its slug when it gains a file, remembering the
old name when the shape changes, one graph node for the module page and none
for the attached one, both directions of the anchor CHECK, prose stored only
when the members have not moved, `missing` told from `invalid`, prose
surviving a later skeleton pass, and the zero-credit refusal for
`docskeleton` beside a billable `docpage`.

## Not done

- **The `docpage` worker job.** Nothing calls a model, so no page has prose
  in production. The enrich lifecycle it would follow exists; wiring it is
  the next concrete step and it needs G3.
- **The `docskeleton` worker job.** The applier and the builder are here; no
  handler assembles skeletons from stored rows and calls them. That part
  needs no gate and is the cheapest remaining piece.
- **`/app/docs` and `/app/docs/[slug]`.** No screen, and no redirect from a
  `previous_slugs` entry — the column is written and nothing reads it yet.
- **`get_doc_page`, `list_doc_pages`, `request_docs`.** Not registered. The
  plan puts them inside todo 22's tool budget, which has not been spent yet.
- **Module pages as the far-collapse supernode's label and prose.** The map
  still labels a collapsed cluster from the directory node.
- **No live run.** The acceptance asks for one repository page, five module
  pages and three feature pages of real prose. Zero have been generated.
- **`feature` scope has no producer.** The schema and the slug rule accept
  it; nothing decides what a feature *is* yet, so only `module`, `file` and
  the other anchored scopes have a caller in sight.

---

# 2026-09-14 — the skeleton pass runs, and the pages have a face

**Scope:** `apps/worker/src/{doc-skeleton-job,postgres-doc-store}.ts` (new),
`apps/worker/src/{queue,analysis-job,run-local,index}.ts`,
`apps/web/lib/docs/doc-pages-report.ts` (new), `apps/web/app/ui/doc-pages.tsx`
(new), `apps/web/app/app/(shell)/docs/{page,[slug]/page}.tsx` (new),
`apps/web/lib/strings/{docs,common,terms,index}.ts`,
`apps/web/app/ui/shell-nav-data.ts`, `apps/web/app/styles/screens/docs.css`
(new), tests below. No migration: everything here calls what
`202609060010_doc_pages.sql` already installed.

**Still behind G3.** No model has been called; `docpage` has a registered
handler that throws "no producer yet" so a queued job fails loudly instead of
vanishing. The checkbox stays open — see "Not done" at the end.

## The `docskeleton` job

`buildDocSkeletonPages(rows, commitSha)` is pure over the rows the scan and
the analysis already wrote — artifact paths, blob shas, exported symbol
*names*, directories, edges, node labels — and produces:

- one `repo` page (identity `repo:<full name>`, every artifact a member);
- one `module` page per cluster from `deriveModuleClusters` over the stored
  `imports`/`calls` edges — the same clusters `explain_module` and the map's
  module card read, so the three surfaces cannot disagree about what a
  module is. Its identity is the cluster key and its member digest is
  `moduleMemberDigest` over the members' blob shas, which is what makes a
  later `apply_doc_page_prose` conditional on the same thing the module
  summary is conditional on;
- one `directory` page per directory that has at least one file under it,
  anchored to the directory node. An empty folder gets no page: a face with
  nothing behind it.

`contains` edges are excluded from every page's relations and citations —
hierarchy is not a relationship a page should describe. There is no body
column in any of the reads, and the real-PostgreSQL test asserts the stored
pages never contain a signature.

The handler refuses to run before any artifact is stored ("docskeleton ran
before any artifact was stored") rather than writing an empty repository
page, and records the job's commit only when it is a 40-hex sha — a payload
it cannot verify becomes `source_commit_sha = null`, not a lie.

**Chaining.** `createAnalysisJobHandler` gained an optional
`enqueueDocSkeleton`; `run-local.ts` wires it to
`PostgresDocSkeletonStore.enqueueDocSkeleton`, which calls `enqueue_job` with
cost 0 and idempotency key `docskeleton:<repository>:<sha>` — so a re-run of
the analysis for the same commit is one skeleton job, not two, and the
`jobs_deterministic_zero_credit` CHECK is what refuses a cost if anyone
ever passes one. The enqueue happens after `publishAnalyzedCommit`, so a
skeleton never runs over a half-published analysis.

## `/app/docs` and `/app/docs/[slug]`

Read as the signed-in member through the session client; `doc_pages_select_member`
decides visibility. The loader (`doc-pages-report.ts`) is field-tolerant: a
malformed citation drops itself, not the page, and an unknown scope drops
the row rather than crashing the list.

**The prose is served only under the digest it was written for.** A page
whose `summary_member_digest` no longer equals `member_digest` has *stale*
prose — the screen names that ("산문이 이전 멤버 구성 기준이라 현행으로 싣지
않습니다") in the summary slot and does not render the text. A page with no
prose says "산문 없음". The two absences are different sentences because
they call for different actions. Current prose renders under the `inferred`
badge and nothing else; no path on the page can produce a `verified` badge.

**The old address follows the page.** `/app/docs/<slug>` looks the slug up;
if nothing answers, it looks in `previous_slugs` and issues a permanent
redirect to the current slug. A slug that is not 32 hex characters, or that
nobody has answered to, is a 404. Backlinks are the read-time reverse
lookup the 2026-09-06 note promised: pages whose `cited_node_ids` contain
this page's node (its own id for node scopes, its anchor for attached ones).

The route sits in the sidebar's 기록·자산 group as `문서` and is not one of
the primary tabs. Copy is in `lib/strings/docs.ts` and the module is
enrolled in the Korean-first sweep; `export` joined the conventional English
terms because the page lists a file's export *names* and the word is the
name of the thing.

## Verification

- `pnpm lint` clean · `pnpm typecheck` clean (root + 6 workspaces) ·
  `verify-scope-boundaries.ts` PASS (12 boundaries, 381 files) ·
  `git diff --check` clean · `pnpm test` 202 files / 1,864 passed /
  1 skipped.
- `apps/worker/src/doc-skeleton-job.test.ts` (8): the page set for a
  fixture repository (repo, one module of two, two directories, no page for
  the empty folder), anchors by scope, names-and-counts only with the
  hierarchy excluded, the digest equal to `moduleMemberDigest` and moving
  when a blob moves, no pages for an empty repository, the handler's
  refusal before any artifact, the null commit for an unverifiable payload,
  the `docpage` placeholder's loud failure.
- `tests/doc-skeleton-store.test.ts` (3, PGlite, real migrations): the
  three pages written from stored rows with a `doc_page` graph node for the
  module and an anchor for the directory, no body anywhere; a second pass
  idempotent (same slugs, nothing renamed, `{renamed: 0, written: 0}` for an
  empty batch); one free `docskeleton` job per commit under the idempotency
  key.
- `apps/web/lib/docs/doc-pages-report.test.ts` (5) and
  `apps/web/app/ui/doc-pages.test.tsx` (4): prose state, field-tolerant
  skeleton reads, list order, the empty state, row attributes, the badge
  discipline, the two absences.
- `tests/e2e/docs-pages.spec.ts` (1, live): a real scan of
  `fixtures/drifted-demo` → the worker's builder → `apply_doc_page_skeletons`
  (12 pages) → `apply_doc_page_prose` for the repository page and the
  session module (the module cites the repository page) → the module gains
  a member in a new directory (`renamed: 1`) → the list shows the repository
  page current and the module stale; the module's **old** slug redirects to
  its new one and the page names the stale prose without serving it; the
  repository page shows its prose under `inferred` with the module page as a
  backlink and an export name without a signature; an unknown slug is 404;
  both themes axe colour-contrast **0 violations** —
  [`todo-20/axe-contrast-doc-page-{dark,light}.json`](./todo-20/),
  screenshots [`todo-20/doc-page-{dark,light}.png`](./todo-20/) and
  [`todo-20/docs-list-light.png`](./todo-20/docs-list-light.png).

## Not done (the checkbox stays open)

- **The `docpage` producer** — nothing calls a model; the handler exists
  only to fail loudly. Needs G3, then the enrich lifecycle
  (`apply_doc_page_prose` is ready for it).
- **No live run** — the acceptance's repo 1 + module 5 + feature 3 prose
  pages: zero generated. The e2e's prose is a fixture applied through the
  real conditional write, not a model's.
- **`get_doc_page`, `list_doc_pages`, `request_docs`** — not registered
  (todo 22's tool budget).
- **`feature` scope** — no producer; the screens render it if a row exists.
- **Module pages as the far-collapse supernode's label and prose** — the
  map still labels a collapsed cluster from the directory node.
- **Production `docskeleton` needs a worker redeploy** — the handler is in
  `run-local.ts`; until Fly ships it, an analysis that enqueues a
  `docskeleton` job leaves it queued (cost 0), which the drain loop will
  pick up once the new worker is live.

---

# 2026-09-15 — the first production skeleton pass collided on its own slug

**Scope:** `supabase/migrations/202609150001_doc_page_slug_identity.sql`
(new), `packages/core/src/docs/doc-page.ts`,
`apps/worker/src/postgres-doc-store.ts`, `tests/doc-pages.test.ts`,
`tests/doc-skeleton-store.test.ts`, `tests/helpers/database.ts`. Rollout
record: [`pr19-22-production-rollout-2026-09-15.md`](./pr19-22-production-rollout-2026-09-15.md).

## What happened

PR #21 shipped, the worker redeployed, and the first `docskeleton` job on
the pilot (`01M2JN34NV8ZWMFJN2XQFPNHHX`, 2026-09-15T13:46Z) failed at
attempt 3, cost 0:

```
duplicate key value violates unique constraint "doc_pages_workspace_repository_slug_unique"
```

Codex's read-only reproduction over production metadata: 173 pages (repo 1,
module 21, directory 151) and one duplicate group — the modules
`scripts/adr-guardrails.ts` (6 members) and
`scripts/verify-plan-coverage.ts` (3 members), both spanning exactly
`scripts/` and `tests/`, both slug `100afb35…`. `/app/docs` stayed at the
empty state; the acceptance for the list and page could not run.

## Why

The 2026-09-06 address rule hashed a node-scoped page from its member
**directories** alone, on purpose: adding a file must not rename the page.
The 2026-09-06 note already found that rule collides for attached scopes
(two files in one directory) and moved those to their identity. It did not
see that it collides for modules too: two clusters over the same directory
set is ordinary — every `scripts/x.ts` + `tests/x.test.ts` pair is one —
and nothing in the fixtures had two of them. The identity key was already
what told the rows apart (`doc_pages_workspace_repository_identity_unique`);
it simply was not in the address.

## The fix

The identity joins the hash for the three node scopes
(`scope\nidentityKey\ndirectories`); attached scopes are unchanged (their
identity was the whole address). The directories stay in, so the rules the
tests pin still hold: a module that gains a file in a directory it spans
keeps its address, a module that spans a new directory gets a new one and
keeps the old in `previous_slugs`. Both implementations changed together —
the SQL in the migration, the TypeScript in `doc-page.ts` — and the
equivalence test still pins them against each other over the same member
sets. New pins: two modules over one directory set are two addresses
(TypeScript), and `apply_doc_page_skeletons` stores both without touching
the unique constraint (real PostgreSQL, the pilot's exact shape).

The migration also re-addresses any page stored under the old rule and
appends its old slug to `previous_slugs`. Production holds none — the pass
that would have written them is the one that failed — so on production the
statement is a no-op; a local database may carry a few.

## Asking for the pass again

`enqueue_job` returns the existing row for a repeated key whatever its
status, so after the terminal failure the rescan Codex ran after the
deploy was handed the same dead job back, and would have been forever.
`enqueueDocSkeleton` now mints the key through `next_retry_idempotency_key`
— the 2026-09-02 rule judgments and coaching already follow: a terminal
failure yields `…:r1` on the next analysis, a queued/running/succeeded pass
is returned as is, and the failed rows stay what they are and still count
in `ops:health`. Recovery is therefore one more rescan after the worker
redeploys, with no manual change to the failed job.

## Verification

`tests/doc-pages.test.ts` (25): the two new pins above, the SQL/TypeScript
equivalence, slug kept on a new file, renamed on a new directory, both
anchor shapes, the conditional prose write. `tests/doc-skeleton-store.test.ts`
(4): the retry generation after a terminal failure, a live retry returned
rather than a third row, a succeeded pass never redone. The migration
applied to the local Supabase (PostgreSQL 17) and the two pilot module
shapes hash differently there; `tests/e2e/docs-pages.spec.ts` re-run
against it. Full gates in the handoff.

The checkbox stays open for the same reasons as before (G3, the MCP tools,
`feature`, the far-collapse label) plus the production acceptance that is
now a second rescan away.

---

# 2026-09-15, later — the migration applied, and the pages exist on production

**Scope:** nothing in this tree. This section records the production
observation of the acceptance items the morning's section left "a second
rescan away". Codex's records:
[`pr23-production-rollout-2026-09-15.md`](./pr23-production-rollout-2026-09-15.md),
[`docs/frontend/logs/2026-09-15-pr23-production-verification.md`](../../../docs/frontend/logs/2026-09-15-pr23-production-verification.md).

## The migration

Ledger before: 66 applied, latest `202609130001`, every applied checksum
matching the checkout, `202609150001_doc_page_slug_identity.sql` the only
pending file. `doc_pages` before: **0 rows**, so the re-addressing UPDATE
touched nothing, as predicted. `Applied: 202609150001_doc_page_slug_identity.sql`,
exit 0, ledger timestamp 14:27:43Z, with the nested-transaction warnings the
handoff described. Read-only postcheck: two module identities over the same
directory set now hash to two slugs.

## The skeleton pass

PR #23 merged as `3866daa` at 14:28:26Z; Fly v22 started 14:29:07Z. The
first `docskeleton` job on the merged head — key
`docskeleton:<repo>:3866daa…`, created 14:30:19Z — **succeeded at attempt 1,
cost 0**, completed 14:31:50Z. The base key, not `:r1`: the merged head had
no prior failure to retry, so the retry generation was never asked for.
Codex checked read-only that `next_retry_idempotency_key` for the old failed
head `e53b36b` returns its `:r1` key and did not enqueue it — that head is
superseded, and a pass for it would prove nothing
`tests/doc-skeleton-store.test.ts` does not already pin. The `…:r1`
execution on production is therefore not an observed event, and this note
does not claim it.

The operator's one rescan at 14:40Z (after main CI) re-ran analyze on the
same head and was handed the succeeded skeleton row back — one job per
commit, as designed; no second skeleton was needed.

## The pages

`/app/docs`: **173** rows — repo 1, module 21, directory 151 — the census
the failed pass had computed that morning; every row `data-prose="missing"`
and `산문 없음`, zero `verified` badges. The formerly colliding module
`scripts/adr-guardrails.ts` opens: 6 members, 15 export names, commit
`3866daa`, references 65 · calls 5 · imports 5 · tests 3, no prose, no
badge. A made-up address answers `404 · 알 수 없는 경로`. Read-only check at
14:35:01Z: all 173 pages reference the merged head, none has prose or a
verified grade. The collision does not reproduce.

## What the count in `ops:health` actually was

The handoff expected `docskeleton failed 1` to remain. It is **3**: two more
skeleton passes had failed the same way on PR #23's own branch heads
(`b075e42` at 14:18Z, `5e6c8ea` at 14:21Z) — the v21 worker ran the old slug
function on every pushed head while the fix was in review. All three predate
the migration (14:27:43Z), all three stay as they are, and the 7-day WARN
went from the morning's 16 to 18 for exactly those two. Zero jobs failed
after the migration. The prediction was wrong about the count, not about
the rule: failed rows are not repaired, and they count.

## Still open (the checkbox stays open)

The production acceptance for the deterministic half is met: skeleton job at
0 credits, list, page, redirect rule, 404. The reasons of 2026-09-14 remain
— G3 is closed, so the `docpage` producer and the live prose run (repo 1 +
module 5 + feature 3) are at zero; the three MCP tools are unregistered
(todo 22's budget); `feature` has no producer; the far-collapse label is
unchanged. None of them moved today.
