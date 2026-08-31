begin;

-- Coaching results land on the prompt record itself: `prompt_records.rubric`
-- was reserved for exactly this shape (202608170005), and the team surfaces
-- read a record's rubric from that column. Invalid model outputs get the same
-- treatment judgment already has — an append-only rejected-attempt log that
-- is never billed (schema-invalid AI output carries no charge).

create table public.prompt_coaching_attempts (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  job_id text not null references public.jobs(id) on delete cascade,
  attempt_number integer not null,
  provider text not null,
  model text not null,
  status text not null,
  error_code text not null,
  message text not null default '',
  payload_digest text not null,
  created_at timestamptz not null default now(),
  constraint prompt_coaching_attempts_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint prompt_coaching_attempts_attempt_positive check (attempt_number > 0),
  constraint prompt_coaching_attempts_status check (status = 'rejected'),
  constraint prompt_coaching_attempts_error_code check (error_code = 'schema_invalid'),
  constraint prompt_coaching_attempts_payload_digest_sha256 check (payload_digest ~ '^[0-9a-f]{64}$'),
  constraint prompt_coaching_attempts_job_attempt_unique unique (job_id, attempt_number)
);

create index prompt_coaching_attempts_workspace_idx
  on public.prompt_coaching_attempts (workspace_id, created_at desc);

alter table public.prompt_coaching_attempts enable row level security;
alter table public.prompt_coaching_attempts force row level security;

-- Member SELECT in the initplan-friendly shape 202608300001 standardized:
-- the inner select depends only on auth.uid(), so Postgres evaluates it once
-- instead of per row.
create policy prompt_coaching_attempts_select_member on public.prompt_coaching_attempts
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

grant select on public.prompt_coaching_attempts to authenticated;
grant all on public.prompt_coaching_attempts to service_role;

create or replace function public.apply_prompt_coaching(
  target_job_id text,
  target_workspace_id text,
  target_prompt_record_id text,
  coaching_provider text,
  coaching_model text,
  coaching_payload jsonb,
  coaching_payload_digest text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  -- Schema-level echo of the hard rule: coaching output is ALWAYS inferred.
  -- A payload claiming any other grade, or missing the rubric/suggestions
  -- shape, never lands on a record no matter what the caller validated.
  if coaching_payload->>'grade' is distinct from 'inferred'
     or coaching_payload->'rubric' is null
     or coaching_payload->'suggestions' is null then
    raise exception 'coaching payload must be an inferred rubric with suggestions';
  end if;

  update public.prompt_records
  set rubric = coaching_payload
  where id = target_prompt_record_id
    and workspace_id = target_workspace_id;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'prompt record % is not in workspace %',
      target_prompt_record_id, target_workspace_id;
  end if;
  return target_prompt_record_id;
end;
$$;

create or replace function public.record_invalid_prompt_coaching(
  target_job_id text,
  target_workspace_id text,
  coaching_provider text,
  coaching_model text,
  failure_message text,
  coaching_payload_digest text,
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
  insert into public.prompt_coaching_attempts (
    workspace_id, job_id, attempt_number, provider, model,
    status, error_code, message, payload_digest
  ) values (
    target_workspace_id, target_job_id, target_attempt_number,
    coaching_provider, coaching_model, 'rejected', 'schema_invalid',
    left(coalesce(failure_message, ''), 500), coaching_payload_digest
  )
  on conflict (job_id, attempt_number) do update set job_id = excluded.job_id
  returning id into attempt_id;
  return attempt_id;
end;
$$;

revoke all on function public.apply_prompt_coaching(text,text,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.apply_prompt_coaching(text,text,text,text,text,jsonb,text)
  to service_role;
revoke all on function public.record_invalid_prompt_coaching(text,text,text,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.record_invalid_prompt_coaching(text,text,text,text,text,text,integer)
  to service_role;

commit;
