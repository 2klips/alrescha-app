-- A revision writers move, and stages a reader can tell apart (Codex remedy
-- P0-B §5.3-§5.4, step S6). This resolves OQ-053 in favour of option ⑴.
--
-- S3 gave one page a snapshot. Across pages there is none: PostgreSQL 17's
-- Read Committed gives every statement its own, so a workspace load that
-- makes thirteen reads can straddle a write and hand back a mix of two
-- states. The fence needs something that moves when the data moves.
--
-- **A commit SHA cannot be that something.** The same commit carries
-- different summaries, findings, todos, CI evidence and memory depending on
-- which jobs have run since. `data_revision` is a counter that only writers
-- of read-visible data increment, in the *same statement or transaction* as
-- their change — a revision bumped separately would leave a window where the
-- data moved and the number had not.
--
-- Two counters, not a family of them (REMEDY §5.4): one per repository for
-- its graph, one per workspace for its memory. Adding one per table would
-- make the fence cheaper to satisfy and mean less.
--
-- **Read observations must never bump it.** `access_events` and
-- `mcp_tokens.last_used_at` are written *by reading*, so counting them would
-- make every read invalidate itself and no fence would ever hold.
--
-- And a revision that holds still is not a claim that analysis finished.
-- Query consistency, structure publication and derived freshness are three
-- independent states (REMEDY §5.4): `last_scanned_commit_sha` says the
-- structure is published, `last_analyzed_commit_sha` says the derived layer
-- caught up, and the gap between them is a repository whose graph is real
-- and whose findings are from an older commit.

alter table public.repositories
  add column if not exists data_revision bigint not null default 1;

alter table public.repositories
  add column if not exists last_analyzed_commit_sha text;

alter table public.repositories
  drop constraint if exists repositories_last_analyzed_commit_sha;

alter table public.repositories
  add constraint repositories_last_analyzed_commit_sha check (
    last_analyzed_commit_sha is null
    or last_analyzed_commit_sha ~ '^[0-9a-f]{40}$'
  );

alter table public.workspaces
  add column if not exists memory_revision bigint not null default 1;

/**
 * The fence value for a scope: one repository, or every repository in the
 * workspace. A sum works because revisions only ever increase, so any write
 * anywhere in the scope changes it.
 */
create or replace function public.revision_of(
  target_workspace_id text,
  target_repository_id text
) returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(r.data_revision), 0)::bigint
  from public.repositories r
  where r.workspace_id = target_workspace_id
    and (target_repository_id is null or r.id = target_repository_id);
$$;

/**
 * Publish a derived-layer change: bump the revision, and record the commit
 * the analysis covered when the caller states one. One statement, so it is
 * inside whatever transaction the caller already opened.
 */
create or replace function public.publish_repository_change(
  target_workspace_id text,
  target_repository_id text,
  analyzed_commit_sha text default null
) returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.repositories
  set data_revision = data_revision + 1,
      last_analyzed_commit_sha =
        coalesce(analyzed_commit_sha, last_analyzed_commit_sha)
  where workspace_id = target_workspace_id
    and id = target_repository_id
  returning data_revision;
$$;

/** What a read is standing on, per repository (REMEDY §4's ReadBasis). */
create or replace function public.read_repository_basis(
  target_workspace_id text
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'analyzedCommit', r.last_analyzed_commit_sha,
        'dataRevision', r.data_revision,
        -- There is no immutable generation to read from, so the field says
        -- so rather than borrowing the commit sha and calling it one.
        'graphGeneration', null,
        'indexedCommit', r.last_scanned_commit_sha,
        'repositoryId', r.id,
        'stages', jsonb_build_object(
          'analysis', case
            when r.last_scanned_commit_sha is null then 'unavailable'
            when r.last_analyzed_commit_sha = r.last_scanned_commit_sha
              then 'current'
            else 'pending'
          end,
          'structure', case
            when r.last_scanned_commit_sha is null then 'building' else 'ready'
          end
        )
      )
      order by r.id
    ),
    '[]'::jsonb
  )
  from public.repositories r
  where r.workspace_id = target_workspace_id;
$$;

revoke all on function public.revision_of(text, text)
  from public, anon, authenticated;
revoke all on function public.publish_repository_change(text, text, text)
  from public, anon, authenticated;
revoke all on function public.read_repository_basis(text)
  from public, anon, authenticated;
grant execute on function public.revision_of(text, text) to service_role;
grant execute on function public.publish_repository_change(text, text, text)
  to service_role;
grant execute on function public.read_repository_basis(text) to service_role;

