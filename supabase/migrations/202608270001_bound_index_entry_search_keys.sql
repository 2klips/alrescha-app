begin;

-- search_key can contain a whole normalized symbol/document vocabulary and
-- exceed PostgreSQL's per-entry B-tree limit. Hosted MCP loads workspace rows
-- by tenant/repository and performs ranking in memory, so only those bounded
-- columns belong in the database access index.
drop index if exists public.index_entries_workspace_repository_search_idx;

create index index_entries_workspace_repository_idx
  on public.index_entries(workspace_id, repository_id);

commit;
