create table public.workspace_job_settings (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  max_enqueues_per_minute integer not null default 60,
  monthly_credit_cap integer not null default 1000,
  per_job_credit_cap integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_job_settings_rate_positive check (max_enqueues_per_minute > 0),
  constraint workspace_job_settings_credit_caps check (
    monthly_credit_cap >= 0 and per_job_credit_cap >= 0 and per_job_credit_cap <= monthly_credit_cap
  )
);

insert into public.workspace_job_settings (workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

create table public.workspace_enqueue_windows (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('minute', now()),
  enqueue_count integer not null default 0,
  constraint workspace_enqueue_windows_count_nonnegative check (enqueue_count >= 0)
);

alter table public.jobs
  add column priority integer not null default 100,
  add column worker_id text,
  add column lease_expires_at timestamptz,
  add column last_error text,
  add column cancelled_at timestamptz,
  add column credit_cost integer not null default 0,
  add column reservation_id text,
  add constraint jobs_priority_nonnegative check (priority >= 0),
  add constraint jobs_credit_cost_nonnegative check (credit_cost >= 0),
  add constraint jobs_deterministic_zero_credit check (kind not in ('scan', 'analyze') or credit_cost = 0);

alter table public.credit_ledger
  add constraint credit_ledger_workspace_id_unique unique (workspace_id, id),
  add constraint credit_ledger_amount_by_event check (
    (event in ('grant', 'topup', 'refund') and amount > 0)
    or (event = 'reserve' and amount < 0)
    or (event = 'settle' and amount = 0)
    or (event = 'adjust' and amount <> 0)
  );

alter table public.jobs
  add constraint jobs_reservation_tenant_fk foreign key (workspace_id, reservation_id)
    references public.credit_ledger(workspace_id, id) on delete restrict;

create index jobs_stale_lease_idx
  on public.jobs(workspace_id, lease_expires_at)
  where status = 'running';
create index jobs_workspace_status_created_idx
  on public.jobs(workspace_id, status, created_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_workspace_id text;
begin
  insert into public.workspaces (owner_user_id)
  values (new.id)
  returning id into personal_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (personal_workspace_id, new.id, 'owner');

  insert into public.workspace_job_settings (workspace_id)
  values (personal_workspace_id);

  return new;
end;
$$;

create or replace function public.enqueue_job(
  target_workspace_id text,
  target_repository_id text,
  target_run_id text,
  job_kind text,
  target_idempotency_key text,
  job_payload jsonb default '{}'::jsonb,
  requested_credit_cost integer default 0,
  requested_max_attempts integer default 3
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job_id text;
  new_job_id text;
  rate_limit integer;
  current_window public.workspace_enqueue_windows%rowtype;
begin
  select id into existing_job_id
  from public.jobs
  where workspace_id = target_workspace_id and idempotency_key = target_idempotency_key;

  if existing_job_id is not null then
    return existing_job_id;
  end if;

  if job_kind not in ('scan', 'analyze', 'judge', 'pack') then
    raise exception 'unsupported job kind: %', job_kind;
  end if;
  if job_kind in ('scan', 'analyze') and requested_credit_cost <> 0 then
    raise exception 'deterministic jobs must have zero credit cost';
  end if;
  if requested_credit_cost < 0 then
    raise exception 'credit cost must be nonnegative';
  end if;
  if requested_max_attempts not between 1 and 10 then
    raise exception 'max attempts must be between 1 and 10';
  end if;

  insert into public.workspace_job_settings (workspace_id)
  values (target_workspace_id)
  on conflict (workspace_id) do nothing;

  select max_enqueues_per_minute into rate_limit
  from public.workspace_job_settings
  where workspace_id = target_workspace_id
  for update;

  insert into public.workspace_enqueue_windows (workspace_id)
  values (target_workspace_id)
  on conflict (workspace_id) do nothing;

  select * into current_window
  from public.workspace_enqueue_windows
  where workspace_id = target_workspace_id
  for update;

  if current_window.window_started_at + interval '1 minute' <= now() then
    update public.workspace_enqueue_windows
    set window_started_at = date_trunc('minute', now()), enqueue_count = 0
    where workspace_id = target_workspace_id;
    current_window.enqueue_count := 0;
  end if;

  if current_window.enqueue_count >= rate_limit then
    raise exception 'workspace enqueue rate limit exceeded';
  end if;

  update public.workspace_enqueue_windows
  set enqueue_count = enqueue_count + 1
  where workspace_id = target_workspace_id;

  insert into public.jobs (
    workspace_id, repository_id, run_id, kind, idempotency_key, payload,
    credit_cost, max_attempts
  ) values (
    target_workspace_id, target_repository_id, target_run_id, job_kind,
    target_idempotency_key, job_payload, requested_credit_cost, requested_max_attempts
  )
  returning id into new_job_id;

  return new_job_id;
exception
  when unique_violation then
    select id into existing_job_id
    from public.jobs
    where workspace_id = target_workspace_id and idempotency_key = target_idempotency_key;
    return existing_job_id;
end;
$$;

create or replace function public.reserve_job_credits(target_job_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs%rowtype;
  settings public.workspace_job_settings%rowtype;
  available_balance integer;
  month_spend integer;
  reservation_ledger_id text;
begin
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if target_job.kind in ('scan', 'analyze') then
    if target_job.credit_cost <> 0 then
      raise exception 'deterministic jobs must have zero credit cost';
    end if;
    return null;
  end if;
  if target_job.credit_cost = 0 then
    return null;
  end if;
  if target_job.reservation_id is not null then
    return target_job.reservation_id;
  end if;

  select * into settings
  from public.workspace_job_settings
  where workspace_id = target_job.workspace_id
  for update;

  if target_job.credit_cost > settings.per_job_credit_cap then
    raise exception 'job credit cost exceeds workspace per-job cap';
  end if;

  select coalesce(sum(amount), 0)::integer into available_balance
  from public.credit_ledger
  where workspace_id = target_job.workspace_id;

  select coalesce(-sum(amount), 0)::integer into month_spend
  from public.credit_ledger
  where workspace_id = target_job.workspace_id
    and created_at >= date_trunc('month', now())
    and event in ('reserve', 'refund');

  if available_balance < target_job.credit_cost then
    raise exception 'insufficient workspace credits';
  end if;
  if month_spend + target_job.credit_cost > settings.monthly_credit_cap then
    raise exception 'workspace monthly credit cap exceeded';
  end if;

  insert into public.credit_ledger (
    workspace_id, event, amount, job_id, idempotency_key, metadata
  ) values (
    target_job.workspace_id,
    'reserve',
    -target_job.credit_cost,
    target_job.id,
    'reserve:' || target_job.id,
    jsonb_build_object('cost', target_job.credit_cost)
  )
  on conflict (workspace_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into reservation_ledger_id;

  update public.jobs
  set reservation_id = reservation_ledger_id
  where id = target_job.id;

  return reservation_ledger_id;
end;
$$;

create or replace function public.settle_job_credits(target_job_id text, succeeded boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs%rowtype;
  ledger_id text;
  ledger_event text;
  ledger_amount integer;
begin
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if target_job.reservation_id is null or target_job.credit_cost = 0 then
    return null;
  end if;

  perform 1 from public.workspace_job_settings
  where workspace_id = target_job.workspace_id
  for update;

  ledger_event := case when succeeded then 'settle' else 'refund' end;
  ledger_amount := case when succeeded then 0 else target_job.credit_cost end;

  insert into public.credit_ledger (
    workspace_id, event, amount, job_id, reservation_id, idempotency_key, metadata
  ) values (
    target_job.workspace_id,
    ledger_event,
    ledger_amount,
    target_job.id,
    target_job.reservation_id,
    ledger_event || ':' || target_job.id,
    jsonb_build_object('reserved', target_job.credit_cost)
  )
  on conflict (workspace_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into ledger_id;

  return ledger_id;
end;
$$;

create or replace function public.reap_stale_jobs(target_workspace_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_job public.jobs%rowtype;
  reaped integer := 0;
begin
  for stale_job in
    select * from public.jobs
    where workspace_id = target_workspace_id
      and status = 'running'
      and lease_expires_at < now()
    for update skip locked
  loop
    if stale_job.attempt_count < stale_job.max_attempts then
      update public.jobs
      set status = 'queued', worker_id = null, claimed_at = null,
          heartbeat_at = null, lease_expires_at = null,
          available_at = now() + power(2, stale_job.attempt_count) * interval '1 second',
          last_error = 'worker lease expired'
      where id = stale_job.id;
    else
      update public.jobs
      set status = 'failed', worker_id = null, lease_expires_at = null,
          completed_at = now(), last_error = 'worker lease expired'
      where id = stale_job.id;
      perform public.settle_job_credits(stale_job.id, false);
    end if;
    reaped := reaped + 1;
  end loop;
  return reaped;
end;
$$;

create or replace function public.claim_next_job(
  target_workspace_id text,
  target_worker_id text,
  lease_seconds integer default 30
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lease_seconds not between 5 and 300 then
    raise exception 'lease seconds must be between 5 and 300';
  end if;

  perform public.reap_stale_jobs(target_workspace_id);

  return query
  with candidate as (
    select id
    from public.jobs
    where workspace_id = target_workspace_id
      and status = 'queued'
      and available_at <= now()
      and attempt_count < max_attempts
    order by priority, created_at
    for update skip locked
    limit 1
  )
  update public.jobs as job
  set status = 'running',
      worker_id = target_worker_id,
      attempt_count = job.attempt_count + 1,
      claimed_at = now(),
      heartbeat_at = now(),
      lease_expires_at = now() + lease_seconds * interval '1 second'
  from candidate
  where job.id = candidate.id
  returning job.*;
end;
$$;

create or replace function public.heartbeat_job(
  target_job_id text,
  target_worker_id text,
  lease_seconds integer default 30
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with heartbeat as (
    update public.jobs
    set heartbeat_at = now(), lease_expires_at = now() + lease_seconds * interval '1 second'
    where id = target_job_id and worker_id = target_worker_id and status = 'running'
    returning 1
  )
  select exists(select 1 from heartbeat);
$$;

create or replace function public.finish_job(
  target_job_id text,
  target_worker_id text,
  succeeded boolean,
  failure_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs%rowtype;
begin
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.worker_id is distinct from target_worker_id or target_job.status <> 'running' then
    return 'ignored';
  end if;

  if succeeded then
    update public.jobs
    set status = 'succeeded', completed_at = now(), lease_expires_at = null,
        heartbeat_at = now(), last_error = null
    where id = target_job.id;
    perform public.settle_job_credits(target_job.id, true);
    return 'succeeded';
  end if;

  if target_job.attempt_count < target_job.max_attempts then
    update public.jobs
    set status = 'queued', worker_id = null, claimed_at = null,
        heartbeat_at = null, lease_expires_at = null,
        available_at = now() + power(2, target_job.attempt_count) * interval '1 second',
        last_error = left(coalesce(failure_message, 'job failed'), 2000)
    where id = target_job.id;
    return 'retrying';
  end if;

  update public.jobs
  set status = 'failed', completed_at = now(), lease_expires_at = null,
      last_error = left(coalesce(failure_message, 'job failed'), 2000)
  where id = target_job.id;
  perform public.settle_job_credits(target_job.id, false);
  return 'failed';
end;
$$;

create or replace function public.cancel_job(target_workspace_id text, target_job_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_job public.jobs%rowtype;
begin
  update public.jobs
  set status = 'cancelled', cancelled_at = now(), completed_at = now(),
      worker_id = null, lease_expires_at = null
  where id = target_job_id
    and workspace_id = target_workspace_id
    and status in ('queued', 'running')
  returning * into cancelled_job;

  if not found then
    return false;
  end if;

  perform public.settle_job_credits(cancelled_job.id, false);
  return true;
end;
$$;

create or replace function public.ingest_github_webhook_event(
  target_workspace_id text,
  target_repository_id text,
  target_delivery_id text,
  target_event text,
  target_action text,
  target_conclusion text,
  target_commit_sha text,
  target_payload_digest text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row_id text;
  run_row_id text;
begin
  insert into public.github_webhook_deliveries (
    workspace_id, repository_id, delivery_id, event, action, conclusion,
    commit_sha, payload_digest
  ) values (
    target_workspace_id, target_repository_id, target_delivery_id, target_event,
    target_action, target_conclusion, target_commit_sha, target_payload_digest
  )
  on conflict (delivery_id) do nothing
  returning id into delivery_row_id;

  if delivery_row_id is null then
    return false;
  end if;

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, target_event,
    'github:' || target_delivery_id, target_commit_sha
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into run_row_id;

  perform public.enqueue_job(
    target_workspace_id, target_repository_id, run_row_id, 'scan',
    'github:' || target_delivery_id || ':scan',
    jsonb_build_object('commitSha', target_commit_sha), 0, 3
  );
  perform public.enqueue_job(
    target_workspace_id, target_repository_id, run_row_id, 'analyze',
    'github:' || target_delivery_id || ':analyze',
    jsonb_build_object('commitSha', target_commit_sha), 0, 3
  );

  return true;
end;
$$;

alter table public.workspace_job_settings enable row level security;
alter table public.workspace_job_settings force row level security;
alter table public.workspace_enqueue_windows enable row level security;
alter table public.workspace_enqueue_windows force row level security;

create policy workspace_job_settings_select_owner
  on public.workspace_job_settings for select to authenticated
  using ((select public.is_workspace_owner(workspace_id)));

grant select on public.workspace_job_settings to authenticated;
grant all on public.workspace_job_settings, public.workspace_enqueue_windows to service_role;

revoke all on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.reserve_job_credits(text) from public, anon, authenticated;
revoke all on function public.settle_job_credits(text, boolean) from public, anon, authenticated;
revoke all on function public.reap_stale_jobs(text) from public, anon, authenticated;
revoke all on function public.claim_next_job(text, text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_job(text, text, integer) from public, anon, authenticated;
revoke all on function public.finish_job(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.cancel_job(text, text) from public, anon, authenticated;
revoke all on function public.ingest_github_webhook_event(text, text, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer) to service_role;
grant execute on function public.reserve_job_credits(text) to service_role;
grant execute on function public.settle_job_credits(text, boolean) to service_role;
grant execute on function public.reap_stale_jobs(text) to service_role;
grant execute on function public.claim_next_job(text, text, integer) to service_role;
grant execute on function public.heartbeat_job(text, text, integer) to service_role;
grant execute on function public.finish_job(text, text, boolean, text) to service_role;
grant execute on function public.cancel_job(text, text) to service_role;
grant execute on function public.ingest_github_webhook_event(text, text, text, text, text, text, text, text) to service_role;
