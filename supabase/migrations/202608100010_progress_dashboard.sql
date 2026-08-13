create table public.todos (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text,
  requirement_id text,
  title text not null,
  status text not null default 'open',
  source_kind text not null,
  source_key text not null,
  source_artifact_id text,
  source_event_id text,
  source_path text,
  source_span jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todos_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint todos_title_length check (char_length(title) between 1 and 240),
  constraint todos_status check (status in ('open', 'in-progress', 'done', 'blocked')),
  constraint todos_source_kind check (source_kind in ('document', 'progress_event')),
  constraint todos_source_key_length check (char_length(source_key) between 1 and 400),
  constraint todos_source_shape check (
    (
      source_kind = 'document'
      and repository_id is not null
      and source_artifact_id is not null
      and source_event_id is null
      and nullif(btrim(source_path), '') is not null
      and jsonb_typeof(source_span) = 'object'
      and source_span ? 'path'
      and source_span ? 'startLine'
      and source_span ? 'endLine'
    )
    or
    (
      source_kind = 'progress_event'
      and source_event_id is not null
      and source_artifact_id is null
      and source_path is null
      and source_span is null
    )
  ),
  constraint todos_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  constraint todos_artifact_tenant_fk foreign key (workspace_id, repository_id, source_artifact_id)
    references public.artifacts(workspace_id, repository_id, id) on delete cascade,
  constraint todos_requirement_tenant_fk foreign key (workspace_id, repository_id, requirement_id)
    references public.requirements(workspace_id, repository_id, id) on delete set null (requirement_id),
  constraint todos_workspace_source_unique unique (workspace_id, source_kind, source_key),
  constraint todos_workspace_id_unique unique (workspace_id, id)
);

create index todos_workspace_status_updated_idx
  on public.todos(workspace_id, status, updated_at desc);
create index todos_workspace_repository_idx
  on public.todos(workspace_id, repository_id)
  where repository_id is not null;

alter table public.progress_events
  add column todo_id text,
  add constraint progress_events_todo_tenant_fk
    foreign key (workspace_id, todo_id)
    references public.todos(workspace_id, id);

create index progress_events_workspace_todo_idx
  on public.progress_events(workspace_id, todo_id)
  where todo_id is not null;

alter table public.todos enable row level security;
alter table public.todos force row level security;

create policy todos_select_member on public.todos
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.todos to authenticated;
grant all on public.todos to service_role;

create or replace function public.log_progress_atomic(
  p_workspace_id text,
  p_user_id uuid,
  p_token_id text,
  p_task text,
  p_status text,
  p_summary text,
  p_refs text[] default '{}'
)
returns table (
  event_id text,
  event_occurred_at timestamptz,
  todo_id text,
  todo_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_event_id text := public.generate_ulid();
  next_todo_id text;
  next_todo_status text;
  normalized_task text := btrim(p_task);
  progress_source_key text;
begin
  if char_length(normalized_task) not between 1 and 120 then
    raise exception using errcode = '23514', message = 'log_progress task must contain 1 to 120 characters';
  end if;
  if p_status not in ('started', 'progress', 'done', 'blocked') then
    raise exception using errcode = '23514', message = 'log_progress status is invalid';
  end if;
  if char_length(btrim(p_summary)) not between 1 and 200 then
    raise exception using errcode = '23514', message = 'log_progress summary must contain 1 to 200 characters';
  end if;
  if cardinality(coalesce(p_refs, '{}'::text[])) > 10 then
    raise exception using errcode = '23514', message = 'log_progress refs must contain at most 10 entries';
  end if;

  next_todo_status := case
    when p_status in ('started', 'progress') then 'in-progress'
    else p_status
  end;
  progress_source_key := 'progress:' || lower(normalized_task);

  select todo.id into next_todo_id
  from public.todos todo
  where todo.workspace_id = p_workspace_id
    and (
      todo.id = normalized_task
      or (
        todo.source_kind = 'progress_event'
        and todo.source_key = progress_source_key
      )
    )
  order by case when todo.id = normalized_task then 0 else 1 end
  limit 1
  for update;

  if next_todo_id is null then
    next_todo_id := public.generate_ulid();
    insert into public.todos (
      id,
      workspace_id,
      title,
      status,
      source_kind,
      source_key,
      source_event_id
    ) values (
      next_todo_id,
      p_workspace_id,
      normalized_task,
      next_todo_status,
      'progress_event',
      progress_source_key,
      next_event_id
    );
  else
    update public.todos
    set status = next_todo_status,
        updated_at = now()
    where workspace_id = p_workspace_id and id = next_todo_id;
  end if;

  insert into public.progress_events (
    id,
    workspace_id,
    user_id,
    token_id,
    todo_id,
    task,
    status,
    summary,
    refs
  ) values (
    next_event_id,
    p_workspace_id,
    p_user_id,
    p_token_id,
    next_todo_id,
    normalized_task,
    p_status,
    btrim(p_summary),
    coalesce(p_refs, '{}'::text[])
  );

  return query
  select event.id, event.occurred_at, todo.id, todo.status
  from public.progress_events event
  join public.todos todo
    on todo.workspace_id = event.workspace_id and todo.id = event.todo_id
  where event.workspace_id = p_workspace_id and event.id = next_event_id;
end;
$$;

revoke all on function public.log_progress_atomic(text, uuid, text, text, text, text, text[]) from public;
revoke all on function public.log_progress_atomic(text, uuid, text, text, text, text, text[]) from authenticated;
grant execute on function public.log_progress_atomic(text, uuid, text, text, text, text, text[]) to service_role;
