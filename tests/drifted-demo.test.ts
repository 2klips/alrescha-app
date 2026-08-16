import { execFile as execFileCallback } from "node:child_process";
import { createHmac } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  normalizeRecordedArtifacts,
  normalizeRecordedContent,
  normalizeRecordedTree,
  normalizeRecordedWebhook,
} from "../packages/core/src/github/recorded-fixtures";
import { FINDING_TYPES, validateExpectedFindingsManifest } from "./helpers/drifted-demo";

const execFile = promisify(execFileCallback);
const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_ROOT = join(ROOT, "fixtures", "drifted-demo");
const RECORDINGS_ROOT = join(FIXTURE_ROOT, "recordings", "github");
const VITEST_CLI = join(
  dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
  "vitest.mjs",
);

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function directoryBytes(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  let bytes = 0;

  for (const entry of entries) {
    if (entry.name === ".reports" || entry.name === "node_modules") {
      continue;
    }

    const path = join(directory, entry.name);
    bytes += entry.isDirectory() ? await directoryBytes(path) : (await stat(path)).size;
  }

  return bytes;
}

describe("drifted-demo expected findings manifest", () => {
  it("validates all six finding types and their real source spans", async () => {
    const manifest = await validateExpectedFindingsManifest(
      await json(join(FIXTURE_ROOT, "expected-findings.json")),
      FIXTURE_ROOT,
    );

    expect(manifest.findings).toHaveLength(6);
    expect(new Set(manifest.findings.map(({ type }) => type))).toEqual(new Set(FINDING_TYPES));
    expect(manifest.findings.every(({ grade }) => grade === "inferred")).toBe(true);
  });

  it("rejects a manifest span that points outside its source file", async () => {
    const manifest = (await json(join(FIXTURE_ROOT, "expected-findings.json"))) as {
      findings: Array<{ provenance: Array<{ endLine: number; startLine: number }> }>;
    };
    const firstSpan = manifest.findings[0]?.provenance[0];

    if (!firstSpan) {
      throw new Error("Fixture manifest unexpectedly has no first span.");
    }

    firstSpan.startLine = 999;
    firstSpan.endLine = 999;

    await expect(validateExpectedFindingsManifest(manifest, FIXTURE_ROOT)).rejects.toThrow(
      /span spec\.md:999-999 is outside file/,
    );
  });
});

describe("recorded GitHub fixture replay", () => {
  it("normalizes the tree, contents, webhooks, and Actions artifacts offline", async () => {
    const tree = normalizeRecordedTree(await json(join(RECORDINGS_ROOT, "tree.json")));
    const spec = normalizeRecordedContent(
      await json(join(RECORDINGS_ROOT, "contents", "spec.json")),
    );
    const session = normalizeRecordedContent(
      await json(join(RECORDINGS_ROOT, "contents", "session.json")),
    );
    const webhooks = await Promise.all(
      ["push.json", "check-run.json", "workflow-run.json"].map(async (file) =>
        normalizeRecordedWebhook(await json(join(RECORDINGS_ROOT, "webhooks", file))),
      ),
    );
    const artifacts = normalizeRecordedArtifacts(
      await json(join(RECORDINGS_ROOT, "actions", "artifacts.json")),
    );

    expect(tree.treeSha).toBe("2222222222222222222222222222222222222222");
    expect(tree.truncated).toBe(false);
    expect(tree.paths).toContain("spec.md");
    expect(Buffer.from(spec.content, "base64").toString("utf8")).toBe(
      await readFile(join(FIXTURE_ROOT, spec.path), "utf8"),
    );
    expect(Buffer.from(session.content, "base64").toString("utf8")).toBe(
      await readFile(join(FIXTURE_ROOT, session.path), "utf8"),
    );
    expect(webhooks.map(({ kind }) => kind).sort()).toEqual(["check_run", "push", "workflow_run"]);
    expect(webhooks.every(({ commitSha }) => commitSha === "1".repeat(40))).toBe(true);
    expect(webhooks.every(({ repository }) => repository === "arr/drifted-demo")).toBe(true);
    expect(artifacts.map(({ name }) => name)).toEqual(["junit-results", "vitest-results"]);
    expect(artifacts.every(({ workflowRunId }) => workflowRunId === 8801)).toBe(true);
  });

  it("keeps each recorded webhook signature reproducible", async () => {
    const metadata = (await json(join(RECORDINGS_ROOT, "recording-metadata.json"))) as {
      webhookSecret: string;
    };

    for (const file of ["push.json", "check-run.json", "workflow-run.json"]) {
      const recording = (await json(join(RECORDINGS_ROOT, "webhooks", file))) as {
        body: unknown;
        headers: Record<string, string>;
      };
      const digest = createHmac("sha256", metadata.webhookSecret)
        .update(JSON.stringify(recording.body))
        .digest("hex");

      expect(recording.headers["x-hub-signature-256"]).toBe(`sha256=${digest}`);
    }
  });

  it("contains passing JUnit and Vitest JSON evidence for REQ-AUTH-002", async () => {
    const junit = await readFile(join(RECORDINGS_ROOT, "actions", "junit.xml"), "utf8");
    const vitest = (await json(join(RECORDINGS_ROOT, "actions", "vitest.json"))) as {
      numFailedTests: number;
      numPassedTests: number;
      success: boolean;
      testResults: Array<{ assertionResults: Array<{ fullName: string; status: string }> }>;
    };

    expect(junit).toContain('tests="1" failures="0"');
    expect(junit).toContain("REQ-AUTH-002");
    expect(vitest).toMatchObject({ success: true, numPassedTests: 1, numFailedTests: 0 });
    expect(vitest.testResults[0]?.assertionResults[0]).toMatchObject({
      status: "passed",
    });
    expect(vitest.testResults[0]?.assertionResults[0]?.fullName).toContain("REQ-AUTH-002");
  });

  it("stays below the bounded fixture size budget", async () => {
    await expect(directoryBytes(FIXTURE_ROOT)).resolves.toBeLessThan(512 * 1024);
  });
});

describe("fixture executable tests", () => {
  it(
    "runs offline and emits fresh JUnit plus JSON report artifacts",
    async () => {
      await execFile(process.execPath, [VITEST_CLI, "run", "--config", "vitest.config.ts"], {
        cwd: FIXTURE_ROOT,
        env: { ...process.env, CI: "1" },
        timeout: 30_000,
      });

      const junit = await readFile(join(FIXTURE_ROOT, ".reports", "junit.xml"), "utf8");
      const report = (await json(join(FIXTURE_ROOT, ".reports", "vitest.json"))) as {
        numFailedTests: number;
        numPassedTests: number;
        success: boolean;
      };

      expect(junit).toContain("REQ-AUTH-002");
      expect(report).toMatchObject({ success: true, numPassedTests: 1, numFailedTests: 0 });
    },
    30_000,
  );
});
