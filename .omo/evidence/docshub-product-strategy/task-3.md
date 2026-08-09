# Task 3 evidence — drifted-demo and recorded GitHub fixtures

Date: 2026-08-09

## Delivered

- Importable 41,101-byte TypeScript fixture repository with a spec, two ADRs, root/nested AGENTS.md, Cursor rule, SKILL.md, TODO, code, and executable Vitest test.
- `expected-findings.json` contains exactly one example of each finding type with source spans and excerpts:
  - `missing-implementation`
  - `missing-test`
  - `stale-doc`
  - `contradicting-instructions` (both conflicting spans)
  - `orphan-doc`
  - `unproven-claim`
- Recorded GitHub tree and base64 Contents responses, signed push/check_run/workflow_run webhook requests, Actions/check-run metadata, and passing JUnit/Vitest JSON reports.
- Pure offline normalization functions for tree, content, webhook, and Actions artifact payloads.

## Acceptance evidence

| Command | Result |
| --- | --- |
| `pnpm test -- drifted-demo` | pass; 7 schema/replay/report/size/execution tests |
| `pnpm --filter @specproof/drifted-demo test:reports` | pass; 1 fixture test, fresh `.reports/junit.xml` and `.reports/vitest.json` |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass; fixture included as fourth checked workspace package |

Negative acceptance is automated: mutating a manifest span to line 999 is rejected with a path-specific out-of-file diagnostic. Replay is network-free and verifies decoded Contents bodies against local source bytes plus reproducible webhook HMACs.

