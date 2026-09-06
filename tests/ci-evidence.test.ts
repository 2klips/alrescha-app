import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ingestCiTestReports } from "../packages/core/src/index";
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

describe("CI test report evidence ingestion", () => {
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
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      grade: "verified",
      reason: "Passing parsed reports and checks match the analyzed commit.",
      requirementId: "REQ-AUTH-002",
      verdict: "supports",
    });
    expect(
      result.evidence[0]?.sources.map(({ artifactId, format, headSha }) => ({
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

  it("keeps a stale-commit report inferred with an explicit reason and one guidance banner", async () => {
    const analyzedCommitSha = "1".repeat(40);
    const staleCommitSha = "2".repeat(40);
    const result = ingestCiTestReports({
      analyzedCommitSha,
      checkRuns: [
        {
          conclusion: "success",
          head_sha: analyzedCommitSha,
          name: "fixture-tests",
          status: "completed",
        },
      ],
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

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      grade: "inferred",
      reason: `Report commit ${staleCommitSha} does not match analyzed commit ${analyzedCommitSha}.`,
      requirementId: "REQ-AUTH-002",
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
      checkRuns: [
        {
          conclusion: "success",
          head_sha: analyzedCommitSha,
          name: "fixture-tests",
          status: "completed",
        },
      ],
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

    expect(result.evidence).toEqual([]);
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
      ingestCiTestReports({ analyzedCommitSha, ...collected }).evidence[0],
    ).toMatchObject({
      grade: "verified",
      requirementId: "REQ-AUTH-002",
      verdict: "supports",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    for (const [, options] of fetchImplementation.mock.calls) {
      expect((options?.headers as Record<string, string>).authorization).toBe(
        "Bearer installation-token",
      );
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

  async function collectArchive(files: Record<string, string>) {
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
          return new Response(JSON.stringify({ check_runs: [] }), {
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

  it("still reads a plain test archive as reports", async () => {
    const collected = await collectArchive({
      "junit.xml": '<testsuites tests="0"></testsuites>',
    });

    expect(collected.reports.map(({ format }) => format)).toEqual(["junit"]);
    expect(collected.coverage).toEqual([]);
  });
});
