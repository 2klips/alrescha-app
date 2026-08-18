-- Dependency-audit uploads (Phase 2C todo 1).
--
-- Arr collects `npm audit --json`; it does not scan. The report is stored
-- verbatim so the parser stays the only interpreter and the provenance stays
-- "npm audit, as uploaded" — a scanner boundary the scope suite enforces.
-- Only the newest report per repository is read, but old ones are kept so a
-- reader can see when a vulnerability first appeared.

create table public.dependency_audit_reports (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  repository_id text not null,
  commit_sha text,
  report jsonb not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  constraint dependency_audit_reports_id_ulid
    check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint dependency_audit_reports_commit_sha
    check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  constraint dependency_audit_reports_repository_tenant_fk
    foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade
);

create index dependency_audit_reports_latest_idx
  on public.dependency_audit_reports(workspace_id, repository_id, uploaded_at desc);

alter table public.dependency_audit_reports enable row level security;
alter table public.dependency_audit_reports force row level security;

create policy dependency_audit_reports_select_member
  on public.dependency_audit_reports
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy dependency_audit_reports_insert_member
  on public.dependency_audit_reports
  for insert to authenticated
  with check ((select public.is_workspace_member(workspace_id)));

grant select, insert on public.dependency_audit_reports to authenticated;
