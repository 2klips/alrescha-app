create table public.library_items (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  item_type text not null,
  source_repository text not null,
  source_path text not null,
  source_commit_sha text not null,
  content_snapshot text not null,
  digest text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint library_items_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint library_items_name_length check (char_length(name) between 1 and 200),
  constraint library_items_type check (item_type in ('skill', 'rules', 'instruction')),
  constraint library_items_source_repository check (source_repository ~ '^[^/]+/[^/]+$'),
  constraint library_items_source_path check (
    char_length(source_path) between 1 and 500
    and left(source_path, 1) <> '/'
    and source_path !~ '(^|/)\.\.(/|$)'
  ),
  constraint library_items_source_commit check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  constraint library_items_content_nonempty check (char_length(content_snapshot) > 0),
  constraint library_items_digest_sha256 check (digest ~ '^[0-9a-f]{64}$'),
  constraint library_items_tags_limit check (cardinality(tags) <= 20),
  constraint library_items_workspace_digest_unique unique (workspace_id, digest)
);

create index library_items_workspace_created_idx
  on public.library_items(workspace_id, created_at desc);
create index library_items_created_by_idx on public.library_items(created_by);
create index library_items_tags_idx on public.library_items using gin(tags);

create or replace function public.reject_library_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'Library item snapshots are immutable';
end;
$$;

create trigger library_items_immutable
before update on public.library_items
for each row execute function public.reject_library_item_update();

alter table public.library_items enable row level security;
alter table public.library_items force row level security;

create policy library_items_select_member on public.library_items
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy library_items_insert_member on public.library_items
  for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

create policy library_items_delete_creator on public.library_items
  for delete to authenticated
  using (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

grant select, insert, delete on public.library_items to authenticated;
grant all on public.library_items to service_role;

create or replace function public.save_library_item(
  p_workspace_id text,
  p_name text,
  p_item_type text,
  p_source_path text,
  p_source_repository text,
  p_source_commit_sha text,
  p_content_snapshot text,
  p_digest text,
  p_tags text[] default '{}'
)
returns table (id text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_id text;
  was_created boolean := true;
begin
  if actor_id is null or not public.is_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Library workspace access denied';
  end if;

  insert into public.library_items (
    workspace_id,
    created_by,
    name,
    item_type,
    source_repository,
    source_path,
    source_commit_sha,
    content_snapshot,
    digest,
    tags
  ) values (
    p_workspace_id,
    actor_id,
    btrim(p_name),
    p_item_type,
    btrim(p_source_repository),
    replace(btrim(p_source_path), '\', '/'),
    p_source_commit_sha,
    p_content_snapshot,
    p_digest,
    coalesce(p_tags, '{}'::text[])
  )
  on conflict (workspace_id, digest) do nothing
  returning library_items.id into result_id;

  if result_id is null then
    was_created := false;
    select library_items.id into result_id
    from public.library_items
    where workspace_id = p_workspace_id and digest = p_digest;
  end if;

  return query select result_id, was_created;
end;
$$;

revoke all on function public.save_library_item(text, text, text, text, text, text, text, text, text[]) from public;
grant execute on function public.save_library_item(text, text, text, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.save_library_item(text, text, text, text, text, text, text, text, text[]) to service_role;
