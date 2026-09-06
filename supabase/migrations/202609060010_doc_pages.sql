-- Doc pages: the readable face of a node (Phase 4 Wave D todo 20, 설계 ④,
-- OQ-033).
--
-- The graph knows what a module contains and what it touches. Nobody reads a
-- graph, so a page is that face — and what keeps a page from becoming a
-- second, drifting copy of the repository is that the **skeleton is derived
-- and only the prose is written**.
--
-- **Which scopes get a node.** A file, a directory and a concept already
-- *are* nodes; a second node for each would double the graph and make "which
-- node is this file" a question with two answers. Their page attaches with
-- `anchor_node_id`. Only `module`, `feature` and `repo` describe something
-- the graph has no node for, so only those three are `graph_nodes`.
--
-- **The slug hashes member directories, not member files.** A module gains
-- and loses files constantly and changes shape rarely; hashing the files
-- would rename the page on every commit and break every link to it.
-- `previous_slugs` carries the old name when the shape does change, because
-- a URL somebody bookmarked is not free to break.

alter table public.graph_nodes drop constraint graph_nodes_kind;
alter table public.graph_nodes add constraint graph_nodes_kind
  check (kind in (
    'artifact', 'requirement', 'evidence', 'finding', 'rationale', 'concept',
    'directory', 'route', 'db_object', 'section', 'doc_page'
  ));

