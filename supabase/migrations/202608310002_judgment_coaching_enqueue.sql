begin;

-- Enqueue surfaces for the judge and coach runners (the runners shipped in
-- 202608310001's session; nothing produced their jobs until now). Both
-- functions follow `enqueue_enrich_job`: security definer, service_role-only,
-- with the eligibility predicate and billing rule in SQL so the database
-- tests can prove them.

-- One judgment per finding: WORK_SPEC §14 judgment kinds map from the
-- finding's own kind — a contradiction candidate asks for confirmation,
-- every other kind asks for a drift-verdict confirmation
-- (requirement-disambiguation waits for a requirement surface). The context
-- array carries metadata only — title, kind, grades, provenance — never a
-- source body.
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
  -- Platform judgments carry the established 10-credit cost; BYOK spends the
  -- member's own key and must reserve nothing (the handler enforces both).
  judgment_cost := case requested_billing_mode when 'credits' then 10 else 0 end;

  insert into public.runs (workspace_id, repository_id, trigger_kind, trigger_key)
  values (target_workspace_id, finding.repository_id, 'manual', 'judgment:' || target_finding_id)
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into judgment_run_id;

  return public.enqueue_job(
    target_workspace_id, finding.repository_id, judgment_run_id, 'judge',
    'judgment:' || target_finding_id,
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

-- One coaching per prompt record, and only for the record's own author with
-- raw sync consented — ADR-011's own-prompt rule enforced where it cannot be
-- bypassed. Coaching jobs are workspace work, so they ride on a manual run
-- against the workspace's newest repository.
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

  select id into coaching_repository_id
  from public.repositories
  where workspace_id = target_workspace_id
  order by created_at desc
  limit 1;
  if coaching_repository_id is null then
    raise exception 'coaching needs a connected repository in workspace %',
      target_workspace_id;
  end if;

  -- Success bills one credit (`coachingCreditCost`); BYOK reserves nothing.
  coaching_cost := case requested_billing_mode when 'credits' then 1 else 0 end;

  insert into public.runs (workspace_id, repository_id, trigger_kind, trigger_key)
  values (target_workspace_id, coaching_repository_id, 'manual', 'coaching:' || target_prompt_record_id)
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into coaching_run_id;

  return public.enqueue_job(
    target_workspace_id, coaching_repository_id, coaching_run_id, 'coach',
    'coaching:' || target_prompt_record_id,
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode,
      'promptText', record_text,
      'promptRecordId', target_prompt_record_id
    ),
    coaching_cost, 3
  );
end;
$$;

revoke all on function public.enqueue_judgment_job(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.enqueue_judgment_job(text,text,text,text)
  to service_role;
revoke all on function public.enqueue_coaching_job(text,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.enqueue_coaching_job(text,text,uuid,text,text)
  to service_role;

commit;