-- The fence, on the page read. A caller that states the revision it began
-- with is told when the ground moved instead of being handed a page from a
-- different state (REMEDY §5.3).
create or replace function public.read_edge_page(
  target_workspace_id text,
  target_repository_id text,
  after_edge_id text,
  row_budget integer,
  byte_budget integer,
  expected_revision bigint default null
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(row_budget, 500), 1), 2000) as rows_wanted,
      least(greatest(coalesce(byte_budget, 262144), 1024), 4194304)
        as bytes_wanted,
      public.revision_of(target_workspace_id, target_repository_id)
        as current_revision
  ),
  page as (
    select e.id, e.repository_id, e.source_node_id, e.target_node_id,
           e.relation, e.family, e.confidence, e.provenance
    from public.edges e, bounds
    where e.workspace_id = target_workspace_id
      and (target_repository_id is null or e.repository_id = target_repository_id)
      and (after_edge_id is null or e.id > after_edge_id)
      -- A fenced read that lost its ground returns nothing rather than a
      -- page the caller would splice onto rows from another state.
      and (
        expected_revision is null
        or expected_revision = (select current_revision from bounds)
      )
    order by e.id
    limit (select rows_wanted from bounds) + 1
  ),
  shaped as (
    select
      p.id,
      jsonb_build_object(
        'confidence', p.confidence,
        'family', p.family,
        'id', p.id,
        'provenance', p.provenance,
        'relation', p.relation,
        'repository_id', p.repository_id,
        'source_node_id', p.source_node_id,
        'target_node_id', p.target_node_id
      ) as row_json,
      row_number() over (order by p.id) as position
    from page p
  ),
  measured as (
    select
      s.*,
      sum(octet_length(s.row_json::text)) over (order by s.position)
        as bytes_so_far
    from shaped s
  ),
  kept as (
    select m.id, m.row_json
    from measured m, bounds
    where m.position <= bounds.rows_wanted
      and m.bytes_so_far <= bounds.bytes_wanted
  ),
  tally as (
    select
      (select count(*) from shaped) as read_rows,
      (select count(*) from kept) as kept_rows,
      (select rows_wanted from bounds) as rows_wanted,
      (select bytes_wanted from bounds) as bytes_wanted,
      (select current_revision from bounds) as current_revision,
      (select max(id) from kept) as last_id,
      coalesce((select jsonb_agg(row_json order by id) from kept), '[]'::jsonb)
        as edges
  )
  select jsonb_build_object(
    'edges', tally.edges,
    'hasMore', tally.read_rows > tally.kept_rows,
    'nextCursor', tally.last_id,
    'exactCount', null,
    'revision', tally.current_revision,
    'revisionChanged',
      expected_revision is not null
      and expected_revision <> tally.current_revision,
    'coverage', jsonb_build_object(
      'byteBudget', tally.bytes_wanted,
      'rowBudget', tally.rows_wanted,
      'result', case
        when expected_revision is not null
          and expected_revision <> tally.current_revision then 'partial'
        when tally.read_rows > tally.kept_rows then 'partial'
        else 'complete'
      end,
      'stoppedBy', case
        when expected_revision is not null
          and expected_revision <> tally.current_revision then 'revision'
        when tally.read_rows <= tally.kept_rows then null
        when tally.kept_rows < tally.rows_wanted then 'bytes'
        else 'rows'
      end
    )
  )
  from tally;
$$;

