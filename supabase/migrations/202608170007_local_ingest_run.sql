-- Local ingest produces a run (follow-up wiring, ADR-013 + OQ-014).
--
-- `arr push` applied its scan but left no run, so a locally ingested commit
-- never appeared on the commit-analysis cards. It now records one:
--
--   * trigger_kind 'manual' — the schema's existing vocabulary for a
--     non-webhook trigger; trigger_key 'local:<sha>' makes it idempotent per
--     commit, so re-pushing the same tree updates instead of duplicating.
--   * terminal on arrival: the ingest is synchronous, so the run is written
--     'succeeded' with both timestamps. There are no jobs to settle, which is
--     exactly why the card builder must trust the stored run status here.
--   * timestamps are SERVER-measured (route entry → now). Nothing about the
--     duration is taken from the client.
--
-- No receipt is produced: a receipt asserts evidence about findings, and the
-- local path runs the scanner only. Claiming one would be a fabricated
-- attestation — the gap is recorded as OQ-016 instead.

create or replace function public.record_local_ingest_run(
  target_workspace_id text,
  target_repository_id text,
  target_commit_sha text,
  target_started_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id text;
  started timestamptz := coalesce(target_started_at, now());
begin
  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha,
    status, started_at, completed_at
  ) values (
    target_workspace_id, target_repository_id, 'manual',
    'local:' || target_commit_sha, target_commit_sha,
    'succeeded', started, now()
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
  set commit_sha = excluded.commit_sha,
      status = 'succeeded',
      started_at = excluded.started_at,
      completed_at = excluded.completed_at
  returning id into run_id;

  return run_id;
end;
$$;

revoke all on function public.record_local_ingest_run(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_local_ingest_run(text, text, text, timestamptz)
  to service_role;
