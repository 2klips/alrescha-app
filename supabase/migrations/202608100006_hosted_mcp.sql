alter table public.mcp_tokens
  add column created_by uuid references auth.users(id) on delete cascade,
  add column scopes text[] not null default array['mcp:read']::text[],
  add column revoked_at timestamptz;

update public.mcp_tokens token
set created_by = workspace.owner_user_id
from public.workspaces workspace
where workspace.id = token.workspace_id
  and token.created_by is null;

update public.mcp_tokens
set token_prefix = left(token_hash, 12)
where token_prefix is null;

alter table public.mcp_tokens
  alter column created_by set not null,
  alter column token_prefix set not null,
  add constraint mcp_tokens_scopes_nonempty check (cardinality(scopes) > 0),
  add constraint mcp_tokens_scopes_allowed
    check (scopes <@ array['mcp:read', 'mcp:write']::text[]);

create index mcp_tokens_workspace_created_by_idx
  on public.mcp_tokens(workspace_id, created_by, created_at desc);

drop policy mcp_tokens_select_owner on public.mcp_tokens;
drop policy mcp_tokens_insert_owner on public.mcp_tokens;
drop policy mcp_tokens_update_owner on public.mcp_tokens;
drop policy mcp_tokens_delete_owner on public.mcp_tokens;

create policy mcp_tokens_select_owner on public.mcp_tokens
  for select to authenticated
  using (
    (select public.is_workspace_owner(workspace_id))
    and created_by = (select auth.uid())
  );

create policy mcp_tokens_insert_owner on public.mcp_tokens
  for insert to authenticated
  with check (
    (select public.is_workspace_owner(workspace_id))
    and created_by = (select auth.uid())
  );

create policy mcp_tokens_update_owner on public.mcp_tokens
  for update to authenticated
  using (
    (select public.is_workspace_owner(workspace_id))
    and created_by = (select auth.uid())
  )
  with check (
    (select public.is_workspace_owner(workspace_id))
    and created_by = (select auth.uid())
  );

create policy mcp_tokens_delete_owner on public.mcp_tokens
  for delete to authenticated
  using (
    (select public.is_workspace_owner(workspace_id))
    and created_by = (select auth.uid())
  );

alter table public.index_entries
  add column entry_type text not null default 'artifact',
  add column title text not null default '',
  add column path text not null default '',
  add column headings text[] not null default '{}',
  add column tags text[] not null default '{}',
  add column symbols text[] not null default '{}',
  add constraint index_entries_entry_type
    check (entry_type in ('artifact', 'requirement', 'evidence', 'finding', 'receipt', 'context_pack'));

alter table public.findings
  add column evidence_grade text not null default 'inferred',
  add constraint findings_evidence_grade check (evidence_grade in ('verified', 'inferred'));

create table public.progress_events (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id text not null,
  task text not null,
  status text not null,
  summary text not null,
  refs text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  constraint progress_events_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint progress_events_status check (status in ('started', 'progress', 'done', 'blocked')),
  constraint progress_events_task_length check (char_length(task) between 1 and 120),
  constraint progress_events_summary_length check (char_length(summary) between 1 and 200),
  constraint progress_events_refs_limit check (cardinality(refs) <= 10),
  constraint progress_events_token_tenant_fk foreign key (workspace_id, token_id)
    references public.mcp_tokens(workspace_id, id) on delete cascade
);

create index progress_events_workspace_occurred_idx
  on public.progress_events(workspace_id, occurred_at desc);

create table public.mcp_notes (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id text not null,
  text text not null,
  target text,
  occurred_at timestamptz not null default now(),
  constraint mcp_notes_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint mcp_notes_text_length check (char_length(text) between 1 and 2000),
  constraint mcp_notes_target_length check (target is null or char_length(target) between 1 and 200),
  constraint mcp_notes_token_tenant_fk foreign key (workspace_id, token_id)
    references public.mcp_tokens(workspace_id, id) on delete cascade
);

create index mcp_notes_workspace_occurred_idx
  on public.mcp_notes(workspace_id, occurred_at desc);

alter table public.progress_events enable row level security;
alter table public.progress_events force row level security;
alter table public.mcp_notes enable row level security;
alter table public.mcp_notes force row level security;

create policy progress_events_select_member on public.progress_events
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy mcp_notes_select_member on public.mcp_notes
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.progress_events, public.mcp_notes to authenticated;
grant all on public.progress_events, public.mcp_notes to service_role;
