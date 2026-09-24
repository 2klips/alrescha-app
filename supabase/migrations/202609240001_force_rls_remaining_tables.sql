begin;

-- Every table in this schema is meant to pair `enable row level security`
-- with `force row level security`. Eleven do not.
--
-- Three were found on 2026-09-03 (OQ-028): 202608170003_rationale_nodes.sql
-- (`rationales`), 202608240002_concept_graph.sql (`concepts`), and
-- 202608240003_module_summaries.sql (`module_summaries`) wrote only the
-- `enable` line, and production reflected exactly that: all 43 tables in
-- `public` with RLS on, only 40 with it forced (measured read-only,
-- `.omo/evidence/phase2c/followup-deployment-checklist.md`). The fix was
-- written then as 202609030002 but never merged, and the next eight tables
-- repeated the omission:
--   202609050002_directory_nodes.sql   `directories`
--   202609050005_route_nodes.sql       `routes`
--   202609060001_database_objects.sql  `db_objects`
--   202609060002_section_nodes.sql     `sections`
--   202609060008_screen_views.sql      `workspace_screen_views`
--   202609060010_doc_pages.sql         `doc_pages`
--   202609210001_symbol_nodes.sql      `symbols`, `symbol_edges`
--
-- This is not a cross-tenant hole today. `force` is the switch that applies
-- RLS to the table's OWNER; the app reaches these tables as `authenticated`
-- (policies already apply) or `service_role` (bypasses RLS either way,
-- forced or not). What the gap costs is the guarantee rather than any
-- current read: the moment anything connects as the owner — a migration, a
-- manual query, a future function that is not `security definer` — these
-- tables, and only these, would hand back every tenant's rows. Closing it
-- keeps the invariant one sentence long ("RLS enabled means RLS forced").
--
-- The writers are unaffected, and production already shows it: the eight
-- newer tables are written by `apply_repository_scan` and
-- `apply_doc_page_skeletons`/`apply_doc_page_prose`, security definer
-- functions that in the same transaction write `graph_nodes` and
-- `artifacts`, which have been forced since 202608100002; and
-- `workspace_screen_views` by `touch_screen_view`, a security invoker
-- function called as `authenticated`, which is never the owner.
--
-- The applied migrations are deliberately left untouched: `migrate.ts`
-- compares a sha256 of each applied file against its ledger row and refuses
-- a file whose checksum changed. `force row level security` is idempotent,
-- so re-applying this migration is a no-op.
alter table public.concepts force row level security;
alter table public.module_summaries force row level security;
alter table public.rationales force row level security;
alter table public.directories force row level security;
alter table public.routes force row level security;
alter table public.db_objects force row level security;
alter table public.sections force row level security;
alter table public.workspace_screen_views force row level security;
alter table public.doc_pages force row level security;
alter table public.symbols force row level security;
alter table public.symbol_edges force row level security;

commit;
