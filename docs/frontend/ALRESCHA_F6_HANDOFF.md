# Alrescha F6 handoff

Desktop frontend track F0–F6 is complete. Continue from current `main`; do not resume from `claude/awesome-lehmann-a47e28` without first syncing because its `69372a1` commit is already contained in `main` and the branch trails the integrated work.

## Read first

1. [`ALRESCHA_FRONTEND_REDESIGN_PLAN.md`](./ALRESCHA_FRONTEND_REDESIGN_PLAN.md)
2. [`ALRESCHA_DESIGN_SYSTEM.md`](./ALRESCHA_DESIGN_SYSTEM.md)
3. [`COMPONENT_STATE_MATRIX.md`](./COMPONENT_STATE_MATRIX.md)
4. [`logs/2026-09-01-f6-verification-handoff.md`](./logs/2026-09-01-f6-verification-handoff.md)
5. [`WORKLOG.md`](./WORKLOG.md)

## Integrated sequence

- `f4acec8` — Alrescha repository shell.
- `828c7bd` — evidence graph workspace.
- `bd6f68c` — Claude Code judgment/coaching enqueue surfaces, already integrated.
- `571f18d` — core screen normalization.
- `ba13ce0` — Alrescha naming migration.
- F6 commit — verification fixes, evidence, and this handoff.

## Locked contracts

- Product name: `Alrescha`.
- Desktop web only: 1280, 1440, and 1920 acceptance widths.
- GitHub/Primer-inspired structure; no trademark clone or external Primer dependency.
- Canonical semantic tokens live in `apps/web/app/styles/tokens.css`; no raw screen colors.
- Graph canvas keeps an accessible table/DOM source of truth and keyboard parity.
- Mobile UI remains deferred.
- `arr` packages, protocols, environment variables, MCP server key, storage keys, markers, repository names, and branches are compatibility identifiers, not visible-brand leftovers.
- Every future frontend task needs a dated `docs/frontend/logs/` entry and `WORKLOG.md` row.

## Verification baseline

- Public desktop matrix: 90/90 passed, light/dark, no overflow or console failures.
- Full Playwright: 119 passed, 1 explicitly deferred mobile test, 0 failed.
- Unit/integration: 130 files, 976 passed, 1 skipped.
- Lint, typecheck, production build: passed.
- `/map`: 404.9KB gzip idle; `/graph`: 222.1KB gzip idle; both under 450KB.
- Evidence root: `output/playwright/alrescha-f6-verification-2026-09-01/`.

## Do not absorb

- Modified `.omo/evidence/**` files belong to the user and were excluded from F6.
- Untracked `docs/brand/**` assets are reference-only and were excluded from F6.
- Do not rename compatibility identifiers while completing brand copy work.

## Remaining work

No F7 desktop wave is defined. Only separately authorized tracks remain: dedicated mobile frontend, compatibility-identifier migration, or final brand-asset approval.
