-- Run lifecycle writer (OQ-014).
--
-- `runs.status`, `started_at`, and `completed_at` were declared by the domain
-- migration but never written by any production path: webhook ingest created
-- runs as 'pending' and the queue functions only ever touched `jobs`. This
-- migration makes the queue functions transition the parent run as a side
-- effect of the job transitions they already perform:
--
--   * first claim of a run's job      → run 'running', started_at set once
--   * last job reaches a terminal end → run 'succeeded' / 'failed' /
--                                       'cancelled', completed_at set
--
-- Rules:
--   * A retry requeue is not terminal — the run stays 'running'.
--   * failed > cancelled > succeeded: any failed job fails the run; a run whose
--     terminal jobs are only cancelled/succeeded with at least one cancelled is
--     'cancelled' (this preserves the installation-revocation semantics, which
--     cancels jobs and expects cancelled runs).
--   * A run already outside 'pending'/'running' is never resurrected.
--
-- Concurrency: the settle helper locks the run row (`for update`) before
-- counting the run's jobs, so two jobs finishing at the same instant serialize
-- on the run and the second finisher sees the first's committed job row. Every
-- caller acquires locks in the same order (job row, then run row), so no lock
-- cycle exists.

create or replace function public.mark_run_running(target_run_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.runs
  set status = 'running', started_at = coalesce(started_at, now())
  where id = target_run_id
    and status in ('pending', 'running');
$$;

create or replace function public.settle_run_after_job(target_run_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.runs%rowtype;
  open_count integer;
  failed_count integer;
  cancelled_count integer;
begin
  if target_run_id is null then
    return;
  end if;

  select * into target_run
  from public.runs
  where id = target_run_id
  for update;

  if not found or target_run.status not in ('pending', 'running') then
    return;
  end if;

  select
    count(*) filter (where status in ('queued', 'running')),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'cancelled')
  into open_count, failed_count, cancelled_count
  from public.jobs
  where run_id = target_run_id;

  if open_count > 0 then
    return;
  end if;

  update public.runs
  set status = case
        when failed_count > 0 then 'failed'
        when cancelled_count > 0 then 'cancelled'
        else 'succeeded'
      end,
      completed_at = now()
  where id = target_run_id;
end;
$$;

revoke all on function public.mark_run_running(text) from public, anon, authenticated;
grant execute on function public.mark_run_running(text) to service_role;
revoke all on function public.settle_run_after_job(text) from public, anon, authenticated;
grant execute on function public.settle_run_after_job(text) to service_role;

-- claim_next_job: unchanged claim semantics, plus the run transition.
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
declare
  claimed public.jobs%rowtype;
begin
  if lease_seconds not between 5 and 300 then
    raise exception 'lease seconds must be between 5 and 300';
  end if;

  perform public.reap_stale_jobs(target_workspace_id);

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
  returning job.* into claimed;

  if claimed.id is null then
    return;
  end if;

  perform public.mark_run_running(claimed.run_id);
  return next claimed;
end;
$$;

-- finish_job: terminal branches settle the run; the retry branch leaves it
-- 'running' because the job goes back to the queue.
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
    perform public.settle_run_after_job(target_job.run_id);
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
  perform public.settle_run_after_job(target_job.run_id);
  return 'failed';
end;
$$;

-- reject_job: terminal by definition, so it always settles the run.
create or replace function public.reject_job(
  target_job_id text,
  target_worker_id text,
  failure_message text
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

  update public.jobs
  set status = 'failed', completed_at = now(), lease_expires_at = null,
      last_error = left(coalesce(failure_message, 'job rejected'), 2000)
  where id = target_job.id;
  perform public.settle_job_credits(target_job.id, false);
  perform public.settle_run_after_job(target_job.run_id);
  return 'failed';
end;
$$;

-- reap_stale_jobs: only the exhausted-attempts branch is terminal.
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
      perform public.settle_run_after_job(stale_job.run_id);
    end if;
    reaped := reaped + 1;
  end loop;
  return reaped;
end;
$$;

-- cancel_job: cancellation is terminal for the job, so the run settles too —
-- a run whose jobs were all cancelled (installation revocation) becomes
-- 'cancelled', matching the revocation path's own bulk update.
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
  perform public.settle_run_after_job(cancelled_job.run_id);
  return true;
end;
$$;
