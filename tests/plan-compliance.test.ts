import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyPlanCoverage } from "../scripts/verify-plan-coverage";

const ROOT = resolve(import.meta.dirname, "..");
const PLAN = resolve(ROOT, ".omo/plans/docshub-product-strategy.md");

async function verifyMutation(mutate: (source: string) => string) {
  const directory = await mkdtemp(join(tmpdir(), "specproof-compliance-"));
  const mutatedPlan = join(directory, "mutated-plan.md");
  const source = await readFile(PLAN, "utf8");
  await writeFile(mutatedPlan, mutate(source), "utf8");

  try {
    return await verifyPlanCoverage(mutatedPlan, ROOT);
  } finally {
    await rm(directory, { recursive: true });
  }
}

describe("final plan compliance", () => {
  it("maps every shipped todo and mandatory boundary to executable proof", async () => {
    const report = await verifyPlanCoverage(PLAN, ROOT);

    expect(report).toMatchObject({
      evidenceCount: 22,
      mustHaveCount: 22,
      mustNotCount: 10,
      requiredBoundaryCount: 6,
      status: "pass",
    });
    expect(report.failures).toEqual([]);
  });

  it("never weakens or suppresses the repository quality gates", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(ROOT, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    const qualityGates = [
      packageJson.scripts.lint,
      packageJson.scripts.test,
      packageJson.scripts.typecheck,
    ].join("\n");

    expect(qualityGates).toContain("eslint . --max-warnings=0");
    expect(qualityGates).toContain("vitest run");
    expect(qualityGates).toContain("tsc --noEmit");
    expect(qualityGates).not.toMatch(
      /passWithNoTests|noEmitOnError false|--force/,
    );
  });

  it("rejects removal of any WORK_SPEC guardrail, not only the highlighted six", async () => {
    const report = await verifyMutation((source) =>
      source.replace(
        '"id": "provenance-required"',
        '"id": "unmapped-boundary"',
      ),
    );

    expect(report.status).toBe("fail");
    expect(report.failures).toContain(
      "must-not: WORK_SPEC boundary missing: provenance-required",
    );
  });

  it("rejects a proof that is labeled as neither test nor browser QA", async () => {
    const report = await verifyMutation((source) =>
      source.replace('"kind": "browser-qa"', '"kind": "document"'),
    );

    expect(report.status).toBe("fail");
    expect(report.failures).toContain(
      "must-have MH-01: invalid proof kind: document",
    );
  });
});
