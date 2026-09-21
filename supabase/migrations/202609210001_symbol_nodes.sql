-- Symbol nodes behind hierarchical loading (Phase 4 Wave F todo 26, OQ-031 ⑴).
--
-- A symbol has been metadata since Phase 1: a name and a span inside
-- `artifacts.exported_symbols`, flattened to names in `index_entries`. That
-- is why "which class extends this one" was never a question the graph
-- could answer, and why every call collapsed to file ↔ file. This migration
-- gives each exported symbol a node of its own — and keeps it out of every
-- read that did not ask for it.
--
-- Three rules, all structural rather than by convention:
--
-- 1. The rows are DERIVED from `exported_symbols` inside `apply_repository_scan`,
--    so the plan carries no symbol and the two ingest paths cannot disagree
--    about which exist (ADR-013, the directory rule). What a row holds is a
--    name, a kind, a span and the engine that read it (ADR-014) — never a
--    signature, never a docstring (WORK_SPEC §3-3). `verify-scope-boundaries`
--    refuses a column named like either.
-- 2. Identity is `symbol_stable_key(path, container, kind, name)`: a rescan
--    that finds the same declaration keeps its row and node id; one that no
--    longer does removes them. The node id stays a ULID the database mints,
--    because `graph_nodes` says so.
-- 3. The layer is loaded on request or not at all. Symbol edges live in
--    `symbol_edges`, not `edges`, so the map's family reads, the MCP edge
--    page, the neighbour cache and the doc skeleton never see them; and the
--    default node reads exclude `kind = 'symbol'`. One file's symbols are
--    fetched by the map's `/api/map/symbols` and by the MCP store's
--    `loadSymbolNeighborhood` — never the whole workspace's.
--
-- `declares` (file → symbol) is hierarchy: ownership, like `contains`.
-- `extends` (symbol → symbol) is structure: a dependency, like `imports`.

alter table public.graph_nodes drop constraint graph_nodes_kind;
alter table public.graph_nodes add constraint graph_nodes_kind
  check (kind in (
    'artifact', 'requirement', 'evidence', 'finding', 'rationale', 'concept',
    'directory', 'route', 'db_object', 'section', 'doc_page', 'symbol'
  ));

-- md5 rather than the plan's sha1: every PostgreSQL has it, pgcrypto is not
-- one of them, and the key is an identifier — not a checksum anyone forges.
-- `packages/core/src/ingest/symbol-identity.ts` computes the same string.
create or replace function public.symbol_stable_key(
  symbol_path text,
  symbol_container text,
  symbol_kind text,
  symbol_name text
) returns text
language sql
immutable
set search_path = ''
as $$
  select md5(
    symbol_path || '|' || coalesce(symbol_container, '') || '|' ||
    symbol_kind || '|' || symbol_name
  );
$$;

grant execute on function public.symbol_stable_key(text, text, text, text)
  to authenticated, service_role;

