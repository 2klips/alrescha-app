create or replace function public.generate_ulid()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  timestamp_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  generated text := '';
  position integer;
begin
  for position in 1..10 loop
    generated := substr(alphabet, (timestamp_ms % 32)::integer + 1, 1) || generated;
    timestamp_ms := timestamp_ms / 32;
  end loop;

  for position in 1..16 loop
    generated := generated || substr(alphabet, floor(random() * 32)::integer + 1, 1);
  end loop;

  return generated;
end;
$$;

create table public.workspaces (
  id text primary key default public.generate_ulid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Personal workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint workspaces_one_personal_per_owner unique (owner_user_id)
);

create table public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_role check (role in ('owner', 'member'))
);

create index workspace_members_user_id_idx on public.workspace_members(user_id);

create table public.repositories (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  constraint repositories_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint repositories_workspace_id_id_unique unique (workspace_id, id),
  constraint repositories_workspace_full_name_unique unique (workspace_id, full_name)
);

create index repositories_workspace_id_idx on public.repositories(workspace_id);

create table public.findings (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  constraint findings_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint findings_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade
);

create index findings_workspace_repository_idx on public.findings(workspace_id, repository_id);

create table public.receipts (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  commit_sha text not null,
  created_at timestamptz not null default now(),
  constraint receipts_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint receipts_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade
);

create index receipts_workspace_repository_idx on public.receipts(workspace_id, repository_id);

create table public.mcp_tokens (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint mcp_tokens_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);

create index mcp_tokens_workspace_id_idx on public.mcp_tokens(workspace_id);

create table public.credit_ledger (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  event text not null,
  amount integer not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint credit_ledger_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint credit_ledger_event check (event in ('grant', 'reserve', 'settle', 'refund', 'topup', 'adjust')),
  constraint credit_ledger_workspace_idempotency_unique unique (workspace_id, idempotency_key)
);

create index credit_ledger_workspace_created_idx on public.credit_ledger(workspace_id, created_at desc);

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
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_workspace_id text;
begin
  insert into public.workspaces (owner_user_id)
  values (new.id)
  returning id into personal_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (personal_workspace_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.repositories enable row level security;
alter table public.findings enable row level security;
alter table public.receipts enable row level security;
alter table public.mcp_tokens enable row level security;
alter table public.credit_ledger enable row level security;

alter table public.workspaces force row level security;
alter table public.workspace_members force row level security;
alter table public.repositories force row level security;
alter table public.findings force row level security;
alter table public.receipts force row level security;
alter table public.mcp_tokens force row level security;
alter table public.credit_ledger force row level security;

create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using ((select public.is_workspace_member(id)));

create policy workspaces_update_owner on public.workspaces
  for update to authenticated
  using ((select public.is_workspace_owner(id)))
  with check ((select public.is_workspace_owner(id)));

create policy workspace_members_select_self on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy repositories_select_member on public.repositories
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy repositories_insert_owner on public.repositories
  for insert to authenticated
  with check ((select public.is_workspace_owner(workspace_id)));

create policy repositories_update_owner on public.repositories
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id)))
  with check ((select public.is_workspace_owner(workspace_id)));

create policy repositories_delete_owner on public.repositories
  for delete to authenticated
  using ((select public.is_workspace_owner(workspace_id)));

create policy findings_select_member on public.findings
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy receipts_select_member on public.receipts
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy mcp_tokens_select_owner on public.mcp_tokens
  for select to authenticated
  using ((select public.is_workspace_owner(workspace_id)));

create policy mcp_tokens_insert_owner on public.mcp_tokens
  for insert to authenticated
  with check ((select public.is_workspace_owner(workspace_id)));

create policy mcp_tokens_update_owner on public.mcp_tokens
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id)))
  with check ((select public.is_workspace_owner(workspace_id)));

create policy mcp_tokens_delete_owner on public.mcp_tokens
  for delete to authenticated
  using ((select public.is_workspace_owner(workspace_id)));

create policy credit_ledger_select_owner on public.credit_ledger
  for select to authenticated
  using ((select public.is_workspace_owner(workspace_id)));

grant usage on schema public to authenticated, service_role;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.repositories to authenticated;
grant select on public.findings, public.receipts to authenticated;
grant select, insert, update, delete on public.mcp_tokens to authenticated;
grant select on public.credit_ledger to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.is_workspace_member(text) to authenticated, service_role;
grant execute on function public.is_workspace_owner(text) to authenticated, service_role;
