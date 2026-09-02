begin;

-- Retry after a terminal failure (judge/coach production smoke, 2026-09-02).
--
-- `enqueue_job` returns the existing job for a repeated idempotency key no
-- matter its status, so once a judgment or coaching job failed for good the
-- button could never produce another — and re-queueing the dead row in place
-- would collide with its `reserve:<job>` / `settle:<job>` ledger keys and run
-- the model for free. Instead, a repeat request after a terminal failure
-- mints the next generation of the key (`<base>:r1`, `:r2`, …): a brand-new
-- job with its own reservation and settlement. Queued, running and
-- succeeded jobs keep returning as before — one live attempt at a time, and
-- a successful judgment is never silently redone.

create or replace function public.next_retry_idempotency_key(
  target_workspace_id text,
  base_key text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest_status text;
  terminal_count integer;
begin
  select status into latest_status
  from public.jobs
  where workspace_id = target_workspace_id
    and (idempotency_key = base_key or idempotency_key like base_key || ':r%')
  order by created_at desc
  limit 1;

  if latest_status is null or latest_status not in ('failed', 'cancelled') then
    -- Nothing yet, or a live/succeeded attempt: hand back the key that will
    -- resolve to it (or create the first job).
    return case
      when latest_status is null then base_key
      else (
        select idempotency_key from public.jobs
        where workspace_id = target_workspace_id
          and (idempotency_key = base_key or idempotency_key like base_key || ':r%')
        order by created_at desc
        limit 1
      )
    end;
  end if;

  select count(*)::integer into terminal_count
  from public.jobs
  where workspace_id = target_workspace_id
    and (idempotency_key = base_key or idempotency_key like base_key || ':r%')
    and status in ('failed', 'cancelled');
  return base_key || ':r' || terminal_count;
end;
$$;

create or replace function public.enqueue_judgment_job(
  target_workspace_id text,
  target_finding_id text,
  requested_provider text,
  requested_billing_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  finding public.findings%rowtype;
  judgment_kind text;
  judgment_run_id text;
  judgment_cost integer;
begin
  if requested_provider not in ('anthropic', 'openai') then
    raise exception 'unsupported judgment provider: %', requested_provider;
  end if;
  if requested_billing_mode not in ('byok', 'credits') then
    raise exception 'unsupported judgment billing mode: %', requested_billing_mode;
  end if;

  select * into finding
  from public.findings
  where id = target_finding_id and workspace_id = target_workspace_id;
  if not found then
    raise exception 'finding % is not in workspace %',
      target_finding_id, target_workspace_id;
  end if;
  if finding.status <> 'open' then
    raise exception 'only open findings can be judged (finding % is %)',
      target_finding_id, finding.status;
  end if;

  judgment_kind := case finding.kind
    when 'contradicting-instructions' then 'contradiction-confirmation'
    else 'drift-verdict-confirmation'
  end;
  judgment_cost := case requested_billing_mode when 'credits' then 10 else 0 end;

  insert into public.runs (workspace_id, repository_id, trigger_kind, trigger_key)
  values (target_workspace_id, finding.repository_id, 'manual', 'judgment:' || target_finding_id)
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into judgment_run_id;

  return public.enqueue_job(
    target_workspace_id, finding.repository_id, judgment_run_id, 'judge',
    public.next_retry_idempotency_key(target_workspace_id, 'judgment:' || target_finding_id),
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode,
      'kind', judgment_kind,
      'targetId', target_finding_id,
      'currentConfidence', finding.confidence,
      'currentSeverity', finding.severity,
      'context', jsonb_build_array(
        left('finding ' || target_finding_id || ' (' || finding.kind
          || ', severity ' || finding.severity
          || ', confidence ' || finding.confidence
          || ', evidence ' || finding.evidence_grade || ')', 4000),
        left('title: ' || finding.title, 4000),
        left('provenance: ' || finding.provenance::text, 4000)
      )
    ),
    judgment_cost, 3
  );
end;
$$;

create or replace function public.enqueue_coaching_job(
  target_workspace_id text,
  target_prompt_record_id text,
  requesting_user_id uuid,
  requested_provider text,
  requested_billing_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_user uuid;
  record_text text;
  coaching_repository_id text;
  coaching_run_id text;
  coaching_cost integer;
begin
  if requested_provider not in ('anthropic', 'openai') then
    raise exception 'unsupported coaching provider: %', requested_provider;
  end if;
  if requested_billing_mode not in ('byok', 'credits') then
    raise exception 'unsupported coaching billing mode: %', requested_billing_mode;
  end if;

  select user_id, raw_text into record_user, record_text
  from public.prompt_records
  where id = target_prompt_record_id and workspace_id = target_workspace_id;
  if not found then
    raise exception 'prompt record % is not in workspace %',
      target_prompt_record_id, target_workspace_id;
  end if;
  if record_user is distinct from requesting_user_id then
    raise exception 'only the author may request coaching on a prompt record';
  end if;
  if record_text is null then
    raise exception 'coaching needs the raw prompt text (raw sync consent)';
  end if;
  -- `record_text` is checked, not copied: see the payload below.

  select id into coaching_repository_id
  from public.repositories
  where workspace_id = target_workspace_id
  order by created_at desc
  limit 1;
  if coaching_repository_id is null then
    raise exception 'coaching needs a connected repository in workspace %',
      target_workspace_id;
  end if;

  coaching_cost := case requested_billing_mode when 'credits' then 1 else 0 end;

  insert into public.runs (workspace_id, repository_id, trigger_kind, trigger_key)
  values (target_workspace_id, coaching_repository_id, 'manual', 'coaching:' || target_prompt_record_id)
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into coaching_run_id;

  return public.enqueue_job(
    target_workspace_id, coaching_repository_id, coaching_run_id, 'coach',
    public.next_retry_idempotency_key(target_workspace_id, 'coaching:' || target_prompt_record_id),
    -- ADR-011: the queue row names the record only. The worker reads the raw
    -- text at run time, so a consent revoked between click and claim is
    -- honored and no second copy of the text sits in a generic table.
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode,
      'promptRecordId', target_prompt_record_id
    ),
    coaching_cost, 3
  );
end;
$$;

revoke all on function public.next_retry_idempotency_key(text,text)
  from public, anon, authenticated;
grant execute on function public.next_retry_idempotency_key(text,text)
  to service_role;

commit;
