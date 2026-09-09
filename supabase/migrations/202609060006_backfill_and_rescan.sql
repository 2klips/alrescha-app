-- Backfill on connect, and rescan on demand (Phase 4 Wave C todo 16, D11,
-- OQ-029).
--
-- Connecting a repository stored a row and then waited for someone to push.
-- A repository that is finished — the case this wave is about — may not get a
-- push for weeks, so the product's first impression was an empty graph and a
-- suggestion to go and commit something.
--
-- Two entry points, both deterministic and both free:
--
-- * `enqueue_backfill_scan` runs once per (repository, head) at connect time.
--   The idempotency key is the head sha, so a double-click, a retried form
--   post and a re-render all resolve to the same job.
-- * `enqueue_repository_rescan` is the "scan again" button and the MCP tool
--   behind it. Its key carries the mode as well, because asking for a *full*
--   relink after an incremental one is a different request, not a repeat.
--
-- A scan is `deterministic`, so `enqueue_job` already refuses a non-zero
-- credit cost for it; these pass zero and the ledger test holds them to it.
--
-- **The mode is chosen here and enforced there.** A repository whose edges
-- were built by an older resolver keeps a thin graph until every file happens
-- to change, so falling behind `link_schema_version` is itself a reason to
-- relink (R5 §2.2 D2). `run_repository_scan` in the worker upgrades the mode
-- on the same rule; choosing it here as well is what lets the caller be told
-- *why* their incremental request became a full one instead of finding out
-- from the row count.

create or replace function public.enqueue_backfill_scan(
  target_workspace_id text,
  target_repository_id text,
  head_commit_sha text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  repository public.repositories%rowtype;
  run_row_id text;
begin
  select * into repository
  from public.repositories
  where workspace_id = target_workspace_id and id = target_repository_id;
  if not found then
    raise exception 'repository % is not in workspace %',
      target_repository_id, target_workspace_id;
  end if;
  if head_commit_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'backfill needs the head commit sha';
  end if;

  -- `manual`, because a person connecting a repository is what triggered it.
  -- The run's key carries the head, so the run is as idempotent as the job.
  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual',
    'backfill:' || head_commit_sha, head_commit_sha
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into run_row_id;

  -- A first scan has nothing to be incremental against, so it is full by
  -- construction rather than by flag.
  return public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    run_row_id,
    'scan',
    'backfill:' || target_repository_id || ':' || head_commit_sha,
    jsonb_build_object(
      'commitSha', head_commit_sha,
      'mode', 'full',
      'reason', 'backfill'
    ),
    0,
    3
  );
end;
$$;

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

revoke all on function public.enqueue_backfill_scan(text, text, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_repository_rescan(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_backfill_scan(text, text, text)
  to service_role;
grant execute on function public.enqueue_repository_rescan(text, text, text, integer)
  to service_role;
