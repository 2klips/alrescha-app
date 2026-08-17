-- Team workspaces (Phase 2B todo 9, ADR-006-1 first follow-up).
--
-- The schema was team-ready: workspace_members exists and the graph tables
-- already gate SELECT on is_workspace_member. This migration adds what was
-- missing — the full role set, an invitation lifecycle, and the capability
-- matrix, enforced in security-definer functions:
--
--   owner  ─ everything; the only role that can grant/revoke admins
--   admin  ─ invite/revoke members and viewers, manage prompt capture
--   member ─ shared graph read, own writes
--   viewer ─ shared graph read only
--
-- Membership must be ACTIVE to count: invited/revoked rows grant nothing.

alter table public.workspace_members drop constraint workspace_members_role;
alter table public.workspace_members add constraint workspace_members_role
  check (role in ('owner', 'admin', 'member', 'viewer'));

alter table public.workspace_members
  add column status text not null default 'active',
  add column invited_by uuid references auth.users(id) on delete set null,
  add column updated_at timestamptz not null default now();

alter table public.workspace_members add constraint workspace_members_status
  check (status in ('invited', 'active', 'revoked'));

-- Tighten the tenancy helpers: only ACTIVE membership counts. Same
-- signatures — every existing policy picks the change up in place.
create or replace function public.is_workspace_member(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and role = 'owner'
      and status = 'active'
  );
$$;

create or replace function public.workspace_role(target_workspace_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = (select auth.uid())
    and status = 'active';
$$;

-- Active members can see the roster (membership is visible to the team —
-- deliberately unlike prompt-capture consent, which never is).
create policy workspace_members_select_members on public.workspace_members
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create or replace function public.invite_workspace_member(
  target_workspace_id text,
  target_user_id uuid,
  target_role text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := public.workspace_role(target_workspace_id);
begin
  if caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can invite members.';
  end if;
  if target_role not in ('admin', 'member', 'viewer') then
    raise exception 'Invitations can grant admin, member, or viewer only.';
  end if;
  if target_role = 'admin' and caller_role <> 'owner' then
    raise exception 'Only the owner can grant the admin role.';
  end if;
  if exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_user_id
      and status in ('invited', 'active')
  ) then
    raise exception 'The user is already invited or active in this workspace.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, status, invited_by)
  values (target_workspace_id, target_user_id, target_role, 'invited', (select auth.uid()))
  on conflict (workspace_id, user_id) do update
  set role = excluded.role,
      status = 'invited',
      invited_by = excluded.invited_by,
      updated_at = now();
  return true;
end;
$$;

create or replace function public.accept_workspace_invite(
  target_workspace_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted integer;
begin
  update public.workspace_members
  set status = 'active', updated_at = now()
  where workspace_id = target_workspace_id
    and user_id = (select auth.uid())
    and status = 'invited';
  get diagnostics accepted = row_count;
  if accepted = 0 then
    raise exception 'No pending invitation for this workspace.';
  end if;
  return true;
end;
$$;

create or replace function public.revoke_workspace_member(
  target_workspace_id text,
  target_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := public.workspace_role(target_workspace_id);
  target_member_role text;
begin
  if caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can revoke members.';
  end if;
  select role into target_member_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
    and status in ('invited', 'active');
  if target_member_role is null then
    raise exception 'The user is not invited or active in this workspace.';
  end if;
  if target_member_role = 'owner' then
    raise exception 'The workspace owner cannot be revoked.';
  end if;
  if target_member_role = 'admin' and caller_role <> 'owner' then
    raise exception 'Only the owner can revoke an admin.';
  end if;

  update public.workspace_members
  set status = 'revoked', updated_at = now()
  where workspace_id = target_workspace_id and user_id = target_user_id;
  return true;
end;
$$;

grant execute on function public.invite_workspace_member(text, uuid, text) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.revoke_workspace_member(text, uuid) to authenticated;
grant execute on function public.workspace_role(text) to authenticated;

-- The shared graph includes rationale nodes (202608170003 shipped them
-- owner-only before the team roles landed).
create policy rationales_member_select on public.rationales
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
