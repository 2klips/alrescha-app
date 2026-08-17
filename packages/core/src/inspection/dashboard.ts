/**
 * Project inspection dashboard (Phase 2B todo 8, ADR-009 agenda ⑥).
 *
 * One deterministic builder composes six widgets — progress, open findings,
 * document freshness + inferred summaries, drift-based risk, dependency
 * audit ingestion, and the append-only ruled-out history. Contract shared by
 * every widget: a `sourceLabel` naming where the data came from, and an
 * `insufficient-evidence` state whenever there is no stored data — absence
 * renders as absence, never as a fabricated zero.
 */

import {
  parseNpmAuditReport,
  type DependencyAuditReport,
} from "./dependency-audit";

export type InspectionSectionState = "insufficient-evidence" | "ok";

export type InspectionFindingKind =
  | "contradicting-instructions"
  | "missing-implementation"
  | "missing-test"
  | "orphan-doc"
  | "stale-doc"
  | "unproven-claim";

export type InspectionSeverity = "critical" | "high" | "low" | "medium";

export interface InspectionFindingInput {
  readonly id: string;
  readonly kind: InspectionFindingKind;
  readonly severity: InspectionSeverity;
  readonly status: "dismissed" | "open" | "resolved";
  readonly title: string;
}

export interface InspectionDocumentInput {
  readonly lastSeenCommitSha: string;
  readonly path: string;
  /** AI-written summary, if a judgment job produced one. Always `inferred`. */
  readonly summary: string | null;
}

export interface RuledOutAttemptInput {
  readonly hypothesis: string;
  readonly id: string;
  readonly outcome: string;
  readonly recordedAt: string;
  readonly refs: readonly string[];
}

export interface BuildInspectionDashboardInput {
  /** Raw `npm audit --json` output, exactly as uploaded. */
  readonly dependencyAuditJson: unknown;
  readonly documents: readonly InspectionDocumentInput[];
  readonly findings: readonly InspectionFindingInput[];
  readonly headCommitSha: string | null;
  readonly ruledOutAttempts: readonly RuledOutAttemptInput[];
  readonly todos: { readonly done: number; readonly total: number } | null;
}

export type DocumentFreshness = "current" | "drift-suspected" | "outdated";

export interface InspectionDocumentEntry {
  readonly freshness: DocumentFreshness;
  readonly path: string;
  /** grade is the literal evidence label the UI must render. */
  readonly summary: {
    readonly grade: "inferred";
    readonly text: string;
  } | null;
}

export interface InspectionDashboard {
  readonly dependencyAudit: {
    readonly report: DependencyAuditReport | null;
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
  };
  readonly documents: {
    readonly entries: readonly InspectionDocumentEntry[];
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
  };
  readonly driftRisks: {
    readonly entries: readonly InspectionFindingInput[];
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
  };
  readonly findings: {
    readonly entries: readonly InspectionFindingInput[];
    readonly openBySeverity: Readonly<Record<InspectionSeverity, number>>;
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
  };
  readonly progress: {
    readonly done: number;
    readonly percent: number | null;
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
    readonly total: number;
  };
  readonly ruledOut: {
    readonly entries: readonly RuledOutAttemptInput[];
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
  };
}

/** Finding kinds that constitute documentation/drift risk (ADR-009-4 ⑴). */
const DRIFT_RISK_KINDS: readonly InspectionFindingKind[] = [
  "contradicting-instructions",
  "stale-doc",
  "unproven-claim",
];

const SEVERITY_ORDER: readonly InspectionSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

function bySeverityThenTitle(
  left: InspectionFindingInput,
  right: InspectionFindingInput,
): number {
  return (
    SEVERITY_ORDER.indexOf(left.severity) -
      SEVERITY_ORDER.indexOf(right.severity) ||
    left.title.localeCompare(right.title)
  );
}

export function buildInspectionDashboard(
  input: BuildInspectionDashboardInput,
): InspectionDashboard {
  const openFindings = input.findings
    .filter(({ status }) => status === "open")
    .sort(bySeverityThenTitle);
  const openBySeverity = { critical: 0, high: 0, low: 0, medium: 0 };
  for (const finding of openFindings) {
    openBySeverity[finding.severity] += 1;
  }

  const driftRisks = openFindings.filter(({ kind }) =>
    DRIFT_RISK_KINDS.includes(kind),
  );

  const staleDocTitles = new Set(
    openFindings
      .filter(({ kind }) => kind === "stale-doc")
      .map(({ title }) => title),
  );
  const documents = [...input.documents]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((document): InspectionDocumentEntry => {
      const freshness: DocumentFreshness = [...staleDocTitles].some((title) =>
        title.includes(document.path),
      )
        ? "drift-suspected"
        : input.headCommitSha !== null &&
            document.lastSeenCommitSha === input.headCommitSha
          ? "current"
          : "outdated";
      return {
        freshness,
        path: document.path,
        summary:
          document.summary === null
            ? null
            : { grade: "inferred", text: document.summary },
      };
    });

  const auditReport = parseNpmAuditReport(input.dependencyAuditJson);

  // Append-only: the history is sorted, never deduplicated or truncated —
  // a repeated hypothesis stays visible twice, which is the point.
  const ruledOut = [...input.ruledOutAttempts].sort(
    (left, right) =>
      right.recordedAt.localeCompare(left.recordedAt) ||
      left.id.localeCompare(right.id),
  );

  return {
    dependencyAudit: {
      report: auditReport,
      sourceLabel: "npm audit --json ingest",
      state: auditReport === null ? "insufficient-evidence" : "ok",
    },
    documents: {
      entries: documents,
      sourceLabel: "repository scan metadata + judgment summaries",
      state: documents.length === 0 ? "insufficient-evidence" : "ok",
    },
    driftRisks: {
      entries: driftRisks,
      sourceLabel: "deterministic drift rules",
      state: driftRisks.length === 0 ? "insufficient-evidence" : "ok",
    },
    findings: {
      entries: openFindings,
      openBySeverity,
      sourceLabel: "assurance engine findings",
      state: openFindings.length === 0 ? "insufficient-evidence" : "ok",
    },
    progress: {
      done: input.todos?.done ?? 0,
      percent:
        input.todos === null || input.todos.total === 0
          ? null
          : Math.round((input.todos.done / input.todos.total) * 100),
      sourceLabel: "TODO/progress checkboxes + log_progress events",
      state:
        input.todos === null || input.todos.total === 0
          ? "insufficient-evidence"
          : "ok",
      total: input.todos?.total ?? 0,
    },
    ruledOut: {
      entries: ruledOut,
      sourceLabel: "append-only ruled-out log",
      state: ruledOut.length === 0 ? "insufficient-evidence" : "ok",
    },
  };
}
