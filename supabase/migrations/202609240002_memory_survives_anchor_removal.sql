begin;

-- Agent memory must not be able to stop a scan.
--
-- 202608230004 made `memory_block_entries` and `agent_assertions`
-- append-only: a BEFORE DELETE trigger refuses every delete, even for
-- service_role. It also pointed their node columns at `graph_nodes` with
-- `on delete cascade`. The two cannot hold together. When a scan removes a
-- node — a deleted or renamed file, an ADR rationale whose key changed, a
-- heading, symbol, route, directory or database object that went away — the
-- cascade reaches the memory row, the trigger raises, and the whole scan
-- transaction fails. Every retry removes the same path again, so one memory
-- entry or assertion about a file was enough to stop that repository's
-- scans for good. Invalidated history rows block it just the same.
--
-- The node references stop being foreign keys. The rows keep the id they
-- were written with, unchanged: the table's own rule is that nothing is
-- deleted or rewritten, and a memory about a file that is gone is still
-- history. `on delete set null` would rewrite that history (and turn a
-- file's gotcha into a workspace-wide one), so it is not an option. What a
-- missing anchor should mean for reads — stale, hidden, re-anchored — is
-- left to the memory-resume work (RE-05). Readers already cope: the map
-- drops an assertion whose endpoint is not in the loaded node set, and the
-- MCP memory read resolves the anchor's path to null when it cannot find it.
--
-- What the foreign keys guaranteed at write time moves into insert
-- triggers, so the property still lives in the schema and not only in
-- `write_memory_entry` / `record_agent_assertion` (which check first and
-- answer `unknown_node`). The anchor check is also tenant-scoped now: the
-- old `anchor_node_id` key referenced `graph_nodes(id)` alone, so a direct
-- insert could anchor a memory to another workspace's node.
alter table public.memory_block_entries
  drop constraint memory_block_entries_anchor_node_id_fkey;
alter table public.agent_assertions
  drop constraint agent_assertions_source_tenant_fk;
alter table public.agent_assertions
  drop constraint agent_assertions_target_tenant_fk;

create or replace function public.require_memory_anchor_in_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anchor_node_id is not null and not exists (
    select 1 from public.graph_nodes
    where workspace_id = new.workspace_id and id = new.anchor_node_id
  ) then
    raise exception 'memory anchor % is not a node in workspace %',
      new.anchor_node_id, new.workspace_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function public.require_assertion_nodes_in_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.graph_nodes
    where workspace_id = new.workspace_id
      and repository_id = new.repository_id
      and id = new.source_node_id
  ) or not exists (
    select 1 from public.graph_nodes
    where workspace_id = new.workspace_id
      and repository_id = new.repository_id
      and id = new.target_node_id
  ) then
    raise exception 'assertion node is not in repository % of workspace %',
      new.repository_id, new.workspace_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger memory_block_entries_anchor_in_tenant
  before insert on public.memory_block_entries
  for each row execute function public.require_memory_anchor_in_tenant();
create trigger agent_assertions_nodes_in_tenant
  before insert on public.agent_assertions
  for each row execute function public.require_assertion_nodes_in_tenant();

-- Updates. The only legal update is still the one-way invalidation stamp,
-- enforced by the `*_invalidate_only` triggers from 202608230004. Their
-- function compared six columns (id, workspace, token, user and the two
-- ingest times), which was enough while foreign keys pinned the node
-- columns. With the keys gone, an UPDATE that sets `invalidated_at` could
-- also move `anchor_node_id`, `source_node_id`, `target_node_id` or
-- `repository_id` — to an id that never existed, or to another tenant's
-- node — and pass. So the function now holds every column except the two
-- the stamp writes (`invalidated_at`, `invalidated_by`), whatever columns
-- the tables gain later. It checks no node on purpose: a row whose anchor a
-- scan removed must still be invalidatable. The messages are unchanged.
-- The applied 202608230004 file stays as it is (migrate.ts checksums it);
-- replacing the function here is how a new migration changes it.
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
  if (to_jsonb(new) - 'invalidated_at' - 'invalidated_by')
     is distinct from
     (to_jsonb(old) - 'invalidated_at' - 'invalidated_by') then
    raise exception 'invalidation must not rewrite history';
  end if;
  return new;
end;
$$;

commit;
