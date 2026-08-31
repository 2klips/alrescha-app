# Alrescha frontend track

This directory is the shared handoff surface for Claude Code and Codex frontend work.

## Read order

1. [`ALRESCHA_FRONTEND_REDESIGN_PLAN.md`](./ALRESCHA_FRONTEND_REDESIGN_PLAN.md)
2. [`WORKLOG.md`](./WORKLOG.md)
3. The latest file in [`logs/`](./logs/)
4. Existing product rules in [`../../spec/IMPLEMENTATION_GUIDE.md`](../../spec/IMPLEMENTATION_GUIDE.md), [`../../spec/WORK_SPEC.md`](../../spec/WORK_SPEC.md), and [`../../spec/BUILD_PLAN.md`](../../spec/BUILD_PLAN.md)

## Current contract

- Official product name: `Alrescha`.
- Frontend redesign scope: desktop web only.
- Visual reference: GitHub.com product/repository UI, interpreted through GitHub Primer.
- Primary design skill: Anthropic `frontend-design`.
- Supporting checks: `ui-ux-pro-max` for graph accessibility and Next.js performance.
- Every task must create a dated log and add one row to `WORKLOG.md`.
- Before starting from a separate Claude Code worktree, sync the branch containing this directory; do not copy files between worktrees by hand.

`docs/brand/ALRESCA_LOGO_DIRECTION.md` and its assets predate the `Alrescha` naming decision. They are reference-only until separately reviewed and renamed; they do not override this contract.
