-- The concept graph (Phase 3 Wave C todo 7).
--
-- Enrich part ② synthesizes concept nodes (`system`/`api`/`concept`) from the
-- prose summaries and links them with the closed seven-verb vocabulary. All
-- of it is AI output, so all of it is `inferred` (ADR-001): concept nodes are
-- graph nodes of kind 'concept', their edges carry `tier: 'inferred'` in
-- provenance, and freshness is tracked by a digest of the member summaries so
-- a changed file invalidates exactly the concepts built on it.
--
-- Convergence contract: concepts upsert by deterministic slug — the same
-- input synthesized twice lands on the same rows — and a synthesis pass
-- replaces the whole concept layer (vanished concepts are deleted; the
-- structural layer is never touched).

alter table public.graph_nodes drop constraint graph_nodes_kind;
alter table public.graph_nodes add constraint graph_nodes_kind
  check (kind in ('artifact', 'requirement', 'evidence', 'finding', 'rationale', 'concept'));

alter table public.edges drop constraint edges_relation;
alter table public.edges add constraint edges_relation
  check (relation in (
    'requires', 'implements', 'tests', 'supports', 'contradicts',
    'supersedes', 'references', 'imports', 'calls',
    -- The closed concept verbs (Graft precedent; 'implements' already exists).
    'part_of', 'uses', 'depends_on', 'produces', 'configures', 'validates'
  ));

create table public.concepts (
  id text primary key,
  workspace_id text not null,
  repository_id text not null,
  slug text not null,
  name text not null,
  kind text not null,
  summary text not null,
  member_paths text[] not null default '{}',
  source_digest text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concepts_kind check (kind in ('system', 'api', 'concept')),
  constraint concepts_slug_length check (char_length(slug) between 1 and 120),
  constraint concepts_graph_node_tenant_fk foreign key (workspace_id, repository_id, id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint concepts_workspace_repository_slug_unique unique (workspace_id, repository_id, slug)
);

create index concepts_workspace_repository_idx
  on public.concepts(workspace_id, repository_id);

alter table public.concepts enable row level security;

create policy concepts_owner_select on public.concepts
  for select to authenticated
  using (public.is_workspace_owner(workspace_id));

-- Tables created after the blanket grants must name their roles themselves
-- (the recurring trap: 2C Wave 1, Wave A todo 1).
grant select on public.concepts to authenticated;
grant all on public.concepts to service_role;

-- The single write path for a synthesis pass. Items:
--   {slug, name, kind, summary, memberPaths: text[],
--    links: [{target: {slug} | {path}, relation}]}
-- Replace-all semantics for the concept layer; unknown link targets and
-- self-links are discarded (the clean pass also runs in TypeScript — this is
-- the second, structural line of defence).
create or replace function public.apply_concept_graph(
  target_workspace_id text,
  target_repository_id text,
  concept_items jsonb,
  synthesis_digest text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  link jsonb;
  concept_id text;
  link_target_id text;
  kept_slugs text[];
  touched integer := 0;
begin
  select coalesce(array_agg(entry->>'slug'), array[]::text[])
  into kept_slugs
  from jsonb_array_elements(coalesce(concept_items, '[]'::jsonb)) entry;

  -- Vanished concepts leave with their node (edges cascade via FK).
  delete from public.graph_nodes
  where workspace_id = target_workspace_id
    and repository_id = target_repository_id
    and id in (
      select id from public.concepts
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and not (slug = any(kept_slugs))
    );

  for item in
    select jsonb_array_elements(coalesce(concept_items, '[]'::jsonb))
  loop
    select id into concept_id
    from public.concepts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and slug = item->>'slug';

    if concept_id is null then
      insert into public.graph_nodes (workspace_id, repository_id, kind, label)
      values (target_workspace_id, target_repository_id, 'concept', item->>'name')
      returning id into concept_id;

      insert into public.concepts (
        id, workspace_id, repository_id, slug, name, kind, summary,
        member_paths, source_digest
      ) values (
        concept_id, target_workspace_id, target_repository_id,
        item->>'slug', item->>'name', item->>'kind', item->>'summary',
        coalesce(
          (select array_agg(value) from jsonb_array_elements_text(item->'memberPaths')),
          array[]::text[]
        ),
        synthesis_digest
      );
    else
      update public.concepts
      set name = item->>'name',
          kind = item->>'kind',
          summary = item->>'summary',
          member_paths = coalesce(
            (select array_agg(value) from jsonb_array_elements_text(item->'memberPaths')),
            array[]::text[]
          ),
          source_digest = synthesis_digest,
          updated_at = now()
      where id = concept_id and workspace_id = target_workspace_id;

      update public.graph_nodes
      set label = item->>'name', updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and id = concept_id;
    end if;

    touched := touched + 1;
  end loop;

  -- Second pass: links, after every concept of this batch exists — a link
  -- may point at a concept defined later in the same synthesis.
  for item in
    select jsonb_array_elements(coalesce(concept_items, '[]'::jsonb))
  loop
    select id into concept_id
    from public.concepts
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and slug = item->>'slug';

    -- A synthesis pass replaces the concept's outgoing links.
    delete from public.edges
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and source_node_id = concept_id;

    for link in
      select jsonb_array_elements(coalesce(item->'links', '[]'::jsonb))
    loop
      if link->>'relation' not in (
        'part_of', 'uses', 'depends_on', 'produces',
        'configures', 'validates', 'implements'
      ) then
        continue; -- outside the closed vocabulary → discarded
      end if;

      link_target_id := null;
      if link->'target'->>'slug' is not null then
        select id into link_target_id
        from public.concepts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and slug = link->'target'->>'slug';
      elsif link->'target'->>'path' is not null then
        select id into link_target_id
        from public.artifacts
        where workspace_id = target_workspace_id
          and repository_id = target_repository_id
          and path = link->'target'->>'path';
      end if;

      if link_target_id is not null and link_target_id <> concept_id then
        insert into public.edges (
          workspace_id, repository_id, source_node_id, target_node_id,
          relation, provenance, confidence
        ) values (
          target_workspace_id, target_repository_id, concept_id, link_target_id,
          link->>'relation',
          jsonb_build_object(
            'reason', 'concept synthesis from file summaries',
            'tier', 'inferred',
            'sourceDigest', synthesis_digest
          ),
          0.5
        )
        on conflict (workspace_id, repository_id, source_node_id, target_node_id, relation)
        do update set provenance = excluded.provenance, confidence = excluded.confidence;
      end if;
    end loop;
  end loop;

  return touched;
end;
$$;

revoke all on function public.apply_concept_graph(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_concept_graph(text, text, jsonb, text) to service_role;

-- enqueue_enrich_job learns about the concept layer: work is pending when
-- summaries are uncached OR the concept layer was built from a different
-- summary set (digest mismatch, LazyGraphRAG-style invalidation). The digest
-- formula mirrors @arr/core's `conceptSynthesisDigest` exactly — md5 over
-- 'path:blobSha' lines sorted bytewise (collate "C").
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
