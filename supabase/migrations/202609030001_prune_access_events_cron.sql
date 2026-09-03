begin;

-- The pilot promises a 30-day MCP access-event retention
-- (`workspaces.access_event_retention_days`) and
-- `public.prune_expired_access_events()` is the function that enforces it
-- (202608100009_release_hardening.sql). Nothing ever called it: the deployment
-- checklist asked for a daily service-role database job and no scheduler
-- existed, so the retention promise was one the database never kept.
--
-- pg_cron is the only scheduler reachable without adding a credential or a
-- second always-on process, and the production project reports it as an
-- available extension. The whole body is guarded because the test database
-- (PGlite) and any Postgres without pg_cron must still apply this migration
-- cleanly — there it is a deliberate no-op.
--
-- The job runs as the role that schedules it, which owns the function. It is
-- not scheduled as the literal `service_role`: pg_cron honours a different
-- `username` only for superusers, and Supabase's `postgres` role is not one.
-- `prune_expired_access_events` is `security definer`, so it executes with
-- owner privileges either way — the privilege level the checklist asks for.
--
-- Every cron statement goes through `execute` so plpgsql never plans a
-- reference to the `cron` schema on a database that does not have one.
do $prune_schedule$
declare
  already_scheduled integer;
begin
  if not exists (
    select 1 from pg_available_extensions where name = 'pg_cron'
  ) then
    raise notice
      'pg_cron is unavailable; skipped alrescha_prune_access_events.';
    return;
  end if;

  execute 'create extension if not exists pg_cron';

  execute $count$
    select count(*)::integer
    from cron.job
    where jobname = 'alrescha_prune_access_events'
  $count$ into already_scheduled;

  if already_scheduled > 0 then
    raise notice
      'alrescha_prune_access_events already scheduled; left untouched.';
    return;
  end if;

  -- 18:17 UTC is 03:17 in Asia/Seoul, the quietest window for this pilot. The
  -- off-the-hour minute keeps it clear of every other hourly scheduler.
  execute $schedule$
    select cron.schedule(
      'alrescha_prune_access_events',
      '17 18 * * *',
      'select public.prune_expired_access_events();'
    )
  $schedule$;
  raise notice 'scheduled alrescha_prune_access_events daily at 18:17 UTC.';
end
$prune_schedule$;

commit;
