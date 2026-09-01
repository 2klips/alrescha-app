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
