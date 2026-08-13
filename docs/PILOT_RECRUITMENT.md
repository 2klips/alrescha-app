# Pilot recruitment and baseline script

## Invitation

> We are piloting SpecProof, a metadata-only project-assurance workspace that links requirements, code, CI evidence, and receipts. The GitHub App is read-only by default and can be limited to selected repositories. Raw source is fetched transiently, access events are retained 30 days, and AI judgment is optional. Would you try one real maintenance task and let us compare your own baseline with your own observed workflow?

Do not promise time, token, cost, accuracy, or quality savings. Any later statement must link to that user's sufficient opt-in observations at `/app/stats` and its JSON export.

## Consent and fit

1. Confirm the participant controls the selected repository and may grant read access, including private-repository access if applicable.
2. Show `/app/settings/privacy`, requested GitHub permissions, metadata-only storage, transient source fetches, BYOK handling, credit behavior, and 30-day access-event retention.
3. Ask separately for pilot instrumentation consent. Declining does not block product use.
4. Choose one ordinary implementation, question-answering, or drift-review task before showing results.

## Baseline capture

Capture before the first assisted task:

| Field | Value |
| --- | --- |
| Participant/repository pseudonym | |
| Date, model/tool version | |
| Task statement fixed in advance | |
| Repository commit SHA | |
| Baseline start/end time | |
| Baseline input/output tokens reported by model | |
| Baseline tool calls | |
| Baseline test/answer/finding grade | |
| Errors or abandoned attempts | |

Do not remove failed attempts or change the task between baseline and assisted runs.

## Assisted run and debrief

Use the same task, commit, model, and grading rule. Capture elapsed time, model-reported tokens, tool calls, outcome, failures, scan duration, pack requests, and finding/receipt movement. Export `/app/stats` only when it reports sufficient evidence; otherwise record “not enough evidence.”

Ask:

- Which evidence link changed your decision?
- Where did guidance or permission copy remain unclear?
- Did the graph omit or overstate anything?
- Would you reconnect after a GitHub revocation? Why?

Attach raw trial records, the workspace stats JSON, consent state, and open issues to the pilot record. Report observations only; do not generalize beyond measured evidence.
