-- Agent memory: bi-temporal assertions and bounded memory blocks
-- (Phase 3 Wave D todos 9-10, Graphiti/Mem0 patterns — RESEARCH_KG_FUSION §3).
--
-- Two write surfaces for agents, both bi-temporal: nothing is ever deleted or
-- rewritten; a fact stops being current by getting `invalidated_at`, so
-- "what did the workspace believe at time T" stays answerable and every
-- write keeps its author token. Deletion is physically blocked by triggers —
-- like ruled_out_attempts, the property lives in the schema, not in callers.
--
-- Reconciliation (Mem0's ADD/UPDATE/DELETE/NOOP) is deterministic SQL on the
-- natural key, so it costs no credits and cannot drift per caller.

-- ① Agent-asserted edges: the closed 7-verb concept vocabulary (Graft).
create table public.agent_assertions (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  source_node_id text not null,
  target_node_id text not null,
  relation text not null,
  reason text not null,
  token_id text not null,
  user_id uuid not null,
  valid_from timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidated_by text,
  constraint agent_assertions_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint agent_assertions_relation check (relation in (
    'part_of', 'uses', 'depends_on', 'produces', 'configures', 'validates', 'implements'
  )),
  constraint agent_assertions_reason_length check (char_length(reason) between 1 and 500),
  constraint agent_assertions_distinct_nodes check (source_node_id <> target_node_id),
  constraint agent_assertions_source_tenant_fk foreign key (workspace_id, repository_id, source_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint agent_assertions_target_tenant_fk foreign key (workspace_id, repository_id, target_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint agent_assertions_token_tenant_fk foreign key (workspace_id, token_id)
    references public.mcp_tokens(workspace_id, id) on delete cascade
);

create index agent_assertions_active_pair_idx
  on public.agent_assertions(workspace_id, source_node_id, target_node_id)
  where invalidated_at is null;

-- ② Bounded memory blocks: named entries anchored to a node or the workspace.
create table public.memory_block_entries (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  anchor_node_id text references public.graph_nodes(id) on delete cascade,
  name text not null,
  entry_key text not null,
  text text not null,
  token_id text not null,
  user_id uuid not null,
  valid_from timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidated_by text,
  constraint memory_block_entries_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint memory_block_entries_name check (name in ('conventions', 'decisions', 'gotchas')),
  constraint memory_block_entries_key check (entry_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  constraint memory_block_entries_text_length check (char_length(text) between 1 and 500),
  constraint memory_block_entries_token_tenant_fk foreign key (workspace_id, token_id)
    references public.mcp_tokens(workspace_id, id) on delete cascade
);

create index memory_block_entries_active_idx
  on public.memory_block_entries(workspace_id, name, entry_key)
  where invalidated_at is null;

-- ③ Bi-temporal enforcement: no DELETE ever; the only legal UPDATE is the
-- one-way invalidation stamp — every other column must stay byte-identical.
create or replace function public.forbid_agent_memory_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'agent memory rows are never deleted; invalidate them instead';
end;
$$;

create or replace function public.allow_only_invalidation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.invalidated_at is not null then
    raise exception 'an invalidated row is immutable';
  end if;
  if new.invalidated_at is null then
    raise exception 'the only legal update is setting invalidated_at';
  end if;
  if row(new.id, new.workspace_id, new.token_id, new.user_id, new.valid_from, new.ingested_at)
     is distinct from
     row(old.id, old.workspace_id, old.token_id, old.user_id, old.valid_from, old.ingested_at) then
    raise exception 'invalidation must not rewrite history';
  end if;
  return new;
end;
$$;

create trigger agent_assertions_no_delete
  before delete on public.agent_assertions
  for each row execute function public.forbid_agent_memory_delete();
create trigger agent_assertions_invalidate_only
  before update on public.agent_assertions
  for each row execute function public.allow_only_invalidation();
create trigger memory_block_entries_no_delete
  before delete on public.memory_block_entries
  for each row execute function public.forbid_agent_memory_delete();
create trigger memory_block_entries_invalidate_only
  before update on public.memory_block_entries
  for each row execute function public.allow_only_invalidation();

-- ④ RLS + grants (tables created after the blanket grants name their roles).
alter table public.agent_assertions enable row level security;
alter table public.agent_assertions force row level security;
alter table public.memory_block_entries enable row level security;
alter table public.memory_block_entries force row level security;

create policy agent_assertions_select_member on public.agent_assertions
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy memory_block_entries_select_member on public.memory_block_entries
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.agent_assertions, public.memory_block_entries to authenticated;
grant all on public.agent_assertions, public.memory_block_entries to service_role;

-- ⑤ Deterministic reconciliation, atomic per call (service_role only).
--
-- record_agent_assertion: same active pair with the same relation → noop;
-- with a different relation → the old edge is invalidated and superseded.
create or replace function public.record_agent_assertion(
  target_workspace_id text,
  target_token_id text,
  target_user_id uuid,
  target_source_node_id text,
  target_target_node_id text,
  target_relation text,
  target_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_repository_id text;
  target_repository_id text;
  existing record;
  new_id text;
begin
  select repository_id into source_repository_id
  from public.graph_nodes
  where workspace_id = target_workspace_id and id = target_source_node_id;
  select repository_id into target_repository_id
  from public.graph_nodes
  where workspace_id = target_workspace_id and id = target_target_node_id;

  if source_repository_id is null or target_repository_id is null
    or source_repository_id <> target_repository_id then
    return jsonb_build_object('outcome', 'unknown_node');
  end if;

  select id, relation into existing
  from public.agent_assertions
  where workspace_id = target_workspace_id
    and source_node_id = target_source_node_id
    and target_node_id = target_target_node_id
    and invalidated_at is null
  limit 1;

  if existing.id is not null and existing.relation = target_relation then
    return jsonb_build_object('outcome', 'noop', 'id', existing.id);
  end if;

  insert into public.agent_assertions (
    workspace_id, repository_id, source_node_id, target_node_id,
    relation, reason, token_id, user_id
  ) values (
    target_workspace_id, source_repository_id, target_source_node_id,
    target_target_node_id, target_relation, target_reason,
    target_token_id, target_user_id
  ) returning id into new_id;

  if existing.id is not null then
    update public.agent_assertions
    set invalidated_at = now(), invalidated_by = new_id
    where id = existing.id and workspace_id = target_workspace_id;
    return jsonb_build_object(
      'outcome', 'superseded', 'id', new_id, 'invalidated_id', existing.id
    );
  end if;
  return jsonb_build_object('outcome', 'added', 'id', new_id);
end;
$$;

-- write_memory_entry: ADD / UPDATE (invalidate+insert) / NOOP / remove
-- (invalidate), with a hard cap of 12 active entries per (anchor, name) —
-- the cap is the distillation pressure, so it rejects rather than rotates.
create or replace function public.write_memory_entry(
  target_workspace_id text,
  target_token_id text,
  target_user_id uuid,
  target_anchor_node_id text,
  target_name text,
  target_entry_key text,
  target_text text,
  remove_entry boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing record;
  active_count integer;
  new_id text;
begin
  if target_anchor_node_id is not null and not exists (
    select 1 from public.graph_nodes
    where workspace_id = target_workspace_id and id = target_anchor_node_id
  ) then
    return jsonb_build_object('outcome', 'unknown_node');
  end if;

  select id, text into existing
  from public.memory_block_entries
  where workspace_id = target_workspace_id
    and anchor_node_id is not distinct from target_anchor_node_id
    and name = target_name
    and entry_key = target_entry_key
    and invalidated_at is null
  limit 1;

  if remove_entry then
    if existing.id is null then
      return jsonb_build_object('outcome', 'noop');
    end if;
    update public.memory_block_entries
    set invalidated_at = now()
    where id = existing.id and workspace_id = target_workspace_id;
    return jsonb_build_object('outcome', 'invalidated', 'id', existing.id);
  end if;

  if existing.id is not null and existing.text = target_text then
    return jsonb_build_object('outcome', 'noop', 'id', existing.id);
  end if;

  if existing.id is null then
    select count(*) into active_count
    from public.memory_block_entries
    where workspace_id = target_workspace_id
      and anchor_node_id is not distinct from target_anchor_node_id
      and name = target_name
      and invalidated_at is null;
    if active_count >= 12 then
      return jsonb_build_object('outcome', 'rejected_cap', 'limit', 12);
    end if;
  end if;

  insert into public.memory_block_entries (
    workspace_id, anchor_node_id, name, entry_key, text, token_id, user_id
  ) values (
    target_workspace_id, target_anchor_node_id, target_name,
    target_entry_key, target_text, target_token_id, target_user_id
  ) returning id into new_id;

  if existing.id is not null then
    update public.memory_block_entries
    set invalidated_at = now(), invalidated_by = new_id
    where id = existing.id and workspace_id = target_workspace_id;
    return jsonb_build_object(
      'outcome', 'updated', 'id', new_id, 'invalidated_id', existing.id
    );
  end if;
  return jsonb_build_object('outcome', 'added', 'id', new_id);
end;
$$;

revoke all on function public.record_agent_assertion(text, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_agent_assertion(text, text, uuid, text, text, text, text)
  to service_role;
revoke all on function public.write_memory_entry(text, text, uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.write_memory_entry(text, text, uuid, text, text, text, text, boolean)
  to service_role;