revoke all on function public.read_edge_page(text, text, text, integer, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.read_edge_page(text, text, text, integer, integer, bigint)
  to service_role;
-- The five-argument signature is gone: a caller that omits the fence now
-- says so with an explicit null rather than by picking an older overload.
drop function if exists public.read_edge_page(text, text, text, integer, integer);


-- Both writers of read-visible data now move the revision, each inside the
-- transaction that makes its change. `apply_repository_scan` bumps in the
-- same UPDATE that publishes the commit; `apply_artifact_summaries` bumps
-- only when a row actually changed.

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
  artifact_symbols text[];
  artifact_basename text;
  plan_link_scope text := coalesce(plan->>'linkScope', 'incremental');
  document_paths text[];
  plan_link_version integer := coalesce((plan->>'linkSchemaVersion')::integer, 1);
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

    -- Identity migration (Phase 4 Wave A todo 5): the key used to be the
    -- item's byte offset, so an edit above a checkbox renamed it. A row whose
    -- title still matches an incoming item is that item — move its key and
    -- keep the row, rather than deleting it and losing its history.
    update public.todos existing
    set source_key = incoming.source_key,
        updated_at = now()
    from (
      select item->>'sourceKey' as source_key, item->>'title' as title
      from jsonb_array_elements(coalesce(artifact->'todoItems', '[]'::jsonb)) item
    ) incoming
    where existing.workspace_id = target_workspace_id
      and existing.repository_id = target_repository_id
      and existing.source_artifact_id = artifact_node_id
      and existing.source_kind = 'document'
      and existing.title = incoming.title
      and existing.source_key <> incoming.source_key
      and not exists (
        select 1 from public.todos other
        where other.workspace_id = target_workspace_id
          and other.source_kind = 'document'
          and other.source_key = incoming.source_key
      );

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
        source_artifact_id, source_path, source_span, parent_key
      ) values (
        target_workspace_id, target_repository_id,
        todo->>'title', todo->>'status', 'document', todo->>'sourceKey',
        artifact_node_id, todo->'source'->>'path', todo->'source'->'span',
        todo->>'parentKey'
      )
      on conflict (workspace_id, source_kind, source_key) do update
      set title = excluded.title,
          status = excluded.status,
          repository_id = excluded.repository_id,
          source_artifact_id = excluded.source_artifact_id,
          source_path = excluded.source_path,
          source_span = excluded.source_span,
          parent_key = excluded.parent_key,
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
          relation, family, provenance, confidence
        ) values (
          target_workspace_id, target_repository_id, rationale_id, artifact_node_id,
          'references', 'structure',
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

  -- Code-link sync (Wave B todo 3; scoped and set-based in Phase 4 Wave A
  -- todo 0). An incremental plan speaks only for the files it rescanned; a
  -- full relink recomputed every code file's outgoing links, so it replaces
  -- the repository's structure edges outright. Either way a link whose target
  -- was skipped (oversized, binary) simply has no node — the join drops it.
  select coalesce(
    array_agg(item->>'path'), array[]::text[]
  ) into scanned_paths
  from jsonb_array_elements(coalesce(plan->'artifacts', '[]'::jsonb)) item;

  if plan_link_scope = 'full' then
    -- Evidence-sourced `tests` edges (a CI run supporting a file) are not
    -- artifact-sourced, so they are outside this delete and survive.
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and relation in ('imports', 'calls', 'tests')
      and source_node_id in (
        select id from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
      );
  else
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and relation in ('imports', 'calls', 'tests')
      and source_node_id in (
        select id from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and path = any(scanned_paths)
      );
  end if;

  -- One statement instead of two lookups and an insert per link: a full
  -- relink of a real repository carries thousands of them. `distinct on`
  -- keeps a plan that repeats a link from hitting the same conflict row
  -- twice in one statement, which Postgres rejects outright.
  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select
    target_workspace_id, target_repository_id,
    source_artifact.id, target_artifact.id,
    link.kind,
    case when link.kind = 'tests' then 'evidence' else 'structure' end,
    jsonb_build_object(
      'sourceArtifactId', source_artifact.id,
      'span', jsonb_build_object(
        'path', link.source_path,
        'startLine', link.start_line,
        'endLine', link.end_line
      ),
      'tier', link.tier,
      'method', link.method,
      'symbols', link.symbols
    ),
    case when link.tier = 'resolved' then 1.0 else 0.6 end
  from (
    select distinct on (
      item->>'kind', item->>'sourcePath', item->>'targetPath'
    )
      item->>'kind' as kind,
      item->>'sourcePath' as source_path,
      item->>'targetPath' as target_path,
      item->>'tier' as tier,
      item->>'method' as method,
      coalesce(item->'symbols', '[]'::jsonb) as symbols,
      (item->'span'->>'startLine')::integer as start_line,
      (item->'span'->>'endLine')::integer as end_line
    from jsonb_array_elements(coalesce(plan->'codeLinks', '[]'::jsonb)) item
    order by
      item->>'kind', item->>'sourcePath', item->>'targetPath',
      (item->'span'->>'startLine')::integer
  ) link
  join public.artifacts source_artifact
    on source_artifact.workspace_id = target_workspace_id
   and source_artifact.repository_id = target_repository_id
   and source_artifact.path = link.source_path
  join public.artifacts target_artifact
    on target_artifact.workspace_id = target_workspace_id
   and target_artifact.repository_id = target_repository_id
   and target_artifact.path = link.target_path
  where source_artifact.id <> target_artifact.id
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence;

  -- Document links (Phase 4 Wave A todo 2). Scoped like the code links
  -- above: an incremental plan speaks for the documents it re-read, a full
  -- relink for every one of them. `references` edges out of a *rationale*
  -- node are a different writer's and stay untouched — this delete names
  -- artifact sources only.
  select coalesce(
    array_agg(item->>'sourcePath'), array[]::text[]
  ) into document_paths
  from jsonb_array_elements(coalesce(plan->'docLinks', '[]'::jsonb)) item;

  if plan_link_scope = 'full' then
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and relation = 'references'
      and family = 'doc'
      and source_node_id in (
        select id from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
      );
  else
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and relation = 'references'
      and family = 'doc'
      and source_node_id in (
        select id from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and path = any(scanned_paths || document_paths)
      );
  end if;

  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select
    target_workspace_id, target_repository_id,
    source_artifact.id, target_artifact.id,
    'references', 'doc',
    jsonb_build_object(
      'sourceArtifactId', source_artifact.id,
      'span', jsonb_build_object(
        'path', link.source_path,
        'startLine', link.start_line,
        'endLine', link.end_line
      ),
      'tier', link.tier,
      'method', link.method
    ),
    case when link.tier = 'resolved' then 1.0 else 0.6 end
  from (
    select distinct on (item->>'sourcePath', item->>'targetPath')
      item->>'sourcePath' as source_path,
      item->>'targetPath' as target_path,
      item->>'tier' as tier,
      item->>'method' as method,
      (item->'span'->>'startLine')::integer as start_line,
      (item->'span'->>'endLine')::integer as end_line
    from jsonb_array_elements(coalesce(plan->'docLinks', '[]'::jsonb)) item
    order by
      item->>'sourcePath', item->>'targetPath',
      (item->'span'->>'startLine')::integer
  ) link
  join public.artifacts source_artifact
    on source_artifact.workspace_id = target_workspace_id
   and source_artifact.repository_id = target_repository_id
   and source_artifact.path = link.source_path
  join public.artifacts target_artifact
    on target_artifact.workspace_id = target_workspace_id
   and target_artifact.repository_id = target_repository_id
   and target_artifact.path = link.target_path
  where source_artifact.id <> target_artifact.id
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence,
    family = excluded.family;

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
      and (plan_link_scope = 'full' or scanned.path = any(scanned_paths))
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

  -- Directory nodes and containment (Phase 4 Wave A todo 3).
  --
  -- Derived here from the artifact paths rather than carried in the plan, so
  -- the plan stays byte-identical between the two ingest paths and ADR-013
  -- equivalence is a property of the schema rather than of two scanners
  -- agreeing (R5 §2.3). Runs after the artifact upserts and deletes above, so
  -- it sees the tree this commit actually has.
  create temporary table scan_directories on commit drop as
  with tracked as (
    select path, string_to_array(path, '/') as parts
    from public.artifacts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
  ),
  ancestors as (
    select distinct array_to_string(parts[1:depth], '/') as dir_path
    from tracked,
         generate_series(1, array_length(parts, 1) - 1) as depth
  )
  select
    dir_path,
    nullif(regexp_replace(dir_path, '/?[^/]+$', ''), '') as parent_path,
    exists (
      select 1 from tracked
      where tracked.path = dir_path || '/package.json'
         or tracked.path = dir_path || '/pyproject.toml'
    ) as is_package
  from ancestors
  where dir_path <> '';

  -- A directory that no longer holds anything loses its node; the edges FK
  -- cascade takes its containment with it.
  delete from public.graph_nodes n
  where n.workspace_id = target_workspace_id
    and n.repository_id = target_repository_id
    and n.kind = 'directory'
    and not exists (
      select 1 from public.directories d
      join scan_directories s on s.dir_path = d.path
      where d.workspace_id = n.workspace_id
        and d.repository_id = n.repository_id
        and d.id = n.id
    );

  insert into public.graph_nodes (workspace_id, repository_id, kind, label)
  select target_workspace_id, target_repository_id, 'directory', s.dir_path
  from scan_directories s
  where not exists (
    select 1 from public.directories d
    where d.workspace_id = target_workspace_id
      and d.repository_id = target_repository_id
      and d.path = s.dir_path
  );

  insert into public.directories (
    id, workspace_id, repository_id, path, role
  )
  select
    n.id, target_workspace_id, target_repository_id, s.dir_path,
    case when s.is_package then 'package' else null end
  from scan_directories s
  join public.graph_nodes n
    on n.workspace_id = target_workspace_id
   and n.repository_id = target_repository_id
   and n.kind = 'directory'
   and n.label = s.dir_path
  where not exists (
    select 1 from public.directories d
    where d.workspace_id = target_workspace_id
      and d.repository_id = target_repository_id
      and d.path = s.dir_path
  )
  on conflict (workspace_id, repository_id, path) do update
  set role = excluded.role, updated_at = now();

  -- A directory that gained or lost its manifest changes role in place.
  update public.directories d
  set role = case when s.is_package then 'package' else null end,
      updated_at = now()
  from scan_directories s
  where d.workspace_id = target_workspace_id
    and d.repository_id = target_repository_id
    and d.path = s.dir_path
    and d.role is distinct from (case when s.is_package then 'package' else null end);

  -- Containment is replaced wholesale on every scan: it is a pure function of
  -- the path set, and the path set is what just changed.
  delete from public.edges
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id
    and relation = 'contains';

  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select
    target_workspace_id, target_repository_id, parent.id, child.id,
    'contains', 'hierarchy',
    jsonb_build_object(
      'reason', 'path containment',
      'tier', 'resolved',
      'layoutOnly', true
    ),
    1.0
  from (
    -- A directory's immediate parent directory…
    select d.id as child_id, s.parent_path
    from public.directories d
    join scan_directories s on s.dir_path = d.path
    where d.workspace_id = target_workspace_id
      and d.repository_id = target_repository_id
      and s.parent_path is not null
    union all
    -- …and every file's own directory.
    select a.id as child_id,
           nullif(regexp_replace(a.path, '/?[^/]+$', ''), '') as parent_path
    from public.artifacts a
    where a.workspace_id = target_workspace_id
      and a.repository_id = target_repository_id
  ) child_of
  join public.directories parent_directory
    on parent_directory.workspace_id = target_workspace_id
   and parent_directory.repository_id = target_repository_id
   and parent_directory.path = child_of.parent_path
  join public.graph_nodes parent
    on parent.workspace_id = target_workspace_id
   and parent.repository_id = target_repository_id
   and parent.id = parent_directory.id
  join public.graph_nodes child
    on child.workspace_id = target_workspace_id
   and child.repository_id = target_repository_id
   and child.id = child_of.child_id
  where child_of.parent_path is not null
    and parent.id <> child.id
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do nothing;

  -- Routes (Phase 4 Wave A′ todo 6).
  --
  -- Next.js states the URL in the path, so it is derived here from the
  -- stored artifacts — the plan carries no Next route, and the two ingest
  -- paths cannot disagree about one (ADR-013, the directory rule again).
  -- Decorator routes arrive in `plan.routes` at the `reference` tier,
  -- because only the file body states them and a router mounted under a
  -- prefix produces a path the scan cannot see.
  create temporary table scan_route_files on commit drop as
  select
    a.id as artifact_id,
    a.path,
    public.next_route_url(a.path) as url,
    (regexp_match(a.path, '/(page|layout|route)\.[cm]?[jt]sx?$'))[1] as entry
  from public.artifacts a
  where a.workspace_id = target_workspace_id
    and a.repository_id = target_repository_id
    and public.next_route_url(a.path) is not null;

  create temporary table scan_routes on commit drop as
  select url, 'resolved'::text as tier, array[]::text[] as methods
  from scan_route_files
  where entry in ('page', 'route')
  group by url
  union
  select
    item->>'path' as url,
    'reference'::text as tier,
    array_agg(distinct item->>'method') as methods
  from jsonb_array_elements(coalesce(plan->'routes', '[]'::jsonb)) item
  group by item->>'path';

  -- A URL that no file serves any more loses its node.
  delete from public.graph_nodes n
  where n.workspace_id = target_workspace_id
    and n.repository_id = target_repository_id
    and n.kind = 'route'
    and not exists (
      select 1 from public.routes r
      join scan_routes s on s.url = r.url
      where r.workspace_id = n.workspace_id
        and r.repository_id = n.repository_id
        and r.id = n.id
    );

  insert into public.graph_nodes (workspace_id, repository_id, kind, label)
  select target_workspace_id, target_repository_id, 'route', s.url
  from scan_routes s
  where not exists (
    select 1 from public.routes r
    where r.workspace_id = target_workspace_id
      and r.repository_id = target_repository_id
      and r.url = s.url
  );

  insert into public.routes (id, workspace_id, repository_id, url, tier, methods)
  select n.id, target_workspace_id, target_repository_id, s.url, s.tier, s.methods
  from scan_routes s
  join public.graph_nodes n
    on n.workspace_id = target_workspace_id
   and n.repository_id = target_repository_id
   and n.kind = 'route'
   and n.label = s.url
  on conflict (workspace_id, repository_id, url) do update
  set tier = excluded.tier,
      methods = excluded.methods,
      updated_at = now();

  delete from public.edges
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id
    and relation = 'handles';

  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select distinct on (route.id, handler.artifact_id)
    target_workspace_id, target_repository_id, route.id, handler.artifact_id,
    'handles', 'route',
    jsonb_build_object(
      'reason', handler.reason,
      'tier', route.tier,
      'span', jsonb_build_object(
        'path', handler.path,
        'startLine', handler.line,
        'endLine', handler.line
      )
    ),
    case when route.tier = 'resolved' then 1.0 else 0.6 end
  from public.routes route
  join (
    -- The file that serves the URL…
    select f.artifact_id, f.path, f.url, 1 as line,
           'route entry' as reason
    from scan_route_files f
    where f.entry in ('page', 'route')
    union all
    -- …every layout above it, which every route inside its directory shares.
    -- Containment is by *path*, not by URL: a route group's layout
    -- (`app/(shell)/layout.tsx`) has the same URL as the root layout, and
    -- only the directory says that `/api/health` is outside it.
    select f.artifact_id, f.path, served.url, 1 as line,
           'shared layout' as reason
    from scan_route_files f
    join scan_route_files served
      on served.entry in ('page', 'route')
     and served.path like regexp_replace(f.path, '[^/]+$', '') || '%'
    where f.entry = 'layout'
    union all
    -- …and the module a decorator declared it in.
    select a.id as artifact_id, a.path, item->>'path' as url,
           (item->>'line')::integer as line,
           'route decorator' as reason
    from jsonb_array_elements(coalesce(plan->'routes', '[]'::jsonb)) item
    join public.artifacts a
      on a.workspace_id = target_workspace_id
     and a.repository_id = target_repository_id
     and a.path = item->>'sourcePath'
  ) handler on handler.url = route.url
  where route.workspace_id = target_workspace_id
    and route.repository_id = target_repository_id
  order by route.id, handler.artifact_id, handler.line
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence;

  -- Database objects (Phase 4 Wave A′ todo 7).
  --
  -- Unlike directories and routes, an object's name lives in the file body,
  -- so the plan carries it rather than the SQL deriving it. Both ingest paths
  -- read the same migrations with the same parser, so both still state the
  -- same names (ADR-013), and what travels is a name, a kind and a line.
  --
  -- A migration chain re-declares the same function many times. The newest
  -- file that declares a name wins, because that is where its current
  -- definition is and that is the file a reader wants opened.
  create temporary table scan_schema_objects on commit drop as
  select distinct on (name) name, kind, source_path, source_line
  from (
    select
      item->>'name' as name,
      item->>'kind' as kind,
      item->>'sourcePath' as source_path,
      (item->'span'->>'startLine')::integer as source_line
    from jsonb_array_elements(coalesce(plan->'schemaObjects', '[]'::jsonb)) item
  ) declared
  order by name, source_path desc, source_line;

  -- An object no longer declared loses its node. Under an incremental plan
  -- that only holds for objects whose declaring file was actually re-read: a
  -- table in a migration this scan never opened has to survive.
  delete from public.graph_nodes n
  where n.workspace_id = target_workspace_id
    and n.repository_id = target_repository_id
    and n.kind = 'db_object'
    and exists (
      select 1 from public.db_objects o
      where o.workspace_id = n.workspace_id
        and o.repository_id = n.repository_id
        and o.id = n.id
        and (plan_link_scope = 'full' or o.source_path = any(scanned_paths))
        and not exists (
          select 1 from scan_schema_objects s where s.name = o.name
        )
    );

  insert into public.graph_nodes (workspace_id, repository_id, kind, label)
  select target_workspace_id, target_repository_id, 'db_object', s.name
  from scan_schema_objects s
  where not exists (
    select 1 from public.db_objects o
    where o.workspace_id = target_workspace_id
      and o.repository_id = target_repository_id
      and o.name = s.name
  );

  insert into public.db_objects (
    id, workspace_id, repository_id, name, kind, source_path, source_line
  )
  select
    n.id, target_workspace_id, target_repository_id,
    s.name, s.kind, s.source_path, s.source_line
  from scan_schema_objects s
  join public.graph_nodes n
    on n.workspace_id = target_workspace_id
   and n.repository_id = target_repository_id
   and n.kind = 'db_object'
   and n.label = s.name
  on conflict (workspace_id, repository_id, name) do update
  set kind = excluded.kind,
      source_path = excluded.source_path,
      source_line = excluded.source_line,
      updated_at = now();

  -- Every database edge departs from a file the plan speaks for: a schema
  -- statement from its migration, a foreign key from the migration that
  -- writes it, a query literal from the code file that holds it. Scoping the
  -- sweep by that path is the rule the import and doc families already use.
  if plan_link_scope = 'full' then
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and family = 'database';
  else
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and family = 'database'
      and provenance->'span'->>'path' = any(scanned_paths);
  end if;

  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select distinct on (link.source_id, target_object.id, link.kind)
    target_workspace_id, target_repository_id, link.source_id, target_object.id,
    link.kind, 'database',
    jsonb_build_object(
      'reason', case
        when link.kind = 'queries' then 'code names the object in a literal'
        when link.kind = 'references' then 'foreign key'
        else 'schema statement'
      end,
      'tier', link.tier,
      'method', link.method,
      'span', jsonb_build_object(
        'path', link.source_path,
        'startLine', link.start_line,
        'endLine', link.end_line
      )
    ),
    case when link.tier = 'resolved' then 1.0 else 0.6 end
  from (
    select
      item->>'kind' as kind,
      item->>'method' as method,
      item->>'tier' as tier,
      item->>'sourcePath' as source_path,
      item->>'targetObject' as target_object,
      (item->'span'->>'startLine')::integer as start_line,
      (item->'span'->>'endLine')::integer as end_line,
      case
        when item->>'sourceObject' is null then (
          select a.id from public.artifacts a
          where a.workspace_id = target_workspace_id
            and a.repository_id = target_repository_id
            and a.path = item->>'sourcePath'
        )
        else (
          select o.id from public.db_objects o
          where o.workspace_id = target_workspace_id
            and o.repository_id = target_repository_id
            and o.name = item->>'sourceObject'
        )
      end as source_id
    from jsonb_array_elements(coalesce(plan->'schemaLinks', '[]'::jsonb)) item
  ) link
  join public.db_objects target_object
    on target_object.workspace_id = target_workspace_id
   and target_object.repository_id = target_repository_id
   and target_object.name = link.target_object
  where link.source_id is not null
    and link.source_id <> target_object.id
  order by link.source_id, target_object.id, link.kind, link.start_line
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence,
    family = excluded.family;

  -- Sections: ID-token headings (Phase 4 Wave A′ todo 8).
  --
  -- One home per token. A token can be declared twice — the decision record
  -- and an evidence log that opens with the same name — and `homeRank`
  -- decides which is the home, computed in TypeScript from the heading alone
  -- so this comparison is a tie-break, not a second implementation of the
  -- rule (`bestHome` in `section-links.ts` orders the same way).
  create temporary table scan_sections on commit drop as
  select distinct on (token) token, heading, home_rank, source_path, source_line
  from (
    select
      item->>'token' as token,
      item->>'heading' as heading,
      (item->>'homeRank')::integer as home_rank,
      item->>'path' as source_path,
      (item->'span'->>'startLine')::integer as source_line
    from jsonb_array_elements(coalesce(plan->'sections', '[]'::jsonb)) item
  ) declared
  order by token, home_rank, source_path, source_line;

  -- A heading that no longer declares its token loses the node, but only when
  -- this plan actually re-read the file that used to declare it.
  delete from public.graph_nodes n
  where n.workspace_id = target_workspace_id
    and n.repository_id = target_repository_id
    and n.kind = 'section'
    and exists (
      select 1 from public.sections s
      where s.workspace_id = n.workspace_id
        and s.repository_id = n.repository_id
        and s.id = n.id
        and (plan_link_scope = 'full' or s.source_path = any(scanned_paths))
        and not exists (
          select 1 from scan_sections d where d.token = s.token
        )
    );

  insert into public.graph_nodes (workspace_id, repository_id, kind, label)
  select target_workspace_id, target_repository_id, 'section', d.token
  from scan_sections d
  where not exists (
    select 1 from public.sections s
    where s.workspace_id = target_workspace_id
      and s.repository_id = target_repository_id
      and s.token = d.token
  );

  insert into public.sections (
    id, workspace_id, repository_id, token, heading, home_rank,
    source_path, source_line
  )
  select
    n.id, target_workspace_id, target_repository_id,
    d.token, d.heading, d.home_rank, d.source_path, d.source_line
  from scan_sections d
  join public.graph_nodes n
    on n.workspace_id = target_workspace_id
   and n.repository_id = target_repository_id
   and n.kind = 'section'
   and n.label = d.token
  on conflict (workspace_id, repository_id, token) do update
  set heading = excluded.heading,
      home_rank = excluded.home_rank,
      source_path = excluded.source_path,
      source_line = excluded.source_line,
      updated_at = now()
  -- A worse-ranked declaration never evicts a better one; the file that holds
  -- the home may still move its own heading.
  where excluded.home_rank < public.sections.home_rank
     or excluded.source_path = public.sections.source_path;

  -- Citations of a section. Swept by target rather than by relation: a
  -- `references` edge into a section and one into a file are the same
  -- relation in the same family, and only the target tells them apart.
  delete from public.edges e
  where e.workspace_id = target_workspace_id
    and e.repository_id = target_repository_id
    and e.relation = 'references'
    and (
      plan_link_scope = 'full'
      or e.provenance->'span'->>'path' = any(scanned_paths || document_paths)
    )
    and exists (
      select 1 from public.sections s
      where s.workspace_id = e.workspace_id
        and s.repository_id = e.repository_id
        and s.id = e.target_node_id
    );

  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select distinct on (link.source_id, target_section.id)
    target_workspace_id, target_repository_id, link.source_id,
    target_section.id, 'references', 'doc',
    jsonb_build_object(
      'reason', case
        when link.via = 'rationale' then 'comment cites the section'
        else 'document names the section'
      end,
      'tier', link.tier,
      'method', link.method,
      'span', jsonb_build_object(
        'path', link.source_path,
        'startLine', link.start_line,
        'endLine', link.end_line
      )
    ),
    1.0
  from (
    select
      item->>'method' as method,
      item->>'tier' as tier,
      item->>'via' as via,
      item->>'sourcePath' as source_path,
      item->>'targetToken' as target_token,
      (item->'span'->>'startLine')::integer as start_line,
      (item->'span'->>'endLine')::integer as end_line,
      (
        select a.id from public.artifacts a
        where a.workspace_id = target_workspace_id
          and a.repository_id = target_repository_id
          and a.path = item->>'sourcePath'
      ) as source_id
    from jsonb_array_elements(coalesce(plan->'sectionLinks', '[]'::jsonb)) item
  ) link
  -- Resolved against every persisted section, not only this plan's: a
  -- citation of `ADR-013` still lands when the decision record itself was
  -- not re-read this pass (OQ-055).
  join public.sections target_section
    on target_section.workspace_id = target_workspace_id
   and target_section.repository_id = target_repository_id
   and target_section.token = link.target_token
  where link.source_id is not null
    and link.source_id <> target_section.id
    and target_section.source_path <> link.source_path
  order by link.source_id, target_section.id, link.start_line
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence,
    family = excluded.family;

  update public.repositories
  set data_revision = data_revision + 1,
      last_scanned_commit_sha = plan_commit_sha,
      link_schema_version = case
        when plan_link_scope = 'full'
          then greatest(coalesce(link_schema_version, 1), plan_link_version)
        else link_schema_version
      end,
      -- The conventions this commit stated, with the commit that stated
      -- them: a reader can tell which `.alrescha.json` produced a picture,
      -- and a plan that carries none clears the stored one rather than
      -- leaving a repository governed by a file it deleted.
      layout_config = coalesce(plan->'layoutConfig', '{}'::jsonb),
      layout_config_commit_sha = case
        when plan->'layoutConfig' is null then null
        else plan_commit_sha
      end
  where workspace_id = target_workspace_id and id = target_repository_id;

  return plan_touched + 1;
end;
$$;

create or replace function public.apply_artifact_summaries(
  target_workspace_id text,
  target_repository_id text,
  summaries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_path text;
  expected_blob text;
  updated_id text;
  exists_at_path boolean;
  applied integer := 0;
  superseded integer := 0;
  missing integer := 0;
  invalid integer := 0;
  skips_applied integer := 0;
begin
  for item in select jsonb_array_elements(coalesce(summaries, '[]'::jsonb))
  loop
    item_path := item->>'path';
    expected_blob := nullif(trim(coalesce(item->>'summaryBlobSha', '')), '');
    updated_id := null;

    if item->>'kind' not in ('summary', 'skip') then
      raise exception 'unsupported summary item kind: %', item->>'kind';
    end if;

    -- A write with no path, or a summary with no digest, cannot be made
    -- conditional and is refused rather than applied unconditionally.
    if item_path is null
       or (item->>'kind' = 'summary' and expected_blob is null) then
      invalid := invalid + 1;
      continue;
    end if;

    if item->>'kind' = 'summary' then
      update public.artifacts
      set metadata = (coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'summary', item->>'summary',
            'summaryBlobSha', expected_blob,
            'summaryModel', item->>'model',
            'summaryProvider', item->>'provider',
            'summaryGrade', 'inferred',
            'summaryUpdatedAt', now()
          )) - 'summarySkipped',
          updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item_path
        and source_blob_sha is not null
        and source_blob_sha = expected_blob
      returning id into updated_id;
    else
      -- A skip records which blob failed. An older failure must not land on
      -- top of a newer success, so it carries the same condition; a skip
      -- from a client that states no digest stays unconditional, which is
      -- what the pre-remedy callers sent.
      update public.artifacts
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'summarySkipped', jsonb_build_object(
              'reason', item->>'reason',
              'sourceBlobSha', expected_blob,
              'observedAt', now()
            )
          ),
          updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item_path
        and (
          expected_blob is null
          or (source_blob_sha is not null and source_blob_sha = expected_blob)
        )
      returning id into updated_id;
    end if;

    if updated_id is not null then
      if item->>'kind' = 'summary' then
        applied := applied + 1;
      else
        skips_applied := skips_applied + 1;
      end if;
      continue;
    end if;

    -- A skip that did not land is simply not counted as a gate written; the
    -- summary buckets stay about prose.
    if item->>'kind' = 'skip' then
      continue;
    end if;

    select exists (
      select 1 from public.artifacts
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item_path
    ) into exists_at_path;

    if exists_at_path then
      superseded := superseded + 1;
    else
      missing := missing + 1;
    end if;
  end loop;

  -- Only a write publishes. A run where every item was superseded or
  -- missing changed nothing a reader can see, and bumping for it would
  -- invalidate every fence for no reason.
  if applied > 0 or skips_applied > 0 then
    perform public.publish_repository_change(
      target_workspace_id, target_repository_id, null
    );
  end if;

  return jsonb_build_object(
    'applied', applied,
    'superseded', superseded,
    'missing', missing,
    'invalid', invalid,
    'skipsApplied', skips_applied
  );
end;
$$;
