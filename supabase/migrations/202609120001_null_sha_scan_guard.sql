-- No scan at the null sha (2026-09-12; `.omo/evidence/phase4/null-sha-scan-requests-2026-09-12.md`).
--
-- Between 2026-09-09 and 2026-09-12 six `scan` jobs failed permanently in
-- production, every one at commit `0000000000000000000000000000000000000000`.
-- That is Git's null object id, and GitHub writes it as `after` in the push
-- webhook for a *deleted* branch or tag (`deleted: true`, `head_commit:
-- null`). Every check on the way to the queue asked "forty hex characters?"
-- — the table constraints, `normalizeGitHubWebhook`, this function's caller
-- — and the null id answers yes. The worker then asked GitHub for the tree
-- of a commit that does not exist, failed three times, and the job counted
-- toward `ops:health`'s permanent-failure threshold as if a job kind were
-- failing systematically.
--
-- The web handler now acknowledges a deletion push without persisting it.
-- This migration is the queue's own refusal, for any producer that is not
-- the web handler: a delivery whose commit is not a real commit raises
-- before a row, a run or a job exists.
--
-- `enqueue_backfill_scan` gets the same word. Its head check already refused
-- `HEAD`; it now also refuses the null id, which is what an empty repository
-- or a just-deleted default branch would hand a caller.

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
  -- Before any write: a delivery about no commit must not become a run and
  -- two jobs. The null id is a deleted ref; anything else that fails the
  -- format would have been caught by the table constraint, but with a
  -- constraint name for a message.
  if target_commit_sha is null
     or target_commit_sha !~ '^[0-9a-f]{40}$'
     or target_commit_sha = repeat('0', 40)
  then
    raise exception 'webhook delivery % carries no scannable commit: % (the null sha marks a deleted ref)',
      target_delivery_id, coalesce(target_commit_sha, 'null');
  end if;

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
  -- The null id is forty hex characters and no commit at all.
  if head_commit_sha is null
     or head_commit_sha !~ '^[0-9a-f]{40}$'
     or head_commit_sha = repeat('0', 40)
  then
    raise exception 'backfill needs the head commit sha; % is not one',
      coalesce(head_commit_sha, 'null');
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

-- Same signatures as before, so the grants carry over; restated so a reader
-- of this file alone sees who may call them.
revoke all on function public.ingest_github_webhook_event(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_backfill_scan(text, text, text)
  from public, anon, authenticated;
grant execute on function public.ingest_github_webhook_event(text, text, text, text, text, text, text, text)
  to service_role;
grant execute on function public.enqueue_backfill_scan(text, text, text)
  to service_role;
