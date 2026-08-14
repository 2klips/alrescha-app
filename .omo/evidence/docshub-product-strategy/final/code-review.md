# F2 code quality review

Date: 2026-08-14

## Result

PASS. Lint, typecheck, focused runtime tests, and the repository security audit exit 0. The security audit reports no high or critical findings across 154 production files.

## Acceptance commands

```text
pnpm lint && pnpm typecheck && pnpm test -- rls auth parser extractor probes rules receipts worker credit webhook mcp github-permissions pr-proposal
Lint        PASS
Typecheck   PASS (root plus five workspace projects)
Test Files  17 passed (17)
Tests       69 passed (69)
Exit        0
```

```text
pnpm exec tsx scripts/security-audit.ts
PASS security audit: 5 checks, 154 files, 0 high/critical findings
Exit 0
```

## Security categories

- Webhook forgery: unsigned payload processing is critical; HMAC verification/delegation is required.
- Token/key handling: plaintext credential logging, secret-like `NEXT_PUBLIC_` variables, committed provider/GitHub token literals, and plaintext credential columns are critical.
- Tenant isolation: every migration-created table containing `workspace_id` must enable RLS explicitly or through a bounded table loop.
- Transient-fetch boundary: existing raw-code-persistence guardrails are promoted to critical findings.
- Span rendering injection: `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, and `document.write` are high findings.

## Failure-path proof

`tests/security-audit.test.ts` runs seven filesystem-level scenarios. Five malicious fixtures fail for the required security categories. Two safe fixtures preserve public Supabase publishable-key handling and bounded migration-loop RLS without false positives.

Full regression: `pnpm test` passes 53 files and 222 tests.
