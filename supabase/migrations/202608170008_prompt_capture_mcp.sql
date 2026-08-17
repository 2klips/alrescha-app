-- Prompt capture over hosted MCP (follow-up wiring, ADR-011).
--
-- The MCP endpoint authenticates a workspace token and runs on the
-- service-role client, where `auth.uid()` is null — so the authenticated
-- `record_prompt` cannot serve it. This variant takes the acting user
-- explicitly and is granted to service_role ONLY.
--
-- Nothing about the privacy model changes: the BEFORE trigger
-- `prompt_records_capture_gate` still runs, so workspace enablement, the
-- member's own consent, and the separate raw-sync switch all still gate the
-- write. The MCP path is simply another caller of the same gate.

create or replace function public.record_prompt_as(
  target_workspace_id text,
  target_user_id uuid,
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
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_user_id
      and status = 'active'
  ) then
    raise exception 'The user is not an active member of this workspace.';
  end if;

  insert into public.prompt_records (
    workspace_id, user_id, tool_name, target_node_ids, token_count, rubric,
    raw_text, shared
  ) values (
    target_workspace_id, target_user_id, target_tool_name,
    coalesce(target_node_ids, '{}'), coalesce(target_token_count, 0),
    coalesce(target_rubric, '{}'::jsonb), target_raw_text, target_shared
  )
  returning id into record_id;
  return record_id;
end;
$$;

revoke all on function public.record_prompt_as(text, uuid, text, text[], integer, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_prompt_as(text, uuid, text, text[], integer, jsonb, text, boolean)
  to service_role;
