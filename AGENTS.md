# AGENTS.md — arr-app

This repository implements SpecProof (AI development assurance SaaS). Full product spec lives in `spec/`.

## Before doing anything

Read in this exact order:
1. `spec/IMPLEMENTATION_GUIDE.md` — repo rules, prerequisite phases, decided defaults, session protocol
2. `spec/WORK_SPEC.md` — normative spec (intent, 10 guardrails, screens, data model, rules, MCP contract)
3. `spec/BUILD_PLAN.md` — 22 todos with waves, dependencies, acceptance criteria

Conflict priority: `spec/DECISIONS-ADR.md` = WORK_SPEC > BUILD_PLAN > IMPLEMENTATION_GUIDE.

## Hard rules (machine-enforced later, honor them from commit one)

- `verified` only with execution evidence; AI reasoning is always `inferred`.
- Every graph edge/finding carries provenance (source span or explicit reason).
- Never persist raw source-code bodies; transient analysis fetches only.
- Only repo-write path: the advisory minimal-index PR proposal.
- Never inline doc bodies into AGENTS.md/CLAUDE.md.
- MCP 2026-07-28 stateless only — no Sampling/Roots/Logging/sessions.
- No charge on failed/schema-invalid AI outputs; idempotent billing.
- No efficiency numbers without measurement; state assumptions.
- Never weaken tests to make them pass.
- Progress logging: one structured call per task unit (≤150 tokens target).

## Working agreement

- One wave (or 2–3 todos) per session. A todo is done only when its acceptance criteria pass as tests.
- Update BUILD_PLAN checkboxes + `.omo/evidence/` per todo; one conventional commit per todo.
- Blocked on external credentials? Mock it, mark it, move on; request prerequisites by phase (see GUIDE §2).
- Spec ambiguity? Record in `spec/OPEN_QUESTIONS.md`, proceed with a sensible default. Do not edit other `spec/` files.
- End every session with lint/typecheck/test green and a report (done / deferred / open questions / next scope).
