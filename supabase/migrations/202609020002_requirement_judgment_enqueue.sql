begin;

-- Requirement disambiguation — the third judgment kind of WORK_SPEC §14, and
-- the one whose target is a requirement rather than a finding. It follows
-- `enqueue_judgment_job` exactly (security definer, service_role-only,
-- retry generations via `next_retry_idempotency_key`), with two deliberate
-- differences:
--   * A requirement carries no deterministic confidence or severity, but the
--     strict judgment request needs both. They are sent as a neutral
--     baseline (0.5 / low) and, because `apply_successful_judgment` only
--     rewrites `findings`, nothing is written back onto the requirement —
--     the judgment row (verdict + explanation) IS the deliverable.
--   * Context is the requirement's own statement (graph metadata, not a
--     source body) plus where it came from.
create or replace function public.enqueue_requirement_judgment_job(
  target_workspace_id text,
  target_requirement_id text,
  requested_provider text,
  requested_billing_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requirement public.requirements%rowtype;
  source_path text;
  judgment_run_id text;
  judgment_cost integer;
begin
  if requested_provider not in ('anthropic', 'openai') then
    raise exception 'unsupported judgment provider: %', requested_provider;
  end if;
  if requested_billing_mode not in ('byok', 'credits') then
    raise exception 'unsupported judgment billing mode: %', requested_billing_mode;
  end if;

  select * into requirement
  from public.requirements
  where id = target_requirement_id and workspace_id = target_workspace_id;
  if not found then
    raise exception 'requirement % is not in workspace %',
      target_requirement_id, target_workspace_id;
  end if;
  if requirement.status <> 'active' then
    raise exception 'only active requirements can be disambiguated (requirement % is %)',
      target_requirement_id, requirement.status;
  end if;

  select path into source_path
  from public.artifacts
  where workspace_id = target_workspace_id
    and repository_id = requirement.repository_id
    and id = requirement.source_artifact_id;

  judgment_cost := case requested_billing_mode when 'credits' then 10 else 0 end;

  insert into public.runs (workspace_id, repository_id, trigger_kind, trigger_key)
  values (target_workspace_id, requirement.repository_id, 'manual',
          'requirement-judgment:' || target_requirement_id)
  on conflict (workspace_id, repository_id, trigger_key) do update
    set trigger_key = excluded.trigger_key
  returning id into judgment_run_id;

  return public.enqueue_job(
    target_workspace_id, requirement.repository_id, judgment_run_id, 'judge',
    public.next_retry_idempotency_key(
      target_workspace_id, 'requirement-judgment:' || target_requirement_id),
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode,
      'kind', 'requirement-disambiguation',
      'targetId', target_requirement_id,
      'currentConfidence', 0.5,
      'currentSeverity', 'low',
      'context', jsonb_build_array(
        left('requirement ' || target_requirement_id
          || ' (status ' || requirement.status
          || ', source ' || coalesce(source_path, requirement.source_artifact_id)
          || ', span ' || requirement.source_span::text || ')', 4000),
        left('statement: ' || requirement.statement, 4000)
      )
    ),
    judgment_cost, 3
  );
end;
$$;

revoke all on function public.enqueue_requirement_judgment_job(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.enqueue_requirement_judgment_job(text,text,text,text)
  to service_role;

commit;
