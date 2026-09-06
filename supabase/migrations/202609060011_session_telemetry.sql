-- What a session actually costs, measured on both sides (Phase 4 Wave E
-- todo 23, token audit P4).
--
-- Todo 22 measured the *catalogue* — the payload every session pays before
-- it asks anything. That is one line of the bill. The rest is what the
-- answers weigh, and nothing recorded it: `access_events` knew which tool
-- ran and which nodes it touched, never how much came back. A savings meter
-- (todo 24) built on that gap would be an estimate presented as a
-- measurement, which is the one thing this product refuses to do.
--
-- Two sides, because they answer different questions and neither substitutes
-- for the other:
--
--   * **What we served.** `access_events.response_chars` is the length of the
--     serialised result this server handed back. It is a number, not a
--     sample: no body, no excerpt, no prompt. `estimated_tokens` is
--     *generated* from it at a fixed 4 chars/token, so the assumption lives
--     in the column and no writer can report a ratio of its own.
--
--   * **What the agent paid.** Only the model's own usage numbers know what
--     a call cost after caching, and only the client can see them. Hence
--     `session_usage_reports` — opt-in, numbers only, and worth exactly what
--     a self-report is worth, which is why it is stored beside the served
--     bytes rather than instead of them.
--
-- ADR-011 and ADR-004 both hold: this table carries no text a person wrote.
-- The one string it accepts is a model identifier, and a CHECK forbids
-- whitespace so a sentence cannot be smuggled through it.
--
-- R-01 (2026-09-06): these are read observations. They must never bump
-- `repositories.data_revision` or `workspaces.memory_revision` — a read that
-- invalidates its own fence makes the fence meaningless. Nothing here
-- touches either counter, and `tests/session-telemetry.test.ts` asserts it.

alter table public.access_events
  add column if not exists response_chars integer;

alter table public.access_events
  drop constraint if exists access_events_response_chars_nonnegative;

alter table public.access_events
  add constraint access_events_response_chars_nonnegative check (
    response_chars is null or response_chars >= 0
  );

-- Generated, not written. A stored column computed from `response_chars`
-- cannot disagree with it, and the 4 chars/token assumption is then a
-- property of the schema rather than a convention every writer must
-- remember. `packages/mcp/src/repo-map.ts#estimateTokens` is the same
-- arithmetic on the TypeScript side and a test pins the two together.
alter table public.access_events
  add column if not exists estimated_tokens integer
  generated always as (ceil(response_chars / 4.0)::integer) stored;

comment on column public.access_events.response_chars is
  'Characters of the serialised tool or resource result. A length, never content. Null means the call emitted no sized result.';

comment on column public.access_events.estimated_tokens is
  'response_chars at a fixed 4 chars per token. Generated, so the assumption belongs to the column and not to a writer.';

/**
 * Agent-reported provider usage (opt-in).
 *
 * Numbers only. `token_id` ties a report to the credential that made the
 * calls, which is what makes it attributable without naming a person; the
 * repository is optional because a session may touch none or several and
 * guessing one would invent an attribution.
 */
create table if not exists public.session_usage_reports (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  token_id text not null,
  repository_id text,
  occurred_at timestamptz not null default now(),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  constraint session_usage_reports_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint session_usage_reports_token_tenant_fk foreign key (workspace_id, token_id)
    references public.mcp_tokens(workspace_id, id) on delete cascade,
  constraint session_usage_reports_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  -- A model identifier, not prose: no whitespace, bounded length. The point
  -- is that this column cannot become a place to put a sentence.
  constraint session_usage_reports_model_identifier check (
    model is null or model ~ '^[A-Za-z0-9._:/-]{1,120}$'
  ),
  constraint session_usage_reports_counts_nonnegative check (
    input_tokens >= 0
    and output_tokens >= 0
    and cache_read_tokens >= 0
    and cache_creation_tokens >= 0
  )
);

comment on table public.session_usage_reports is
  'Opt-in self-reported provider usage for a workspace MCP credential. Numbers and a model identifier; never prompt or response text (ADR-011).';

create index if not exists session_usage_reports_workspace_occurred_idx
  on public.session_usage_reports(workspace_id, occurred_at desc);

create index if not exists session_usage_reports_workspace_repository_idx
  on public.session_usage_reports(workspace_id, repository_id, occurred_at desc)
  where repository_id is not null;

alter table public.session_usage_reports enable row level security;
alter table public.session_usage_reports force row level security;

drop policy if exists session_usage_reports_select_member on public.session_usage_reports;
create policy session_usage_reports_select_member on public.session_usage_reports
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.session_usage_reports to authenticated;
grant all on public.session_usage_reports to service_role;

/**
 * The opt-in gate, below every path including service role.
 *
 * `workspaces.pilot_instrumentation_enabled` is the switch that already
 * carries a recorded consent timestamp and already gates the pack metrics on
 * `access_events`. A second switch for the same class of data — numbers
 * about how the product was used — would be two things to consent to and one
 * of them would drift.
 */
create or replace function public.enforce_session_usage_optin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $gate$
begin
  if not exists (
    select 1 from public.workspaces
    where id = new.workspace_id and pilot_instrumentation_enabled
  ) then
    raise exception 'Session usage reporting is not enabled for this workspace.';
  end if;
  return new;
end;
$gate$;

drop trigger if exists session_usage_reports_optin_gate on public.session_usage_reports;
create trigger session_usage_reports_optin_gate
  before insert or update on public.session_usage_reports
  for each row execute procedure public.enforce_session_usage_optin();

