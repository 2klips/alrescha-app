alter table public.workspaces
  add column access_event_retention_days integer default 30,
  add constraint workspaces_access_event_retention_days check (
    access_event_retention_days is null
    or access_event_retention_days between 1 and 365
  );

alter table public.github_installations
  add column revoked_at timestamptz,
  add column revocation_reason text,
  add constraint github_installations_revocation_pair check (
    (revoked_at is null and revocation_reason is null)
    or (
      revoked_at is not null
      and revocation_reason in ('deleted', 'suspend')
    )
  );

create index github_installations_active_workspace_idx
  on public.github_installations(workspace_id, updated_at desc)
  where revoked_at is null;

create table public.security_audit_events (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  actor_kind text not null,
  actor_id text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  source_key text unique,
  occurred_at timestamptz not null default now(),
  constraint security_audit_events_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint security_audit_events_actor_kind check (actor_kind in ('user', 'github', 'system')),
  constraint security_audit_events_action check (action in (
    'github_installation_connected',
    'github_installation_revoked',
    'repository_selected',
    'scan_requested',
    'index_pr_proposed'
  )),
  constraint security_audit_events_target_type_length check (char_length(target_type) between 1 and 64),
  constraint security_audit_events_actor_id_length check (actor_id is null or char_length(actor_id) <= 200),
  constraint security_audit_events_target_id_length check (target_id is null or char_length(target_id) <= 200),
  constraint security_audit_events_source_key_length check (source_key is null or char_length(source_key) <= 240),
  constraint security_audit_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint security_audit_events_metadata_bounded check (octet_length(metadata::text) <= 4096)
);

create index security_audit_events_workspace_occurred_idx
  on public.security_audit_events(workspace_id, occurred_at desc);

alter table public.security_audit_events enable row level security;
alter table public.security_audit_events force row level security;

create policy security_audit_events_select_member on public.security_audit_events
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.security_audit_events to authenticated;
grant all on public.security_audit_events to service_role;

create or replace function public.record_security_audit_event(
  target_workspace_id text,
  target_actor_kind text,
  target_actor_id text,
  target_action text,
  target_type text,
  target_id text,
  target_metadata jsonb default '{}'::jsonb,
  target_source_key text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_event_id text;
begin
  insert into public.security_audit_events (
    workspace_id, actor_kind, actor_id, action, target_type, target_id,
    metadata, source_key
  ) values (
    target_workspace_id, target_actor_kind, target_actor_id, target_action,
    target_type, target_id, coalesce(target_metadata, '{}'::jsonb), target_source_key
  )
  on conflict (source_key) do nothing
  returning id into audit_event_id;

  if audit_event_id is null and target_source_key is not null then
    select id into audit_event_id
    from public.security_audit_events
    where source_key = target_source_key;
  end if;

  return audit_event_id;
end;
$$;

create table public.workspace_security_rate_limits (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0,
  primary key (workspace_id, operation),
  constraint workspace_security_rate_limits_operation_length check (char_length(operation) between 1 and 80),
  constraint workspace_security_rate_limits_count_nonnegative check (request_count >= 0)
);

alter table public.workspace_security_rate_limits enable row level security;
alter table public.workspace_security_rate_limits force row level security;
grant all on public.workspace_security_rate_limits to service_role;

create or replace function public.consume_workspace_security_limit(
  target_workspace_id text,
  target_operation text,
  maximum_requests integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window public.workspace_security_rate_limits%rowtype;
begin
  if maximum_requests <= 0 or window_seconds <= 0 or window_seconds > 86400 then
    raise exception 'invalid security rate limit';
  end if;

  insert into public.workspace_security_rate_limits (workspace_id, operation)
  values (target_workspace_id, target_operation)
  on conflict (workspace_id, operation) do nothing;

  select * into current_window
  from public.workspace_security_rate_limits
  where workspace_id = target_workspace_id and operation = target_operation
  for update;

  if current_window.window_started_at <= clock_timestamp() - make_interval(secs => window_seconds) then
    update public.workspace_security_rate_limits
    set window_started_at = clock_timestamp(), request_count = 1
    where workspace_id = target_workspace_id and operation = target_operation;
    return true;
  end if;

  if current_window.request_count >= maximum_requests then
    return false;
  end if;

  update public.workspace_security_rate_limits
  set request_count = request_count + 1
  where workspace_id = target_workspace_id and operation = target_operation;
  return true;
end;
$$;

create or replace function public.revoke_github_installation(
  target_github_installation_id bigint,
  target_reason text,
  target_delivery_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_installation public.github_installations%rowtype;
  pending_job record;
  audit_source_key text := 'github-installation:' || target_delivery_id;
begin
  if target_reason not in ('deleted', 'suspend') then
    raise exception 'unsupported GitHub revocation reason';
  end if;

  if exists (
    select 1 from public.security_audit_events where source_key = audit_source_key
  ) then
    return 'duplicate';
  end if;

  select * into target_installation
  from public.github_installations
  where github_installation_id = target_github_installation_id
  for update;

  if not found then
    return 'unknown';
  end if;

  update public.github_installations
  set revoked_at = coalesce(revoked_at, clock_timestamp()),
      revocation_reason = target_reason,
      updated_at = clock_timestamp()
  where id = target_installation.id;

  for pending_job in
    select job.id
    from public.jobs job
    join public.repositories repository
      on repository.workspace_id = job.workspace_id
     and repository.id = job.repository_id
    where repository.installation_id = target_installation.id
      and job.status in ('queued', 'running')
  loop
    perform public.cancel_job(target_installation.workspace_id, pending_job.id);
  end loop;

  update public.runs run
  set status = 'cancelled', completed_at = clock_timestamp()
  from public.repositories repository
  where repository.installation_id = target_installation.id
    and run.workspace_id = repository.workspace_id
    and run.repository_id = repository.id
    and run.status in ('pending', 'running');

  perform public.record_security_audit_event(
    target_installation.workspace_id,
    'github',
    target_github_installation_id::text,
    'github_installation_revoked',
    'github_installation',
    target_installation.id,
    jsonb_build_object('reason', target_reason),
    audit_source_key
  );
  return 'revoked';
end;
$$;

create or replace function public.audit_scan_job_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'scan' then
    perform public.record_security_audit_event(
      new.workspace_id,
      'system',
      null,
      'scan_requested',
      'repository',
      new.repository_id,
      jsonb_build_object('jobId', new.id),
      'job:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger audit_scan_job_request_after_insert
  after insert on public.jobs
  for each row execute procedure public.audit_scan_job_request();

create or replace function public.prune_expired_access_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.access_events event
  using public.workspaces workspace
  where event.workspace_id = workspace.id
    and workspace.access_event_retention_days is not null
    and event.occurred_at < clock_timestamp() - make_interval(days => workspace.access_event_retention_days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.record_security_audit_event(text,text,text,text,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.consume_workspace_security_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.revoke_github_installation(bigint,text,text) from public, anon, authenticated;
revoke all on function public.audit_scan_job_request() from public, anon, authenticated;
revoke all on function public.prune_expired_access_events() from public, anon, authenticated;

grant execute on function public.record_security_audit_event(text,text,text,text,text,text,jsonb,text) to service_role;
grant execute on function public.consume_workspace_security_limit(text,text,integer,integer) to service_role;
grant execute on function public.revoke_github_installation(bigint,text,text) to service_role;
grant execute on function public.audit_scan_job_request() to service_role;
grant execute on function public.prune_expired_access_events() to service_role;