create table public.symbols (
  id text primary key,
  workspace_id text not null,
  repository_id text not null,
  artifact_id text not null,
  path text not null,
  /** Reserved for members (`Class.method`); null for every top-level export. */
  container text,
  kind text not null,
  name text not null,
  start_line integer not null,
  end_line integer not null,
  start_column integer not null,
  end_column integer not null,
  /** The extractor that read it (ADR-014); null when the artifact named none. */
  engine text,
  stable_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint symbols_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint symbols_name_length check (char_length(name) between 1 and 400),
  constraint symbols_kind_length check (char_length(kind) between 1 and 80),
  constraint symbols_container_length check (container is null or char_length(container) between 1 and 400),
  constraint symbols_span_order check (start_line >= 1 and end_line >= start_line),
  constraint symbols_stable_key_shape check (stable_key ~ '^[0-9a-f]{32}$'),
  constraint symbols_graph_node_tenant_fk foreign key (workspace_id, repository_id, id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint symbols_artifact_tenant_fk foreign key (workspace_id, repository_id, artifact_id)
    references public.artifacts(workspace_id, repository_id, id) on delete cascade,
  constraint symbols_workspace_repository_key_unique
    unique (workspace_id, repository_id, stable_key)
);

create index symbols_workspace_repository_artifact_idx
  on public.symbols(workspace_id, repository_id, artifact_id);
create index symbols_workspace_repository_path_idx
  on public.symbols(workspace_id, repository_id, path);

alter table public.symbols enable row level security;

create policy symbols_owner_select on public.symbols
  for select to authenticated
  using (public.is_workspace_owner(workspace_id));

grant select on public.symbols to authenticated;
grant all on public.symbols to service_role;

-- The symbol layer's edges, shaped like `edges` and kept apart from it on
-- purpose (rule 3 above). Same provenance contract: the artifact and the span
-- that state the relation.
create table public.symbol_edges (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  source_node_id text not null,
  target_node_id text not null,
  relation text not null,
  family text not null,
  provenance jsonb not null,
  confidence numeric(4,3) not null,
  created_at timestamptz not null default now(),
  constraint symbol_edges_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint symbol_edges_relation check (relation in ('declares', 'extends')),
  constraint symbol_edges_family check (family in ('hierarchy', 'structure')),
  constraint symbol_edges_confidence_range check (confidence between 0 and 1),
  constraint symbol_edges_provenance_shape check (
    jsonb_typeof(provenance) = 'object'
    and provenance ? 'sourceArtifactId'
    and provenance ? 'span'
  ),
  constraint symbol_edges_source_node_tenant_fk foreign key (workspace_id, repository_id, source_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint symbol_edges_target_node_tenant_fk foreign key (workspace_id, repository_id, target_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint symbol_edges_unique
    unique (workspace_id, repository_id, source_node_id, target_node_id, relation)
);

create index symbol_edges_source_idx
  on public.symbol_edges(workspace_id, repository_id, source_node_id);
create index symbol_edges_target_idx
  on public.symbol_edges(workspace_id, repository_id, target_node_id);

alter table public.symbol_edges enable row level security;

create policy symbol_edges_owner_select on public.symbol_edges
  for select to authenticated
  using (public.is_workspace_owner(workspace_id));

grant select on public.symbol_edges to authenticated;
grant all on public.symbol_edges to service_role;

-- `apply_repository_scan`, redefined in full (the file is the body of
-- `202609110015_containment_join_shape.sql` plus the symbol section at the
-- end and one delete in the removed-path loop). Nothing else moved.

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
    -- A removed file's symbols lose their nodes first: the symbol rows
    -- cascade from the artifact, but a node cascades from nothing.
    delete from public.graph_nodes
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and id in (
        select symbol_row.id from public.symbols symbol_row
        where symbol_row.workspace_id = target_workspace_id
          and symbol_row.repository_id = target_repository_id
          and symbol_row.path = removed_path
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

  -- Every child and the path of its parent, computed once. Materialised on
  -- purpose: as a subquery this branch could be re-executed per node pair
  -- (see the header), and a temp table gives the planner nothing to re-run.
  create temporary table scan_containment on commit drop as
  select child_id, parent_path
  from (
    -- A directory's immediate parent directory…
    select d.id as child_id, s.parent_path
    from public.directories d
    join scan_directories s on s.dir_path = d.path
    where d.workspace_id = target_workspace_id
      and d.repository_id = target_repository_id
    union all
    -- …and every file's own directory.
    select a.id as child_id,
           nullif(regexp_replace(a.path, '/?[^/]+$', ''), '') as parent_path
    from public.artifacts a
    where a.workspace_id = target_workspace_id
      and a.repository_id = target_repository_id
  ) child_of
  where parent_path is not null;

  -- No join back to `graph_nodes`: both id columns are foreign keys into it,
  -- and the `edges` FKs would refuse a stray id anyway.
  insert into public.edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select
    target_workspace_id, target_repository_id, parent.id, child.child_id,
    'contains', 'hierarchy',
    jsonb_build_object(
      'reason', 'path containment',
      'tier', 'resolved',
      'layoutOnly', true
    ),
    1.0
  from scan_containment child
  join public.directories parent
    on parent.workspace_id = target_workspace_id
   and parent.repository_id = target_repository_id
   and parent.path = child.parent_path
  where parent.id <> child.child_id
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

  -- Symbols (Phase 4 Wave F todo 26).
  --
  -- Derived from the `exported_symbols` the artifact rows already carry, so
  -- the plan gains nothing for them and the two ingest paths cannot disagree
  -- about which symbols exist (ADR-013, the directory rule). Identity is
  -- `symbol_stable_key`; the span, the owning artifact and the engine are
  -- the mutable part. Scoped like the links above: a full plan re-derives
  -- every file's symbols, an incremental one only the files it re-read.
  --
  -- `distinct on (stable_key)`: a function with overload signatures is
  -- declared twice under one name and one kind, and it is one symbol.
  create temporary table scan_symbols on commit drop as
  select distinct on (stable_key)
    artifact_id, path, container, kind, name,
    start_line, end_line, start_column, end_column, engine, stable_key
  from (
    select
      a.id as artifact_id,
      a.path,
      nullif(item->>'container', '') as container,
      item->>'kind' as kind,
      item->>'name' as name,
      (item->>'startLine')::integer as start_line,
      (item->>'endLine')::integer as end_line,
      coalesce((item->>'startColumn')::integer, 1) as start_column,
      coalesce((item->>'endColumn')::integer, 1) as end_column,
      a.metadata->>'symbolEngine' as engine,
      public.symbol_stable_key(
        a.path, nullif(item->>'container', ''), item->>'kind', item->>'name'
      ) as stable_key
    from public.artifacts a
    cross join lateral jsonb_array_elements(
      coalesce(a.exported_symbols, '[]'::jsonb)
    ) item
    where a.workspace_id = target_workspace_id
      and a.repository_id = target_repository_id
      and (plan_link_scope = 'full' or a.path = any(scanned_paths))
      and nullif(item->>'name', '') is not null
      and nullif(item->>'kind', '') is not null
      and (item->>'startLine')::integer >= 1
      and (item->>'endLine')::integer >= (item->>'startLine')::integer
  ) declared
  order by stable_key, start_line, start_column;

  -- A symbol this pass no longer finds in a file it re-read loses its node;
  -- the FK cascades take its row and both of its edge directions.
  delete from public.graph_nodes n
  where n.workspace_id = target_workspace_id
    and n.repository_id = target_repository_id
    and n.kind = 'symbol'
    and exists (
      select 1 from public.symbols s
      where s.workspace_id = n.workspace_id
        and s.repository_id = n.repository_id
        and s.id = n.id
        and (plan_link_scope = 'full' or s.path = any(scanned_paths))
        and not exists (
          select 1 from scan_symbols ss where ss.stable_key = s.stable_key
        )
    );

  -- New identities get a node id here, once, so the node and the row agree
  -- on it without a join on a label that is not unique.
  create temporary table scan_new_symbols on commit drop as
  select public.generate_ulid() as id, ss.*
  from scan_symbols ss
  where not exists (
    select 1 from public.symbols s
    where s.workspace_id = target_workspace_id
      and s.repository_id = target_repository_id
      and s.stable_key = ss.stable_key
  );

  insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
  select id, target_workspace_id, target_repository_id, 'symbol', name
  from scan_new_symbols;

  insert into public.symbols (
    id, workspace_id, repository_id, artifact_id, path, container, kind, name,
    start_line, end_line, start_column, end_column, engine, stable_key
  )
  select
    id, target_workspace_id, target_repository_id, artifact_id, path, container,
    kind, name, start_line, end_line, start_column, end_column, engine, stable_key
  from scan_new_symbols;

  -- The same symbol, moved on the page or read by a newer engine.
  update public.symbols s
  set artifact_id = ss.artifact_id,
      start_line = ss.start_line,
      end_line = ss.end_line,
      start_column = ss.start_column,
      end_column = ss.end_column,
      engine = ss.engine,
      updated_at = now()
  from scan_symbols ss
  where s.workspace_id = target_workspace_id
    and s.repository_id = target_repository_id
    and s.stable_key = ss.stable_key
    and (s.artifact_id, s.start_line, s.end_line, s.start_column, s.end_column, s.engine)
      is distinct from
      (ss.artifact_id, ss.start_line, ss.end_line, ss.start_column, ss.end_column, ss.engine);

  -- `declares` is a pure function of the symbol rows: one per symbol, from
  -- the file that declares it. A removed symbol's edge went with its node.
  insert into public.symbol_edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select
    target_workspace_id, target_repository_id, s.artifact_id, s.id,
    'declares', 'hierarchy',
    jsonb_build_object(
      'sourceArtifactId', s.artifact_id,
      'span', jsonb_build_object(
        'path', s.path,
        'startLine', s.start_line,
        'endLine', s.end_line
      ),
      'tier', 'resolved',
      'method', coalesce(s.engine, 'declaration')
    ),
    1.0
  from public.symbols s
  where s.workspace_id = target_workspace_id
    and s.repository_id = target_repository_id
    and (plan_link_scope = 'full' or s.path = any(scanned_paths))
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence;

  -- `extends` is replaced for the files this plan speaks for, as `imports`
  -- is. Both ends are looked up by (path, name) among the symbols that exist
  -- now — a base the tree does not export is not an edge — and a source that
  -- names its own kind keeps a merged `interface Foo` + `class Foo` apart.
  delete from public.symbol_edges e
  where e.workspace_id = target_workspace_id
    and e.repository_id = target_repository_id
    and e.relation = 'extends'
    and e.source_node_id in (
      select s.id from public.symbols s
      where s.workspace_id = target_workspace_id
        and s.repository_id = target_repository_id
        and (plan_link_scope = 'full' or s.path = any(scanned_paths))
    );

  insert into public.symbol_edges (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, family, provenance, confidence
  )
  select
    target_workspace_id, target_repository_id, source_symbol.id, target_symbol.id,
    'extends', 'structure',
    jsonb_build_object(
      'sourceArtifactId', source_symbol.artifact_id,
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
    select distinct on (
      item->>'sourcePath', item->>'sourceName', item->>'targetPath', item->>'targetName'
    )
      item->>'sourcePath' as source_path,
      item->>'sourceName' as source_name,
      item->>'sourceKind' as source_kind,
      item->>'targetPath' as target_path,
      item->>'targetName' as target_name,
      item->>'tier' as tier,
      item->>'method' as method,
      (item->'span'->>'startLine')::integer as start_line,
      (item->'span'->>'endLine')::integer as end_line
    from jsonb_array_elements(coalesce(plan->'symbolLinks', '[]'::jsonb)) item
    order by
      item->>'sourcePath', item->>'sourceName', item->>'targetPath', item->>'targetName',
      (item->'span'->>'startLine')::integer
  ) link
  join public.symbols source_symbol
    on source_symbol.workspace_id = target_workspace_id
   and source_symbol.repository_id = target_repository_id
   and source_symbol.path = link.source_path
   and source_symbol.name = link.source_name
   and source_symbol.kind = link.source_kind
   and source_symbol.container is null
  join public.symbols target_symbol
    on target_symbol.workspace_id = target_workspace_id
   and target_symbol.repository_id = target_repository_id
   and target_symbol.path = link.target_path
   and target_symbol.name = link.target_name
   and target_symbol.container is null
  where source_symbol.id <> target_symbol.id
  on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
  do update set
    provenance = excluded.provenance,
    confidence = excluded.confidence;

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
