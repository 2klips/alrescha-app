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

export interface CiRequirementEvidence {
  readonly grade: "inferred" | "verified";
  readonly reason: string;
  readonly requirementId: string;
  readonly sources: readonly CiEvidenceSource[];
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
  readonly evidence: readonly CiRequirementEvidence[];
  readonly guidance: CiEvidenceGuidance | null;
}

interface ParsedTestCase {
  readonly passed: boolean;
  readonly testFile: string;
  readonly testName: string;
}

interface ParsedReport {
  readonly artifact: CiReportArtifact;
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

function parseJsonReport(artifact: CiReportArtifact): ParsedReport {
  const parsed = jsonReportSchema.parse(JSON.parse(artifact.content));
  const tests = parsed.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      passed:
        parsed.success && file.status === "passed" && test.status === "passed",
      testFile: file.name,
      testName: test.fullName ?? test.title,
    })),
  );
  return {
    artifact,
    passed: parsed.success && tests.every(({ passed }) => passed),
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
        passed:
          testCase.failure === undefined &&
          testCase.error === undefined &&
          testCase.skipped === undefined,
        testFile: stringAttribute(testCase, "classname") || suiteName,
        testName: stringAttribute(testCase, "name"),
      });
    }
  }
  const reportPassed =
    numericAttribute(suitesRoot, "failures") === 0 &&
    numericAttribute(suitesRoot, "errors") === 0 &&
    tests.length > 0 &&
    tests.every(({ passed }) => passed);
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
    return { diagnostics, evidence: [], guidance };
  }

  const passingCheck = hasPassingCheck(checkRuns, analyzedCommitSha);
  const byRequirement = new Map<
    string,
    { reasons: Set<string>; sources: CiEvidenceSource[]; verified: boolean }
  >();
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
      for (const requirementId of requirementIds(test.testName)) {
        const current = byRequirement.get(requirementId) ?? {
          reasons: new Set<string>(),
          sources: [],
          verified: false,
        };
        current.sources.push({
          artifactId: report.artifact.artifactId,
          artifactName: report.artifact.artifactName,
          format: report.artifact.format,
          headSha: report.artifact.headSha,
          testFile: test.testFile,
          testName: test.testName,
        });
        current.verified ||= reportVerified && test.passed;
        if (!reportVerified || !test.passed) {
          current.reasons.add(
            test.passed ? inferredReason : "Mapped test case did not pass.",
          );
        }
        byRequirement.set(requirementId, current);
      }
    }
  }

  const evidence = [...byRequirement.entries()]
    .map(([requirementId, mapped]): CiRequirementEvidence => ({
      grade: mapped.verified ? "verified" : "inferred",
      reason: mapped.verified
        ? "Passing parsed reports and checks match the analyzed commit."
        : ([...mapped.reasons][0] ?? "No verified test evidence was produced."),
      requirementId,
      sources: mapped.sources.sort(
        (left, right) => left.artifactId - right.artifactId,
      ),
      verdict: mapped.verified ? "supports" : "unknown",
    }))
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId),
    );
  const hasVerifiedEvidence = evidence.some(
    ({ grade }) => grade === "verified",
  );
  return {
    diagnostics: [],
    evidence,
    guidance: hasVerifiedEvidence ? null : guidance,
  };
}
