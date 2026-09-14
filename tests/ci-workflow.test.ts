import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The CI workflow as the evidence path depends on it (Phase 4 Wave C todo
 * 18, 2026-09-14). `GitHubCiEvidenceSource` reads a run's *artifacts* and
 * classifies `.xml` entries as JUnit; the workflow therefore has to write a
 * JUnit report and upload it as an artifact, on failure too — the check
 * run's conclusion, not the upload, is what withholds the grade. These pins
 * keep an edit to the workflow from silently disconnecting the product's
 * own repository from the `verified` grade.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const workflow = readFileSync(
  resolve(repoRoot, ".github/workflows/ci.yml"),
  "utf8",
);

describe("the CI workflow feeds the evidence path", () => {
  it("runs on every push, which is the event the analysis follows", () => {
    expect(workflow).toContain("\non:\n  push:\n");
  });

  it("runs the gate with a frozen lockfile", () => {
    for (const step of [
      "pnpm install --frozen-lockfile",
      "pnpm lint",
      "pnpm typecheck",
    ]) {
      expect(workflow).toContain(`- run: ${step}`);
    }
  });

  it("writes a JUnit report and uploads it as an artifact even when tests fail", () => {
    expect(workflow).toContain(
      "vitest run --reporter=default --reporter=junit --outputFile.junit=reports/vitest-junit.xml",
    );
    const upload = workflow.slice(workflow.indexOf("upload-artifact"));
    expect(workflow).toContain(
      "        if: always()\n        uses: actions/upload-artifact@v4\n",
    );
    expect(upload).toContain("path: reports/vitest-junit.xml");
    expect(upload).toContain("if-no-files-found: error");
  });

  it("keeps the report out of the tree without hiding docs/reports", () => {
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
    const rules = gitignore.split(/\r?\n/);
    expect(rules).toContain("/reports/");
    // An unanchored `reports/` would ignore the deployment handoffs too.
    expect(rules).not.toContain("reports/");
  });

  it("asks for nothing beyond reading the repository", () => {
    expect(workflow).toContain("permissions:\n  contents: read\n");
    expect(workflow).not.toMatch(/contents: write|secrets\./);
  });
});
