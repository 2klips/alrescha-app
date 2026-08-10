alter table public.artifacts
  add column classification text not null default 'spec',
  add column source_blob_sha text,
  add column size_bytes integer not null default 0,
  add column exported_symbols jsonb not null default '[]'::jsonb,
  add column last_seen_commit_sha text,
  add constraint artifacts_classification check (
    classification in ('agents', 'claude', 'skill', 'cursor_rule', 'spec', 'adr', 'todo_progress', 'code_metadata')
  ),
  add constraint artifacts_source_blob_sha check (source_blob_sha is null or source_blob_sha ~ '^[0-9a-f]{40}$'),
  add constraint artifacts_size_nonnegative check (size_bytes >= 0),
  add constraint artifacts_last_seen_commit_sha check (
    last_seen_commit_sha is null or last_seen_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  add constraint artifacts_workspace_repository_path_unique unique (workspace_id, repository_id, path);

alter table public.artifacts alter column classification drop default;

create table public.repository_scan_skips (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  commit_sha text not null,
  path text not null,
  reason text not null,
  detail text not null,
  observed_at timestamptz not null default now(),
  constraint repository_scan_skips_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint repository_scan_skips_commit_sha check (commit_sha ~ '^[0-9a-f]{40}$'),
  constraint repository_scan_skips_reason check (reason in ('binary', 'oversized', 'submodule', 'symlink')),
  constraint repository_scan_skips_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  constraint repository_scan_skips_workspace_repository_commit_path_unique
    unique (workspace_id, repository_id, commit_sha, path)
);

create index repository_scan_skips_workspace_repository_commit_idx
  on public.repository_scan_skips(workspace_id, repository_id, commit_sha);

alter table public.repository_scan_skips enable row level security;
alter table public.repository_scan_skips force row level security;

create policy repository_scan_skips_select_member
  on public.repository_scan_skips for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.repository_scan_skips to authenticated;
grant all on public.repository_scan_skips to service_role;
