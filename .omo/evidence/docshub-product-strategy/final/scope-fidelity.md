# F4 scope fidelity audit

Date: 2026-08-14

## Result

PASS. The scope verifier checked all 11 forbidden MVP boundaries across 141 product files and found no reachable forbidden paths.

## Acceptance commands

```text
pnpm test -- scope-fidelity
Test Files  1 passed (1)
Tests       13 passed (13)
Exit        0
```

```text
pnpm exec tsx scripts/verify-scope-boundaries.ts
PASS scope fidelity: 11 boundaries, 141 files, 0 forbidden paths
Exit 0
```

## Negative-test coverage

`tests/scope-fidelity.test.ts` provides one malicious filesystem fixture for each exported boundary:

- local CLI
- team UI
- external billing
- non-GitHub repository provider
- marketplace
- skill security scanning
- direct/autonomous repository writes
- raw-code persistence
- always-loaded generated context
- deprecated MCP capabilities
- unsupported numeric savings claims

The coverage assertion requires the fixture boundary set to equal the verifier's complete boundary set. A missing, duplicate, or renamed boundary therefore fails the suite. The final test runs the same public verifier against the current repository and requires zero findings.

## Scanned surface

The verifier scans production source and package manifests under `apps/` and `packages/`, SQL migrations under `supabase/migrations/`, and the root `package.json` and `README.md`. Test files, dependencies, build output, coverage output, and Next.js output are excluded.

Full regression: `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; the full unit suite covers 54 files and 235 tests.
