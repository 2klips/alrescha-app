create table public.github_installations (
  id text primary key default public.generate_ulid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  github_installation_id bigint not null unique,
  account_id bigint not null,
  account_login text not null,
  permission_mode text not null default 'read_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_installations_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint github_installations_permission_mode check (permission_mode in ('read_only', 'read_with_pr_proposals')),
  constraint github_installations_workspace_id_id_unique unique (workspace_id, id)
);

create index github_installations_workspace_id_idx
  on public.github_installations(workspace_id);

alter table public.repositories
  add column installation_id text,
  add column github_repository_id bigint,
  add column default_branch text not null default 'main',
  add column selected_at timestamptz,
  add column last_scanned_commit_sha text,
  add constraint repositories_installation_tenant_fk
    foreign key (workspace_id, installation_id)
    references public.github_installations(workspace_id, id) on delete restrict,
  add constraint repositories_workspace_github_id_unique
    unique (workspace_id, github_repository_id),
  add constraint repositories_last_scanned_sha_format
    check (last_scanned_commit_sha is null or last_scanned_commit_sha ~ '^[0-9a-f]{40}$');

create index repositories_workspace_installation_idx
  on public.repositories(workspace_id, installation_id)
  where installation_id is not null;

create table public.graph_nodes (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  kind text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graph_nodes_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint graph_nodes_kind check (kind in ('artifact', 'requirement', 'evidence', 'finding')),
  constraint graph_nodes_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  constraint graph_nodes_workspace_repository_id_unique unique (workspace_id, repository_id, id)
);

create index graph_nodes_workspace_repository_kind_idx
  on public.graph_nodes(workspace_id, repository_id, kind);

