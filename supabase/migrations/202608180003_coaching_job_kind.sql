-- Coaching runs through the credit ledger (Phase 2C todo 8).
--
-- Coaching is an AI call like any other: it costs credits when it produces a
-- usable rubric, and it must cost nothing when the model returns something
-- the schema rejects. Rather than build a second billing path, it becomes a
-- fifth job kind so it inherits the lifecycle that already exists — reserve
-- on claim, settle on success, refund on `reject_job`. The no-charge rule
-- then holds by construction instead of by a parallel implementation.

alter table public.jobs drop constraint jobs_kind;
alter table public.jobs
  add constraint jobs_kind
  check (kind in ('scan', 'analyze', 'judge', 'pack', 'coach'));

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

  -- 'coach' joins the billable kinds: like 'judge' it calls a model, so
  -- it may carry a credit cost. The deterministic kinds still may not.
  if job_kind not in ('scan', 'analyze', 'judge', 'pack', 'coach') then
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

revoke all on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer) to service_role;
