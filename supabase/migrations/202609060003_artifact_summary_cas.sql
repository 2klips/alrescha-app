-- Conditional summary writes and honest apply counts (Codex remedy P0-A /
-- R-02, step S1).
--
-- Two defects, one function. The old `apply_artifact_summaries` matched on
-- workspace, repository and path only, so a job that started against blob A
-- and finished after a rescan had already stored the summary for blob B
-- overwrote B with A — the newer prose was lost and had to be paid for
-- again. And it returned the number of *input items*, so a summary for a
-- file that had since been deleted reported `1` while updating no row at
-- all; the worker then reported that phantom as a delivered summary.
--
-- The fix is a compare-and-set on the digest the generation started from,
-- plus a real count of what changed. Filtering on read is not a substitute:
-- a read filter hides the wrong prose, it does not stop the newer prose from
-- being destroyed.
--
-- Outcomes. The four buckets count **summary** items, because delivered prose
-- is what the caller has to reason about; skip rows are written under the same
-- condition and counted separately, since a recorded failure is not delivered
-- work:
--   applied      the row exists and its blob still matches — prose written
--   superseded   the row exists and its blob moved on — nothing written
--   missing      no artifact at that path any more — nothing written
--   invalid      the item names no path or no digest — nothing written
--   skipsApplied failure gates written, under the same condition
--
-- `superseded` is not a failure. The model did its work and the world moved;
-- the next enqueue picks the file up at its new blob. Treating it as a
-- provider failure would retry a repository that is simply being edited.

drop function if exists public.apply_artifact_summaries(text, text, jsonb);

create or replace function public.apply_artifact_summaries(
  target_workspace_id text,
  target_repository_id text,
  summaries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_path text;
  expected_blob text;
  updated_id text;
  exists_at_path boolean;
  applied integer := 0;
  superseded integer := 0;
  missing integer := 0;
  invalid integer := 0;
  skips_applied integer := 0;
begin
  for item in select jsonb_array_elements(coalesce(summaries, '[]'::jsonb))
  loop
    item_path := item->>'path';
    expected_blob := nullif(trim(coalesce(item->>'summaryBlobSha', '')), '');
    updated_id := null;

    if item->>'kind' not in ('summary', 'skip') then
      raise exception 'unsupported summary item kind: %', item->>'kind';
    end if;

    -- A write with no path, or a summary with no digest, cannot be made
    -- conditional and is refused rather than applied unconditionally.
    if item_path is null
       or (item->>'kind' = 'summary' and expected_blob is null) then
      invalid := invalid + 1;
      continue;
    end if;

    if item->>'kind' = 'summary' then
      update public.artifacts
      set metadata = (coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'summary', item->>'summary',
            'summaryBlobSha', expected_blob,
            'summaryModel', item->>'model',
            'summaryProvider', item->>'provider',
            'summaryGrade', 'inferred',
            'summaryUpdatedAt', now()
          )) - 'summarySkipped',
          updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item_path
        and source_blob_sha is not null
        and source_blob_sha = expected_blob
      returning id into updated_id;
    else
      -- A skip records which blob failed. An older failure must not land on
      -- top of a newer success, so it carries the same condition; a skip
      -- from a client that states no digest stays unconditional, which is
      -- what the pre-remedy callers sent.
      update public.artifacts
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'summarySkipped', jsonb_build_object(
              'reason', item->>'reason',
              'sourceBlobSha', expected_blob,
              'observedAt', now()
            )
          ),
          updated_at = now()
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item_path
        and (
          expected_blob is null
          or (source_blob_sha is not null and source_blob_sha = expected_blob)
        )
      returning id into updated_id;
    end if;

    if updated_id is not null then
      if item->>'kind' = 'summary' then
        applied := applied + 1;
      else
        skips_applied := skips_applied + 1;
      end if;
      continue;
    end if;

    -- A skip that did not land is simply not counted as a gate written; the
    -- summary buckets stay about prose.
    if item->>'kind' = 'skip' then
      continue;
    end if;

    select exists (
      select 1 from public.artifacts
      where workspace_id = target_workspace_id
        and repository_id = target_repository_id
        and path = item_path
    ) into exists_at_path;

    if exists_at_path then
      superseded := superseded + 1;
    else
      missing := missing + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'applied', applied,
    'superseded', superseded,
    'missing', missing,
    'invalid', invalid,
    'skipsApplied', skips_applied
  );
end;
$$;

revoke all on function public.apply_artifact_summaries(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_artifact_summaries(text, text, jsonb) to service_role;
