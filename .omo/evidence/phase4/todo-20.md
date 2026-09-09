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
