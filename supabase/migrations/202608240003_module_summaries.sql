-- Lazy module summaries (Phase 3 Wave C todo 8).
--
-- LazyGraphRAG's cost model: the structure index is always fresh and free;
-- prose about a module is generated on first demand, cached against a digest
-- of its members' blobs, and invalidated the moment a member changes. The
-- MCP `explain_module` tool reads this cache and — on miss or staleness —
-- enqueues an `enrich` job scoped to the module, inheriting the credit
-- lifecycle like every other AI call. Summaries are `inferred` (ADR-001).

create table public.module_summaries (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  module_key text not null,
  name text not null,
  member_paths text[] not null default '{}',
  member_digest text not null,
  summary text not null,
  model text not null,
  provider text not null,
  grade text not null default 'inferred',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_summaries_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint module_summaries_grade check (grade = 'inferred'),
  constraint module_summaries_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  constraint module_summaries_workspace_repository_key_unique
    unique (workspace_id, repository_id, module_key)
);

alter table public.module_summaries enable row level security;

create policy module_summaries_owner_select on public.module_summaries
  for select to authenticated
  using (public.is_workspace_owner(workspace_id));

-- The recurring trap: tables created after the blanket grants name roles.
grant select on public.module_summaries to authenticated;
grant all on public.module_summaries to service_role;

-- Lazy enqueue: called by the MCP tool on a cache miss or a stale digest.
-- Idempotent per (module, digest) — a hundred agents asking about the same
-- stale module enqueue one job.
create or replace function public.enqueue_module_summary_job(
  target_workspace_id text,
  target_repository_id text,
  target_module_key text,
  target_member_paths text[],
  target_member_digest text,
  requested_provider text,
  requested_billing_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_run_id text;
  module_job_key text;
begin
  if requested_provider not in ('anthropic', 'openai') then
    raise exception 'unsupported enrich provider: %', requested_provider;
  end if;
  if requested_billing_mode not in ('byok', 'credits') then
    raise exception 'unsupported enrich billing mode: %', requested_billing_mode;
  end if;

  module_job_key := 'module:' || target_repository_id || ':' || target_module_key
    || ':' || target_member_digest;

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual', module_job_key,
    (select last_scanned_commit_sha from public.repositories
     where workspace_id = target_workspace_id and id = target_repository_id)
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
  set commit_sha = excluded.commit_sha
  returning id into module_run_id;

  return public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    module_run_id,
    'enrich',
    module_job_key,
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode,
      'moduleKey', target_module_key,
      'memberPaths', to_jsonb(target_member_paths),
      'memberDigest', target_member_digest
    ),
    case when requested_billing_mode = 'credits' then 1 else 0 end,
    3
  );
end;
$$;

