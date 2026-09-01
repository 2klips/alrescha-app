# Alrescha frontend track

This directory is the shared handoff surface for Claude Code and Codex frontend work.

## Read order

1. [`ALRESCHA_FRONTEND_REDESIGN_PLAN.md`](./ALRESCHA_FRONTEND_REDESIGN_PLAN.md)
2. [`ALRESCHA_DESIGN_SYSTEM.md`](./ALRESCHA_DESIGN_SYSTEM.md)
3. [`COMPONENT_STATE_MATRIX.md`](./COMPONENT_STATE_MATRIX.md)
4. [`F1_RESEARCH_2026-09-01.md`](./F1_RESEARCH_2026-09-01.md)
5. [`BASELINE_2026-08-31.md`](./BASELINE_2026-08-31.md)
6. [`NAMING_MIGRATION_INVENTORY.md`](./NAMING_MIGRATION_INVENTORY.md)
7. [`WORKLOG.md`](./WORKLOG.md)
8. The latest file in [`logs/`](./logs/)
9. Existing product rules in [`../../spec/IMPLEMENTATION_GUIDE.md`](../../spec/IMPLEMENTATION_GUIDE.md), [`../../spec/WORK_SPEC.md`](../../spec/WORK_SPEC.md), and [`../../spec/BUILD_PLAN.md`](../../spec/BUILD_PLAN.md)

## Current contract

- Official product name: `Alrescha`.
- Frontend redesign scope: desktop web only.
- Visual reference: GitHub.com product/repository UI, interpreted through GitHub Primer.
- Primary design skill: Anthropic `frontend-design`.
- Supporting checks: `ui-ux-pro-max` for graph accessibility and Next.js performance.
- Every task must create a dated log and add one row to `WORKLOG.md`.
- Before starting from a separate Claude Code worktree, sync the branch containing this directory; do not copy files between worktrees by hand.

## Progress

- F0 contract and desktop baseline: complete.
- F1 desktop design system: complete.
- F2 app shell and navigation: complete.
- F3 evidence graph workspace: complete.
- F4 core product screens: next.
- F5 naming migration: pending.
- F6 second-pass verification and handoff: pending.

`docs/brand/ALRESCA_LOGO_DIRECTION.md` and its assets predate the `Alrescha` naming decision. They are reference-only until separately reviewed and renamed; they do not override this contract.
