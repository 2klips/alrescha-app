begin;

-- access_events only had (workspace_id, token_id, occurred_at desc)
-- (202608100002_evidence_graph_domain.sql), but the readers that page
-- through a workspace's access history filter by workspace_id and order by
-- occurred_at alone, without a token_id predicate — a scan of that
-- three-column index can't use its second key column and degrades toward a
-- workspace-wide scan. Add the two-column index the actual query shape
-- needs; the existing three-column index stays for token-scoped lookups.
create index access_events_workspace_occurred_idx
  on public.access_events (workspace_id, occurred_at desc);

commit;