create table public.doc_pages (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  scope text not null,
  -- What this page is *about*, stably: a module key, an anchor path, a
  -- concept name. The slug is the address and may change when the shape
  -- does; this is the identity that finds the row when it does.
  identity_key text not null,
  slug text not null,
  -- Every name this page has answered to. A reader following an old link is
  -- redirected rather than told the page does not exist.
  previous_slugs text[] not null default '{}',
  -- Set for the scopes that attach to an existing node; null for the three
  -- that are nodes themselves (the CHECK below holds the two apart).
  anchor_node_id text,
  title text not null,
  member_paths text[] not null default '{}',
  -- What the prose was generated from. The conditional write compares it.
  member_digest text not null,
  -- The deterministic half: members, symbol names, relation counts and the
  -- citation candidate set. Names and counts, never a source body.
  skeleton jsonb not null default '{}'::jsonb,
  summary text,
  summary_model text,
  summary_provider text,
  -- The digest the stored prose was generated from, which is what makes the
  -- write conditional and the read able to say "stale" (보완 R-02).
  summary_member_digest text,
  summary_grade text,
  cited_node_ids text[] not null default '{}',
  source_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doc_pages_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint doc_pages_scope check (
    scope in ('concept', 'directory', 'feature', 'file', 'module', 'repo')
  ),
  constraint doc_pages_slug_shape check (slug ~ '^[0-9a-f]{32}$'),
  -- ADR-001: page prose is a model's reading of stored facts. There is no
  -- verified page and the column may not hold the word.
  constraint doc_pages_grade check (
    summary_grade is null or summary_grade = 'inferred'
  ),
  -- Prose and the digest it describes travel together, or neither is stored.
  constraint doc_pages_summary_digest check (
    (summary is null) = (summary_member_digest is null)
  ),
  -- The two shapes, held apart: a node-scoped page IS a graph node (its id
  -- is that node's id) and anchors nothing; an attached page anchors and is
  -- not a node.
  constraint doc_pages_anchor_shape check (
    (scope in ('feature', 'module', 'repo') and anchor_node_id is null)
    or (scope in ('concept', 'directory', 'file') and anchor_node_id is not null)
  ),
  constraint doc_pages_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  constraint doc_pages_anchor_tenant_fk foreign key (workspace_id, repository_id, anchor_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint doc_pages_workspace_repository_slug_unique
    unique (workspace_id, repository_id, slug),
  constraint doc_pages_workspace_repository_identity_unique
    unique (workspace_id, repository_id, scope, identity_key)
);

create index doc_pages_workspace_repository_idx
  on public.doc_pages(workspace_id, repository_id);
create index doc_pages_anchor_idx
  on public.doc_pages(workspace_id, repository_id, anchor_node_id);

alter table public.doc_pages enable row level security;

create policy doc_pages_select_member on public.doc_pages
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.doc_pages to authenticated;
grant all on public.doc_pages to service_role;

/**
 * The page's address.
 *
 * For the three scopes that *are* a member set, md5 over the sorted set of
 * member **directories** — so adding one file to a module does not rename
 * its page. For the scopes that attach to an existing node, that rule would
 * collide (two files in one directory hash the same), so their address is
 * their own identity. The scope is inside the hash either way.
 *
 * `packages/core/src/docs/doc-page.ts` states the same rule, and
 * `tests/doc-pages.test.ts` pins the two against each other — one rule with
 * two implementations only stays one rule if something checks, which is the
 * lesson `next_route_url` and `bestHome` already carry.
 */
create or replace function public.doc_page_slug(
  page_scope text,
  member_paths text[],
  identity_key text
)
returns text
language sql
immutable
set search_path = ''
as $$
  -- `collate "C"` so the ordering is byte-wise and matches the TypeScript
  -- sort: a database collation that ignores punctuation would order
  -- `src/a` and `src-a` differently and produce a different slug for the
  -- same module.
  select md5(
    page_scope || E'\n' ||
    case
      when page_scope in ('feature', 'module', 'repo') then coalesce(
        (
          select string_agg(directory, E'\n' order by directory collate "C")
          from (
            select distinct regexp_replace(path, '/?[^/]*$', '') as directory
            from unnest(coalesce(member_paths, array[]::text[])) as path
          ) directories
        ),
        ''
      )
      else coalesce(identity_key, '')
    end
  );
$$;

-- `docskeleton` is deterministic and free; `docpage` calls a model and may
-- carry a credit cost. The queue enforces both.
alter table public.jobs drop constraint jobs_kind;
alter table public.jobs
  add constraint jobs_kind
  check (kind in (
    'scan', 'analyze', 'judge', 'pack', 'coach', 'enrich',
    'docskeleton', 'docpage'
  ));

alter table public.jobs drop constraint jobs_deterministic_zero_credit;
alter table public.jobs
  add constraint jobs_deterministic_zero_credit
  check (kind not in ('scan', 'analyze', 'docskeleton') or credit_cost = 0);

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

  -- `docskeleton` joins the deterministic kinds: it reads stored rows and
  -- writes stored rows, so it may never carry a cost. `docpage` joins the
  -- billable ones beside `enrich`, `judge` and `coach` (todo 20).
  if job_kind not in (
    'scan', 'analyze', 'judge', 'pack', 'coach', 'enrich',
    'docskeleton', 'docpage'
  ) then
    raise exception 'unsupported job kind: %', job_kind;
  end if;
  if job_kind in ('scan', 'analyze', 'docskeleton') and requested_credit_cost <> 0 then
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

revoke all on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_job(text, text, text, text, text, jsonb, integer, integer)
  to service_role;

/**
 * Apply one `docskeleton` pass: the derived half of every page.
 *
 * Free, replayable and idempotent — it reads stored rows and writes stored
 * rows. Prose is never touched here: a skeleton that overwrote a page's
 * summary would make every rescan an un-billable way to lose paid work.
 *
 * A page whose member directories changed keeps its identity: the row is
 * found by anchor (attached scopes) or by any slug it has answered to (node
 * scopes), and the old slug joins `previous_slugs`.
 */
create or replace function public.apply_doc_page_skeletons(
  target_workspace_id text,
  target_repository_id text,
  pages jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  page jsonb;
  page_scope text;
  page_slug text;
  page_members text[];
  existing public.doc_pages%rowtype;
  page_id text;
  written integer := 0;
  renamed integer := 0;
begin
  for page in select jsonb_array_elements(coalesce(pages, '[]'::jsonb))
  loop
    page_scope := page->>'scope';
    select coalesce(array_agg(value order by value), array[]::text[])
    into page_members
    from jsonb_array_elements_text(coalesce(page->'memberPaths', '[]'::jsonb)) value;
    page_slug := public.doc_page_slug(
      page_scope, page_members, page->>'identityKey');

    -- Found by identity, never by address: a module that gained a directory
    -- has a new slug and is the same page, and looking it up by the new slug
    -- would create a second one.
    select * into existing from public.doc_pages
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and scope = page_scope
      and identity_key = page->>'identityKey';

    if found then
      if existing.slug <> page_slug then
        renamed := renamed + 1;
      end if;
      update public.doc_pages
      set slug = page_slug,
          previous_slugs = case
            when existing.slug = page_slug then previous_slugs
            else array(select distinct unnest(previous_slugs || existing.slug))
          end,
          title = page->>'title',
          member_paths = page_members,
          member_digest = page->>'memberDigest',
          skeleton = coalesce(page->'skeleton', '{}'::jsonb),
          source_commit_sha = page->>'commitSha',
          updated_at = now()
      where id = existing.id;
      written := written + 1;
      continue;
    end if;

    if page_scope in ('feature', 'module', 'repo') then
      -- The page is the node: one row in each table, sharing an id.
      insert into public.graph_nodes (workspace_id, repository_id, kind, label)
      values (target_workspace_id, target_repository_id, 'doc_page', page->>'title')
      returning id into page_id;
      insert into public.doc_pages (
        id, workspace_id, repository_id, scope, identity_key, slug, title,
        member_paths, member_digest, skeleton, source_commit_sha
      ) values (
        page_id, target_workspace_id, target_repository_id, page_scope,
        page->>'identityKey', page_slug, page->>'title', page_members,
        page->>'memberDigest', coalesce(page->'skeleton', '{}'::jsonb),
        page->>'commitSha'
      );
    else
      insert into public.doc_pages (
        workspace_id, repository_id, scope, identity_key, slug,
        anchor_node_id, title, member_paths, member_digest, skeleton,
        source_commit_sha
      ) values (
        target_workspace_id, target_repository_id, page_scope,
        page->>'identityKey', page_slug, page->>'anchorNodeId',
        page->>'title', page_members, page->>'memberDigest',
        coalesce(page->'skeleton', '{}'::jsonb), page->>'commitSha'
      );
    end if;
    written := written + 1;
  end loop;

  return jsonb_build_object('renamed', renamed, 'written', written);
end;
$$;

/**
 * Store generated page prose, conditionally (보완 R-02).
 *
 * The same rule `apply_artifact_summaries` follows since step S1, for the
 * same reason: a page generated from one member set must not be written on
 * top of a page whose members have since changed. The write compares the
 * digest the generation started from against the one stored now, and the
 * four outcomes are reported rather than collapsed into a count:
 *
 *   applied    — the digest matched and the prose landed
 *   superseded — the members moved while the model was running
 *   missing    — no page with that slug
 *   invalid    — the item carried no slug or no digest to be conditional on
 *
 * A `superseded` result is **not** an instruction to call the model again.
 * Re-running on every miss would turn a busy repository into an unbounded
 * bill, and the no-charge/idempotent rule is what stops it.
 */
create or replace function public.apply_doc_page_prose(
  target_workspace_id text,
  target_repository_id text,
  items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_slug text;
  expected_digest text;
  updated_id text;
  page_exists boolean;
  applied integer := 0;
  superseded integer := 0;
  missing integer := 0;
  invalid integer := 0;
begin
  for item in select jsonb_array_elements(coalesce(items, '[]'::jsonb))
  loop
    item_slug := nullif(trim(coalesce(item->>'slug', '')), '');
    expected_digest := nullif(trim(coalesce(item->>'memberDigest', '')), '');
    updated_id := null;

    -- A write that cannot be made conditional is refused rather than applied
    -- unconditionally.
    if item_slug is null or expected_digest is null then
      invalid := invalid + 1;
      continue;
    end if;

    update public.doc_pages
    set summary = item->>'body',
        summary_member_digest = expected_digest,
        summary_model = item->>'model',
        summary_provider = item->>'provider',
        summary_grade = 'inferred',
        cited_node_ids = coalesce(
          (
            select array_agg(value)
            from jsonb_array_elements_text(
              coalesce(item->'citedNodeIds', '[]'::jsonb)
            ) value
          ),
          array[]::text[]
        ),
        updated_at = now()
    where workspace_id = target_workspace_id
      and repository_id = target_repository_id
      and slug = item_slug
      and member_digest = expected_digest
    returning id into updated_id;

    if updated_id is not null then
      applied := applied + 1;
      continue;
    end if;

    select exists (
      select 1 from public.doc_pages
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and slug = item_slug
    ) into page_exists;

    if page_exists then
      superseded := superseded + 1;
    else
      missing := missing + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'applied', applied,
    'invalid', invalid,
    'missing', missing,
    'superseded', superseded
  );
end;
$$;

revoke all on function public.doc_page_slug(text, text[], text)
  from public, anon;
grant execute on function public.doc_page_slug(text, text[], text)
  to authenticated, service_role;
revoke all on function public.apply_doc_page_skeletons(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_doc_page_prose(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_doc_page_skeletons(text, text, jsonb)
  to service_role;
grant execute on function public.apply_doc_page_prose(text, text, jsonb)
  to service_role;
