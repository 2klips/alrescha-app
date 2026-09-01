# Alrescha naming migration inventory

**Status:** Alrescha user-facing + compatibility identifier migration complete; legacy removal deferred

**Baseline snapshot:** 2026-08-31 at commit `68269d9`

> Sections 1–5 retain the F5 inventory and decision history. Current canonical/legacy policy is in §6.

## 1. Exact-name inventory

Search excludes `output/`, `docs/frontend/`, and `pnpm-lock.yaml` so generated F0 records do not inflate the baseline.

| Exact word  | Files | Matches | Meaning                                                    |
| ----------- | ----: | ------: | ---------------------------------------------------------- |
| `Alrescha`  |     1 |       2 | New contract in `AGENTS.md` only                           |
| `Alresca`   |     2 |       5 | Pre-decision brand exploration and references              |
| `SpecProof` |    10 |      29 | Mostly historical specification/review records             |
| `Arr`       |    39 |     127 | Current UI copy, docs, specification history, and comments |

## 2. Migration classes

### A. User-visible product name — change first

These are safe to migrate as one frontend copy task with tests:

- `apps/web/lib/strings/common.ts`: product name, home label, outside-workspace copy.
- `apps/web/lib/strings/dashboard.ts`: dashboard accessible name.
- `apps/web/app/layout.tsx`: page metadata title.
- `apps/web/lib/strings/terms.ts`: product term.
- `README.md`, `docs/PRIVACY.md`, `docs/PILOT_RECRUITMENT.md`, `docs/DEPLOYMENT_RUNBOOK.md`: current public and operational prose.
- Logo wordmark/accessible label consumers that read `COMMON.product.name`.

Acceptance: no user-visible page title, navigation brand, empty/error state, policy, or current README copy calls the product `Arr`.

### B. Visible demo/repository identity — decide, then migrate

`2klips/arr-app` and `arr/drifted-demo` are repository identities shown throughout onboarding, shell context, graph fixtures, library, tests, and evidence. They are not simple product copy.

- Keep until the actual repository/demo fixture names change or aliases are agreed.
- If renamed, update fixture paths, GitHub API expectations, seeded database rows, screenshots, and tests in one migration.
- Do not display a fictional `Alrescha` repository if the connected repository remains `2klips/arr-app`.

### C. Compatibility-sensitive identifiers — do not change in frontend wave

Require an explicit alias/deprecation plan:

- Workspace packages: `@arr/core`, `@arr/web`, `@arr/mcp`, `@arr/worker`, `@arr/cli`.
- Environment variables: `ARR_TOKEN`, `ARR_SERVER_URL`, `ARR_MCP_URL`, and related configuration.
- MCP/resource protocol: `arr://...`.
- Receipt/schema URLs such as `https://arr.dev/receipt/v1`.
- Generated branch/marker identifiers: `arr/minimal-index-*`, `ARR:BEGIN`, `ARR:END`.
- Local state and storage: `.arr/`, `arr-theme`, sidebar keys, workspace IDs, test email domains.
- Deployed URLs, GitHub App identity, database constraints, package publication names, and telemetry dimensions.

Strategy: add Alrescha-facing names while keeping Arr aliases until consumers migrate. Removal needs a separate compatibility release.

### D. Historical records — preserve

Do not bulk-rewrite ADRs, old reports, benchmark evidence, changelog entries, or completed plan history. Add a current-name note where readers could confuse history with active policy.

### E. Misspelled pre-decision assets — review manually

`docs/brand/ALRESCA_LOGO_DIRECTION.md` and `docs/brand/alresca-*` assets use `Alresca`. They are untracked, pre-decision exploration owned by another workstream.

- Do not rename binary files automatically.
- Review the concept, then regenerate or deliberately rename selected assets with `Alrescha` metadata.
- Until reviewed, none is an approved product logo.

## 3. Recommended order

1. User-visible copy and metadata.
2. Wordmark and approved logo asset.
3. Public documentation and deployment copy.
4. Demo/repository identity after real repository decision.
5. Add compatibility aliases for packages, environment variables, MCP URIs, schemas, and local state.
6. Remove old aliases only in a separately versioned migration.

## 4. Verification queries

Use exact-word searches; plain `Arr` also matches `Array`.

```powershell
rg -n "\bArr\b|\bSpecProof\b|\bAlresca\b" apps/web README.md docs
rg -n "@arr|ARR_|arr://|https://arr\.dev|arr-theme|\.arr/" apps packages tests scripts
```

## 5. F5 result — 2026-09-01

- Active UI copy, metadata, current README/operations/privacy/pilot documentation, generated MCP instructions, managed-index copy, and advisory proposal copy now use `Alrescha`.
- `tests/alrescha-naming.test.ts` prevents `Arr`, `Alresca`, and `SpecProof` from returning to the selected active product surfaces.
- `@arr/*`, `ARR_*`, `arr://`, `arr-theme`, `.arr/`, MCP server key `arr`, managed markers, proposal branch names, real repository names, and schema/deployment identities remain unchanged.
- Historical records and the user-owned untracked `docs/brand/ALRESCA_*` exploration remain outside this migration.
- Detailed evidence: [`logs/2026-09-01-f5-naming-migration.md`](./logs/2026-09-01-f5-naming-migration.md).

## 6. Compatibility identifier result — 2026-09-01

- Canonical: `alrescha`, `@alrescha/*`, `ALRESCHA_*`, `alrescha://`, `.alrescha/`, `ALRESCHA:BEGIN/END`, and `alrescha/minimal-index-*`.
- Read compatibility: CLI binary `arr`; `ARR_SERVER_URL`, `ARR_TOKEN`, `ARR_MCP_URL`; legacy local-storage keys; legacy managed-index blocks; stored receipt tool name `arr`; deprecated exported marker/schema aliases.
- New writes and generated output use only canonical identifiers.
- Demo identity migrated to `alrescha/drifted-demo`; recording HMACs and artifact digest were regenerated from the changed fixture bytes.
- Immutable/real external IDs retained: `2klips/arr-app`, `arr-app-web.vercel.app`, `arr-worker`, production receipt predicate URI, applied migration names, and the shared `arr_migrations` advisory lock.
- Historical ADR/spec/reports and `.arr-*` CSS hooks remain unchanged. CSS hooks are private selectors, not interoperability identifiers.
- Legacy alias removal is a separate future release. Do not remove aliases until external consumers and stored local state are measured as migrated.
- Detailed evidence: [`logs/2026-09-01-alrescha-compatibility-identifiers.md`](./logs/2026-09-01-alrescha-compatibility-identifiers.md).
