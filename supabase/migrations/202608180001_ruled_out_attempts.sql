-- Ruled-out attempts (Phase 2C todo 2, carried from Phase 2B todo 8 / H3).
--
-- The point of this log is that a dead end stays recorded: the next agent
-- must be able to see "we already tried X, and here is what happened". So
-- append-only is a *schema* property, not a convention — there is no update
-- or delete path, and a BEFORE trigger refuses both even for service_role.
-- Rewriting history here would defeat the only reason the table exists.

create table public.ruled_out_attempts (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  repository_id text references public.repositories(id) on delete cascade,
  hypothesis text not null,
  outcome text not null,
  refs text[] not null default '{}',
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint ruled_out_attempts_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint ruled_out_attempts_hypothesis_length
    check (char_length(hypothesis) between 1 and 2000),
  constraint ruled_out_attempts_outcome_length
    check (char_length(outcome) between 1 and 2000),
  constraint ruled_out_attempts_refs_bounded check (cardinality(refs) <= 50)
);

create index ruled_out_attempts_workspace_idx
  on public.ruled_out_attempts(workspace_id, recorded_at desc);

alter table public.ruled_out_attempts enable row level security;
alter table public.ruled_out_attempts force row level security;

-- Readable by the workspace; the log is shared knowledge, not private notes.
create policy ruled_out_attempts_select_member on public.ruled_out_attempts
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy ruled_out_attempts_insert_member on public.ruled_out_attempts
  for insert to authenticated
  with check ((select public.is_workspace_member(workspace_id)));

-- No update/delete policy is declared, so `authenticated` cannot reach those
-- paths at all. The trigger closes the remaining one: service_role bypasses
-- RLS, and the MCP server runs as service_role.
create or replace function public.reject_ruled_out_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'ruled_out_attempts is append-only: a recorded dead end cannot be % .',
    lower(tg_op);
end;
$$;

create trigger ruled_out_attempts_append_only
  before update or delete on public.ruled_out_attempts
  for each row execute procedure public.reject_ruled_out_mutation();

-- Service-role writer for the hosted MCP server, which has no `auth.uid()`.
-- The actor is passed explicitly so the row still records who ruled it out.
create or replace function public.record_ruled_out_as(
  target_workspace_id text,
  actor_user_id uuid,
  attempt_hypothesis text,
  attempt_outcome text,
  attempt_refs text[] default '{}',
  target_repository_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_id text;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = actor_user_id
  ) then
    raise exception 'The actor is not a member of this workspace.';
  end if;

  insert into public.ruled_out_attempts (
    workspace_id, repository_id, hypothesis, outcome, refs, recorded_by
  ) values (
    target_workspace_id, target_repository_id, attempt_hypothesis,
    attempt_outcome, coalesce(attempt_refs, '{}'), actor_user_id
  )
  returning id into attempt_id;

  return attempt_id;
end;
$$;

revoke all on function public.record_ruled_out_as(
  text, uuid, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.record_ruled_out_as(
  text, uuid, text, text, text[], text
) to service_role;

-- Read and append only: update/delete are not granted, so the append-only
-- property holds at the privilege layer too, not just in the trigger.
grant select, insert on public.ruled_out_attempts to authenticated;
