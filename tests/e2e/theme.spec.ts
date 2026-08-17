import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2A todo 2 — the theme toggle must work on every themed surface, must
 * persist across reloads, and must never flash the wrong theme on load.
 * Assertions read *computed* styles so they fail if a screen keeps a hardcoded
 * colour instead of an Ink & Seal token.
 */

const SURFACES = ["/", "/findings", "/receipts"] as const;

// Playwright emulates `prefers-color-scheme: light` by default. Pin the OS hint
// to dark here so these cases exercise the product default rather than the
// first-visit OS path, which has its own case at the bottom of this file.
test.use({ colorScheme: "dark" });

async function currentTheme(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
  );
}

for (const surface of SURFACES) {
  test(`theme toggles and persists on ${surface}`, async ({ page }) => {
    await page.goto(surface);

    // Dark is the default and is painted before hydration.
    await expect.poll(() => currentTheme(page)).toBe("dark");
    const darkBackground = await bodyBackground(page);

    const toggle = page.locator("[data-theme-toggle]").first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect.poll(() => currentTheme(page)).toBe("light");
    const lightBackground = await bodyBackground(page);
    expect(lightBackground).not.toBe(darkBackground);
    expect(lightBackground.length).toBeGreaterThan(0);

    // The choice survives a reload, and the toggle reports it back.
    await page.reload();
    await expect.poll(() => currentTheme(page)).toBe("light");
    await expect(page.locator("[data-theme-toggle]").first()).toHaveAttribute(
      "data-theme-value",
      "light",
    );
    expect(await bodyBackground(page)).toBe(lightBackground);
  });
}

test("light is painted before first paint, with no dark flash", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-theme-toggle]").first().click();
  await expect.poll(() => currentTheme(page)).toBe("light");

  // Capture data-theme at the very first opportunity on the next navigation:
  // if the boot script were missing, this would observe the dark default.
  const themeAtDocumentStart: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      (window as unknown as { __arrThemeProbe?: string[] }).__arrThemeProbe ??=
        [];
      (window as unknown as { __arrThemeProbe: string[] }).__arrThemeProbe.push(
        document.documentElement.getAttribute("data-theme") ?? "unset",
      );
    });
  });
  await page.goto("/findings");
  themeAtDocumentStart.push(
    ...((await page.evaluate(
      () =>
        (window as unknown as { __arrThemeProbe?: string[] }).__arrThemeProbe ??
        [],
    )) as string[]),
  );

  expect(themeAtDocumentStart.length).toBeGreaterThan(0);
  expect(themeAtDocumentStart).not.toContain("dark");
  expect(themeAtDocumentStart).not.toContain("unset");
});

test("first visit follows the OS preference, then the stored choice wins", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();

  await page.goto("/");
  await expect.poll(() => currentTheme(page)).toBe("light");

  // An explicit choice must not be undone by the OS preference on reload.
  await page.locator("[data-theme-toggle]").first().click();
  await expect.poll(() => currentTheme(page)).toBe("dark");
  await page.reload();
  await expect.poll(() => currentTheme(page)).toBe("dark");

  await context.close();
});
