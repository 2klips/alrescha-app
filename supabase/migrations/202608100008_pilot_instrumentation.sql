alter table public.workspaces
  add column pilot_instrumentation_enabled boolean not null default false,
  add column pilot_instrumentation_consented_at timestamptz,
  add constraint workspaces_pilot_consent_required check (
    not pilot_instrumentation_enabled
    or pilot_instrumentation_consented_at is not null
  );

alter table public.access_events
  add column pack_selected_tokens integer,
  add column pack_baseline_tokens integer,
  add constraint access_events_pack_metrics_pair check (
    (pack_selected_tokens is null and pack_baseline_tokens is null)
    or (
      tool = 'request_context_pack'
      and pack_selected_tokens >= 0
      and pack_baseline_tokens > 0
      and pack_selected_tokens <= pack_baseline_tokens
    )
  );

create or replace function public.gate_pilot_pack_metrics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspaces
    where id = new.workspace_id
      and pilot_instrumentation_enabled
  ) then
    new.pack_selected_tokens := null;
    new.pack_baseline_tokens := null;
  end if;

  return new;
end;
$$;

create trigger gate_access_event_pilot_pack_metrics
  before insert or update of pack_selected_tokens, pack_baseline_tokens
  on public.access_events
  for each row execute procedure public.gate_pilot_pack_metrics();

revoke all on function public.gate_pilot_pack_metrics() from public, anon, authenticated;
grant execute on function public.gate_pilot_pack_metrics() to service_role;
