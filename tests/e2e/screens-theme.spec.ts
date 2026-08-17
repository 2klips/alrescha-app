import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";

/**
 * Phase 2A todo 8 — every remaining screen, in both themes.
 *
 * The plan's acceptance is "Playwright walks each screen in both themes without
 * unthemed-color lint violations". The hex lint rule covers source files; what
 * it cannot see is a screen that renders the *browser's* defaults because a rule
 * was never written for it. So each screen is asserted to actually re-theme —
 * its painted colours must change when the stored preference flips — and to
 * carry no element left on the user agent's default black text.
 *
 * The screenshots this produces are the todo's evidence artefact.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2a/task-8");

// Pin the OS hint so the run starts from the product default rather than the
// first-visit `prefers-color-scheme` path, which has its own case in theme.spec.
test.use({ colorScheme: "dark" });

/**
 * Public routes. Two families are missing on purpose:
 *  - `/app/*` needs a live Supabase session.
 *  - `/auth/*` answers 500 in this environment, before any of this phase's
 *    changes reach it — the theme boot script never runs, so there is nothing
 *    to walk.
 * Both are covered by vitest component tests here and belong to Wave 4's
 * authenticated browser walk. See OQ-008.
 */
const SCREENS = [
  ["dashboard", "/"],
  ["overview", "/overview"],
  ["commits", "/commits"],
  ["findings", "/findings"],
  ["lint", "/lint"],
  ["receipts", "/receipts"],
  ["progress", "/progress"],
  ["harness", "/harness"],
  ["inspection", "/inspection"],
  ["library", "/library"],
  ["team", "/team"],
  ["graph-detail", "/graph?node=req-auth"],
  ["onboarding", "/onboarding"],
  ["not-found", "/route-that-does-not-exist"],
] as const;

/** Every distinct painted colour on the page, as computed values. */
async function paintedColors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("*"))) {
      const style = getComputedStyle(element);
      seen.add(style.color);
      if (style.backgroundColor !== "rgba(0, 0, 0, 0)")
        seen.add(style.backgroundColor);
    }
    return [...seen].sort();
  });
}

/**
 * Elements still painted in the user agent's default text colour. `--text` is a
 * near-white in dark and a near-black in light — neither is pure black, so an
 * exact match here means some element never got a rule.
 */
async function unthemedTextNodes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .filter((element) => getComputedStyle(element).color === "rgb(0, 0, 0)")
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
      .slice(0, 10),
  );
}

async function themeOf(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

for (const [name, route] of SCREENS) {
  test(`${name} is fully themed in dark and light`, async ({ page }) => {
    await mkdir(EVIDENCE, { recursive: true });

    await page.goto(route);
    await expect.poll(() => themeOf(page)).toBe("dark");
    await page.waitForTimeout(500);

    const darkColors = await paintedColors(page);
    expect(darkColors.length).toBeGreaterThan(2);
    expect(await unthemedTextNodes(page)).toEqual([]);
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, `${name}-dark.png`),
    });

    // Not every surface carries the header toggle, so the stored preference is
    // flipped directly — the same value the toggle and the boot script use.
    await page.evaluate(
      (key: string) => window.localStorage.setItem(key, "light"),
      THEME_STORAGE_KEY,
    );
    await page.reload();
    await expect.poll(() => themeOf(page)).toBe("light");
    await page.waitForTimeout(500);

    const lightColors = await paintedColors(page);
    // A screen that does not re-theme is a screen with hardcoded colours.
    expect(lightColors).not.toEqual(darkColors);
    expect(await unthemedTextNodes(page)).toEqual([]);
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, `${name}-light.png`),
    });
  });
}
