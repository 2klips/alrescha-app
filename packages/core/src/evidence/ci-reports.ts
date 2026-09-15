import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

export type CiReportFormat = "jest-json" | "junit" | "vitest-json";

export interface CiReportArtifact {
  readonly artifactId: number;
  readonly artifactName: string;
  readonly content: string;
  readonly format: CiReportFormat;
  readonly headSha: string;
}

export interface CiCheckRun {
  readonly conclusion: string | null;
  readonly head_sha: string;
  readonly name: string;
  readonly status: string;
}

export interface CiEvidenceSource {
  readonly artifactId: number;
  readonly artifactName: string;
  readonly format: CiReportFormat;
  readonly headSha: string;
  readonly testFile: string;
  readonly testName: string;
}

/**
 * One test file a CI run executed, and what that run says about it.
 *
 * The file is the unit of evidence (Phase 4 Wave C todo 18, 2026-09-14):
 * "this file ran and passed at the analysed commit" is the claim a report
 * makes directly, and it does not depend on the test's name. The
 * requirement codes the names carry are a property of that claim — they
 * become `supports` edges out of the same row — rather than the gate for
 * it, so a repository whose tests name no requirement can still reach the
 * `verified` grade for the files its CI actually ran.
 */
export interface CiTestFileEvidence {
  readonly grade: "inferred" | "verified";
  readonly reason: string;
  /** `REQ-…` codes found in this file's test names, sorted, deduplicated. */
  readonly requirementIds: readonly string[];
  readonly sources: readonly CiEvidenceSource[];
  /** The file as the report named it — often a CI machine's absolute path. */
  readonly testFile: string;
  readonly verdict: "supports" | "unknown";
}

export interface CiReportDiagnostic {
  readonly artifactId: number;
  readonly artifactName: string;
  readonly message: string;
  readonly severity: "error";
}

export interface CiEvidenceGuidance {
  readonly kind: "connect-ci-reports";
  readonly message: string;
}

export interface IngestCiTestReportsInput {
  readonly analyzedCommitSha: string;
  readonly checkRuns: readonly CiCheckRun[];
  readonly reports: readonly CiReportArtifact[];
}

export interface CiTestReportIngestionResult {
  readonly diagnostics: readonly CiReportDiagnostic[];
  readonly guidance: CiEvidenceGuidance | null;
  readonly testFiles: readonly CiTestFileEvidence[];
}

type ParsedTestStatus = "failed" | "passed" | "skipped";

interface ParsedTestCase {
  readonly status: ParsedTestStatus;
  readonly testFile: string;
  readonly testName: string;
}

interface ParsedReport {
  readonly artifact: CiReportArtifact;
  /** No failure and no error anywhere in the report. A skip is neither. */
  readonly passed: boolean;
  readonly tests: readonly ParsedTestCase[];
}

const jsonReportSchema = z.object({
  success: z.boolean(),
  testResults: z.array(
    z.object({
      assertionResults: z.array(
        z.object({
          fullName: z.string().optional(),
          status: z.string(),
          title: z.string(),
        }),
      ),
      name: z.string(),
      status: z.string(),
    }),
  ),
});

/** Jest and Vitest spell "did not run" four ways between them. */
const JSON_SKIPPED_STATUSES = new Set(["disabled", "pending", "skipped", "todo"]);

function jsonStatus(
  reportSucceeded: boolean,
  fileStatus: string,
  testStatus: string,
): ParsedTestStatus {
  if (JSON_SKIPPED_STATUSES.has(testStatus)) return "skipped";
  return reportSucceeded && fileStatus === "passed" && testStatus === "passed"
    ? "passed"
    : "failed";
}

