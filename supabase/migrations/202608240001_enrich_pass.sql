-- The enrich pass (Phase 3 Wave C todo 6).
--
-- `enrich` becomes the sixth job kind: an AI call that writes prose file
-- summaries into artifact metadata. Like `judge` and `coach` it inherits the
-- credit lifecycle wholesale — reserve on claim, settle on success, refund on
-- reject — so the no-charge rule holds by construction, not by a parallel
-- implementation.
--
-- Billing shape (recorded discretionary default): one enrich job costs 1
-- credit when at least one file actually needs a model call, and is not
-- enqueued at all when the blob-hash cache already covers every file — that
-- is what "cache hit costs nothing" means at the ledger. BYOK enqueues at 0.
--
-- This migration also closes the Wave D finding: `apply_repository_scan` now
-- derives `index_entries` deterministically from the plan (title, path,
-- symbols, classification), so `search_index`/`search_nodes` serve real
-- scanned workspaces, not just fixtures. Existing artifacts are backfilled.

alter table public.jobs drop constraint jobs_kind;
alter table public.jobs
  add constraint jobs_kind
  check (kind in ('scan', 'analyze', 'judge', 'pack', 'coach', 'enrich'));

create or replace function public.enqueue_job(
  target_workspace_id text,
  target_repository_id text,
  target_run_id text,
  job_kind text,
  target_idempotency_key text,
  job_payload jsonb default '{}'::jsonb,
  requested_credit_cost integer default 0,
  requested_max_attempts integer default 3
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job_id text;
  new_job_id text;
  rate_limit integer;
  current_window public.workspace_enqueue_windows%rowtype;
begin
  select id into existing_job_id
  from public.jobs
  where workspace_id = target_workspace_id and idempotency_key = target_idempotency_key;

  if existing_job_id is not null then
    return existing_job_id;
  end if;

  -- 'enrich' joins the billable kinds: like 'judge' and 'coach' it calls a
  -- model, so it may carry a credit cost. The deterministic kinds still may not.
  if job_kind not in ('scan', 'analyze', 'judge', 'pack', 'coach', 'enrich') then
    raise exception 'unsupported job kind: %', job_kind;
  end if;
  if job_kind in ('scan', 'analyze') and requested_credit_cost <> 0 then
    raise exception 'deterministic jobs must have zero credit cost';
  end if;
  if requested_credit_cost < 0 then
    raise exception 'credit cost must be nonnegative';
  end if;
  if requested_max_attempts not between 1 and 10 then
    raise exception 'max attempts must be between 1 and 10';
  end if;

  insert into public.workspace_job_settings (workspace_id)
  values (target_workspace_id)
  on conflict (workspace_id) do nothing;

  select max_enqueues_per_minute into rate_limit
  from public.workspace_job_settings
  where workspace_id = target_workspace_id
  for update;

  insert into public.workspace_enqueue_windows (workspace_id)
  values (target_workspace_id)
  on conflict (workspace_id) do nothing;

  select * into current_window
  from public.workspace_enqueue_windows
  where workspace_id = target_workspace_id
  for update;

  if current_window.window_started_at + interval '1 minute' <= now() then
    update public.workspace_enqueue_windows
    set window_started_at = date_trunc('minute', now()), enqueue_count = 0
    where workspace_id = target_workspace_id;
    current_window.enqueue_count := 0;
  end if;

  if current_window.enqueue_count >= rate_limit then
    raise exception 'workspace enqueue rate limit exceeded';
  end if;

  update public.workspace_enqueue_windows
  set enqueue_count = enqueue_count + 1
  where workspace_id = target_workspace_id;

  insert into public.jobs (
    workspace_id, repository_id, run_id, kind, idempotency_key, payload,
    credit_cost, max_attempts
  ) values (
    target_workspace_id, target_repository_id, target_run_id, job_kind,
    target_idempotency_key, job_payload, requested_credit_cost, requested_max_attempts
  )
  returning id into new_job_id;

  return new_job_id;
exception
  when unique_violation then
    select id into existing_job_id
    from public.jobs
    where workspace_id = target_workspace_id and idempotency_key = target_idempotency_key;
    return existing_job_id;
end;
$$;

revoke all on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer) to service_role;

