# F0 desktop baseline and migration inventory

**Completed:** 2026-09-01

**Captured:** 2026-08-31

**Agent:** Codex

**Starting commit:** `68269d98e24dbeb5fc0bc83d4b73d9c196a7f625`

## Objective and acceptance

- Capture `/map` at 1280×720, 1440×900, and 1920×1080 in both themes.
- Identify concrete layout, typography, graph, and theme defects.
- Inventory name migration and frontend ownership.
- Record build, test, contrast, render, and bundle baselines.
- Do not change product code or overwrite another agent's evidence.

All five objectives completed.

## Starting state

- `main` was one local documentation commit ahead of `origin/main`.
- Claude Code worktree `claude/awesome-lehmann-a47e28` was five commits behind `main` with active Claude processes. It was not modified.
- Seventeen `.omo/evidence` files and untracked `docs/brand/ALRESCA_*` assets were already present. They were preserved.
- Port 3000 belonged to `C:\Users\axz14\Desktop\Project\30m\frontend`; it was not stopped. The baseline server used port 3010.

## Skill influence

- `frontend-design`: forced a brief-specific critique rather than a palette swap. The retained signature is the evidence dependency canvas; decorative HUD/glow is rejected.
- `ui-ux-pro-max`: contributed the accessible list/table fallback, non-color graph cues, reduced-motion requirement, and heavy-component bundle discipline. Generic landing-page, mobile, gold-accent, and all-monospace recommendations were rejected as brief conflicts.
- `playwright`: drove the real Chromium captures, stable six-second graph settle, targeted axe injection, and reload measurements.

## Outputs

- `docs/frontend/BASELINE_2026-08-31.md`
- `docs/frontend/NAMING_MIGRATION_INVENTORY.md`
- Six PNG files under `output/playwright/alrescha-f0-baseline-2026-08-31/`
- Updated frontend README, plan progress, and worklog.

No product source, configuration, dependency, specification, or pre-existing evidence file changed.

## Commands and results

- `pnpm lint`: initial run failed only because two temporary Playwright audit functions were inside the lint scope. The temporary files were deleted; rerun passed.
- `pnpm typecheck`: passed across six workspace projects.
- `pnpm test`: 125 files passed; 941 passed, 1 skipped.
- `pnpm build`: passed; all Next.js routes compiled.
- `node --import tsx scripts/measure-route-bundle.ts --budget 450 /map`: passed at 409.4KB gzip idle payload, 31 chunks.
- Playwright CLI screenshots: six captures completed.
- Targeted axe color contrast: zero definite violations in light/dark; 40 pass nodes and 67 incomplete nodes per theme.
- Development reload sample: canvas-visible median 422ms over five runs at 1440×900.

Full Playwright was not rerun because its fixed port 3000 belonged to another project and the suite writes into the user's already-modified `.omo/evidence` files. This limitation is explicit; it is not reported as a pass.

## Key decisions

1. F1 starts from a 1280 desktop grid.
2. GitHub/Primer-like typography is intentional and brief-driven; monospace becomes data-only.
3. The force panel leaves the permanent canvas layer.
4. Graph chrome, plot rectangle, and inspector become separate layout regions.
5. No new UI or graph dependency while `/map` consumes 91% of its current gzip budget.
6. User-visible `Arr` changes before compatibility-sensitive `@arr`, `ARR_*`, `arr://`, `.arr/`, and schema identifiers.

## Deferred and next task

- Full E2E rerun in an isolated checkout or after port/evidence ownership is resolved.
- F1 design-system proposal: exact tokens, typography, layout grid, component states, and two-pass self-critique.
- Product code implementation remains unstarted.
