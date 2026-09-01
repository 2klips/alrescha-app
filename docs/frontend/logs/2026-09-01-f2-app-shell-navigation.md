# F2 app shell and navigation

## Objective and acceptance

Replace the permanent application sidebar with the locked GitHub-style desktop repository shell and apply the F1 token contract. Acceptance required the 56/48/40px shell stack, active horizontal tabs, repository context, command palette, theme parity, no desktop horizontal overflow, system fonts, and green repository gates. Mobile remains outside this track.

Result: complete. Every demo/workspace route using the shared route-group layout now inherits the new shell. Settings owns a local left navigation; graph-internal rails remain F3 work.

## Starting state

- Start SHA: `3e6a5d8c138bc206f28defa7c1e43cc102830cad` on `main`.
- The worktree was already dirty with 17 modified `.omo/evidence/**` files plus untracked `docs/brand/ALRESCA_LOGO_DIRECTION.md`, `docs/brand/alresca-concepts/**`, and `docs/brand/alresca-higgsfield/**` assets. They were not edited, staged, or claimed by F2.
- Claude Code worktree `claude/awesome-lehmann-a47e28` was inspected read-only and not modified.

## Decisions applied

- GitHub repository structure is the reference: quiet global header, repository identity row, horizontal current-route tabs, then route content.
- No permanent global sidebar. Local left navigation is reserved for settings and similarly deep route-local information architecture.
- System UI sans and system monospace replace Pretendard/IBM Plex downloads. Monospace remains data-only.
- Light and dark themes share geometry, radii, focus treatment, and component hierarchy.
- `frontend-design` drove the restrained repository-tool visual direction. `ui-ux-pro-max` supplied active-navigation, sticky-offset, and 2px focus checks. `vercel:nextjs` and `vercel:react-best-practices` kept data-loading in the server shell and isolated pathname/theme/palette behavior in small client leaves.
- No dependency was added. Legacy token aliases and compatibility-sensitive `arr-*` storage/package/schema identifiers remain until F5.

## Implementation

- Replaced `apps/web/app/styles/tokens.css` with the canonical Alrescha semantic/color/type/layout scale and retained documented aliases.
- Reworked `base.css`, `primitives.css`, `themes.css`, `shell.css`, and graph viewport offset for the new 144px sticky shell stack.
- Removed webfont imports/dependencies and the obsolete sidebar boot path.
- Replaced `SideNav` with `ShellHeader`, `RepositoryHeader`, `RepositoryTabs`, and settings-only `SettingsLocalNav`.
- Added skip navigation, current-route `aria-current`, command-palette focus containment and focus return, global theme/account actions, and repository branch/SHA/receipt context.
- Changed visible product shell/metadata strings to `Alrescha`. Known residual user-visible `Arr` strings remain tracked for F5; compatibility identifiers were not renamed.
- Added `tests/alrescha-shell.test.ts` and updated token, theme, Korean-copy, shell, dashboard, and library checks. Updated the final-plan proof string to the renamed repository-shell test.

## Verification

Commands and exact results:

- `pnpm test`: first full run exposed one stale final-plan proof string after the test rename. The proof mapping was corrected. Final run: 126 test files passed; 949 tests passed, 1 skipped, 0 failed.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed across the root and six workspace projects.
- `pnpm build`: passed; Next.js 16.3 compiled and generated all routes.
- `node --import tsx scripts/measure-route-bundle.ts --budget 450 /map`: passed. Idle payload 402.7KB gzip across 29 chunks, down from the F0 409.4KB; CSS 17.9KB gzip; 0 font files.
- Playwright CLI geometry at 1280×720: global header 56px, repository header 48px, tabs 40px, content top 144px, active tab `Graph`, no horizontal overflow.
- Playwright CLI warm development reloads to visible graph canvas: 319/325/327/335/337ms; median 327ms versus F0 422ms.
- Command palette: initial focus enters search; Shift+Tab remains inside; Escape closes and returns focus to the expanded search trigger.
- Browser console: no errors or warnings; only React DevTools and development HMR messages.

The full Playwright suite was not run because its fixed port 3000 belonged to another project and the suite writes into the user's already-modified `.omo/evidence` files. Targeted real-browser verification used the isolated `alrescha-f2` CLI session on port 3010. Full matrix execution remains F6.

## Visual evidence

Before: `output/playwright/alrescha-f0-baseline-2026-08-31/`.

After:

- `output/playwright/alrescha-f2-shell-2026-09-01/map-light-1280.png`
- `output/playwright/alrescha-f2-shell-2026-09-01/map-dark-1280.png`
- `output/playwright/alrescha-f2-shell-2026-09-01/map-light-1440.png`
- `output/playwright/alrescha-f2-shell-2026-09-01/map-dark-1440.png`
- `output/playwright/alrescha-f2-shell-2026-09-01/map-light-1920.png`
- `output/playwright/alrescha-f2-shell-2026-09-01/map-dark-1920.png`

All six captures were inspected. Shell layout, active state, contrast, and theme geometry are consistent. Visible graph title/legend collisions, permanent repo summary rail, inspector treatment, and force-control panel are pre-existing graph-workspace defects intentionally deferred to F3.

## Deferred and next task

1. F3 next: graph workspace grid, toolbar/filter/legend, right inspector, force-control popover, accessible relationship list, state surfaces, label collision fixes, and large-fixture performance.
2. F4 pending: migrate core screens and retire legacy visual CSS after consumer removal.
3. F5 pending: finish visible naming migration and make explicit compatibility decisions for technical identifiers/assets.
4. F6 pending: full desktop Playwright/axe matrix, before/after review, regression closure, mobile-deferral note, and Claude Code handoff.
