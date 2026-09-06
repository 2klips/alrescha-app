-- A progress entry that lands on the todo it is about (Phase 4 Wave D
-- todo 21).
--
-- `log_progress` could only ever find a todo it had minted itself: the match
-- was the exact id, or the `progress:<lowercased task>` key it wrote the
-- first time. A checkbox the scan read out of a document had a different
-- `source_kind` and a different key, so an agent reporting work on it
-- created a **second** todo with the same title — and the board showed both.
--
-- Three things fix that, and each one is a different kind of claim:
--
--   * `p_todo_id` — the caller names the todo. Verified against the
--     workspace and refused when unknown: a client-supplied id is a request,
--     never a claim, and creating a todo because the named one was missing
--     would answer a question nobody asked.
--   * **normalised title matching** — the fallback, over *every* todo in the
--     workspace rather than only the ones this function wrote. The rule
--     strips decoration and nothing else: a bullet, a checkbox, an ordinal,
--     trailing punctuation, case and repeated whitespace. It never removes a
--     word, because two tasks that differ by one word are two tasks.
--   * `p_repository_id` and `p_commit_sha` — attribution. Also verified, and
--     also refused rather than guessed.
--
-- `packages/core/src/progress/todo-title.ts` is the other half of the
-- normaliser and `tests/progress-attribution.test.ts` runs both over the same
-- strings in this database, because two implementations of one rule that
-- nobody compares are two rules.

/**
 * Decoration off, words untouched. IMMUTABLE so a generated column can call
 * it — which is the point: the normalised form is stored beside the title
 * and cannot drift from it.
 */
create or replace function public.normalize_todo_title(title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            normalize(coalesce(title, ''), NFKC),
            -- bullet, checkbox, ordinal, bullet again
            '^\s*([-*+]\s*)?(\[[ xX]?\]\s*)?([0-9]+[.)]\s*)?([-*+]\s*)?',
            ''
          ),
          '[.,;:!?\s]+$',
          ''
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  )
$$;

alter table public.todos
  add column if not exists normalized_title text
  generated always as (public.normalize_todo_title(title)) stored;

comment on column public.todos.normalized_title is
  'title with decoration removed, for matching a progress entry to the checkbox it is about. Generated, so it cannot drift from the title.';

create index if not exists todos_workspace_normalized_title_idx
  on public.todos(workspace_id, normalized_title);

alter table public.progress_events
  add column if not exists commit_sha text;

alter table public.progress_events
  drop constraint if exists progress_events_commit_sha;

alter table public.progress_events
  add constraint progress_events_commit_sha check (
    commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'
  );

comment on column public.progress_events.commit_sha is
  'The commit the reported work landed in, when the caller named one. Null is "not stated", never "unknown commit".';

drop function if exists public.log_progress_atomic(
  text, uuid, text, text, text, text, text[]
);

create or replace function public.log_progress_atomic(
  p_workspace_id text,
  p_user_id uuid,
  p_token_id text,
  p_task text,
  p_status text,
  p_summary text,
  p_refs text[] default '{}',
  p_todo_id text default null,
  p_repository_id text default null,
  p_commit_sha text default null
)
returns table (
  event_id text,
  event_occurred_at timestamptz,
  todo_id text,
  todo_status text,
  todo_matched text
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
  match_title text;
  progress_source_key text;
  matched text;
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
  if p_commit_sha is not null and p_commit_sha !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '23514', message = 'log_progress commit_sha must be a 40-character commit sha';
  end if;
  -- A client-supplied repository id is a request, not a claim.
  if p_repository_id is not null and not exists (
    select 1 from public.repositories
    where workspace_id = p_workspace_id and id = p_repository_id
  ) then
    raise exception using errcode = '23503', message = 'log_progress repository_id is not in this workspace';
  end if;

  next_todo_status := case
    when p_status in ('started', 'progress') then 'in-progress'
    else p_status
  end;
  progress_source_key := 'progress:' || lower(normalized_task);
  match_title := public.normalize_todo_title(normalized_task);

  if p_todo_id is not null then
    -- Named explicitly: find it or refuse. Minting a new todo because the
    -- named one was missing would answer a different question.
    select todo.id into next_todo_id
    from public.todos todo
    where todo.workspace_id = p_workspace_id and todo.id = p_todo_id
    for update;
    if next_todo_id is null then
      raise exception using errcode = '23503', message = 'log_progress todo_id is not in this workspace';
    end if;
    matched := 'todo_id';
  else
    -- Id, then the key this function mints, then the normalised title —
    -- widest last, so an exact answer always wins over a matched one.
    select todo.id,
           case
             when todo.id = normalized_task then 'id'
             when todo.source_key = progress_source_key then 'source_key'
             else 'normalized_title'
           end
      into next_todo_id, matched
    from public.todos todo
    where todo.workspace_id = p_workspace_id
      and (
        todo.id = normalized_task
        or (
          todo.source_kind = 'progress_event'
          and todo.source_key = progress_source_key
        )
        or todo.normalized_title = match_title
      )
    order by case
      when todo.id = normalized_task then 0
      when todo.source_key = progress_source_key then 1
      else 2
    end, todo.created_at
    limit 1
    for update;
  end if;

  if next_todo_id is null then
    next_todo_id := public.generate_ulid();
    matched := 'created';
    insert into public.todos (
      id,
      workspace_id,
      repository_id,
      title,
      status,
      source_kind,
      source_key,
      source_event_id
    ) values (
      next_todo_id,
      p_workspace_id,
      p_repository_id,
      normalized_task,
      next_todo_status,
      'progress_event',
      progress_source_key,
      next_event_id
    );
  else
    update public.todos
    set status = next_todo_status,
        -- Attribution only ever fills a gap. A todo already tied to a
        -- repository is not moved by a caller who named a different one.
        repository_id = coalesce(repository_id, p_repository_id),
        updated_at = now()
    where workspace_id = p_workspace_id and id = next_todo_id;
  end if;

  insert into public.progress_events (
    id,
    workspace_id,
    user_id,
    token_id,
    todo_id,
    repository_id,
    commit_sha,
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
    p_repository_id,
    p_commit_sha,
    normalized_task,
    p_status,
    btrim(p_summary),
    coalesce(p_refs, '{}'::text[])
  );

  return query
  select event.id, event.occurred_at, todo.id, todo.status, matched
  from public.progress_events event
  join public.todos todo
    on todo.workspace_id = event.workspace_id and todo.id = event.todo_id
  where event.workspace_id = p_workspace_id and event.id = next_event_id;
end;
$$;

revoke all on function public.log_progress_atomic(
  text, uuid, text, text, text, text, text[], text, text, text
) from public, anon, authenticated;
grant execute on function public.log_progress_atomic(
  text, uuid, text, text, text, text, text[], text, text, text
) to service_role;
revoke all on function public.normalize_todo_title(text) from public, anon;
grant execute on function public.normalize_todo_title(text) to authenticated, service_role;
