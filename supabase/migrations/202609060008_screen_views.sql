-- When this member last opened a screen (Phase 4 Wave D todo 19 ⑵).
--
-- The progress board answers "where does everything stand". A digest answers
-- "what moved since I last looked", and that second question needs one stored
-- fact per member per screen: the last time they looked.
--
-- Per **member**, not per workspace. Two people on one workspace have
-- different last visits, and a shared row would tell the second one that
-- everything the first one already read is new.
--
-- `last_viewed_at` is the only column that changes, and it is deliberately
-- outside `repositories.data_revision` (OQ-051): a read that recorded itself
-- into the graph revision would invalidate its own fence.

create table public.workspace_screen_views (
  workspace_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  screen text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (workspace_id, user_id, screen),
  constraint workspace_screen_views_screen
    check (screen in ('progress', 'inspection', 'map', 'commits')),
  constraint workspace_screen_views_workspace_fk
    foreign key (workspace_id) references public.workspaces(id) on delete cascade
);

alter table public.workspace_screen_views enable row level security;

-- A member sees and writes only their own visits. Even inside one workspace,
-- when somebody else last looked at a screen is not this member's business.
create policy workspace_screen_views_own_select on public.workspace_screen_views
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Insert and update are the same row and the same rule. Stamping is a read's
-- side effect, so it runs as the member rather than through a definer
-- function that could stamp anyone.
create policy workspace_screen_views_own_insert on public.workspace_screen_views
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_workspace_member(workspace_id)
  );

create policy workspace_screen_views_own_update on public.workspace_screen_views
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (
    user_id = (select auth.uid()) and public.is_workspace_member(workspace_id)
  );

grant select, insert, update on public.workspace_screen_views to authenticated;
grant all on public.workspace_screen_views to service_role;

/**
 * Read the previous visit and record this one, in that order.
 *
 * The order is the whole point: a screen that stamped the visit first would
 * always read its own stamp and report nothing new. This returns what was
 * there *before* the write, so the first call after a two-day gap reports two
 * days, and an immediate refresh reports the moment of the first call.
 *
 * Null means never — which is not the same as "nothing has happened", and the
 * screen says so rather than showing an empty digest.
 */
create or replace function public.touch_screen_view(
  target_workspace_id text,
  target_screen text
) returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous timestamptz;
begin
  select last_viewed_at into previous
  from public.workspace_screen_views
  where workspace_id = target_workspace_id
    and user_id = (select auth.uid())
    and screen = target_screen;

  insert into public.workspace_screen_views (workspace_id, user_id, screen)
  values (target_workspace_id, (select auth.uid()), target_screen)
  on conflict (workspace_id, user_id, screen) do update
    set last_viewed_at = now();

  return previous;
end;
$$;

revoke all on function public.touch_screen_view(text, text) from public, anon;
grant execute on function public.touch_screen_view(text, text)
  to authenticated, service_role;
