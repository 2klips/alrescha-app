-- Opt-in prompt capture (Phase 2B todo 10, ADR-011).
--
-- The seven ADR-011 rules, machine-enforced:
--   1  double opt-in: workspace enablement AND the member's own consent
--   2  local-first: the default store is a file in the user's repo; this
--      server store only receives what a consented member syncs
--   3  metadata-first: raw prompt text is stored ONLY when the member's
--      separate raw-sync switch is on; reads default to the author
--   4  observation ≠ appraisal: individual rows are author-scoped; team
--      sees only what the author explicitly shared
--   6  deletion: author deletes own rows; aggregates are computed from
--      rows, so deletion propagates by construction
--   —  and the ADR-004 invariant stays: this store is fully separate from
--      access_events, which never carries prompt text
--
-- Consent is invisible to the team: consents are self-readable only. A
-- BEFORE trigger guards every insert/update — even service-role writes
-- cannot store data for a member who has not consented.

create table public.prompt_capture_settings (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  enabled_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.prompt_capture_consents (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_sync_enabled boolean not null default false,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (workspace_id, user_id)
);

create table public.prompt_records (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  tool_name text not null,
  target_node_ids text[] not null default '{}',
  token_count integer not null default 0,
  rubric jsonb not null default '{}'::jsonb,
  raw_text text,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prompt_records_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint prompt_records_tool_name_length check (char_length(tool_name) between 1 and 120),
  constraint prompt_records_token_count check (token_count >= 0)
);

create index prompt_records_workspace_user_idx
  on public.prompt_records(workspace_id, user_id, occurred_at desc);

alter table public.prompt_capture_settings enable row level security;
alter table public.prompt_capture_consents enable row level security;
alter table public.prompt_records enable row level security;
alter table public.prompt_capture_settings force row level security;
alter table public.prompt_capture_consents force row level security;
alter table public.prompt_records force row level security;

-- Whether capture is on is visible to members (they must be able to decide);
-- WHO consented never is — consents are readable by their subject only.
create policy prompt_capture_settings_select_member on public.prompt_capture_settings
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy prompt_capture_consents_select_self on public.prompt_capture_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Records: the author always; the team only when the author shared the row.
create policy prompt_records_select_author_or_shared on public.prompt_records
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (shared and (select public.is_workspace_member(workspace_id)))
  );

create policy prompt_records_update_author on public.prompt_records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy prompt_records_delete_author on public.prompt_records
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The double-opt-in gate, enforced below every code path (service role
-- included): no enablement or no live consent → no row, ever. Raw text
-- additionally requires the member's separate raw-sync switch.
create or replace function public.enforce_prompt_capture_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  capture_enabled boolean;
  consent_raw_sync boolean;
begin
  select enabled into capture_enabled
  from public.prompt_capture_settings
  where workspace_id = new.workspace_id;
  if capture_enabled is distinct from true then
    raise exception 'Prompt capture is not enabled for this workspace.';
  end if;

  select raw_sync_enabled into consent_raw_sync
  from public.prompt_capture_consents
  where workspace_id = new.workspace_id
    and user_id = new.user_id
    and revoked_at is null;
  if not found then
    raise exception 'The member has not consented to prompt capture.';
  end if;

  if new.raw_text is not null and consent_raw_sync is distinct from true then
    raise exception 'Raw prompt sync is not enabled for this member.';
  end if;
  return new;
end;
$$;

create trigger prompt_records_capture_gate
  before insert or update on public.prompt_records
  for each row execute procedure public.enforce_prompt_capture_gate();

create or replace function public.set_prompt_capture(
  target_workspace_id text,
  target_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.workspace_role(target_workspace_id) not in ('owner', 'admin') then
    raise exception 'Only owners and admins can configure prompt capture.';
  end if;
  insert into public.prompt_capture_settings (workspace_id, enabled, enabled_by)
  values (target_workspace_id, target_enabled, (select auth.uid()))
  on conflict (workspace_id) do update
  set enabled = excluded.enabled,
      enabled_by = excluded.enabled_by,
      updated_at = now();
  return true;
end;
$$;

create or replace function public.set_prompt_consent(
  target_workspace_id text,
  target_consented boolean,
  target_raw_sync boolean default false
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'Only active workspace members can set prompt consent.';
  end if;
  insert into public.prompt_capture_consents (
    workspace_id, user_id, raw_sync_enabled, consented_at, revoked_at
  ) values (
    target_workspace_id, (select auth.uid()),
    target_consented and target_raw_sync,
    now(),
    case when target_consented then null else now() end
  )
  on conflict (workspace_id, user_id) do update
  set raw_sync_enabled = excluded.raw_sync_enabled,
      consented_at = case when excluded.revoked_at is null then now() else prompt_capture_consents.consented_at end,
      revoked_at = excluded.revoked_at;
  return true;
end;
$$;

create or replace function public.record_prompt(
  target_workspace_id text,
  target_tool_name text,
  target_node_ids text[],
  target_token_count integer,
  target_rubric jsonb,
  target_raw_text text default null,
  target_shared boolean default false
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_id text;
begin
  insert into public.prompt_records (
    workspace_id, user_id, tool_name, target_node_ids, token_count, rubric,
    raw_text, shared
  ) values (
    target_workspace_id, (select auth.uid()), target_tool_name,
    coalesce(target_node_ids, '{}'), coalesce(target_token_count, 0),
    coalesce(target_rubric, '{}'::jsonb), target_raw_text, target_shared
  )
  returning id into record_id;
  return record_id;
end;
$$;

-- Table privileges: reads and author-scoped update/delete go through RLS;
-- INSERT is deliberately NOT granted — the only authenticated write path is
-- `record_prompt`, and even that lands on the consent-gate trigger.
grant select on public.prompt_capture_settings to authenticated;
grant select on public.prompt_capture_consents to authenticated;
grant select, update, delete on public.prompt_records to authenticated;

grant execute on function public.set_prompt_capture(text, boolean) to authenticated;
grant execute on function public.set_prompt_consent(text, boolean, boolean) to authenticated;
grant execute on function public.record_prompt(text, text, text[], integer, jsonb, text, boolean) to authenticated;
