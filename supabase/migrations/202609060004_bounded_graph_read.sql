-- A bounded, keyset-paged edge read (Codex remedy P0-B / R-01, step S3).
--
-- S2b gave the PostgREST reads an order and a limit, so a truncated answer
-- says it is truncated. It could not say *how to continue*, and it could not
-- bound anything but rows: a page of 2,000 edges with long provenance is a
-- payload nobody budgeted for.
--
-- This is the scoped read the remedy recommends (REMEDY §5.1-§5.2): one
-- read-only SELECT behind one function, returning the rows, whether more
-- exist, and where to resume, in a single scalar JSON.
--
-- The rules it follows, and why each one is a rule:
--
-- * **Keyset, not offset.** Pages walk `id > after_edge_id` in id order.
--   An offset re-reads and can skip or repeat a row when the table changes
--   between pages; a keyset cannot.
-- * **`limit` applies to rows, before aggregation.** Aggregating first and
--   slicing the array afterwards would read the whole table to return a
--   page, which is the cost the budget exists to avoid.
-- * **n+1 decides `hasMore`.** The function reads one row past the budget
--   and reports whether it got it. "I asked for 2,000 and got 2,000" is not
--   evidence of anything — that is exactly the inference the remedy calls
--   out (REMEDY §5.2).
-- * **Bytes are budgeted too.** Rows are kept while their running serialized
--   size fits. A scalar JSON return is not a way to smuggle an unbounded
--   payload past a row cap.
-- * **`exactCount` is null.** Counting every matching edge costs a scan this
--   read is trying not to pay. A number nobody measured is worse than no
--   number.
--
-- Consistency: one SELECT is one snapshot, so a single page is internally
-- consistent. **Across pages it is not** — PostgreSQL 17's Read Committed
-- gives each statement its own snapshot, so wrapping several reads in a
-- function would not have made them one either (REMEDY §5.3). Whether to add
-- a revision fence is OQ-053; until then this function claims a page, not a
-- graph.
--
-- Permission: `security invoker`, so it can never be a way around RLS, and
-- EXECUTE is granted to `service_role` alone. The workspace comes from the
-- caller's verified principal, never from a client-supplied string —
-- SECURITY INVOKER on its own is not a tenant boundary (REMEDY §5.5).

create or replace function public.read_edge_page(
  target_workspace_id text,
  target_repository_id text,
  after_edge_id text,
  row_budget integer,
  byte_budget integer
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(row_budget, 500), 1), 2000) as rows_wanted,
      least(greatest(coalesce(byte_budget, 262144), 1024), 4194304) as bytes_wanted
  ),
  -- The limit applies here, to rows, and asks for one more than the budget.
  page as (
    select e.id, e.repository_id, e.source_node_id, e.target_node_id,
           e.relation, e.family, e.confidence, e.provenance
    from public.edges e, bounds
    where e.workspace_id = target_workspace_id
      and (target_repository_id is null or e.repository_id = target_repository_id)
      and (after_edge_id is null or e.id > after_edge_id)
    order by e.id
    limit (select rows_wanted from bounds) + 1
  ),
  shaped as (
    select
      p.id,
      -- Column names, not a second naming convention: the row decoder is the
      -- same one the table select feeds, and two shapes would be two
      -- decoders.
      jsonb_build_object(
        'confidence', p.confidence,
        'family', p.family,
        'id', p.id,
        'provenance', p.provenance,
        'relation', p.relation,
        'repository_id', p.repository_id,
        'source_node_id', p.source_node_id,
        'target_node_id', p.target_node_id
      ) as row_json,
      row_number() over (order by p.id) as position
    from page p
  ),
  measured as (
    select
      s.*,
      sum(octet_length(s.row_json::text)) over (order by s.position) as bytes_so_far
    from shaped s
  ),
  kept as (
    select m.id, m.row_json
    from measured m, bounds
    where m.position <= bounds.rows_wanted
      and m.bytes_so_far <= bounds.bytes_wanted
  ),
  tally as (
    select
      (select count(*) from shaped) as read_rows,
      (select count(*) from kept) as kept_rows,
      (select rows_wanted from bounds) as rows_wanted,
      (select bytes_wanted from bounds) as bytes_wanted,
      (select max(id) from kept) as last_id,
      coalesce((select jsonb_agg(row_json order by id) from kept), '[]'::jsonb)
        as edges
  )
  select jsonb_build_object(
    'edges', tally.edges,
    'hasMore', tally.read_rows > tally.kept_rows,
    'nextCursor', tally.last_id,
    -- Never a count nobody paid for.
    'exactCount', null,
    'coverage', jsonb_build_object(
      'byteBudget', tally.bytes_wanted,
      'rowBudget', tally.rows_wanted,
      'result', case
        when tally.read_rows > tally.kept_rows then 'partial' else 'complete'
      end,
      'stoppedBy', case
        when tally.read_rows <= tally.kept_rows then null
        when tally.kept_rows < tally.rows_wanted then 'bytes'
        else 'rows'
      end
    )
  )
  from tally;
$$;

revoke all on function public.read_edge_page(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_edge_page(text, text, text, integer, integer)
  to service_role;
