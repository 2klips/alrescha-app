import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ingestCiTestReports,
  resolveReportedPath,
} from "../packages/core/src/index";
import { GitHubCiEvidenceSource } from "../apps/worker/src/github-ci-evidence-source";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

const ACTIONS_ROOT = resolve(
  import.meta.dirname,
  "../fixtures/drifted-demo/recordings/github/actions",
);

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ACTIONS_ROOT, name), "utf8")) as T;
}

const passingCheck = (headSha: string) => ({
  conclusion: "success",
  head_sha: headSha,
  name: "fixture-tests",
  status: "completed",
});

describe("CI test report evidence ingestion", () => {
  // The title is pinned by `.omo/plans/docshub-product-strategy.md` (MH-11).
  it("maps recorded JUnit and Vitest reports to one verified same-commit requirement", async () => {
    const artifacts = await json<{
      artifacts: Array<{
        id: number;
        name: string;
        workflow_run: { head_sha: string };
      }>;
    }>("artifacts.json");
    const checkRuns = await json<{
      check_runs: Array<{
        conclusion: string | null;
        head_sha: string;
        name: string;
        status: string;
      }>;
    }>("check-runs.json");
    const analyzedCommitSha = artifacts.artifacts[0]!.workflow_run.head_sha;
    const result = ingestCiTestReports({
      analyzedCommitSha,
      checkRuns: checkRuns.check_runs,
      reports: [
        {
          artifactId: artifacts.artifacts[0]!.id,
          artifactName: artifacts.artifacts[0]!.name,
          content: await readFile(resolve(ACTIONS_ROOT, "junit.xml"), "utf8"),
          format: "junit",
          headSha: artifacts.artifacts[0]!.workflow_run.head_sha,
        },
        {
          artifactId: artifacts.artifacts[1]!.id,
          artifactName: artifacts.artifacts[1]!.name,
          content: await readFile(resolve(ACTIONS_ROOT, "vitest.json"), "utf8"),
          format: "vitest-json",
          headSha: artifacts.artifacts[1]!.workflow_run.head_sha,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.guidance).toBeNull();
    // Two reports, one file: both name `tests/session.test.ts`, so they are
    // one claim with two sources.
    expect(result.testFiles).toHaveLength(1);
    expect(result.testFiles[0]).toMatchObject({
      grade: "verified",
      reason: "Passing parsed reports and checks match the analyzed commit.",
      requirementIds: ["REQ-AUTH-002"],
      testFile: "tests/session.test.ts",
      verdict: "supports",
    });
    expect(
      result.testFiles[0]?.sources.map(({ artifactId, format, headSha }) => ({
        artifactId,
        format,
        headSha,
      })),
    ).toEqual([
      { artifactId: 7001, format: "junit", headSha: analyzedCommitSha },
      { artifactId: 7002, format: "vitest-json", headSha: analyzedCommitSha },
    ]);
    expect(JSON.stringify(result)).not.toContain("<?xml");
    expect(JSON.stringify(result)).not.toContain("assertionResults");
  });

  /**
   * The file is the evidence; the code in a test's name is what it supports
   * (2026-09-14). A suite that names no requirement — this repository's own,
   * for one — still has files that ran and passed, and that is the claim.
   */
  it("grades a test file whose names carry no requirement code", async () => {
    const analyzedCommitSha = "1".repeat(40);
    const result = ingestCiTestReports({
      analyzedCommitSha,
      checkRuns: [passingCheck(analyzedCommitSha)],
      reports: [
        {
          artifactId: 7010,
          artifactName: "vitest-junit",
          content: `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="2" failures="0" errors="0" time="0.01">
  <testsuite name="tests/alrescha-shell.test.ts" tests="2" failures="0" errors="0" skipped="0" time="0.01">
    <testcase classname="tests/alrescha-shell.test.ts" name="Alrescha F2 repository shell &gt; renders the three horizontal chrome bands in order" time="0.001"></testcase>
    <testcase classname="tests/alrescha-shell.test.ts" name="Alrescha F2 repository shell &gt; keeps route state explicit and tree-local" time="0.001"></testcase>
  </testsuite>
</testsuites>`,
          format: "junit",
          headSha: analyzedCommitSha,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.guidance).toBeNull();
    expect(result.testFiles).toEqual([
      expect.objectContaining({
        grade: "verified",
        requirementIds: [],
        testFile: "tests/alrescha-shell.test.ts",
        verdict: "supports",
      }),
    ]);
    expect(result.testFiles[0]?.sources.map(({ testName }) => testName)).toEqual([
      "Alrescha F2 repository shell > renders the three horizontal chrome bands in order",
      "Alrescha F2 repository shell > keeps route state explicit and tree-local",
    ]);
  });

  /**
   * A skipped case is not a failure. It used to be counted as one at the
   * report level, which un-verified every file in a run over a single
   * `it.skip`; now it costs only the file it is in, and says why.
   */
  it("leaves a file with a skipped case unknown and the other files verified", async () => {
    const analyzedCommitSha = "1".repeat(40);
    const result = ingestCiTestReports({
      analyzedCommitSha,
      checkRuns: [passingCheck(analyzedCommitSha)],
      reports: [
        {
          artifactId: 7011,
          artifactName: "vitest-junit",
          content: `<testsuites name="vitest tests" tests="3" failures="0" errors="0">
  <testsuite name="tests/a.test.ts" tests="1" failures="0" errors="0" skipped="0">
    <testcase classname="tests/a.test.ts" name="a passes"></testcase>
  </testsuite>
  <testsuite name="tests/b.test.ts" tests="2" failures="0" errors="0" skipped="1">
    <testcase classname="tests/b.test.ts" name="b passes"></testcase>
    <testcase classname="tests/b.test.ts" name="b is skipped"><skipped/></testcase>
  </testsuite>
</testsuites>`,
          format: "junit",
          headSha: analyzedCommitSha,
        },
      ],
    });

    expect(result.guidance).toBeNull();
    expect(
      result.testFiles.map(({ grade, reason, testFile, verdict }) => ({
        grade,
        reason,
        testFile,
        verdict,
      })),
    ).toEqual([
      {
        grade: "verified",
        reason: "Passing parsed reports and checks match the analyzed commit.",
        testFile: "tests/a.test.ts",
        verdict: "supports",
      },
      {
        grade: "inferred",
        reason: "Mapped test case was skipped.",
        testFile: "tests/b.test.ts",
        verdict: "unknown",
      },
    ]);
  });

  it("keeps a stale-commit report inferred with an explicit reason and one guidance banner", async () => {
    const analyzedCommitSha = "1".repeat(40);
    const staleCommitSha = "2".repeat(40);
    const result = ingestCiTestReports({
      analyzedCommitSha,
      checkRuns: [passingCheck(analyzedCommitSha)],
      reports: [
        {
          artifactId: 7002,
          artifactName: "vitest-results",
          content: await readFile(resolve(ACTIONS_ROOT, "vitest.json"), "utf8"),
          format: "vitest-json",
          headSha: staleCommitSha,
        },
      ],
    });

    expect(result.testFiles).toHaveLength(1);
    expect(result.testFiles[0]).toMatchObject({
      grade: "inferred",
      reason: `Report commit ${staleCommitSha} does not match analyzed commit ${analyzedCommitSha}.`,
      requirementIds: ["REQ-AUTH-002"],
      testFile: "tests/session.test.ts",
      verdict: "unknown",
    });
    expect(result.guidance).toEqual({
      kind: "connect-ci-reports",
      message:
        "Connect passing CI test reports for the analyzed commit to verify test evidence.",
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects malformed JUnit atomically with diagnostics and no partial evidence", async () => {
    const analyzedCommitSha = "1".repeat(40);
    const result = ingestCiTestReports({
      analyzedCommitSha,
      checkRuns: [passingCheck(analyzedCommitSha)],
      reports: [
        {
          artifactId: 7002,
          artifactName: "vitest-results",
          content: await readFile(resolve(ACTIONS_ROOT, "vitest.json"), "utf8"),
          format: "jest-json",
          headSha: analyzedCommitSha,
        },
        {
          artifactId: 7999,
          artifactName: "broken-junit",
          content: "<testsuites><testcase></testsuites>",
          format: "junit",
          headSha: analyzedCommitSha,
        },
      ],
    });

    expect(result.testFiles).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      artifactId: 7999,
      artifactName: "broken-junit",
      severity: "error",
    });
    expect(result.diagnostics[0]?.message).toContain("Invalid JUnit XML");
    expect(result.guidance?.kind).toBe("connect-ci-reports");
  });
});

describe("GitHub CI evidence source", () => {
  it("collects same-commit artifact reports and check runs through read-only REST endpoints", async () => {
    const analyzedCommitSha = "1".repeat(40);
    const artifacts = await readFile(
      resolve(ACTIONS_ROOT, "artifacts.json"),
      "utf8",
    );
    const checkRuns = await readFile(
      resolve(ACTIONS_ROOT, "check-runs.json"),
      "utf8",
    );
    const junit = await readFile(resolve(ACTIONS_ROOT, "junit.xml"), "utf8");
    const vitest = await readFile(resolve(ACTIONS_ROOT, "vitest.json"), "utf8");
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/actions/artifacts?")) {
        return new Response(artifacts, { status: 200 });
      }
      if (url.includes(`/commits/${analyzedCommitSha}/check-runs?`)) {
        return new Response(checkRuns, { status: 200 });
      }
      if (url.endsWith("/actions/artifacts/7001/zip")) {
        return new Response(zipSync({ "junit.xml": strToU8(junit) }), {
          status: 200,
        });
      }
      if (url.endsWith("/actions/artifacts/7002/zip")) {
        return new Response(zipSync({ "vitest.json": strToU8(vitest) }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
    const source = new GitHubCiEvidenceSource(
      "alrescha",
      "drifted-demo",
      "installation-token",
      fetchImplementation,
    );
    const collected = await source.collect(analyzedCommitSha);

    expect(
      collected.reports.map(({ artifactId, format, headSha }) => ({
        artifactId,
        format,
        headSha,
      })),
    ).toEqual([
      { artifactId: 7001, format: "junit", headSha: analyzedCommitSha },
      { artifactId: 7002, format: "vitest-json", headSha: analyzedCommitSha },
    ]);
    expect(collected.checkRuns).toHaveLength(1);
    expect(
      ingestCiTestReports({ analyzedCommitSha, ...collected }).testFiles[0],
    ).toMatchObject({
      grade: "verified",
      requirementIds: ["REQ-AUTH-002"],
      testFile: "tests/session.test.ts",
      verdict: "supports",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    for (const [input, options] of fetchImplementation.mock.calls) {
      const headers = options?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer installation-token");
      // The archive endpoint refuses `application/octet-stream` with a 415
      // (production, 2026-09-15); every request carries the API media type.
      if (String(input).endsWith("/zip")) {
        expect(headers.accept).toBe("application/vnd.github+json");
      }
    }
  });
});

/**
 * Coverage in the same archive (Phase 4 Wave C todo 18).
 *
 * `coverage-final.json` ends in `.json`, and the classifier used to read
 * every `.json` as a Vitest report. Handing it to `ingestCiTestReports`
 * produces a parse diagnostic, and a single diagnostic makes that function
 * discard **the whole run's evidence** — so a repository that uploads its
 * coverage next to its test results would have lost its `verified` grade to
 * a file that was never a test report.
 */
describe("classifying an artifact archive", () => {
  const COMMIT = "1".repeat(40);

  async function collectArchive(
    files: Record<string, string>,
    checkRuns: readonly ReturnType<typeof passingCheck>[] = [],
  ) {
    const artifacts = JSON.stringify({
      artifacts: [
        {
          expired: false,
          id: 8001,
          name: "results",
          workflow_run: { head_sha: COMMIT },
        },
      ],
    });
    const source = new GitHubCiEvidenceSource(
      "alrescha",
      "drifted-demo",
      "installation-token",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url.includes("/actions/artifacts?")) {
          return new Response(artifacts, { status: 200 });
        }
        if (url.includes("/check-runs?")) {
          return new Response(JSON.stringify({ check_runs: checkRuns }), {
            status: 200,
          });
        }
        return new Response(
          zipSync(
            Object.fromEntries(
              Object.entries(files).map(([name, body]) => [
                name,
                strToU8(body),
              ]),
            ),
          ),
          { status: 200 },
        );
      }),
    );
    return source.collect(COMMIT);
  }

  it("keeps coverage out of the test reports", async () => {
    const collected = await collectArchive({
      "coverage-final.json": JSON.stringify({ "src/a.ts": {} }),
      "lcov.info": "SF:src/a.ts\nend_of_record\n",
      "results.json": JSON.stringify({ success: true, testResults: [] }),
    });

    expect(collected.reports.map(({ format }) => format)).toEqual([
      "vitest-json",
    ]);
    expect(collected.coverage.map(({ format }) => format).sort()).toEqual([
      "istanbul-json",
      "lcov",
    ]);

    // The point of the split: the test reports still parse, because the
    // coverage file never reached the test-report parser.
    expect(
      ingestCiTestReports({
        analyzedCommitSha: COMMIT,
        checkRuns: collected.checkRuns,
        reports: collected.reports,
      }).diagnostics,
    ).toEqual([]);
  });

  /**
   * A re-run leaves the failed attempt's artifact beside the passing one
   * under the same name (main CI, 2026-09-15). The latest upload per name
   * is the run's report; grading both would leave every file `unknown` for
   * a commit whose re-run passed.
   */
  it("reads only the latest artifact per name when a run was re-run", async () => {
    const passing = `<testsuites tests="1" failures="0" errors="0"><testsuite name="tests/a.test.ts" tests="1" failures="0" errors="0"><testcase classname="tests/a.test.ts" name="a passes"></testcase></testsuite></testsuites>`;
    const failed = `<testsuites tests="1" failures="1" errors="0"><testsuite name="tests/a.test.ts" tests="1" failures="1" errors="0"><testcase classname="tests/a.test.ts" name="a passes"><failure>timed out</failure></testcase></testsuite></testsuites>`;
    const artifacts = JSON.stringify({
      artifacts: [
        { expired: false, id: 8001, name: "vitest-junit", workflow_run: { head_sha: COMMIT } },
        { expired: false, id: 8002, name: "vitest-junit", workflow_run: { head_sha: COMMIT } },
        // Another commit's upload is not this commit's evidence.
        { expired: false, id: 8003, name: "vitest-junit", workflow_run: { head_sha: "2".repeat(40) } },
      ],
    });
    const requested: string[] = [];
    const source = new GitHubCiEvidenceSource(
      "alrescha",
      "drifted-demo",
      "installation-token",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("/actions/artifacts?")) {
          return new Response(artifacts, { status: 200 });
        }
        if (url.includes("/check-runs?")) {
          return new Response(
            JSON.stringify({ check_runs: [{ ...passingCheck(COMMIT), name: "gate" }] }),
            { status: 200 },
          );
        }
        const body = url.endsWith("/8001/zip") ? failed : passing;
        return new Response(zipSync({ "reports/vitest-junit.xml": strToU8(body) }), {
          status: 200,
        });
      }),
    );
    const collected = await source.collect(COMMIT);

    expect(requested.filter((url) => url.endsWith("/zip"))).toEqual([
      "https://api.github.com/repos/alrescha/drifted-demo/actions/artifacts/8002/zip",
    ]);
    expect(collected.reports.map(({ artifactId }) => artifactId)).toEqual([8002]);
    const { testFiles } = ingestCiTestReports({
      analyzedCommitSha: COMMIT,
      checkRuns: collected.checkRuns,
      reports: collected.reports,
    });
    expect(testFiles).toEqual([
      expect.objectContaining({ grade: "verified", testFile: "tests/a.test.ts" }),
    ]);
  });

  it("still reads a plain test archive as reports", async () => {
    const collected = await collectArchive({
      "junit.xml": '<testsuites tests="0"></testsuites>',
    });

    expect(collected.reports.map(({ format }) => format)).toEqual(["junit"]);
    expect(collected.coverage).toEqual([]);
  });

  /**
   * This repository's own artifact (`.github/workflows/ci.yml`, 2026-09-14):
   * Vitest's JUnit reporter, uploaded as `vitest-junit`. The classname is a
   * repository-relative path, so it resolves against the scan without a
   * runner prefix, and a case named after nothing in particular still
   * grades its file once the check run has passed.
   */
  it("reads the artifact this repository's own workflow uploads, and grades its files", async () => {
    const collected = await collectArchive(
      {
        "reports/vitest-junit.xml": `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="1" failures="0" errors="0" time="0.01">
    <testsuite name="tests/alrescha-shell.test.ts" timestamp="2026-09-14T14:41:03.618Z" hostname="runner" tests="1" failures="0" errors="0" skipped="0" time="0.004">
        <testcase classname="tests/alrescha-shell.test.ts" name="Alrescha F2 repository shell &gt; renders the three horizontal chrome bands in order" time="0.001">
        </testcase>
    </testsuite>
</testsuites>
`,
      },
      [{ ...passingCheck(COMMIT), name: "gate" }],
    );

    expect(collected.reports.map(({ format }) => format)).toEqual(["junit"]);
    const { guidance, testFiles } = ingestCiTestReports({
      analyzedCommitSha: COMMIT,
      checkRuns: collected.checkRuns,
      reports: collected.reports,
    });
    expect(guidance).toBeNull();
    expect(testFiles).toHaveLength(1);
    expect(testFiles[0]).toMatchObject({
      grade: "verified",
      requirementIds: [],
      testFile: "tests/alrescha-shell.test.ts",
    });
    expect(
      resolveReportedPath(
        testFiles[0]!.testFile,
        new Set(["tests/alrescha-shell.test.ts", "src/session.ts"]),
      ),
    ).toBe("tests/alrescha-shell.test.ts");
  });
});
