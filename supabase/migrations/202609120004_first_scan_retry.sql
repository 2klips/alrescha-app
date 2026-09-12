-- A first scan that failed for good can be asked for again — and so can a
-- rescan (Phase 4 Wave C, PR #9 follow-up, 2026-09-12).
--
-- `enqueue_job` returns the existing job for a repeated idempotency key
-- whatever its status. That is what makes a double-clicked button one pair
-- of jobs; it is also what made a failed backfill final. On 2026-09-12 a
-- repository's first backfill ended on GitHub 403s at both jobs. Every way
-- of asking again hit a wall: re-connecting the repository resolved to the
-- same `backfill:<repository>:<head>` keys and got the dead pair back as
-- "scheduled"; "다시 스캔" refused, because `last_scanned_commit_sha` was
-- still null and a rescan has nothing to rescan against. The repository
-- stayed at `구조 스캔 실패 · 분석 실패` with no button.
--
-- The judgment and coaching queues solved the same problem on 2026-09-02:
-- `next_retry_idempotency_key` mints the next generation of a key
-- (`<base>:r1`, `:r2`, …) once the latest job under it is terminal, and
-- hands back the live or succeeded key otherwise. Both scan entry points
-- now key their pair through it. The properties that follow:
--
-- - a live pair is still one pair, however often the button is pressed;
-- - a terminal pair is retried as a *new* pair — new rows, new attempts,
--   the failed rows untouched and still counted by `ops:health`;
-- - only what failed is retried: a succeeded scan beside a failed analyze
--   yields one new analyze job, on a new run, and no second scan;
-- - a retry opens a new run (`<trigger>:rN`). `settle_run_after_job` never
--   reopens a settled run, so reusing the failed one would leave the retry
--   invisible to every reader of `runs`.
--
-- And the never-scanned refusal gains its one exception: when the
-- repository has no scanned commit but does have a scan job — the head the
-- connect read — a rescan retries that first scan at that head, through
-- `enqueue_backfill_scan`, and says so (`reason = 'first-scan-retry'`).
-- A repository that truly has nothing (no scan job at all) is still
-- refused with `never-scanned`, and a local repository is still refused
-- before either, so no server job is ever queued for files the server
-- cannot read (todo 17).
--
-- Return values are unchanged: the backfill returns the scan job id (the
-- generation's, or the live one's); the rescan returns the same jsonb
-- shape with one new `reason` value. Signatures are unchanged, so the
-- grants carry over; they are restated below all the same.

/** The `:rN` generation of a key minted by next_retry_idempotency_key; 0 for the base key. */
create or replace function public.retry_generation_of(idempotency_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(substring(idempotency_key from ':r([0-9]+)$'), '0')::integer;
$$;

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
  scan_base_key text;
  analyze_base_key text;
  scan_key text;
  analyze_key text;
  generation integer;
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

  -- Each half of the pair advances on its own: a succeeded scan keeps its
  -- key (and its job) while a failed analyze gets the next generation.
  scan_base_key := 'backfill:' || target_repository_id || ':' || head_commit_sha;
  analyze_base_key := scan_base_key || ':analyze';
  scan_key := public.next_retry_idempotency_key(target_workspace_id, scan_base_key);
  analyze_key := public.next_retry_idempotency_key(target_workspace_id, analyze_base_key);
  generation := greatest(
    public.retry_generation_of(scan_key),
    public.retry_generation_of(analyze_key)
  );

  -- `manual`, because a person connecting a repository is what triggered it.
  -- The run's key carries the head — and the generation, so a retry is a
  -- run of its own rather than a job appended to one already settled.
  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual',
    'backfill:' || head_commit_sha
      || case when generation > 0 then ':r' || generation::text else '' end,
    head_commit_sha
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
    scan_key,
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
    analyze_key,
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
  first_head text;
  scan_base_key text;
  analyze_base_key text;
  scan_key text;
  analyze_key text;
  generation integer;
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

  -- Nothing to rescan *against* — unless a first scan was attempted and
  -- never landed. Then the head that attempt carried is the head to try
  -- again at, and the retry is the backfill's own path: full, free, keyed
  -- by generation so the failed rows stay what they are.
  if repository.last_scanned_commit_sha is null then
    select payload->>'commitSha' into first_head
    from public.jobs
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and kind = 'scan'
    order by created_at desc
    limit 1;
    if first_head is null
       or first_head !~ '^[0-9a-f]{40}$'
       or first_head = repeat('0', 40)
    then
      return jsonb_build_object(
        'jobId', null,
        'mode', null,
        'reason', 'never-scanned',
        'scheduled', false
      );
    end if;
    job_id := public.enqueue_backfill_scan(
      target_workspace_id, target_repository_id, first_head
    );
    return jsonb_build_object(
      'jobId', job_id,
      'mode', 'full',
      'reason', 'first-scan-retry',
      'scheduled', true
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

  scan_base_key := 'rescan:' || target_repository_id || ':'
    || repository.last_scanned_commit_sha || ':' || resolved_mode;
  analyze_base_key := scan_base_key || ':analyze';
  scan_key := public.next_retry_idempotency_key(target_workspace_id, scan_base_key);
  analyze_key := public.next_retry_idempotency_key(target_workspace_id, analyze_base_key);
  generation := greatest(
    public.retry_generation_of(scan_key),
    public.retry_generation_of(analyze_key)
  );

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual',
    'rescan:' || repository.last_scanned_commit_sha || ':' || resolved_mode
      || case when generation > 0 then ':r' || generation::text else '' end,
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
    scan_key,
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
    analyze_key,
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

revoke all on function public.retry_generation_of(text)
  from public, anon, authenticated;
grant execute on function public.retry_generation_of(text) to service_role;
revoke all on function public.enqueue_backfill_scan(text, text, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_repository_rescan(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_backfill_scan(text, text, text)
  to service_role;
grant execute on function public.enqueue_repository_rescan(text, text, text, integer)
  to service_role;
