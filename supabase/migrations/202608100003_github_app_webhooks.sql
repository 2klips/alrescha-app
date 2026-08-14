create table public.github_available_repositories (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  installation_id text not null,
  github_repository_id bigint not null,
  full_name text not null,
  default_branch text not null default 'main',
  observed_at timestamptz not null default now(),
  constraint github_available_repositories_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint github_available_repositories_installation_tenant_fk
    foreign key (workspace_id, installation_id)
    references public.github_installations(workspace_id, id) on delete cascade,
  constraint github_available_repositories_workspace_installation_repo_unique
    unique (workspace_id, installation_id, github_repository_id)
);

create index github_available_repositories_workspace_installation_idx
  on public.github_available_repositories(workspace_id, installation_id, full_name);

create table public.github_webhook_deliveries (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  delivery_id text not null unique,
  event text not null,
  action text,
  conclusion text,
  commit_sha text not null,
  payload_digest text not null,
  received_at timestamptz not null default now(),
  constraint github_webhook_deliveries_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint github_webhook_deliveries_event check (event in ('push', 'check_run', 'workflow_run')),
  constraint github_webhook_deliveries_commit_sha check (commit_sha ~ '^[0-9a-f]{40}$'),
  constraint github_webhook_deliveries_payload_digest check (payload_digest ~ '^[0-9a-f]{64}$'),
  constraint github_webhook_deliveries_repository_tenant_fk
    foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade
);

create index github_webhook_deliveries_workspace_repository_received_idx
  on public.github_webhook_deliveries(workspace_id, repository_id, received_at desc);

alter table public.github_available_repositories enable row level security;
alter table public.github_available_repositories force row level security;
alter table public.github_webhook_deliveries enable row level security;
alter table public.github_webhook_deliveries force row level security;

create policy github_available_repositories_select_member
  on public.github_available_repositories
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy github_webhook_deliveries_select_member
  on public.github_webhook_deliveries
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.github_available_repositories, public.github_webhook_deliveries to authenticated;
grant all on public.github_available_repositories, public.github_webhook_deliveries to service_role;
