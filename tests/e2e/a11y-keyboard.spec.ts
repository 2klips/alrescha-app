import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Phase 2B todo 14 — OQ-006: the keyboard-traversal cost of the canvas hit
 * layer, measured. Before the roving tabindex, HIT_TARGET_LIMIT = 600 meant
 * up to 600 tab stops. Now the layer is ONE stop: Tab enters, arrow keys walk
 * the nodes, Tab leaves. The measurement JSON is the evidence artefact.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2b/todo-14");

test("the hit layer costs exactly one tab stop, with arrow-key node traversal", async ({
  page,
}) => {
  await mkdir(EVIDENCE, { recursive: true });
  await page.goto("/");
  await page.waitForSelector(".brain-map-hit");

  const nodeCount = await page.locator(".brain-map-hit").count();
  // Exactly one button is in the tab order — the roving stop.
  await expect(page.locator('.brain-map-hit[tabindex="0"]')).toHaveCount(1);
  expect(
    await page.locator('.brain-map-hit[tabindex="-1"]').count(),
  ).toBe(nodeCount - 1);

  // Enter the layer and walk it with arrows; focus moves node to node.
  await page.locator('.brain-map-hit[tabindex="0"]').focus();
  const firstId = await page.evaluate(
    () => document.activeElement?.getAttribute("data-node-id") ?? null,
  );
  const traversalStart = Date.now();
  // Never a multiple of nodeCount, so the walk cannot wrap back to the start.
  const steps = Math.min(Math.max(nodeCount - 1, 1), 25);
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  const traversalMs = Date.now() - traversalStart;
  const afterArrows = await page.evaluate(
    () => document.activeElement?.getAttribute("data-node-id") ?? null,
  );
  expect(afterArrows).not.toBeNull();
  if (nodeCount > 1) {
    expect(afterArrows).not.toBe(firstId);
  }
  // Home returns to the first target deterministically.
  await page.keyboard.press("Home");
  const afterHome = await page.evaluate(
    () => document.activeElement?.getAttribute("data-node-id") ?? null,
  );

  // A single Tab from inside the layer leaves it — the 600-stop wall is gone.
  await page.keyboard.press("Tab");
  const escapedInOneTab = await page.evaluate(
    () => !document.activeElement?.classList.contains("brain-map-hit"),
  );
  expect(escapedInOneTab).toBe(true);

  await writeFile(
    path.join(EVIDENCE, "keyboard-traversal.json"),
    `${JSON.stringify(
      {
        arrowStepsMeasured: steps,
        arrowTraversalMs: traversalMs,
        hitTargetLimit: 600,
        nodeCount,
        note: "roving tabindex: tab stops in the layer = 1 (was up to 600); arrow keys traverse nodes",
        perStepMs: Math.round((traversalMs / Math.max(steps, 1)) * 100) / 100,
        returnedHomeTo: afterHome,
        tabStopsInLayer: 1,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});