create table public.artifacts (
  id text primary key,
  workspace_id text not null,
  repository_id text not null,
  kind text not null,
  path text not null,
  digest text not null,
  source_commit_sha text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artifacts_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint artifacts_kind check (kind in ('instruction', 'spec', 'adr', 'todo', 'code_metadata', 'test_report', 'ci_run')),
  constraint artifacts_digest_sha256 check (digest ~ '^[0-9a-f]{64}$'),
  constraint artifacts_source_commit_sha check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  constraint artifacts_graph_node_tenant_fk foreign key (workspace_id, repository_id, id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint artifacts_workspace_repository_id_unique unique (workspace_id, repository_id, id),
  constraint artifacts_workspace_repository_path_digest_unique
    unique (workspace_id, repository_id, path, digest)
);

create index artifacts_workspace_repository_kind_idx
  on public.artifacts(workspace_id, repository_id, kind);

create table public.requirements (
  id text primary key,
  workspace_id text not null,
  repository_id text not null,
  source_artifact_id text not null,
  statement text not null,
  source_span jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint requirements_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint requirements_status check (status in ('active', 'superseded', 'withdrawn')),
  constraint requirements_graph_node_tenant_fk foreign key (workspace_id, repository_id, id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint requirements_source_artifact_tenant_fk foreign key (workspace_id, repository_id, source_artifact_id)
    references public.artifacts(workspace_id, repository_id, id) on delete cascade,
  constraint requirements_workspace_repository_id_unique unique (workspace_id, repository_id, id)
);

create index requirements_workspace_repository_artifact_idx
  on public.requirements(workspace_id, repository_id, source_artifact_id);

create table public.evidence (
  id text primary key,
  workspace_id text not null,
  repository_id text not null,
  source_artifact_id text not null,
  kind text not null,
  verdict text not null,
  source_span jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint evidence_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint evidence_kind check (kind in ('implementation', 'test', 'ci', 'document', 'decision')),
  constraint evidence_verdict check (verdict in ('supports', 'contradicts', 'unknown')),
  constraint evidence_graph_node_tenant_fk foreign key (workspace_id, repository_id, id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint evidence_source_artifact_tenant_fk foreign key (workspace_id, repository_id, source_artifact_id)
    references public.artifacts(workspace_id, repository_id, id) on delete cascade,
  constraint evidence_workspace_repository_id_unique unique (workspace_id, repository_id, id)
);

create index evidence_workspace_repository_artifact_idx
  on public.evidence(workspace_id, repository_id, source_artifact_id);

create table public.edges (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  source_node_id text not null,
  target_node_id text not null,
  relation text not null,
  provenance jsonb not null,
  confidence numeric(4,3) not null,
  created_at timestamptz not null default now(),
  constraint edges_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint edges_relation check (relation in ('requires', 'implements', 'tests', 'supports', 'contradicts', 'supersedes', 'references')),
  constraint edges_confidence_range check (confidence between 0 and 1),
  constraint edges_provenance_shape check (
    jsonb_typeof(provenance) = 'object'
    and (
      (provenance ? 'sourceArtifactId' and provenance ? 'span')
      or nullif(btrim(provenance ->> 'reason'), '') is not null
    )
  ),
  constraint edges_source_node_tenant_fk foreign key (workspace_id, repository_id, source_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint edges_target_node_tenant_fk foreign key (workspace_id, repository_id, target_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint edges_workspace_repository_nodes_relation_unique
    unique (workspace_id, repository_id, source_node_id, target_node_id, relation)
);

create index edges_workspace_repository_source_idx
  on public.edges(workspace_id, repository_id, source_node_id);
create index edges_workspace_repository_target_idx
  on public.edges(workspace_id, repository_id, target_node_id);

alter table public.findings
  add column source_node_id text,
  add column kind text not null default 'unproven-claim',
  add column severity text not null default 'medium',
  add column status text not null default 'open',
  add column provenance jsonb not null default '{"reason":"migration backfill"}'::jsonb,
  add column confidence numeric(4,3) not null default 1,
  add column resolved_at timestamptz,
  add constraint findings_kind check (kind in ('missing-implementation', 'missing-test', 'stale-doc', 'contradicting-instructions', 'orphan-doc', 'unproven-claim')),
  add constraint findings_severity check (severity in ('low', 'medium', 'high', 'critical')),
  add constraint findings_status check (status in ('open', 'resolved', 'dismissed')),
  add constraint findings_confidence_range check (confidence between 0 and 1),
  add constraint findings_provenance_shape check (
    jsonb_typeof(provenance) = 'object'
    and (
      (provenance ? 'sourceArtifactId' and provenance ? 'span')
      or nullif(btrim(provenance ->> 'reason'), '') is not null
    )
  ),
  add constraint findings_source_node_tenant_fk foreign key (workspace_id, repository_id, source_node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  add constraint findings_workspace_repository_id_unique unique (workspace_id, repository_id, id);

alter table public.findings alter column provenance drop default;
alter table public.findings alter column confidence drop default;

create index findings_open_workspace_repository_idx
  on public.findings(workspace_id, repository_id, severity)
  where status = 'open';

create table public.runs (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  trigger_kind text not null,
  trigger_key text not null,
  commit_sha text,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint runs_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint runs_trigger_kind check (trigger_kind in ('manual', 'push', 'check_run', 'workflow_run')),
  constraint runs_status check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  constraint runs_commit_sha check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  constraint runs_repository_tenant_fk foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id) on delete cascade,
  constraint runs_workspace_repository_trigger_unique unique (workspace_id, repository_id, trigger_key),
  constraint runs_workspace_repository_id_unique unique (workspace_id, repository_id, id)
);

create index runs_workspace_repository_created_idx
  on public.runs(workspace_id, repository_id, created_at desc);

create table public.jobs (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  run_id text not null,
  kind text not null,
  status text not null default 'queued',
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint jobs_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint jobs_kind check (kind in ('scan', 'analyze', 'judge', 'pack')),
  constraint jobs_status check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  constraint jobs_attempt_bounds check (attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts),
  constraint jobs_run_tenant_fk foreign key (workspace_id, repository_id, run_id)
    references public.runs(workspace_id, repository_id, id) on delete cascade,
  constraint jobs_workspace_idempotency_unique unique (workspace_id, idempotency_key),
  constraint jobs_workspace_id_unique unique (workspace_id, id),
  constraint jobs_workspace_repository_id_unique unique (workspace_id, repository_id, id)
);

create index jobs_claimable_idx
  on public.jobs(available_at, created_at)
  where status = 'queued';
create index jobs_workspace_run_idx
  on public.jobs(workspace_id, repository_id, run_id);

alter table public.receipts
  add column run_id text,
  add column status text not null default 'generated',
  add column summary jsonb not null default '{}'::jsonb,
  add column digest text,
  add constraint receipts_status check (status in ('generated', 'published', 'invalidated')),
  add constraint receipts_digest_sha256 check (digest is null or digest ~ '^[0-9a-f]{64}$'),
  add constraint receipts_run_tenant_fk foreign key (workspace_id, repository_id, run_id)
    references public.runs(workspace_id, repository_id, id) on delete set null (run_id);

create index receipts_workspace_repository_run_idx
  on public.receipts(workspace_id, repository_id, run_id)
  where run_id is not null;

alter table public.mcp_tokens
  add column name text not null default 'Default token',
  add column token_prefix text,
  add column last_used_at timestamptz,
  add column expires_at timestamptz,
  add constraint mcp_tokens_prefix_length check (token_prefix is null or char_length(token_prefix) between 6 and 16),
  add constraint mcp_tokens_workspace_id_id_unique unique (workspace_id, id);

alter table public.credit_ledger
  add column job_id text,
  add column reservation_id text,
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint credit_ledger_job_tenant_fk foreign key (workspace_id, job_id)
    references public.jobs(workspace_id, id) on delete set null (job_id);

create index credit_ledger_workspace_job_idx
  on public.credit_ledger(workspace_id, job_id)
  where job_id is not null;

create table public.index_entries (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  repository_id text not null,
  node_id text not null,
  search_key text not null,
  neighbor_ids text[] not null default '{}',
  embedding real[],
  updated_at timestamptz not null default now(),
  constraint index_entries_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint index_entries_node_tenant_fk foreign key (workspace_id, repository_id, node_id)
    references public.graph_nodes(workspace_id, repository_id, id) on delete cascade,
  constraint index_entries_workspace_node_unique unique (workspace_id, node_id)
);

create index index_entries_workspace_repository_search_idx
  on public.index_entries(workspace_id, repository_id, search_key);

create table public.access_events (
  id text primary key default public.generate_ulid(),
  workspace_id text not null,
  token_id text not null,
  tool text not null,
  target_node_ids text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  constraint access_events_id_ulid check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  constraint access_events_token_tenant_fk foreign key (workspace_id, token_id)
    references public.mcp_tokens(workspace_id, id) on delete cascade
);

create index access_events_workspace_token_occurred_idx
  on public.access_events(workspace_id, token_id, occurred_at desc);

do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'github_installations', 'graph_nodes', 'artifacts', 'requirements', 'evidence',
    'edges', 'runs', 'jobs', 'index_entries', 'access_events'
  ] loop
    execute format('alter table public.%I enable row level security', tenant_table);
    execute format('alter table public.%I force row level security', tenant_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_workspace_member(workspace_id)))',
      tenant_table || '_select_member',
      tenant_table
    );
    execute format('grant select on public.%I to authenticated', tenant_table);
    execute format('grant all on public.%I to service_role', tenant_table);
  end loop;
end;
$$;

grant all on public.findings, public.receipts, public.mcp_tokens, public.credit_ledger to service_role;
