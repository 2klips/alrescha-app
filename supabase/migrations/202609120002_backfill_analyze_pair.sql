-- A backfill and a rescan queue the same pair a push does (Phase 4 Wave C
-- todo 16, WORK_SPEC §4.1-4).
--
-- `enqueue_backfill_scan` (202609060006, null-sha guard 202609120001) queued
-- one `scan` job and nothing else. A webhook push queues `scan` **and**
-- `analyze` on the same run (`ingest_github_webhook_event`), and it is the
-- analyze job that extracts requirements, writes findings, collects CI
-- evidence and issues the receipt. So a finished repository connected today
-- got its structure and then waited for a push that may never come before
-- any of that happened — the onboarding progress the spec describes
-- (스캔 → 파싱 → 요구사항 추출 → 증거 조사 → 판정) stopped at the first
-- arrow, and the 2026-09-06 live scan had to queue analyze by hand.
--
-- Both manual entry points now queue the pair, keyed like the scan with an
-- `:analyze` suffix so the idempotency story is unchanged: one press, one
-- pair; the same head again, the same pair. Both jobs are deterministic and
-- `enqueue_job` refuses a non-zero credit cost for either.
--
-- The return values do not change. The backfill still returns the scan job
-- id; the rescan still returns the scan job in `jobId`. A caller that wants
-- the analyze job reads the queue, where it always could.
--
-- Ordering: `claim_next_job` orders by (priority, created_at) and both rows
-- are written in one transaction, so the tie is resolved by the queue, not
-- by this function — exactly as for the webhook pair. An analyze claimed
-- before its scan fails fast ("analyze ran before any artifact was stored")
-- and is retried on the queue's backoff after the scan lands; the drain
-- loop serves one workspace sequentially, so that retry is the common case
-- rather than a race.

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
  scan_job_id text;
begin
  select * into repository
  from public.repositories
  where workspace_id = target_workspace_id and id = target_repository_id;
  if not found then
    raise exception 'repository % is not in workspace %',
      target_repository_id, target_workspace_id;
  end if;
  -- The null id is forty hex characters and no commit at all.
  if head_commit_sha is null
     or head_commit_sha !~ '^[0-9a-f]{40}$'
     or head_commit_sha = repeat('0', 40)
  then
    raise exception 'backfill needs the head commit sha; % is not one',
      coalesce(head_commit_sha, 'null');
  end if;

  -- `manual`, because a person connecting a repository is what triggered it.
  -- The run's key carries the head, so the run is as idempotent as the jobs.
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
  scan_job_id := public.enqueue_job(
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

  -- …and the analysis of what that scan stores: requirements, findings, CI
  -- evidence, receipt. The same pair a push queues.
  perform public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    run_row_id,
    'analyze',
    'backfill:' || target_repository_id || ':' || head_commit_sha || ':analyze',
    jsonb_build_object(
      'commitSha', head_commit_sha,
      'reason', 'backfill'
    ),
    0,
    3
  );

  return scan_job_id;
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

  -- No installation means the bodies are on someone's machine and nowhere
  -- else. The worker cannot read them and must not be asked to (todo 17).
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

  -- A relink changes what the rules see (a recovered `tests` edge is what
  -- decides `untested-code`), so the analysis follows the scan here too.
  -- Findings converge on re-analysis; nothing is charged.
  perform public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    run_row_id,
    'analyze',
    'rescan:' || target_repository_id || ':'
      || repository.last_scanned_commit_sha || ':' || resolved_mode || ':analyze',
    jsonb_build_object(
      'commitSha', repository.last_scanned_commit_sha,
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

-- Same signatures as before, so the grants carry over; restated so a reader
-- of this file alone sees who may call them.
revoke all on function public.enqueue_backfill_scan(text, text, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_repository_rescan(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_backfill_scan(text, text, text)
  to service_role;
grant execute on function public.enqueue_repository_rescan(text, text, text, integer)
  to service_role;
