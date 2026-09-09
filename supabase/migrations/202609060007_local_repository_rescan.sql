-- A local repository's rescan belongs on the machine that holds it
-- (Phase 4 Wave C todo 17, OQ-030).
--
-- OQ-030 asked how a local-ingest repository gets analysed. The answer is
-- decided here: **not by the hosted worker.** Doing that would mean sending
-- file bodies to the server, which hard rule ③ forbids and ADR-015 §6 already
-- settled for receipts; the reading moves to the machine that already has the
-- bodies instead (`alrescha serve --local`).
--
-- That decision has a consequence the queue has to state. `enqueue_job` will
-- happily accept a scan for a repository with no installation, and the worker
-- then fails it three times with "repository … is not connected" — a message
-- about plumbing, delivered to a caller who asked a reasonable question.
-- `request_rescan` opened that path for agents in todo 16; this closes it
-- before a job exists, and says where the work actually lives.
--
-- Only the rescan path is guarded. `enqueue_backfill_scan` has exactly one
-- caller — the GitHub connect flow, which cannot reach it without an
-- installation — so a second guard there would be a branch no caller can
-- take.

create or replace function public.enqueue_repository_rescan(
  target_workspace_id text,
  target_repository_id text,
  requested_mode text default null,
  expected_link_schema_version integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  repository public.repositories%rowtype;
  resolved_mode text;
  upgrade_reason text := null;
  job_id text;
  run_row_id text;
begin
  select * into repository
  from public.repositories
  where workspace_id = target_workspace_id and id = target_repository_id;
  if not found then
    raise exception 'repository % is not in workspace %',
      target_repository_id, target_workspace_id;
  end if;

  if requested_mode is not null and requested_mode not in ('full', 'incremental') then
    raise exception 'unsupported rescan mode: %', requested_mode;
  end if;

  -- No installation means the bodies are on someone's machine and nowhere
  -- else. The worker cannot read them and must not be asked to.
  if repository.installation_id is null then
    return jsonb_build_object(
      'jobId', null,
      'mode', null,
      'reason', 'this repository was ingested locally, so the server has no '
        || 'access to its files: rescan it with `alrescha push` or serve it '
        || 'with `alrescha serve --local`',
      'scheduled', false
    );
  end if;

  -- Nothing to rescan *against*: a repository that has never been scanned
  -- needs its head sha from the caller, not a guess.
  if repository.last_scanned_commit_sha is null then
    return jsonb_build_object(
      'jobId', null,
      'mode', null,
      'reason', 'never-scanned',
      'scheduled', false
    );
  end if;

  resolved_mode := coalesce(requested_mode, 'incremental');
  if coalesce(repository.link_schema_version, 1) < expected_link_schema_version
  then
    -- An incremental pass never re-parses an unchanged file, so an older
    -- resolver generation would keep its thin graph forever.
    resolved_mode := 'full';
    upgrade_reason := 'stored links are from resolver generation '
      || coalesce(repository.link_schema_version, 1)::text
      || '; the current one is ' || expected_link_schema_version::text;
  end if;

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual',
    'rescan:' || repository.last_scanned_commit_sha || ':' || resolved_mode,
    repository.last_scanned_commit_sha
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into run_row_id;

  job_id := public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    run_row_id,
    'scan',
    'rescan:' || target_repository_id || ':'
      || repository.last_scanned_commit_sha || ':' || resolved_mode,
    jsonb_build_object(
      'commitSha', repository.last_scanned_commit_sha,
      'mode', resolved_mode,
      'reason', 'rescan'
    ),
    0,
    3
  );

  return jsonb_build_object(
    'jobId', job_id,
    'mode', resolved_mode,
    'reason', coalesce(upgrade_reason, 'requested'),
    'scheduled', true
  );
end;
$$;

revoke all on function public.enqueue_repository_rescan(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_repository_rescan(text, text, text, integer)
  to service_role;
