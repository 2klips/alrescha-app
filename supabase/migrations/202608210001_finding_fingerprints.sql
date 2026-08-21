-- Stable identity for a deterministic finding (Phase 2C todo 5 follow-up).
--
-- The rules engine already names each finding by what produced it —
-- `<type>:<path>:<line>:<column>` — but `findings.id` is a ULID, so a second
-- analysis of the same commit had no way to recognise a finding it had already
-- recorded and would insert it again. The fingerprint is that natural key.
--
-- Nullable and indexed only where present: rows created before this migration,
-- and any future finding that is not span-addressable, simply carry none.

alter table public.findings
  add column if not exists fingerprint text;

comment on column public.findings.fingerprint is
  'Deterministic identity from the rules engine (type:path:line:column). Lets a re-analysis update a finding instead of duplicating it.';

create unique index if not exists findings_workspace_repository_fingerprint_idx
  on public.findings (workspace_id, repository_id, fingerprint)
  where fingerprint is not null;
