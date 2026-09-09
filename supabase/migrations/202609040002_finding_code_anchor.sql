-- Anchor a finding to the code it is about, and admit the first rule that
-- needs no document (Phase 4 Wave A todo 1, R5 §2.2 D8).
--
-- Every finding hangs off `source_node_id`, the node whose span raised it,
-- which for five of the six drift rules is a document. A repository whose
-- risk lives in code therefore had no finding on a single code node, and the
-- map's rings and counts could not reach one. `target_node_id` is the second
-- anchor: the referenced path for `stale-doc`, the file owning the named
-- symbol for `missing-implementation`/`missing-test`, the file itself for
-- `untested-code`. It is nullable — a rule that cannot name a code file
-- without guessing names none.

alter table public.findings
  add column if not exists target_node_id text;

comment on column public.findings.target_node_id is
  'Code node this finding is about, when a rule can name one deterministically. Null is honest absence, not backlog.';

-- Only this column is nulled when the code node goes: the finding itself
-- belongs to its source (which cascades), and losing an anchor must not
-- delete the finding or null the tenant columns beside it.
alter table public.findings
  add constraint findings_target_node_tenant_fk
    foreign key (workspace_id, repository_id, target_node_id)
    references public.graph_nodes(workspace_id, repository_id, id)
    on delete set null (target_node_id);

create index if not exists findings_open_workspace_target_idx
  on public.findings(workspace_id, repository_id, target_node_id)
  where status = 'open' and target_node_id is not null;

-- `untested-code`: an exported code file no test names and no `tests` edge
-- reaches. Deterministic, `inferred`, severity low — "no test was found" is
-- not "no test exists" (WORK_SPEC §3-1).
alter table public.findings
  drop constraint findings_kind;

alter table public.findings
  add constraint findings_kind check (kind in (
    'missing-implementation', 'missing-test', 'stale-doc',
    'contradicting-instructions', 'orphan-doc', 'unproven-claim',
    'untested-code'
  ));
