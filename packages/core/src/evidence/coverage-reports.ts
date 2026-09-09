/**
 * Coverage reports, read for one fact only (Phase 4 Wave C todo 18).
 *
 * A coverage report says which files a test run executed and how much of
 * each. This reads **only the first half**: whether a file was measured at
 * all. The percentage is deliberately dropped.
 *
 * The reason is what a number would do to the repositories that have no CI,
 * which is most of them at the point they connect. A missing report is not
 * zero coverage, but a `0%` on a screen is read as one — and the product's
 * whole claim is that it does not state things it has not measured. "Not
 * measured" and "measured at 0%" are different facts, and only one of them
 * is true of a repository that never ran a coverage job.
 *
 * What the measured set is *for* is the risk map (todo 21): a file with no
 * coverage evidence is grey — evidence absent — rather than red.
 *
 * Both formats are read as text. Nothing here executes repository code, and
 * `tests/ci-evidence.test.ts` holds this file to that.
 */

export type CoverageReportFormat = "istanbul-json" | "lcov";

export interface CoverageReportArtifact {
  readonly artifactId: number;
  readonly artifactName: string;
  readonly content: string;
  readonly format: CoverageReportFormat;
  readonly headSha: string;
}

export interface CoverageReportDiagnostic {
  readonly artifactId: number;
  readonly artifactName: string;
  readonly message: string;
  readonly severity: "error";
}

/** One file a coverage run executed, and which report says so. */
export interface MeasuredFile {
  readonly artifactId: number;
  readonly artifactName: string;
  readonly format: CoverageReportFormat;
  /** The path exactly as the report wrote it — resolving it is the caller's. */
  readonly reportedPath: string;
}

export interface CoverageIngestionResult {
  readonly diagnostics: readonly CoverageReportDiagnostic[];
  readonly measured: readonly MeasuredFile[];
}

/** `SF:<path>` opens a record in an LCOV trace file. Nothing else is read. */
const LCOV_SOURCE_FILE = /^SF:(.+)$/;

function lcovPaths(content: string): string[] {
  const paths: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = LCOV_SOURCE_FILE.exec(line.trim());
    if (match?.[1]) paths.push(match[1].trim());
  }
  if (paths.length === 0) {
    throw new Error("No SF: record found — this is not an LCOV trace file.");
  }
  return paths;
}

/**
 * Istanbul's JSON summary and its raw coverage map are both objects keyed by
 * file path. `total` is a summary row rather than a file and is dropped; the
 * numbers under each key are not read at all.
 */
function istanbulPaths(content: string): string[] {
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Istanbul coverage report must be a JSON object.");
  }
  const paths = Object.keys(parsed as Record<string, unknown>).filter(
    (key) => key !== "total",
  );
  if (paths.length === 0) {
    throw new Error("Istanbul coverage report names no file.");
  }
  return paths;
}

/**
 * Which files a set of coverage reports executed.
 *
 * A report that will not parse is a diagnostic, and the reports that do parse
 * still count: one broken artifact should not erase what the others measured.
 * Duplicate paths across reports collapse to the first report that named
 * them, so the answer is a set of files and not a tally of reports.
 */
export function ingestCoverageReports(
  reports: readonly CoverageReportArtifact[],
): CoverageIngestionResult {
  const diagnostics: CoverageReportDiagnostic[] = [];
  const measured: MeasuredFile[] = [];
  const seen = new Set<string>();

  for (const report of reports) {
    let paths: string[];
    try {
      paths =
        report.format === "lcov"
          ? lcovPaths(report.content)
          : istanbulPaths(report.content);
    } catch (error) {
      diagnostics.push({
        artifactId: report.artifactId,
        artifactName: report.artifactName,
        message:
          error instanceof Error
            ? error.message
            : "Unknown coverage report parse error.",
        severity: "error",
      });
      continue;
    }
    for (const reportedPath of paths) {
      if (seen.has(reportedPath)) continue;
      seen.add(reportedPath);
      measured.push({
        artifactId: report.artifactId,
        artifactName: report.artifactName,
        format: report.format,
        reportedPath,
      });
    }
  }

  return {
    diagnostics,
    measured: measured.sort((left, right) =>
      left.reportedPath < right.reportedPath ? -1 : 1,
    ),
  };
}

/**
 * The repository path a report meant, or null.
 *
 * A CI report writes paths from the machine that ran it —
 * `/home/runner/work/app/app/src/a.ts`, `./src/a.ts`, `src\\a.ts` — and none
 * of those is a key into a scanned repository. The longest trailing run of
 * segments that is a scanned path is the answer, which needs no configuration
 * and cannot invent a file: an unmatched report path resolves to null rather
 * than to something that looks close.
 *
 * Longest-first matters where a repository vendors a copy of a tree: for
 * `packages/core/src/a.ts` and `src/a.ts` both scanned, a report naming
 * `/runner/packages/core/src/a.ts` resolves to the first.
 */
export function resolveReportedPath(
  reportedPath: string,
  scannedPaths: ReadonlySet<string>,
): string | null {
  const segments = reportedPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  for (let start = 0; start < segments.length; start += 1) {
    const candidate = segments.slice(start).join("/");
    if (scannedPaths.has(candidate)) return candidate;
  }
  return null;
}