/**
 * Record one usage report, or say why it was not recorded.
 *
 * Returns a status rather than raising: a telemetry call that fails an
 * agent's session has cost the user more than the telemetry is worth. The
 * trigger above still raises on any path that writes the table directly —
 * this function is the polite door, not the lock.
 */
create or replace function public.report_session_usage(
  target_workspace_id text,
  target_token_id text,
  target_input_tokens integer,
  target_output_tokens integer,
  target_cache_read_tokens integer,
  target_cache_creation_tokens integer,
  target_model text default null,
  target_repository_id text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $report$
begin
  if not exists (
    select 1 from public.workspaces
    where id = target_workspace_id and pilot_instrumentation_enabled
  ) then
    return 'not_enabled';
  end if;

  -- A client-supplied repository id is a request, not a claim.
  if target_repository_id is not null and not exists (
    select 1 from public.repositories
    where workspace_id = target_workspace_id and id = target_repository_id
  ) then
    return 'unknown_repository';
  end if;

  insert into public.session_usage_reports (
    workspace_id, token_id, repository_id, model,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
  ) values (
    target_workspace_id, target_token_id, target_repository_id, target_model,
    coalesce(target_input_tokens, 0), coalesce(target_output_tokens, 0),
    coalesce(target_cache_read_tokens, 0), coalesce(target_cache_creation_tokens, 0)
  );
  return 'recorded';
end;
$report$;

revoke all on function public.enforce_session_usage_optin() from public, anon, authenticated;
revoke all on function public.report_session_usage(text,text,integer,integer,integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.enforce_session_usage_optin() to service_role;
grant execute on function public.report_session_usage(text,text,integer,integer,integer,integer,text,text) to service_role;

/**
 * `usage_daily` — one row per (workspace, repository, UTC day).
 *
 * The first view in this schema, and it earns the exception: it is an
 * aggregate a screen selects from and filters, and `security_invoker` makes
 * the base tables' own RLS the access rule, so there is nothing new to get
 * right. A SECURITY DEFINER function would have had to re-implement that
 * check — and re-implemented tenant checks are how tenants leak.
 *
 * Computed from rows rather than maintained beside them, so retention keeps
 * its promise by construction: pruning `access_events` removes the days it
 * summarised. A materialised counter would have kept reporting numbers whose
 * evidence had been deleted.
 *
 * `served_measured_calls` exists so a reader can tell "0 characters because
 * nobody measured" from "0 characters because the answer was empty". They
 * are different facts and this file refuses to average them together.
 */
create or replace view public.usage_daily
with (security_invoker = true) as
with facts as (
  select
    workspace_id,
    repository_id,
    occurred_at,
    1 as served_calls,
    case when response_chars is null then 0 else 1 end as served_measured_calls,
    coalesce(response_chars, 0) as served_response_chars,
    coalesce(estimated_tokens, 0) as served_estimated_tokens,
    0 as reported_reports,
    0 as reported_input_tokens,
    0 as reported_output_tokens,
    0 as reported_cache_read_tokens,
    0 as reported_cache_creation_tokens
  from public.access_events
  union all
  select
    workspace_id,
    repository_id,
    occurred_at,
    0, 0, 0, 0,
    1,
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_creation_tokens
  from public.session_usage_reports
)
select
  workspace_id,
  repository_id,
  (occurred_at at time zone 'UTC')::date as day,
  sum(served_calls)::bigint as served_calls,
  sum(served_measured_calls)::bigint as served_measured_calls,
  sum(served_response_chars)::bigint as served_response_chars,
  sum(served_estimated_tokens)::bigint as served_estimated_tokens,
  sum(reported_reports)::bigint as reported_reports,
  sum(reported_input_tokens)::bigint as reported_input_tokens,
  sum(reported_output_tokens)::bigint as reported_output_tokens,
  sum(reported_cache_read_tokens)::bigint as reported_cache_read_tokens,
  sum(reported_cache_creation_tokens)::bigint as reported_cache_creation_tokens
from facts
group by workspace_id, repository_id, (occurred_at at time zone 'UTC')::date;

comment on view public.usage_daily is
  'Served bytes and opt-in agent-reported usage per workspace, repository and UTC day. Computed from rows so retention propagates.';

grant select on public.usage_daily to authenticated;
grant select on public.usage_daily to service_role;

/**
 * Retention covers both sides of the meter.
 *
 * `access_event_retention_days` is the promise `docs/PRIVACY.md` makes, and
 * a usage report is the same class of observation about the same session. A
 * second retention setting would be a second promise to keep, and the one
 * that was forgotten would be the one that mattered.
 *
 * The return value stays "rows deleted" and now sums both tables; the daily
 * pg_cron job calls this same function and needs no rescheduling.
 */
create or replace function public.prune_expired_access_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $prune$
declare
  deleted_events integer;
  deleted_reports integer;
begin
  delete from public.access_events event
  using public.workspaces workspace
  where event.workspace_id = workspace.id
    and workspace.access_event_retention_days is not null
    and event.occurred_at < clock_timestamp() - make_interval(days => workspace.access_event_retention_days);
  get diagnostics deleted_events = row_count;

  delete from public.session_usage_reports report
  using public.workspaces workspace
  where report.workspace_id = workspace.id
    and workspace.access_event_retention_days is not null
    and report.occurred_at < clock_timestamp() - make_interval(days => workspace.access_event_retention_days);
  get diagnostics deleted_reports = row_count;

  return deleted_events + deleted_reports;
end;
$prune$;

revoke all on function public.prune_expired_access_events() from public, anon, authenticated;
grant execute on function public.prune_expired_access_events() to service_role;
