/**
 * Dependency audit ingestion (Phase 2B todo 8, ADR-009-4).
 *
 * Arr does not scan code for vulnerabilities — that boundary is machine-
 * enforced (`skill-security-scanning`, WORK_SPEC §16). What it does is
 * COLLECT: this module parses the JSON that `npm audit --json` (report
 * version 2, npm 7+) already produced, uploaded by the user or a CI
 * artifact. It is a pure function of its input — no filesystem, no process
 * execution, no network — and the inspection scope test proves that.
 */

export type DependencyAdvisorySeverity =
  "critical" | "high" | "info" | "low" | "moderate";

export type DependencyFixAvailability = "major" | "none" | "patch";

export interface DependencyAdvisory {
  readonly fixAvailability: DependencyFixAvailability;
  readonly isDirect: boolean;
  readonly name: string;
  readonly range: string | null;
  readonly severity: DependencyAdvisorySeverity;
  readonly title: string | null;
  readonly url: string | null;
}

export interface DependencyAuditReport {
  readonly advisories: readonly DependencyAdvisory[];
  readonly counts: Readonly<Record<DependencyAdvisorySeverity, number>> & {
    readonly total: number;
  };
  readonly reportVersion: 2;
}

const SEVERITIES: readonly DependencyAdvisorySeverity[] = [
  "critical",
  "high",
  "info",
  "low",
  "moderate",
];

function isSeverity(value: unknown): value is DependencyAdvisorySeverity {
  return (
    typeof value === "string" &&
    (SEVERITIES as readonly string[]).includes(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** The first advisory object in `via` carries the human title and URL. */
function viaDetails(via: unknown): {
  title: string | null;
  url: string | null;
} {
  if (!Array.isArray(via)) {
    return { title: null, url: null };
  }
  for (const entry of via) {
    const record = asRecord(entry);
    if (record) {
      return {
        title: optionalString(record["title"]),
        url: optionalString(record["url"]),
      };
    }
  }
  return { title: null, url: null };
}

function fixAvailability(value: unknown): DependencyFixAvailability {
  if (value === true) {
    return "patch";
  }
  const record = asRecord(value);
  if (record) {
    return record["isSemVerMajor"] === true ? "major" : "patch";
  }
  return "none";
}

/**
 * Parse an `npm audit --json` report (auditReportVersion 2). Malformed input
 * yields `null` — the dashboard then shows "insufficient evidence" instead of
 * a fabricated zero. Counts are recomputed from the parsed entries rather
 * than trusted from the report's own metadata block.
 */
export function parseNpmAuditReport(
  input: unknown,
): DependencyAuditReport | null {
  const report = asRecord(input);
  if (!report || report["auditReportVersion"] !== 2) {
    return null;
  }
  const vulnerabilities = asRecord(report["vulnerabilities"]);
  if (!vulnerabilities) {
    return null;
  }

  const advisories: DependencyAdvisory[] = [];
  for (const [name, value] of Object.entries(vulnerabilities)) {
    const entry = asRecord(value);
    if (!entry || !isSeverity(entry["severity"])) {
      return null;
    }
    const { title, url } = viaDetails(entry["via"]);
    advisories.push({
      fixAvailability: fixAvailability(entry["fixAvailable"]),
      isDirect: entry["isDirect"] === true,
      name: optionalString(entry["name"]) ?? name,
      range: optionalString(entry["range"]),
      severity: entry["severity"],
      title,
      url,
    });
  }
  advisories.sort(
    (left, right) =>
      SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity) ||
      left.name.localeCompare(right.name),
  );

  const counts = {
    critical: 0,
    high: 0,
    info: 0,
    low: 0,
    moderate: 0,
    total: advisories.length,
  };
  for (const advisory of advisories) {
    counts[advisory.severity] += 1;
  }

  return { advisories, counts, reportVersion: 2 };
}