function parseJsonReport(artifact: CiReportArtifact): ParsedReport {
  const parsed = jsonReportSchema.parse(JSON.parse(artifact.content));
  const tests = parsed.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      status: jsonStatus(parsed.success, file.status, test.status),
      testFile: file.name,
      testName: test.fullName ?? test.title,
    })),
  );
  return {
    artifact,
    passed: parsed.success && tests.every(({ status }) => status !== "failed"),
    tests,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function stringAttribute(value: Record<string, unknown>, name: string): string {
  const attribute = value[`@_${name}`];
  return typeof attribute === "string" || typeof attribute === "number"
    ? String(attribute)
    : "";
}

function numericAttribute(
  value: Record<string, unknown>,
  name: string,
): number {
  const parsed = Number(stringAttribute(value, name));
  return Number.isFinite(parsed) ? parsed : 0;
}

function junitStatus(testCase: Record<string, unknown>): ParsedTestStatus {
  if (testCase.failure !== undefined || testCase.error !== undefined) {
    return "failed";
  }
  return testCase.skipped !== undefined ? "skipped" : "passed";
}

function parseJunitReport(artifact: CiReportArtifact): ParsedReport {
  const validation = XMLValidator.validate(artifact.content);
  if (validation !== true) {
    throw new Error(`Invalid JUnit XML: ${validation.err.msg}`);
  }
  const xml = record(
    new XMLParser({
      allowBooleanAttributes: true,
      ignoreAttributes: false,
      parseAttributeValue: true,
      trimValues: true,
    }).parse(artifact.content),
  );
  const suitesRoot = record(xml?.testsuites);
  if (!suitesRoot) {
    throw new Error("Invalid JUnit XML: missing testsuites root element.");
  }
  const suiteValues = array(suitesRoot.testsuite);
  const tests: ParsedTestCase[] = [];
  for (const suiteValue of suiteValues) {
    const suite = record(suiteValue);
    if (!suite) {
      continue;
    }
    const suiteName = stringAttribute(suite, "name");
    for (const caseValue of array(suite.testcase)) {
      const testCase = record(caseValue);
      if (!testCase) {
        continue;
      }
      tests.push({
        status: junitStatus(testCase),
        testFile: stringAttribute(testCase, "classname") || suiteName,
        testName: stringAttribute(testCase, "name"),
      });
    }
  }
  // A skipped case is not a failure. The previous rule counted it as one at
  // the report level, which made a single `it.skip` anywhere un-verify every
  // file in the run; the skip now costs only the file it is in.
  const reportPassed =
    numericAttribute(suitesRoot, "failures") === 0 &&
    numericAttribute(suitesRoot, "errors") === 0 &&
    tests.length > 0 &&
    tests.every(({ status }) => status !== "failed");
  return { artifact, passed: reportPassed, tests };
}

function parseReport(artifact: CiReportArtifact): ParsedReport {
  return artifact.format === "junit"
    ? parseJunitReport(artifact)
    : parseJsonReport(artifact);
}

function diagnostic(
  artifact: CiReportArtifact,
  error: unknown,
): CiReportDiagnostic {
  return {
    artifactId: artifact.artifactId,
    artifactName: artifact.artifactName,
    message:
      error instanceof Error
        ? error.message
        : "Unknown test report parse error.",
    severity: "error",
  };
}

function requirementIds(testName: string): readonly string[] {
  return [...new Set(testName.match(/\bREQ-[A-Z\d]+(?:-[A-Z\d]+)*\b/g) ?? [])];
}

function hasPassingCheck(
  checkRuns: readonly CiCheckRun[],
  analyzedCommitSha: string,
): boolean {
  return checkRuns.some(
    ({ conclusion, head_sha, status }) =>
      head_sha === analyzedCommitSha &&
      status === "completed" &&
      conclusion === "success",
  );
}

const guidance: CiEvidenceGuidance = {
  kind: "connect-ci-reports",
  message:
    "Connect passing CI test reports for the analyzed commit to verify test evidence.",
};

const VERIFIED_REASON =
  "Passing parsed reports and checks match the analyzed commit.";

interface FileAccumulator {
  readonly reasons: Set<string>;
  readonly requirementIds: Set<string>;
  readonly sources: CiEvidenceSource[];
  verified: boolean;
}

/**
 * Parse a commit's CI reports into per-file evidence.
 *
 * A file is `verified` when every report that names it matched the
 * analysed commit, passed as a whole, sat under a successful check run, and
 * every one of its cases passed — a skipped case leaves its file `unknown`
 * with that reason and touches no other file. A report that fails to parse
 * discards the whole run's evidence rather than half of it.
 */
export function ingestCiTestReports({
  analyzedCommitSha,
  checkRuns,
  reports,
}: IngestCiTestReportsInput): CiTestReportIngestionResult {
  const parsedReports: ParsedReport[] = [];
  const diagnostics: CiReportDiagnostic[] = [];
  for (const report of reports) {
    try {
      parsedReports.push(parseReport(report));
    } catch (error) {
      diagnostics.push(diagnostic(report, error));
    }
  }
  if (diagnostics.length > 0) {
    return { diagnostics, guidance, testFiles: [] };
  }

  const passingCheck = hasPassingCheck(checkRuns, analyzedCommitSha);
  const byFile = new Map<string, FileAccumulator>();
  for (const report of parsedReports) {
    const reportVerified =
      report.artifact.headSha === analyzedCommitSha &&
      report.passed &&
      passingCheck;
    const inferredReason =
      report.artifact.headSha !== analyzedCommitSha
        ? `Report commit ${report.artifact.headSha} does not match analyzed commit ${analyzedCommitSha}.`
        : !report.passed
          ? "Parsed test report did not pass."
          : "No successful check run matches the analyzed commit.";
    for (const test of report.tests) {
      // A case the report could not attribute to a file anchors nothing.
      if (test.testFile.length === 0) continue;
      const current = byFile.get(test.testFile) ?? {
        reasons: new Set<string>(),
        requirementIds: new Set<string>(),
        sources: [],
        verified: true,
      };
      current.sources.push({
        artifactId: report.artifact.artifactId,
        artifactName: report.artifact.artifactName,
        format: report.artifact.format,
        headSha: report.artifact.headSha,
        testFile: test.testFile,
        testName: test.testName,
      });
      for (const requirementId of requirementIds(test.testName)) {
        current.requirementIds.add(requirementId);
      }
      if (!reportVerified || test.status !== "passed") {
        current.verified = false;
        current.reasons.add(
          test.status === "failed"
            ? "Mapped test case did not pass."
            : test.status === "skipped"
              ? "Mapped test case was skipped."
              : inferredReason,
        );
      }
      byFile.set(test.testFile, current);
    }
  }

  const testFiles = [...byFile.entries()]
    .map(
      ([testFile, mapped]): CiTestFileEvidence => ({
        grade: mapped.verified ? "verified" : "inferred",
        reason: mapped.verified
          ? VERIFIED_REASON
          : ([...mapped.reasons][0] ?? "No verified test evidence was produced."),
        requirementIds: [...mapped.requirementIds].sort(),
        sources: mapped.sources.sort(
          (left, right) => left.artifactId - right.artifactId,
        ),
        testFile,
        verdict: mapped.verified ? "supports" : "unknown",
      }),
    )
    .sort((left, right) => left.testFile.localeCompare(right.testFile));
  const hasVerifiedEvidence = testFiles.some(
    ({ grade }) => grade === "verified",
  );
  return {
    diagnostics: [],
    guidance: hasVerifiedEvidence ? null : guidance,
    testFiles,
  };
}
