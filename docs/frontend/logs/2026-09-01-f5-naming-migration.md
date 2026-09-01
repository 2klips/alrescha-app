# F5 Alrescha naming migration

## Objective and acceptance

Finish the user-facing product-name migration to `Alrescha` without breaking compatibility-sensitive `arr` identifiers. Acceptance required clean active UI copy, page metadata, current public/operational documentation, generated agent instructions, managed-index copy, and proposal copy; historical records and technical identifiers had to remain stable.

Result: complete. Active product surfaces now use `Alrescha`. The actual repository identity and all technical compatibility contracts remain unchanged.

## Starting state

- Start SHA: `571f18d` on `main`.
- The worktree already contained 17 modified `.omo/evidence/**` files and untracked brand-direction assets. They were treated as user-owned, not edited, and excluded from this commit.
- The untracked `docs/brand/ALRESCA_*` direction and binaries still use the pre-decision `Alresca` spelling. They remain unapproved reference assets and were not renamed.

## Migration boundary

Changed to `Alrescha`:

- Current README product description, image alternative text, and footer.
- Privacy, pilot recruitment, deployment, and design-token documentation.
- Inspection, onboarding, settings, and privacy copy that still exposed `Arr`.
- Generated MCP instruction headings and Cursor description.
- Generated managed-index heading/error copy and advisory proposal title/body.
- Current code comments describing the product's persistence/security boundary.
- Korean string-policy allowlist and dedicated naming regression coverage.

Intentionally retained:

- Packages such as `@arr/core` and the `arr-app` repository name.
- `ARR_*` environment/token names, `arr://` protocols, `arr-theme`, `.arr/`, and deployed/schema URLs.
- MCP server key `arr`, instruction markers, filenames, `ARR:BEGIN/END`, and `arr/minimal-index-*` branches.
- Visible real repository identities such as `2klips/arr-app` and demo fixture paths.
- Historical ADRs, specifications, reports, changelog records, benchmark evidence, and prior task logs.

## Verification

- Targeted Vitest: 5 files and 82 tests passed.
- `tests/alrescha-naming.test.ts` checks 13 active product surfaces for `Arr`, `Alresca`, or `SpecProof` and separately proves required compatibility identifiers remain.
- Korean string-policy test passed after removing `Arr` from the allowed user-facing vocabulary.
- Exact active-surface search returned zero legacy product-name matches.
- Targeted ESLint passed for all changed TypeScript and test files.
- `git diff --check`: passed.

No screenshot was added because the visible global shell and metadata already displayed `Alrescha`; this wave corrected residual state/help copy, generated text, and current documentation. F6 browser coverage verifies the affected routes.

## Next task

F6: run the full desktop 1280/1440/1920 × light/dark browser matrix, accessibility and keyboard checks, complete automated gates, bundle measurements, regression closure, and Claude Code handoff.
