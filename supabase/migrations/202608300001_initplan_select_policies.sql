begin;

-- Every "_select_member" SELECT policy called
-- `(select public.is_workspace_member(workspace_id))` — a SECURITY DEFINER,
-- SET search_path function fed a per-row column. Postgres cannot inline a
-- SECURITY DEFINER function, and it cannot turn `(select fn(row_col))` into
-- a one-time initplan because the argument varies per row: the planner has
-- no choice but to invoke the function once per row scanned, on every
-- tenant read.
--
-- The fix inlines the function body as `workspace_id in (select ...)`.
-- Unlike the function call, the inner select does not reference the outer
-- row at all (it only depends on `(select auth.uid())`), so Postgres can
-- evaluate it once as an initplan and reduce every row check to a cheap
-- membership test against that one cached set. Semantics are reproduced
-- exactly from `public.is_workspace_member` as tightened by
-- 202608170004_team_roles.sql: only ACTIVE membership counts (invited and
-- revoked rows grant nothing), and there is no separate owner fallback —
-- `handle_new_user` inserts the owner as an active `workspace_members` row,
-- so owners are already covered by the membership check.
--
-- `workspace_members_select_members` (202608170004) is deliberately left
-- untouched: it is a policy ON workspace_members whose old and new
-- predicates both query workspace_members. Reached through the SECURITY
-- DEFINER function, that inner query runs as the function's (RLS-bypassing)
-- owner, so it never re-enters this table's own RLS. Inlined as a plain
-- subquery it would run as `authenticated` and be subject to this table's
-- policies again, including this one — Postgres detects that cycle and
-- raises "infinite recursion detected in policy for relation
-- \"workspace_members\"". The function-call form is the correct, required
-- shape there, not an oversight.
--
-- INSERT/UPDATE/DELETE policies and the RPCs that back them are untouched;
-- only the SELECT policies enumerated below change.

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (
    id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists repositories_select_member on public.repositories;
create policy repositories_select_member on public.repositories
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists findings_select_member on public.findings;
create policy findings_select_member on public.findings
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists receipts_select_member on public.receipts;
create policy receipts_select_member on public.receipts
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

-- The 202608100002 evidence-graph tables (created via a DO-block loop over
-- the same tenant-table array); each got a `<table>_select_member` policy
-- with the identical predicate shape.
do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'github_installations', 'graph_nodes', 'artifacts', 'requirements', 'evidence',
    'edges', 'runs', 'jobs', 'index_entries', 'access_events'
  ] loop
    execute format('drop policy if exists %I on public.%I', tenant_table || '_select_member', tenant_table);
    execute format(
      $policy$create policy %I on public.%I for select to authenticated using (
        workspace_id in (
          select wm.workspace_id
          from public.workspace_members wm
          where wm.user_id = (select auth.uid())
            and wm.status = 'active'
        )
      )$policy$,
      tenant_table || '_select_member',
      tenant_table
    );
  end loop;
end;
$$;

drop policy if exists github_available_repositories_select_member on public.github_available_repositories;
create policy github_available_repositories_select_member on public.github_available_repositories
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists github_webhook_deliveries_select_member on public.github_webhook_deliveries;
create policy github_webhook_deliveries_select_member on public.github_webhook_deliveries
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists repository_scan_skips_select_member on public.repository_scan_skips;
create policy repository_scan_skips_select_member on public.repository_scan_skips
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists progress_events_select_member on public.progress_events;
create policy progress_events_select_member on public.progress_events
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists mcp_notes_select_member on public.mcp_notes;
create policy mcp_notes_select_member on public.mcp_notes
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists judgments_select_member on public.judgments;
create policy judgments_select_member on public.judgments
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists judgment_attempts_select_member on public.judgment_attempts;
create policy judgment_attempts_select_member on public.judgment_attempts
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists security_audit_events_select_member on public.security_audit_events;
create policy security_audit_events_select_member on public.security_audit_events
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists todos_select_member on public.todos;
create policy todos_select_member on public.todos
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists library_items_select_member on public.library_items;
create policy library_items_select_member on public.library_items
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

-- rationales (202608170004): named `rationales_member_select`, same shape.
drop policy if exists rationales_member_select on public.rationales;
create policy rationales_member_select on public.rationales
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists prompt_capture_settings_select_member on public.prompt_capture_settings;
create policy prompt_capture_settings_select_member on public.prompt_capture_settings
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

-- prompt_records (202608170005): the member check is one arm of an OR with
-- the author's own-row check — only that arm changes shape.
drop policy if exists prompt_records_select_author_or_shared on public.prompt_records;
create policy prompt_records_select_author_or_shared on public.prompt_records
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      shared
      and workspace_id in (
        select wm.workspace_id
        from public.workspace_members wm
        where wm.user_id = (select auth.uid())
          and wm.status = 'active'
      )
    )
  );

drop policy if exists ruled_out_attempts_select_member on public.ruled_out_attempts;
create policy ruled_out_attempts_select_member on public.ruled_out_attempts
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists dependency_audit_reports_select_member on public.dependency_audit_reports;
create policy dependency_audit_reports_select_member on public.dependency_audit_reports
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists file_co_changes_select_member on public.file_co_changes;
create policy file_co_changes_select_member on public.file_co_changes
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists agent_assertions_select_member on public.agent_assertions;
create policy agent_assertions_select_member on public.agent_assertions
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

drop policy if exists memory_block_entries_select_member on public.memory_block_entries;
create policy memory_block_entries_select_member on public.memory_block_entries
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
  );

commit;
