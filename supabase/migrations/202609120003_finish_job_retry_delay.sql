-- finish_job takes the retry time the worker learned from the failure
-- (Phase 4 Wave C, PR #8 follow-up, 2026-09-12).
--
-- The queue's retry backoff is 2^attempt seconds: two seconds after the
-- first failure, four after the second. That is the right shape for a
-- dropped socket and the wrong one for a rate limit. On 2026-09-12 the
-- production backfill's scan and analyze jobs each met a GitHub 403 that
-- said, in its headers, when to come back — and burned all three attempts
-- inside ten seconds, long before that time arrived.
--
-- The worker now reads that time (`retry-after`, or the primary limit's
-- reset) and passes it here as `retry_delay_seconds`. The job is queued for
-- the later of that and the exponential backoff, capped at an hour — the
-- length of a GitHub primary window, and the most any single failure is
-- allowed to claim. Nothing else changes: attempts still count the same
-- way, the terminal path is untouched, and a caller passing four arguments
-- gets exactly the previous behaviour, so a worker released before this
-- migration keeps working against it.
--
-- The four-argument signature is dropped rather than overloaded: with the
-- new parameter defaulted, a four-argument call would match both and
-- PostgreSQL would refuse it as ambiguous.

drop function if exists public.finish_job(text, text, boolean, text);

create or replace function public.finish_job(
  target_job_id text,
  target_worker_id text,
  succeeded boolean,
  failure_message text default null,
  retry_delay_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs%rowtype;
  retry_backoff interval;
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
    retry_backoff := greatest(
      power(2, target_job.attempt_count) * interval '1 second',
      least(greatest(coalesce(retry_delay_seconds, 0), 0), 3600) * interval '1 second'
    );
    update public.jobs
    set status = 'queued', worker_id = null, claimed_at = null,
        heartbeat_at = null, lease_expires_at = null,
        available_at = now() + retry_backoff,
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

revoke all on function public.finish_job(text, text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.finish_job(text, text, boolean, text, integer) to service_role;
