-- Structural code-link edges (Phase 3 Wave B todo 3).
--
-- The scanner now emits cross-file `imports`/`calls` links with a recorded
-- confidence tier: `resolved` (module resolution / import binding) or
-- `reference` (single-owner name match). They persist as edges whose
-- provenance carries the tier, the method and the sighted symbols, so the
-- graph can render derivation honesty (solid vs thin) without a new column.
--
-- Sync contract: a rescanned file REPLACES its outgoing structure edges;
-- unchanged files keep theirs (the scanner does not recompute them), and a
-- removed file's edges go with its node via the FK cascade.

alter table public.edges drop constraint edges_relation;
alter table public.edges add constraint edges_relation
  check (relation in (
    'requires', 'implements', 'tests', 'supports', 'contradicts',
    'supersedes', 'references', 'imports', 'calls'
  ));

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
