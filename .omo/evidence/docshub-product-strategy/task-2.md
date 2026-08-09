# Task 2 evidence — ADR port and guardrails

Date: 2026-08-09

## Delivered

- ADR-001, ADR-002, and ADR-003 ported to `docs/adr/` with accepted status, canonical decisions, and implementation consequences.
- Repository scanner enforces:
  - no deprecated MCP Sampling/Roots/Logging or protocol session state;
  - no raw source-code persistence outside bounded transient paths;
  - no document-body interpolation in minimal-index templates;
  - no GitHub repository writes outside advisory PR-proposal modules;
  - no direct network calls from `packages/core`.
- Root typecheck now covers scripts, config, and tests as well as workspace packages.

## Acceptance evidence

`pnpm test -- adr-guardrails` passed 10 tests. Coverage includes all three ADR documents, clean production-source scan, all five negative guardrails, bounded allowlists, and a recorded failure fixture importing MCP `Sampling` with the exact diagnostic:

```text
MCP Sampling capability is forbidden; MCP 2026-07-28 is stateless.
```

Additional checks: `pnpm lint` and `pnpm typecheck` passed.

