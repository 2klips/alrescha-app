# F1 plan compliance audit

Date: 2026-08-14

## Result

PASS. The executable coverage manifest maps all 22 completed todos to test or browser-QA proof, all 10 WORK_SPEC guardrails to explicit negative assertions, and all 22 todo evidence files to existing non-empty artifacts.

## Acceptance commands

```text
pnpm test -- plan-compliance adr-guardrails evidence-coverage job-lifecycle credit-reconciliation
Test Files  4 passed (4)
Tests       25 passed (25)
Exit        0
```

```text
pnpm exec tsx scripts/verify-plan-coverage.ts .omo/plans/docshub-product-strategy.md
PASS plan coverage: 22 must-haves, 10 must-nots, 22 evidence files
Exit 0
```

## Required negative boundaries

- `no-raw-code-storage`
- `no-inlining`
- `no-deprecated-mcp`
- `advisory-only-writes`
- `verified-inferred-separation`
- `no-charge-on-failure`

The verifier also covers mandatory provenance, honest precision, minimum GitHub permissions, and unsuppressed quality gates.

## Failure-path proof

`tests/evidence-coverage.test.ts` mutates the plan to reference a missing Task 22 artifact and verifies that the audit fails with 21/22 evidence files and an exact missing-path diagnostic.

`tests/plan-compliance.test.ts` also verifies that an omitted WORK_SPEC guardrail and a non-test/non-browser-QA proof kind both fail the audit.