-- Cache-aware enqueue: the single place that decides whether an enrich job
-- exists at all and what it may cost. Pending = artifacts whose stored blob
-- sha differs from the sha their summary was computed from. No pending files
-- → no job, no ledger movement — the cache-hit-costs-nothing proof.
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
  scanned_commit text;
  enrich_key text;
  enrich_run_id text;
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

  if pending_count = 0 then
    return null;
  end if;

  select last_scanned_commit_sha into scanned_commit
  from public.repositories
  where workspace_id = target_workspace_id and id = target_repository_id;

  enrich_key := 'enrich:' || target_repository_id || ':' || requested_provider
    || ':' || requested_billing_mode || ':' || pending_digest;

  insert into public.runs (
    workspace_id, repository_id, trigger_kind, trigger_key, commit_sha
  ) values (
    target_workspace_id, target_repository_id, 'manual', enrich_key, scanned_commit
  )
  on conflict (workspace_id, repository_id, trigger_key) do update
  set commit_sha = excluded.commit_sha
  returning id into enrich_run_id;

  return public.enqueue_job(
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
end;
$$;

revoke all on function public.enqueue_enrich_job(text, text, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_enrich_job(text, text, text, text) to service_role;

-- Persistence for the enrich job's output. Prose only ever lands in artifact
-- metadata (the raw source stays transient in the job). Items carry a kind:
-- 'summary' stores the validated prose + the blob sha it was computed from
-- (the cache key); 'skip' records a provider failure gate without touching
-- the cache key, so the next enqueue picks the file up again.
create or replace function public.apply_artifact_summaries(
  target_workspace_id text,
  target_repository_id text,
  summaries jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  touched integer := 0;
begin
  for item in select jsonb_array_elements(coalesce(summaries, '[]'::jsonb))
  loop
    if item->>'kind' = 'summary' then
      update public.artifacts
      set metadata = (coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'summary', item->>'summary',
            'summaryBlobSha', item->>'summaryBlobSha',
            'summaryModel', item->>'model',
            'summaryProvider', item->>'provider',
            'summaryGrade', 'inferred',
            'summaryUpdatedAt', now()
          )) - 'summarySkipped',
          updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item->>'path';
    elsif item->>'kind' = 'skip' then
      update public.artifacts
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'summarySkipped', jsonb_build_object(
              'reason', item->>'reason',
              'observedAt', now()
            )
          ),
          updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item->>'path';
    else
      raise exception 'unsupported summary item kind: %', item->>'kind';
    end if;
    touched := touched + 1;
  end loop;
  return touched;
end;
$$;

revoke all on function public.apply_artifact_summaries(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_artifact_summaries(text, text, jsonb) to service_role;

-- apply_repository_scan gains deterministic index sync (Wave D finding).
-- Still the single persistence implementation for a scan plan.
create or replace function public.apply_repository_scan(
  target_workspace_id text,
  target_repository_id text,
  plan jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_commit_sha text := plan->>'commitSha';
  plan_touched integer := coalesce((plan->>'touchedRows')::integer, 0);
  removed_path text;
  artifact jsonb;
  skip jsonb;
  todo jsonb;
  artifact_node_id text;
  todo_keys text[];
  rationale jsonb;
  rationale_id text;
  rationale_keys text[];
  rationale_line integer;
  artifact_metadata jsonb;
  scanned_paths text[];
  code_link jsonb;
  link_source_id text;
  link_target_id text;
  artifact_symbols text[];
  artifact_basename text;
begin
  if plan->>'treeSha' is null and plan_touched = 0 then
    return 0;
  end if;

  for removed_path in
    select jsonb_array_elements_text(coalesce(plan->'removedPaths', '[]'::jsonb))
  loop
    delete from public.graph_nodes
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and id in (
        select rationale_row.id from public.rationales rationale_row
        where rationale_row.workspace_id = target_workspace_id
          and rationale_row.repository_id = target_repository_id
          and rationale_row.artifact_id in (
            select id from public.artifacts
            where workspace_id = target_workspace_id
              and repository_id = target_repository_id
              and path = removed_path
          )
      );
    delete from public.graph_nodes
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and id in (
        select id from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and path = removed_path
      );
  end loop;

  for artifact in
    select jsonb_array_elements(coalesce(plan->'artifacts', '[]'::jsonb))
  loop
    select id into artifact_node_id
    from public.artifacts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and path = artifact->>'path';

    if artifact_node_id is null then
      insert into public.graph_nodes (workspace_id, repository_id, kind, label)
      values (target_workspace_id, target_repository_id, 'artifact', artifact->>'path')
      returning id into artifact_node_id;
    end if;

    artifact_metadata := case
      when artifact->>'symbolEngine' is null then '{}'::jsonb
      else jsonb_build_object('symbolEngine', artifact->>'symbolEngine')
    end;

    insert into public.artifacts (
      id, workspace_id, repository_id, kind, classification, path, digest,
      source_blob_sha, source_commit_sha, last_seen_commit_sha, size_bytes,
      exported_symbols, metadata
    ) values (
      artifact_node_id, target_workspace_id, target_repository_id,
      artifact->>'kind', artifact->>'classification', artifact->>'path',
      artifact->>'digest', artifact->>'sourceBlobSha', artifact->>'sourceCommitSha',
      artifact->>'sourceCommitSha', (artifact->>'sizeBytes')::integer,
      coalesce(artifact->'exportedSymbols', '[]'::jsonb), artifact_metadata
    )
    on conflict (workspace_id, repository_id, path) do update
    set kind = excluded.kind,
        classification = excluded.classification,
        digest = excluded.digest,
        source_blob_sha = excluded.source_blob_sha,
        source_commit_sha = excluded.source_commit_sha,
        last_seen_commit_sha = excluded.last_seen_commit_sha,
        size_bytes = excluded.size_bytes,
        exported_symbols = excluded.exported_symbols,
        -- Merge: keep summaries and any other stored keys.
        metadata = coalesce(artifacts.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now();

    -- Deterministic search index (Wave C todo 6): title, path, symbols and
    -- classification, all derived from the plan — zero credits, replayable.
    select coalesce(array_agg(item->>'name'), array[]::text[])
    into artifact_symbols
    from jsonb_array_elements(coalesce(artifact->'exportedSymbols', '[]'::jsonb)) item;

    artifact_basename := regexp_replace(artifact->>'path', '^.*/', '');

    insert into public.index_entries (
      workspace_id, repository_id, node_id, entry_type, title, path,
      symbols, tags, headings, search_key, neighbor_ids, updated_at
    ) values (
      target_workspace_id, target_repository_id, artifact_node_id,
      'artifact', artifact_basename, artifact->>'path',
      artifact_symbols,
      array[artifact->>'classification', artifact->>'kind'],
      array[]::text[],
      lower(
        (artifact->>'path') || ' ' || artifact_basename || ' ' ||
        (artifact->>'classification') || ' ' ||
        array_to_string(artifact_symbols, ' ')
      ),
      array[]::text[],
      now()
    )
    on conflict (workspace_id, node_id) do update
    set entry_type = excluded.entry_type,
        title = excluded.title,
        path = excluded.path,
        symbols = excluded.symbols,
        tags = excluded.tags,
        search_key = excluded.search_key,
        updated_at = now();

    select coalesce(array_agg(item->>'sourceKey'), array[]::text[])
    into todo_keys
    from jsonb_array_elements(coalesce(artifact->'todoItems', '[]'::jsonb)) item;

    delete from public.todos
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and source_artifact_id = artifact_node_id
      and source_kind = 'document'
      and not (source_key = any(todo_keys));

    for todo in
      select jsonb_array_elements(coalesce(artifact->'todoItems', '[]'::jsonb))
    loop
      insert into public.todos (
        workspace_id, repository_id, title, status, source_kind, source_key,
        source_artifact_id, source_path, source_span
      ) values (
        target_workspace_id, target_repository_id,
        todo->>'title', todo->>'status', 'document', todo->>'sourceKey',
        artifact_node_id, todo->'source'->>'path', todo->'source'->'span'
      )
      on conflict (workspace_id, source_kind, source_key) do update
      set title = excluded.title,
          status = excluded.status,
          repository_id = excluded.repository_id,
          source_artifact_id = excluded.source_artifact_id,
          source_path = excluded.source_path,
          source_span = excluded.source_span,
          updated_at = now();
    end loop;

    select coalesce(array_agg(item->>'sourceKey'), array[]::text[])
    into rationale_keys
    from jsonb_array_elements(coalesce(artifact->'rationales', '[]'::jsonb)) item;

    delete from public.graph_nodes
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and id in (
        select rationale_row.id from public.rationales rationale_row
        where rationale_row.workspace_id = target_workspace_id
          and rationale_row.repository_id = target_repository_id
          and rationale_row.artifact_id = artifact_node_id
          and not (rationale_row.source_key = any(rationale_keys))
      );

    for rationale in
      select jsonb_array_elements(coalesce(artifact->'rationales', '[]'::jsonb))
    loop
      rationale_line := (rationale->>'line')::integer;
      select id into rationale_id
      from public.rationales
      where workspace_id = target_workspace_id
        and source_key = rationale->>'sourceKey';

      if rationale_id is null then
        insert into public.graph_nodes (workspace_id, repository_id, kind, label)
        values (
          target_workspace_id, target_repository_id, 'rationale',
          rationale->>'text'
        )
        returning id into rationale_id;

        insert into public.rationales (
          id, workspace_id, repository_id, artifact_id, kind, text, adr_ref,
          source_path, source_line, source_key
        ) values (
          rationale_id, target_workspace_id, target_repository_id, artifact_node_id,
          rationale->>'kind', rationale->>'text', rationale->>'adrRef',
          artifact->>'path', rationale_line, rationale->>'sourceKey'
        );

        insert into public.edges (
          workspace_id, repository_id, source_node_id, target_node_id,
          relation, provenance, confidence
        ) values (
          target_workspace_id, target_repository_id, rationale_id, artifact_node_id,
          'references',
          jsonb_build_object(
            'sourceArtifactId', artifact_node_id,
            'span', jsonb_build_object(
              'path', artifact->>'path',
              'startLine', rationale_line,
              'endLine', rationale_line
            )
          ),
          1.0
        )
        on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
        do nothing;
      else
        update public.rationales
        set kind = rationale->>'kind',
            text = rationale->>'text',
            adr_ref = rationale->>'adrRef',
            source_path = artifact->>'path',
            source_line = rationale_line,
            artifact_id = artifact_node_id,
            updated_at = now()
        where id = rationale_id and workspace_id = target_workspace_id;

        update public.graph_nodes
        set label = rationale->>'text'
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and id = rationale_id;
      end if;
    end loop;
  end loop;

  -- Code-link sync (Wave B todo 3): every file scanned this pass replaces its
  -- outgoing structure edges, then the plan's links are written back. A link
  -- whose target was skipped (oversized, binary) simply has no node — skip.
  select coalesce(
    array_agg(item->>'path'), array[]::text[]
  ) into scanned_paths
  from jsonb_array_elements(coalesce(plan->'artifacts', '[]'::jsonb)) item;

  delete from public.edges
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id
    and relation in ('imports', 'calls')
    and source_node_id in (
      select id from public.artifacts
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = any(scanned_paths)
    );

  for code_link in
    select jsonb_array_elements(coalesce(plan->'codeLinks', '[]'::jsonb))
  loop
    select id into link_source_id
    from public.artifacts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and path = code_link->>'sourcePath';

    select id into link_target_id
    from public.artifacts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and path = code_link->>'targetPath';

    if link_source_id is not null
      and link_target_id is not null
      and link_source_id <> link_target_id then
      insert into public.edges (
        workspace_id, repository_id, source_node_id, target_node_id,
        relation, provenance, confidence
      ) values (
        target_workspace_id, target_repository_id, link_source_id, link_target_id,
        code_link->>'kind',
        jsonb_build_object(
          'sourceArtifactId', link_source_id,
          'span', jsonb_build_object(
            'path', code_link->>'sourcePath',
            'startLine', (code_link->'span'->>'startLine')::integer,
            'endLine', (code_link->'span'->>'endLine')::integer
          ),
          'tier', code_link->>'tier',
          'method', code_link->>'method',
          'symbols', coalesce(code_link->'symbols', '[]'::jsonb)
        ),
        case when code_link->>'tier' = 'resolved' then 1.0 else 0.6 end
      )
      on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
      do update set
        provenance = excluded.provenance,
        confidence = excluded.confidence;
    end if;
  end loop;

  -- Neighbor cache for the scanned files' index entries, read from the edges
  -- that exist after the sync above (structure, rationale and legacy alike).
  update public.index_entries ie
  set neighbor_ids = coalesce(partners.ids, array[]::text[]),
      updated_at = now()
  from (
    select scanned.id as node_id,
           array_remove(array_agg(distinct partner.partner_id), null) as ids
    from public.artifacts scanned
    left join lateral (
      select case
          when edge.source_node_id = scanned.id then edge.target_node_id
          else edge.source_node_id
        end as partner_id
      from public.edges edge
      where edge.workspace_id = target_workspace_id
        and edge.repository_id = target_repository_id
        and (edge.source_node_id = scanned.id or edge.target_node_id = scanned.id)
    ) partner on true
    where scanned.workspace_id = target_workspace_id
      and scanned.repository_id = target_repository_id
      and scanned.path = any(scanned_paths)
    group by scanned.id
  ) partners
  where ie.workspace_id = target_workspace_id
    and ie.node_id = partners.node_id;

  for skip in
    select jsonb_array_elements(coalesce(plan->'skipped', '[]'::jsonb))
  loop
    insert into public.repository_scan_skips (
      workspace_id, repository_id, commit_sha, path, reason, detail
    ) values (
      target_workspace_id, target_repository_id, plan_commit_sha,
      skip->>'path', skip->>'reason', skip->>'detail'
    )
    on conflict (workspace_id, repository_id, commit_sha, path) do update
    set reason = excluded.reason, detail = excluded.detail, observed_at = now();
  end loop;

  update public.repositories
  set last_scanned_commit_sha = plan_commit_sha
  where workspace_id = target_workspace_id and id = target_repository_id;

  return plan_touched + 1;
end;
$$;

-- One-time backfill: workspaces scanned before this migration get their
-- index rows immediately instead of waiting for the next push.
insert into public.index_entries (
  workspace_id, repository_id, node_id, entry_type, title, path,
  symbols, tags, headings, search_key, neighbor_ids
)
select
  a.workspace_id, a.repository_id, a.id, 'artifact',
  regexp_replace(a.path, '^.*/', ''), a.path,
  coalesce(symbol_names.names, array[]::text[]),
  array[a.classification, a.kind],
  array[]::text[],
  lower(
    a.path || ' ' || regexp_replace(a.path, '^.*/', '') || ' ' ||
    a.classification || ' ' ||
    array_to_string(coalesce(symbol_names.names, array[]::text[]), ' ')
  ),
  coalesce(partners.ids, array[]::text[])
from public.artifacts a
left join lateral (
  select array_agg(item->>'name') as names
  from jsonb_array_elements(coalesce(a.exported_symbols, '[]'::jsonb)) item
) symbol_names on true
left join lateral (
  select array_remove(array_agg(distinct case
      when edge.source_node_id = a.id then edge.target_node_id
      else edge.source_node_id
    end), null) as ids
  from public.edges edge
  where edge.workspace_id = a.workspace_id
    and edge.repository_id = a.repository_id
    and (edge.source_node_id = a.id or edge.target_node_id = a.id)
) partners on true
on conflict (workspace_id, node_id) do nothing;
