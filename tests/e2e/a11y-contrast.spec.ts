import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";

/**
 * Phase 2A todo 9 — axe-core WCAG 2.1 AA colour-contrast audit.
 *
 * The plan asks for "axe-core contrast checks on dashboard/findings in both
 * themes (AA for text on bg/surface)". axe's `color-contrast` rule is the only
 * rule enabled here on purpose: the wider ruleset covers structural a11y that
 * this restyle phase did not touch, and mixing it in would make a contrast
 * regression hard to see.
 *
 * Two scoping decisions worth knowing:
 *  - the WebGL canvas and its transparent DOM hit layer are excluded. axe reads
 *    computed CSS, and a transparent button stacked over a canvas has no
 *    computable background, so axe reports `incomplete`, not a real failure.
 *    Node labels are painted by Pixi into the canvas and are outside axe's
 *    reach entirely — they are covered by the LOD unit tests instead.
 *  - `incomplete` results (axe could not determine the background) are recorded
 *    in the report but do not fail the gate; only definite `violations` do.
 *
 * The JSON report each run writes under `.omo/evidence/phase2a/task-9/` is the
 * evidence artefact.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2a/task-9");

const SURFACES = [
  ["dashboard", "/"],
  ["findings", "/findings"],
] as const;

const THEMES = ["dark", "light"] as const;

/** Pixi paints into a canvas; axe cannot read pixels, so it is out of scope. */
const EXCLUDED = [
  '[data-testid="brain-map-stage"]',
  '[data-testid="brain-map-hits"]',
  ".local-graph-canvas",
  "canvas",
];

test.use({ colorScheme: "dark" });

async function themeOf(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

interface ContrastNode {
  html: string;
  message: string;
  target: string;
}

function summarise(
  nodes: readonly {
    any?: readonly { message?: string }[];
    html: string;
    target: readonly unknown[];
  }[],
): ContrastNode[] {
  return nodes.map((node) => ({
    html: node.html.slice(0, 220),
    message: node.any?.[0]?.message ?? "",
    target: node.target.map(String).join(" "),
  }));
}

for (const [surface, route] of SURFACES) {
  for (const theme of THEMES) {
    test(`${surface} has no AA contrast violations in ${theme}`, async ({
      page,
    }) => {
      await mkdir(EVIDENCE, { recursive: true });

      await page.addInitScript(
        ([key, value]: readonly string[]) =>
          window.localStorage.setItem(key as string, value as string),
        [THEME_STORAGE_KEY, theme] as const,
      );
      await page.goto(route);
      await expect.poll(() => themeOf(page)).toBe(theme);
      // Let the graph mount and the HUD settle so transient skeletons are not
      // what gets audited.
      await page.waitForTimeout(1_500);

      let builder = new AxeBuilder({ page })
        .withTags(["wcag2aa", "wcag21aa"])
        .withRules(["color-contrast"]);
      for (const selector of EXCLUDED) builder = builder.exclude(selector);
      const results = await builder.analyze();

      const violations = results.violations.flatMap((violation) =>
        summarise(violation.nodes),
      );
      const incomplete = results.incomplete.flatMap((entry) =>
        summarise(entry.nodes),
      );

      await writeFile(
        path.join(EVIDENCE, `axe-contrast-${surface}-${theme}.json`),
        `${JSON.stringify(
          {
            incomplete,
            incompleteCount: incomplete.length,
            passes: results.passes.reduce(
              (sum, entry) => sum + entry.nodes.length,
              0,
            ),
            route,
            theme,
            violationCount: violations.length,
            violations,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      expect(
        violations,
        `axe color-contrast violations on ${route} (${theme})`,
      ).toEqual([]);
    });
  }
}
