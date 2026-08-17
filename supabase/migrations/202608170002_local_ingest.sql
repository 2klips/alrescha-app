-- Local ingest (Phase 2B todo 3, ADR-013).
--
-- `apply_repository_scan` is the single persistence implementation for a
-- RepositoryScanPlan. It ports apps/worker/src/repository-scan-store.ts#apply
-- verbatim into one atomic SQL function so the GitHub webhook path (worker)
-- and the local ingest path (web API route) persist scans through the SAME
-- code — the graph produced by either path cannot diverge by construction.
--
-- The plan is metadata-only by type: digests, blob shas, sizes, symbol spans,
-- todo spans. No column written here can hold a source-code body, and the
-- raw-code-persistence guardrail keeps it that way.

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
  artifact_id text;
  todo_keys text[];
begin
  -- The unchanged-commit plan (treeSha null, nothing touched) is a no-op.
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
        select id from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and path = removed_path
      );
  end loop;

  for artifact in
    select jsonb_array_elements(coalesce(plan->'artifacts', '[]'::jsonb))
  loop
    select id into artifact_id
    from public.artifacts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and path = artifact->>'path';

    if artifact_id is null then
      insert into public.graph_nodes (workspace_id, repository_id, kind, label)
      values (target_workspace_id, target_repository_id, 'artifact', artifact->>'path')
      returning id into artifact_id;
    end if;

    insert into public.artifacts (
      id, workspace_id, repository_id, kind, classification, path, digest,
      source_blob_sha, source_commit_sha, last_seen_commit_sha, size_bytes,
      exported_symbols, metadata
    ) values (
      artifact_id, target_workspace_id, target_repository_id,
      artifact->>'kind', artifact->>'classification', artifact->>'path',
      artifact->>'digest', artifact->>'sourceBlobSha', artifact->>'sourceCommitSha',
      artifact->>'sourceCommitSha', (artifact->>'sizeBytes')::integer,
      coalesce(artifact->'exportedSymbols', '[]'::jsonb), '{}'::jsonb
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
        updated_at = now();

    -- Document-sourced todos: drop the ones no longer present, upsert the rest.
    -- `source_key = any('{}')` is false for the empty array, so the single
    -- delete covers both branches of the TS original.
    select coalesce(array_agg(item->>'sourceKey'), array[]::text[])
    into todo_keys
    from jsonb_array_elements(coalesce(artifact->'todoItems', '[]'::jsonb)) item;

    delete from public.todos
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and source_artifact_id = artifact_id
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
        artifact_id, todo->'source'->>'path', todo->'source'->'span'
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
  end loop;

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

-- Repository row for a local (non-GitHub) project: installation_id and
-- github_repository_id stay null, which the schema already allows.
create or replace function public.ensure_local_repository(
  target_workspace_id text,
  target_full_name text
) returns text
language sql
security definer
set search_path = ''
as $$
  insert into public.repositories (workspace_id, full_name)
  values (target_workspace_id, target_full_name)
  on conflict (workspace_id, full_name) do update
  set full_name = excluded.full_name
  returning id;
$$;

revoke all on function public.apply_repository_scan(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_repository_scan(text, text, jsonb) to service_role;
revoke all on function public.ensure_local_repository(text, text) from public, anon, authenticated;
grant execute on function public.ensure_local_repository(text, text) to service_role;
