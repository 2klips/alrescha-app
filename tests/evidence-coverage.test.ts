import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyPlanCoverage } from "../scripts/verify-plan-coverage";

const ROOT = resolve(import.meta.dirname, "..");
const PLAN = resolve(ROOT, ".omo/plans/docshub-product-strategy.md");

describe("todo evidence coverage", () => {
  it("fails when a mapped todo evidence file does not exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arr-plan-"));
    const brokenPlan = join(directory, "broken-plan.md");
    const source = await readFile(PLAN, "utf8");
    await writeFile(
      brokenPlan,
      source.replace("task-22.png", "task-22-missing.png"),
      "utf8",
    );

    try {
      const report = await verifyPlanCoverage(brokenPlan, ROOT);

      expect(report.status).toBe("fail");
      expect(report.evidenceCount).toBe(21);
      expect(report.failures).toContain(
        "evidence todo 22: file missing or empty: .omo/evidence/docshub-product-strategy/task-22-missing.png",
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
