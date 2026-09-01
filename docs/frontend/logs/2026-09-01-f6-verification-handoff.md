# F6 verification and Claude Code handoff

## Objective and acceptance

Close the Alrescha desktop redesign with second-pass visual, interaction, accessibility, regression, build, and performance verification. Acceptance required the 1280×720, 1440×900, and 1920×1080 desktop matrix in both themes; current graph and command-palette interactions; full automated gates; regression closure; durable evidence; and a Claude Code handoff that preserves compatibility and concurrent work boundaries.

Result: complete. F0–F6 desktop frontend work is finished with no failing relevant gate.

## Starting state and isolation

- Start SHA: `ba13ce04a51fdb7a6e5b02e1e20bcbe955ab9688` on `main`.
- Seventeen modified `.omo/evidence/**` files and untracked `docs/brand/**` assets were already user-owned. They were not edited or staged.
- Port 3000 belonged to another project. Public visual verification used this repository on port 3010.
- The full Playwright suite normally rewrites `.omo/evidence/**`; it ran in isolated worktree `app-f6-e2e` on port 3012. Only the generated axe JSON reports were copied to the F6 output directory.
- Claude Code worktree `claude/awesome-lehmann-a47e28` remained clean and untouched at `69372a1`. That commit is an ancestor of `main`; before the F6 commit, the branch was 12 commits behind and 0 ahead.

## Browser and visual verification

Browser-plugin DOM verification covered 15 public routes across three widths and two themes: 90 checks total. Every check had one visible `h1`, one main region, matching theme, no blank screen, no Next.js error overlay, no error text, and no horizontal overflow. Browser console result: 0 errors and 0 warnings.

Routes: `/`, `/map`, `/graph?node=req-auth`, `/commits`, `/findings`, `/lint`, `/receipts`, `/progress`, `/library`, `/inspection`, `/team`, `/harness`, `/overview`, `/onboarding`, and `/auth/login`.

Interaction verification on `/map` passed:

- Command palette opened, closed with Escape, and returned focus to the search trigger.
- Graph navigation reached `/map`.
- `L` switched Graph → Table; the first row was `Tenant-safe auth`.
- ArrowDown moved focus to `Idempotent webhooks`.
- `L` switched Table → Graph and restored the canvas.

The Browser-plugin screenshot transport clipped captures above approximately 1248px even while the page DOM reported the requested viewport. Exact-size visual evidence therefore used Playwright CLI. All eight files were inspected at their native dimensions:

- `output/playwright/alrescha-f6-verification-2026-09-01/map-1280-dark.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/map-1280-light.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/map-1440-dark.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/map-1440-light.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/map-1920-dark.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/map-1920-light.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/home-1440-light.png`
- `output/playwright/alrescha-f6-verification-2026-09-01/onboarding-1440-light.png`

Machine-readable evidence:

- `output/playwright/alrescha-f6-verification-2026-09-01/desktop-matrix.json`
- `output/playwright/alrescha-f6-verification-2026-09-01/interaction-report.json`
- `output/playwright/alrescha-f6-verification-2026-09-01/axe/` — 32 clean light/dark contrast reports.

## Regressions closed

- Dark library search action used `--accent-fg` as a filled background and produced only 3.09:1 white-text contrast. Filled library/harness actions now use `--accent-emphasis`; axe passes in both themes.
- Public map E2E tests still targeted the removed floating HUD, always-visible activity feed, and hub rail. Tests now exercise the F3 workspace grid, layout popover, inspector activity tab, and relationship selection.
- Commit empty-state coverage now targets the shared `ProductEmptyState` contract.
- Authenticated MCP and local-ingest tests no longer hardcode port 3000; they derive the active server origin from the browser page.
- Wide-only graph controls are tested at the 1440 desktop acceptance width. The 1280/1440/1920 plot/inspector geometry remains separately covered.
- The prior 420px mobile HUD test is explicitly skipped because mobile acceptance is deferred by the locked project scope.

## Automated verification

- Browser matrix: 90 passed, 0 failed; 0 console errors/warnings.
- Playwright E2E: 119 passed, 1 mobile-only test skipped, 0 failed.
- Axe: 32 light/dark surface reports, 0 contrast violations.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed across all workspace projects with typecheck scripts.
- `pnpm test`: 130 files passed; 976 tests passed, 1 existing skipped, 0 failed.
- `pnpm build`: passed; Next.js compiled and generated 29 static pages plus dynamic routes.
- `/map` idle bundle: 404.9KB gzip; 450KB budget passed.
- `/graph` idle bundle: 222.1KB gzip; 450KB budget passed.
- Changed-file Prettier check: passed.
- `git diff --check`: passed.

## Deferred and remaining work

No active desktop redesign wave remains.

1. Mobile-specific UI and acceptance remain deferred until a dedicated mobile project is approved.
2. Compatibility-sensitive `arr` identifiers remain unchanged until a separate migration is approved.
3. User-owned `docs/brand/**` reference assets still need independent naming/identity review before product use.

Claude Code continuation instructions are in [`../ALRESCHA_F6_HANDOFF.md`](../ALRESCHA_F6_HANDOFF.md).
