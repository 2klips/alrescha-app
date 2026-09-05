-- Data model repairs the feature audit reproduced (Phase 4 Wave A todo 5,
-- R5 §4.4). Four defects, one migration, because they are one failure mode:
-- a document that changes wedges or scrambles the todos derived from it.
--
-- 1. **Identity.** The source key was the checkbox's byte offset, so
--    inserting three lines at the top of a document renamed every todo below
--    it — measured: one id of ten survived, and that one was reattached to a
--    *different* item. The key is now a hash of the normalised title, and
--    `apply_repository_scan` moves an existing row onto its new key rather
--    than deleting and reinserting it.
-- 2. **The wedge.** `progress_events.todo_id` had no ON DELETE, so an agent
--    that logged progress against a todo and then edited the document left a
--    foreign key violation that failed *every* subsequent scan. Nulling the
--    reference keeps the event and its text; losing a link is not worth
--    losing a repository's ingest.
-- 3. **The 240-character mine.** The title CHECK rolled the whole scan back
--    for one long checkbox. The parser truncates now (the rationale
--    precedent), and the CHECK stays as the backstop it was meant to be.
-- 4. **Repository scoping.** `access_events` and `progress_events` had no
--    repository, so every live surface reading them is workspace-flat
--    (R5 §4.5 ⒁, OQ-042). The column is filled by a trigger from the node
--    or todo the row already points at — nullable, because an event about
--    nothing in particular belongs to no repository.
--
-- Nested markers land here too: `[~]` and `[/]` are in progress, `[-]` is
-- blocked, and `parent_key` keeps the nesting the document wrote.

alter table public.todos
  add column if not exists parent_key text;

comment on column public.todos.parent_key is
  'Source key of the enclosing checkbox, when the document nested this one under it.';

alter table public.todos
  drop constraint if exists todos_parent_key_length;

alter table public.todos
  add constraint todos_parent_key_length check (
    parent_key is null or char_length(parent_key) between 1 and 400
  );

-- An event that outlives its todo keeps its own words.
alter table public.progress_events
  drop constraint if exists progress_events_todo_tenant_fk;

alter table public.progress_events
  add constraint progress_events_todo_tenant_fk
    foreign key (workspace_id, todo_id)
    references public.todos(workspace_id, id)
    on delete set null (todo_id);

alter table public.access_events
  add column if not exists repository_id text;

alter table public.progress_events
  add column if not exists repository_id text;

comment on column public.access_events.repository_id is
  'Repository the touched nodes belong to, derived on insert. Null when the call named no node.';

/**
 * Fill `repository_id` from what the row already points at.
 *
 * A trigger rather than a writer change: these rows are written from the MCP
 * server, the settings actions and the SQL functions, and a column that only
 * some of them remember to set is worse than no column at all.
 */
create or replace function public.access_events_set_repository()
returns trigger
language plpgsql
set search_path = ''
as $access$
begin
  if new.repository_id is not null or cardinality(new.target_node_ids) = 0 then
    return new;
  end if;
  select n.repository_id into new.repository_id
  from public.graph_nodes n
  where n.workspace_id = new.workspace_id
    and n.id = any(new.target_node_ids)
  limit 1;
  return new;
end;
$access$;

drop trigger if exists access_events_set_repository_trigger on public.access_events;
create trigger access_events_set_repository_trigger
  before insert on public.access_events
  for each row execute function public.access_events_set_repository();

create or replace function public.progress_events_set_repository()
returns trigger
language plpgsql
set search_path = ''
as $progress$
begin
  if new.repository_id is not null or new.todo_id is null then
    return new;
  end if;
  select t.repository_id into new.repository_id
  from public.todos t
  where t.workspace_id = new.workspace_id and t.id = new.todo_id;
  return new;
end;
$progress$;

drop trigger if exists progress_events_set_repository_trigger on public.progress_events;
create trigger progress_events_set_repository_trigger
  before insert on public.progress_events
  for each row execute function public.progress_events_set_repository();

update public.access_events e
set repository_id = (
  select n.repository_id from public.graph_nodes n
  where n.workspace_id = e.workspace_id
    and n.id = any(e.target_node_ids)
  limit 1
)
where e.repository_id is null and cardinality(e.target_node_ids) > 0;

update public.progress_events e
set repository_id = t.repository_id
from public.todos t
where t.workspace_id = e.workspace_id
  and t.id = e.todo_id
  and e.repository_id is null;

create index if not exists access_events_workspace_repository_idx
  on public.access_events(workspace_id, repository_id, occurred_at desc)
  where repository_id is not null;

create index if not exists progress_events_workspace_repository_idx
  on public.progress_events(workspace_id, repository_id, occurred_at desc)
  where repository_id is not null;

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
