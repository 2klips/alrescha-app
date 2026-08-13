create table public.judgments (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  job_id text not null,
  kind text not null,
  target_id text not null,
  provider text not null,
  model text not null,
  payload jsonb not null,
  payload_digest text not null,
  evidence_grade text not null default 'inferred',
  created_at timestamptz not null default now(),
  constraint judgments_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint judgments_kind check (
    kind in ('drift-verdict-confirmation', 'requirement-disambiguation', 'contradiction-confirmation')
  ),
  constraint judgments_evidence_grade_inferred check (evidence_grade = 'inferred'),
  constraint judgments_payload_digest_sha256 check (payload_digest ~ '^[0-9a-f]{64}$'),
  constraint judgments_payload_inferred check (payload ->> 'evidenceGrade' = 'inferred'),
  constraint judgments_job_tenant_fk foreign key (workspace_id, repository_id, job_id)
    references public.jobs(workspace_id, repository_id, id) on delete cascade,
  constraint judgments_job_unique unique (job_id)
);

create index judgments_workspace_repository_created_idx
  on public.judgments(workspace_id, repository_id, created_at desc);

create table public.judgment_attempts (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  job_id text not null,
  attempt_number integer not null,
  provider text not null,
  model text not null,
  status text not null,
  error_code text not null,
  payload_digest text not null,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint judgment_attempts_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint judgment_attempts_attempt_positive check (attempt_number > 0),
  constraint judgment_attempts_status check (status = 'rejected'),
  constraint judgment_attempts_error_code check (error_code = 'schema_invalid'),
  constraint judgment_attempts_payload_digest_sha256 check (payload_digest ~ '^[0-9a-f]{64}$'),
  constraint judgment_attempts_job_tenant_fk foreign key (workspace_id, repository_id, job_id)
    references public.jobs(workspace_id, repository_id, id) on delete cascade,
  constraint judgment_attempts_job_attempt_unique unique (job_id, attempt_number)
);

create table public.workspace_ai_keys (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  provider text not null,
  algorithm text not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider),
  constraint workspace_ai_keys_provider check (provider in ('anthropic', 'openai')),
  constraint workspace_ai_keys_algorithm check (algorithm = 'aes-256-gcm'),
  constraint workspace_ai_keys_version check (key_version = 1),
  constraint workspace_ai_keys_ciphertext_nonempty check (char_length(ciphertext) > 0),
  constraint workspace_ai_keys_iv_nonempty check (char_length(iv) > 0),
  constraint workspace_ai_keys_auth_tag_nonempty check (char_length(auth_tag) > 0)
);

create or replace function public.record_successful_judgment(
  target_job_id text,
  target_workspace_id text,
  target_repository_id text,
  judgment_kind text,
  judgment_target_id text,
  judgment_provider text,
  judgment_payload jsonb,
  judgment_payload_digest text,
  judgment_model text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  judgment_id text;
begin
  if judgment_payload ->> 'evidenceGrade' is distinct from 'inferred' then
    raise exception 'judgment payload must remain inferred';
  end if;

  insert into public.judgments (
    workspace_id, repository_id, job_id, kind, target_id,
    provider, model, payload, payload_digest, evidence_grade
  ) values (
    target_workspace_id, target_repository_id, target_job_id, judgment_kind,
    judgment_target_id, judgment_provider, judgment_model, judgment_payload,
    judgment_payload_digest, 'inferred'
  )
  on conflict (job_id) do update set job_id = excluded.job_id
  returning id into judgment_id;

  return judgment_id;
end;
$$;

create or replace function public.record_invalid_judgment(
  target_job_id text,
  target_workspace_id text,
  target_repository_id text,
  judgment_provider text,
  judgment_model text,
  judgment_issues jsonb,
  judgment_payload_digest text,
  target_attempt_number integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_id text;
begin
  insert into public.judgment_attempts (
    workspace_id, repository_id, job_id, attempt_number, provider, model,
    status, error_code, payload_digest, issues
  ) values (
    target_workspace_id, target_repository_id, target_job_id,
    target_attempt_number, judgment_provider, judgment_model, 'rejected',
    'schema_invalid', judgment_payload_digest, judgment_issues
  )
  on conflict (job_id, attempt_number) do update set job_id = excluded.job_id
  returning id into attempt_id;
  return attempt_id;
end;
$$;

create or replace function public.apply_successful_judgment(
  target_job_id text,
  target_workspace_id text,
  target_repository_id text,
  judgment_kind text,
  judgment_target_id text,
  judgment_provider text,
  judgment_payload jsonb,
  judgment_payload_digest text,
  judgment_model text,
  target_confidence numeric,
  target_severity text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  judgment_id text;
begin
  if target_confidence not between 0 and 1 then
    raise exception 'judgment confidence must be between zero and one';
  end if;
  if target_severity not in ('low', 'medium') then
    raise exception 'inferred judgment severity must not exceed medium';
  end if;

  judgment_id := public.record_successful_judgment(
    target_job_id, target_workspace_id, target_repository_id, judgment_kind,
    judgment_target_id, judgment_provider, judgment_payload,
    judgment_payload_digest, judgment_model
  );

  update public.findings
  set confidence = greatest(confidence, target_confidence),
      evidence_grade = 'inferred',
      severity = target_severity
  where id = judgment_target_id
    and workspace_id = target_workspace_id
    and repository_id = target_repository_id;

  return judgment_id;
end;
$$;

alter table public.judgments enable row level security;
alter table public.judgments force row level security;
alter table public.judgment_attempts enable row level security;
alter table public.judgment_attempts force row level security;
alter table public.workspace_ai_keys enable row level security;
alter table public.workspace_ai_keys force row level security;

create policy judgments_select_member on public.judgments
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy judgment_attempts_select_member on public.judgment_attempts
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.judgments, public.judgment_attempts to authenticated;
grant all on public.judgments, public.judgment_attempts, public.workspace_ai_keys to service_role;

revoke all on function public.record_successful_judgment(text,text,text,text,text,text,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.record_successful_judgment(text,text,text,text,text,text,jsonb,text,text)
  to service_role;
revoke all on function public.record_invalid_judgment(text,text,text,text,text,jsonb,text,integer)
  from public, anon, authenticated;
grant execute on function public.record_invalid_judgment(text,text,text,text,text,jsonb,text,integer)
  to service_role;
revoke all on function public.apply_successful_judgment(text,text,text,text,text,text,jsonb,text,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.apply_successful_judgment(text,text,text,text,text,text,jsonb,text,text,numeric,text)
  to service_role;

create or replace function public.reject_job(
  target_job_id text,
  target_worker_id text,
  failure_message text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs%rowtype;
begin
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.worker_id is distinct from target_worker_id or target_job.status <> 'running' then
    return 'ignored';
  end if;

  update public.jobs
  set status = 'failed', completed_at = now(), lease_expires_at = null,
      last_error = left(coalesce(failure_message, 'job rejected'), 2000)
  where id = target_job.id;
  perform public.settle_job_credits(target_job.id, false);
  return 'failed';
end;
$$;

revoke all on function public.reject_job(text,text,text) from public, anon, authenticated;
grant execute on function public.reject_job(text,text,text) to service_role;