revoke all on function public.enqueue_module_summary_job(text, text, text, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_module_summary_job(text, text, text, text[], text, text, text) to service_role;

create or replace function public.apply_module_summary(
  target_workspace_id text,
  target_repository_id text,
  target_module_key text,
  target_name text,
  target_member_paths text[],
  target_member_digest text,
  target_summary text,
  target_model text,
  target_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.module_summaries (
    workspace_id, repository_id, module_key, name, member_paths,
    member_digest, summary, model, provider
  ) values (
    target_workspace_id, target_repository_id, target_module_key, target_name,
    target_member_paths, target_member_digest, target_summary, target_model,
    target_provider
  )
  on conflict (workspace_id, repository_id, module_key) do update
  set name = excluded.name,
      member_paths = excluded.member_paths,
      member_digest = excluded.member_digest,
      summary = excluded.summary,
      model = excluded.model,
      provider = excluded.provider,
      updated_at = now();
end;
$$;

revoke all on function public.apply_module_summary(text, text, text, text, text[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_module_summary(text, text, text, text, text[], text, text, text, text) to service_role;

-- Requeue-on-failure for the enrich enqueues (pilot round 4 finding): the
-- idempotency key is derived from the *pending state*, so a failed job and a
-- retry of the same state share a key — without this, one terminal failure
-- would freeze that state forever. A failed/cancelled job returned by the
-- idempotent enqueue is reset to queued with fresh attempts; queued/running/
-- succeeded jobs are returned untouched.
create or replace function public.requeue_enrich_job_if_terminal(target_job_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
  set status = 'queued',
      attempt_count = 0,
      completed_at = null,
      claimed_at = null,
      heartbeat_at = null,
      lease_expires_at = null,
      worker_id = null,
      last_error = null,
      available_at = now()
  where id = target_job_id
    and kind = 'enrich'
    and status in ('failed', 'cancelled');
end;
$$;

revoke all on function public.requeue_enrich_job_if_terminal(text) from public, anon, authenticated;
grant execute on function public.requeue_enrich_job_if_terminal(text) to service_role;

create or replace function public.enqueue_enrich_job(
  target_workspace_id text,
  target_repository_id text,
  requested_provider text,
  requested_billing_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_digest text;
  pending_count integer;
  summarized_digest text;
  concept_digest text;
  concepts_stale boolean;
  scanned_commit text;
  enrich_key text;
  enrich_run_id text;
  enrich_job_id text;
begin
  if requested_provider not in ('anthropic', 'openai') then
    raise exception 'unsupported enrich provider: %', requested_provider;
  end if;
  if requested_billing_mode not in ('byok', 'credits') then
    raise exception 'unsupported enrich billing mode: %', requested_billing_mode;
  end if;

  select count(*)::integer,
         md5(coalesce(string_agg(source_blob_sha, ',' order by path), ''))
  into pending_count, pending_digest
  from public.artifacts
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id
    and source_blob_sha is not null
    and (metadata->>'summaryBlobSha') is distinct from source_blob_sha;

  select md5(string_agg(path || ':' || (metadata->>'summaryBlobSha'), E'\n' order by path collate "C"))
  into summarized_digest
  from public.artifacts
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id
    and (metadata->>'summaryBlobSha') = source_blob_sha;

  select min(source_digest) into concept_digest
  from public.concepts
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id;

  concepts_stale := summarized_digest is not null
    and (concept_digest is null or concept_digest <> summarized_digest);

  if pending_count = 0 and not concepts_stale then
    return null;
  end if;

  select last_scanned_commit_sha into scanned_commit
  from public.repositories
  where workspace_id = target_workspace_id and id = target_repository_id;

  enrich_key := 'enrich:' || target_repository_id || ':' || requested_provider
    || ':' || requested_billing_mode || ':' || pending_digest
    || ':' || coalesce(summarized_digest, 'none');

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual', enrich_key, scanned_commit
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
  set commit_sha = excluded.commit_sha
  returning id into enrich_run_id;

  enrich_job_id := public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    enrich_run_id,
    'enrich',
    enrich_key,
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode
    ),
    case when requested_billing_mode = 'credits' then 1 else 0 end,
    3
  );
  perform public.requeue_enrich_job_if_terminal(enrich_job_id);
  return enrich_job_id;
end;
$$;

create or replace function public.enqueue_module_summary_job(
  target_workspace_id text,
  target_repository_id text,
  target_module_key text,
  target_member_paths text[],
  target_member_digest text,
  requested_provider text,
  requested_billing_mode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_run_id text;
  module_job_key text;
  module_job_id text;
begin
  if requested_provider not in ('anthropic', 'openai') then
    raise exception 'unsupported enrich provider: %', requested_provider;
  end if;
  if requested_billing_mode not in ('byok', 'credits') then
    raise exception 'unsupported enrich billing mode: %', requested_billing_mode;
  end if;

  module_job_key := 'module:' || target_repository_id || ':' || target_module_key
    || ':' || target_member_digest;

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual', module_job_key,
    (select last_scanned_commit_sha from public.repositories
     where workspace_id = target_workspace_id and id = target_repository_id)
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
  set commit_sha = excluded.commit_sha
  returning id into module_run_id;

  module_job_id := public.enqueue_job(
    target_workspace_id,
    target_repository_id,
    module_run_id,
    'enrich',
    module_job_key,
    jsonb_build_object(
      'provider', requested_provider,
      'billingMode', requested_billing_mode,
      'moduleKey', target_module_key,
      'memberPaths', to_jsonb(target_member_paths),
      'memberDigest', target_member_digest
    ),
    case when requested_billing_mode = 'credits' then 1 else 0 end,
    3
  );
  perform public.requeue_enrich_job_if_terminal(module_job_id);
  return module_job_id;
end;
$$;
