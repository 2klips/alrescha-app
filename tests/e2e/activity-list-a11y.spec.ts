import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { DASHBOARD } from "../../apps/web/lib/strings";

/**
 * The activity list and the map's motion, in a browser (salvaged from the
 * unmerged Data Brain sweeps, DBR-3.4).
 *
 * The activity rows sat in `role="feed"`, which may only own articles; they
 * are buttons, so axe reported aria-required-children (critical) on `/map`
 * and `/app/map`. The suite's axe run checks colour contrast only, which is
 * why it never surfaced. And the canvas camera glided regardless of the
 * reduced-motion setting the stylesheets already honour.
 */

test("the activity rows are a list of buttons with no structure violation", async ({
  page,
}) => {
  await page.goto("/map");
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
  await page
    .getByRole("tab", { name: DASHBOARD.inspector.tabs.activity })
    .click();
  await page.getByRole("button", { name: DASHBOARD.activity.replay }).click();

  const list = page.getByRole("list", { name: DASHBOARD.activity.title });
  await expect(list.getByRole("button")).toHaveCount(5);
  await expect(list.getByRole("listitem")).toHaveCount(5);

  const results = await new AxeBuilder({ page })
    .include(".arr-activity-table")
    .withRules([
      "aria-required-children",
      "aria-required-parent",
      "list",
      "listitem",
    ])
    .analyze();
  expect(results.violations.map(({ id }) => id)).toEqual([]);
});

test("the map stage follows the reduced-motion setting, live", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map");
  const stage = page.getByTestId("brain-map-stage");
  await expect(stage).toHaveAttribute("data-motion", "reduced");

  // The setting can change while the page is open.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(stage).toHaveAttribute("data-motion", "full");
});
