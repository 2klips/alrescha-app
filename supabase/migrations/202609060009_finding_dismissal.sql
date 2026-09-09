-- Dismissing a finding, and making it stay dismissed (Phase 4 Wave D
-- todo 19 ⑷).
--
-- `findings.status` has allowed `dismissed` since the first migration and
-- nothing ever wrote it. The two things that should produce it both existed
-- and both did something else:
--
--   * a person deciding a finding is not a defect had no writer at all, so
--     the only way off the board was for the rule to stop reproducing;
--   * `apply_successful_judgment` raised confidence and severity from the AI
--     verdict and ignored the verdict itself, so a `rejected` judgment left
--     the finding open with a *higher* confidence than before.
--
-- And a dismissal would not have survived: `reconcileFindings` re-opened
-- every finding it re-derived, so the next analysis undid the decision
-- silently. That is fixed in `postgres-analysis-store.ts`, and
-- `tests/finding-dismissal.test.ts` holds both halves.

alter table public.findings
  add column dismissed_at timestamptz,
  add column dismissed_by uuid references auth.users(id) on delete set null,
  add column dismissed_reason text;

-- A dismissal with no reason is indistinguishable from a finding nobody
-- looked at, which is the state dismissal exists to get out of.
alter table public.findings
  add constraint findings_dismissed_reason check (
    status <> 'dismissed'
    or nullif(btrim(coalesce(dismissed_reason, '')), '') is not null
  );

-- What a member may change about a finding: whether it is on their board,
-- and the note explaining that decision. Nothing else.
--
-- A blanket `grant update on public.findings` would also hand them the title,
-- the confidence and the evidence grade — the columns the analysis owns and
-- the receipt reports. Naming the four columns is what makes "a member can
-- dismiss" mean only that.
create policy findings_dismiss_member on public.findings
  for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));

grant update (status, dismissed_at, dismissed_by, dismissed_reason)
  on public.findings to authenticated;

/**
 * A member dismisses a finding, and says why.
 *
 * `security invoker`, so the row is reached through the member's own RLS —
 * a definer function here would let any caller dismiss any workspace's
 * findings, and dismissal is exactly the operation somebody would want to
 * do quietly to a tenant that is not theirs.
 *
 * Idempotent: dismissing twice keeps the first decision's author and time and
 * takes the newer reason, so a re-submitted form does not rewrite history.
 */
create or replace function public.dismiss_finding(
  target_workspace_id text,
  target_finding_id text,
  dismissal_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  finding public.findings%rowtype;
begin
  if nullif(btrim(coalesce(dismissal_reason, '')), '') is null then
    raise exception 'dismissing a finding needs a reason';
  end if;

  select * into finding
  from public.findings
  where id = target_finding_id and workspace_id = target_workspace_id;
  if not found then
    -- Also the answer when RLS hid it: a caller learns nothing about
    -- another workspace's findings from this either way.
    return jsonb_build_object('dismissed', false, 'reason', 'not-found');
  end if;

  if finding.status = 'resolved' then
    -- Already gone from the board for a stronger reason: the rule stopped
    -- reproducing. Dismissing it would replace a fact with an opinion.
    return jsonb_build_object('dismissed', false, 'reason', 'already-resolved');
  end if;

  update public.findings
  set status = 'dismissed',
      dismissed_at = coalesce(dismissed_at, now()),
      dismissed_by = coalesce(dismissed_by, (select auth.uid())),
      dismissed_reason = dismissal_reason
  where id = target_finding_id and workspace_id = target_workspace_id;

  return jsonb_build_object('dismissed', true, 'reason', 'dismissed');
end;
$$;

revoke all on function public.dismiss_finding(text, text, text)
  from public, anon;
grant execute on function public.dismiss_finding(text, text, text)
  to authenticated, service_role;

/**
 * The judgment applier, now reading the verdict it was already storing.
 *
 * `rejected` means the model examined the finding and concluded it is not a
 * defect. Leaving it open with a raised confidence — what this function did
 * before — is the opposite of what the judgment said. It is recorded as a
 * dismissal whose reason names the model, so a reader can tell a machine's
 * decision from a person's.
 *
 * `confirmed` and `ambiguous` keep the previous behaviour exactly:
 * confidence and severity move, status does not. An AI verdict never raises
 * the evidence grade (ADR-001) and this does not change that either.
 */
create or replace function public.apply_successful_judgment(
  target_job_id text,
  target_workspace_id text,
  target_repository_id text,
  judgment_kind text,
  judgment_target_id text,
  judgment_provider text,
  judgment_payload jsonb,
  judgment_payload_digest text,
  judgment_model text,
  target_confidence numeric,
  target_severity text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  judgment_id text;
  verdict text := judgment_payload->>'verdict';
begin
  if target_confidence not between 0 and 1 then
    raise exception 'judgment confidence must be between zero and one';
  end if;
  if target_severity not in ('low', 'medium') then
    raise exception 'inferred judgment severity must not exceed medium';
  end if;

  judgment_id := public.record_successful_judgment(
    target_job_id, target_workspace_id, target_repository_id, judgment_kind,
    judgment_target_id, judgment_provider, judgment_payload,
    judgment_payload_digest, judgment_model
  );

  update public.findings
  set confidence = greatest(confidence, target_confidence),
      evidence_grade = 'inferred',
      severity = target_severity,
      status = case
        when verdict = 'rejected' and status = 'open' then 'dismissed'
        else status
      end,
      dismissed_at = case
        when verdict = 'rejected' and status = 'open'
          then coalesce(dismissed_at, now())
        else dismissed_at
      end,
      dismissed_reason = case
        when verdict = 'rejected' and status = 'open'
          then coalesce(
            nullif(btrim(coalesce(judgment_payload->>'explanation', '')), ''),
            'rejected by ' || judgment_model
          )
        else dismissed_reason
      end
  where id = judgment_target_id
    and workspace_id = target_workspace_id
    and repository_id = target_repository_id;

  return judgment_id;
end;
$$;

revoke all on function public.apply_successful_judgment(text,text,text,text,text,text,jsonb,text,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.apply_successful_judgment(text,text,text,text,text,text,jsonb,text,text,numeric,text)
  to service_role;
