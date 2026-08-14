# F3 Chromium pilot-flow trace transcript

Date: 2026-08-14

## Result

PASS. One Chromium worker completed the full GitHub-first pilot flow without assertion failure.

```text
pnpm exec playwright test tests/e2e/pilot-flow.spec.ts --project=chromium --trace=on
Running 1 test using 1 worker
1 passed (6.6s)
Test body: 2.7s
Exit: 0
```

## Trace steps

1. Sign up and install the mocked least-privilege GitHub App.
   - Confirmed private solo-workspace explanation.
   - Confirmed `Contents · read`, `Checks · read`, `Actions · read`, and `Metadata · read` reasons.
2. Select fixture repository and watch first metadata-only scan.
   - Opened evidence graph and sourced unresolved-health metric.
3. Inspect findings, transient source, evidence chain, and instruction lint.
   - Confirmed exact analyzed-commit source and dual contradiction spans.
4. Inspect grounded depth-two graph.
   - Confirmed provenance badge and four-node local graph.
5. Issue scoped token and request context pack through official MCP client.
   - Used MCP 2026-07-28.
   - Confirmed token secret is one-time, token hash stays private, and `spec/WORK_SPEC.md` is selected for Codex.
6. Open advisory minimal-index pull request through mocked GitHub port.
   - Confirmed proposal branch, bounded `AGENTS.md`/`CLAUDE.md` writes, then PR creation.
7. Run one inferred judgment and opt in to pilot stats through real PGlite migrations.
   - Confirmed `reserve -10`, `settle 0`, ending balance 40, inferred-only judgment, explicit consent timestamp.
8. Verify current in-toto-shaped receipt.
   - Confirmed matching digest and `3 verified · 1 inferred` verdict.

## Artifacts

- Screenshot: `.omo/evidence/docshub-product-strategy/final/browser-qa.png`
  - Size: 64,979 bytes
  - SHA-256: `12184e485cfef79a6a210e30685b4414a2597849244aae7c6b80159cd5b96a54`
- Playwright trace archive generated at `test-results/pilot-flow-completes-the-G-d4b79-its-stats-and-receipt-proof-chromium/trace.zip`.
  - Size: 1,246,418 bytes
  - SHA-256: `e08bead29f36e1412705f67b76cad395e9c932f403dbcd636afd060ef07799b4`
  - `test-results/` is ephemeral; rerun the acceptance command to regenerate the trace archive.

## Regression

- `pnpm test`: 53 files, 222 tests passed.
- `pnpm exec playwright test --project=chromium --workers=1`: 17 browser tests passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: root plus five workspace projects passed.

Default 8-worker all-E2E execution exposed an existing hydration-timing flake in `live-graph.spec.ts`; the same test passes alone and in the 17-test serialized run. F3's required command uses one worker and passed repeatedly.
