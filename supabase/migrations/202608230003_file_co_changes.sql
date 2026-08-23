-- File co-change counts (Phase 3 Wave B todo 4, CBM FILE_CHANGES_WITH).
--
-- Push webhooks already carry each commit's touched paths, so co-change
-- coupling is nearly free server-side: every pair of files changed by the
-- same commit increments a counter. Only paths and counts persist — never
-- diffs or contents. The map derives display edges from counts at read time
-- (threshold in the loader), so no `edges` rows and no relation growth here.
--
-- Replay safety: the caller only records counts for deliveries that were
-- INSERTED (webhook dedup by delivery id), so replaying a stored delivery
-- cannot double-count.

create table public.file_co_changes (
  workspace_id text not null,
  repository_id text not null,
  path_a text not null,
  path_b text not null,
  change_count integer not null default 1,
  last_commit_sha text not null,
  updated_at timestamptz not null default now(),
  constraint file_co_changes_pair_order check (path_a < path_b),
  constraint file_co_changes_count_positive check (change_count > 0),
  constraint file_co_changes_commit_sha check (last_commit_sha ~ '^[0-9a-f]{40}$'),
  constraint file_co_changes_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  primary key (workspace_id, repository_id, path_a, path_b)
);

create index file_co_changes_workspace_repository_count_idx
  on public.file_co_changes(workspace_id, repository_id, change_count desc);

alter table public.file_co_changes enable row level security;
alter table public.file_co_changes force row level security;

create policy file_co_changes_select_member on public.file_co_changes
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

-- Tables created after the blanket grants must name their roles themselves
-- (Wave 1 service_role gap, Wave A authenticated gap — both live findings).
grant select on public.file_co_changes to authenticated;
grant all on public.file_co_changes to service_role;

-- commits: [{ "sha": "<40hex>", "paths": ["a.ts", "b.ts", ...] }, ...]
create or replace function public.record_push_co_changes(
  target_workspace_id text,
  target_repository_id text,
  commits jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  commit jsonb;
  recorded integer := 0;
begin
  for commit in
    select jsonb_array_elements(coalesce(commits, '[]'::jsonb))
  loop
    if commit->>'sha' !~ '^[0-9a-f]{40}$' then
      continue;
    end if;
    if jsonb_array_length(coalesce(commit->'paths', '[]'::jsonb)) < 2
      or jsonb_array_length(coalesce(commit->'paths', '[]'::jsonb)) > 50 then
      continue;
    end if;

    insert into public.file_co_changes (
      workspace_id, repository_id, path_a, path_b, change_count, last_commit_sha
    )
    select
      target_workspace_id, target_repository_id,
      least(a.path, b.path), greatest(a.path, b.path), 1, commit->>'sha'
    from jsonb_array_elements_text(commit->'paths') as a(path)
    cross join jsonb_array_elements_text(commit->'paths') as b(path)
    where a.path < b.path
    on conflict (workspace_id, repository_id, path_a, path_b)
    do update set
      change_count = public.file_co_changes.change_count + 1,
      last_commit_sha = excluded.last_commit_sha,
      updated_at = now();

    recorded := recorded + 1;
  end loop;
  return recorded;
end;
$$;

revoke all on function public.record_push_co_changes(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_push_co_changes(text, text, jsonb) to service_role;
