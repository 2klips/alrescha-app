-- Route nodes and `handles` (Phase 4 Wave A′ todo 6, design ② / GitNexus).
--
-- A user thinks in screens and endpoints, and the graph had neither. Both
-- frameworks state their routes in a place the scan can already see, so the
-- product does not have to guess:
--
-- - **Next.js** writes the URL into the path. Derived here from the stored
--   artifacts, so the plan carries no route and the two ingest paths cannot
--   disagree about one (ADR-013 — the rule the directory hierarchy follows).
--   `resolved`.
-- - **FastAPI / Flask** write it in a decorator, which only the body states.
--   The scan reads method, path and line and nothing else, and the edge is
--   `reference`: a router mounted under a prefix has a URL this cannot see
--   (ADR-014 — no import graph, no execution, no guessing).
--
-- A layout is not a URL of its own but serves every URL beneath it, so it
-- `handles` each of them: opening a route and seeing the three files that
-- actually render it is the point of the family.

alter table public.graph_nodes drop constraint graph_nodes_kind;
alter table public.graph_nodes add constraint graph_nodes_kind
  check (kind in (
    'artifact', 'requirement', 'evidence', 'finding', 'rationale', 'concept',
    'directory', 'route'
  ));

alter table public.edges drop constraint edges_relation;
alter table public.edges add constraint edges_relation
  check (relation in (
    'requires', 'implements', 'tests', 'supports', 'contradicts',
    'supersedes', 'references', 'imports', 'calls',
    'part_of', 'uses', 'depends_on', 'produces', 'configures', 'validates',
    'contains',
    -- Route family: route → the files that serve it.
    'handles'
  ));

create table public.routes (
  id text primary key,
  workspace_id text not null,
  repository_id text not null,
  url text not null,
  /** 'resolved' when the path states the URL, 'reference' for a decorator. */
  tier text not null default 'resolved',
  /** HTTP verbs a decorator declared; empty for a Next.js page. */
  methods text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint routes_url_length check (char_length(url) between 1 and 400),
  constraint routes_tier check (tier in ('reference', 'resolved')),
  constraint routes_graph_node_tenant_fk foreign key (workspace_id, repository_id, id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint routes_workspace_repository_url_unique
    unique (workspace_id, repository_id, url)
);

create index routes_workspace_repository_idx
  on public.routes(workspace_id, repository_id);

alter table public.routes enable row level security;

create policy routes_owner_select on public.routes
  for select to authenticated
  using (public.is_workspace_owner(workspace_id));

-- Tables created after the blanket grants must name their roles themselves.
grant select on public.routes to authenticated;
grant all on public.routes to service_role;

/**
 * The URL a Next.js file serves, or null when it serves none.
 *
 * The `app` and `pages` trees, route groups `(shell)` dropped, `index` folded
 * into its directory. `packages/core/src/ingest/route-links.ts` states the
 * same rule for the facet axis, and `tests/route-nodes.test.ts` pins the two
 * against each other — one rule with two implementations only stays one rule
 * if something checks.
 */
create or replace function public.next_route_url(source_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $route$
declare
  rest text;
  directory text;
  segments text[];
begin
  if source_path ~ '(^|/)app/.*(page|layout|route)\.[cm]?[jt]sx?$' then
    rest := regexp_replace(source_path, '^.*?(^|/)app/', '');
    directory := regexp_replace(rest, '/?[^/]+$', '');
  elsif source_path ~ '(^|/)pages/.+\.[cm]?[jt]sx?$' then
    rest := regexp_replace(source_path, '^.*?(^|/)pages/', '');
    directory := regexp_replace(rest, '\.[cm]?[jt]sx?$', '');
    directory := regexp_replace(directory, '/?index$', '');
    if directory ~ '(^|/)_(app|document|middleware|error)$' then
      return null;
    end if;
  else
    return null;
  end if;

  select coalesce(array_agg(segment order by ordinality), array[]::text[])
  into segments
  from unnest(string_to_array(directory, '/')) with ordinality as parts(segment, ordinality)
  where segment <> '' and segment !~ '^\(.*\)$';

  return '/' || array_to_string(segments, '/');
end;
$route$;

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

  update public.repositories
  set last_scanned_commit_sha = plan_commit_sha,
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
