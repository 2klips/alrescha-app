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

import type { ArtifactCard } from "../brain/artifact-card";
import {
  parseNpmAuditReport,
  type DependencyAuditReport,
} from "./dependency-audit";
import type { RiskEntry, RiskMap, UnmeasuredSignal } from "./risk-map";

export type InspectionSectionState = "insufficient-evidence" | "ok";

/**
 * Every type the assurance engine emits — `AssuranceFindingType` verbatim.
 *
 * `untested-code` was missing, and the loader drops a row whose kind this
 * list does not know. The rule has fired since Phase 4 Wave A todo 1 and
 * every one of its findings was discarded on the way to the screen (todo 21).
 */
export type InspectionFindingKind =
  | "contradicting-instructions"
  | "missing-implementation"
  | "missing-test"
  | "orphan-doc"
  | "stale-doc"
  | "unproven-claim"
  | "untested-code";

export type InspectionSeverity = "critical" | "high" | "low" | "medium";

/**
 * What the analysis stated about one finding (Phase 4 Wave D todo 19 ⑶).
 *
 * The screen showed a title, a severity and a kind — enough to know
 * something is wrong and not enough to do anything about it. All of this was
 * already stored: `findings.provenance` carries the spans, the reason and
 * the suggested action, and the analyze job has written them since Phase 2C.
 * Reading them is the whole change.
 *
 * `evidenceLinks` are node ids the rule pointed at. Rendering them is the
 * caller's; a dangling one is a rendering decision, not a reason to drop the
 * finding.
 */
export interface InspectionFindingDetail {
  readonly confidence: number;
  /** ADR-001: a deterministic rule states `inferred` unless CI says more. */
  readonly evidenceGrade: "inferred" | "verified";
  readonly evidenceLinks: readonly string[];
  /** Why the rule fired, in the rule's words. */
  readonly reason: string | null;
  readonly spans: readonly {
    readonly endLine: number;
    readonly path: string;
    readonly startLine: number;
  }[];
  readonly suggestedAction: string | null;
}

export interface InspectionFindingInput {
  readonly detail?: InspectionFindingDetail | undefined;
  /**
   * Why somebody took this off the board (todo 19 ⑷). Present only on a
   * `dismissed` finding, where the schema requires it — a dismissal with no
   * reason is indistinguishable from a finding nobody looked at.
   */
  readonly dismissedReason?: string | undefined;
  readonly id: string;
  readonly kind: InspectionFindingKind;
  readonly severity: InspectionSeverity;
  readonly status: "dismissed" | "open" | "resolved";
  readonly title: string;
}

export interface InspectionDocumentInput {
  /**
   * The shared card (Codex remedy §6.1, step S5) — the same builder the MCP
   * artifact answer uses, so the screen and the agent describe a file the
   * same way. Optional while callers move onto it.
   */
  readonly card?: ArtifactCard | undefined;
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
  /**
   * Which files to look at first, built by the caller from rows this
   * builder does not read (edges, co-changes, coverage). Null when the
   * caller did not build one — an absent map, not an empty one.
   */
  readonly riskMap?: RiskMap | null | undefined;
  readonly ruledOutAttempts: readonly RuledOutAttemptInput[];
  readonly todos: { readonly done: number; readonly total: number } | null;
}

export type DocumentFreshness = "current" | "drift-suspected" | "outdated";

export interface InspectionDocumentEntry {
  /** Null until the caller supplies one; never invented here. */
  readonly card: ArtifactCard | null;
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
  /**
   * Findings somebody took off the board, and why (todo 19 ⑷).
   *
   * `findings.entries` is open findings only, so a dismissal used to make a
   * finding vanish — indistinguishable from a deletion, and unreviewable. A
   * decision that cannot be looked at again is not a decision, it is a
   * disappearance.
   */
  readonly dismissed: {
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
  /**
   * The ranked list of files worth opening first (todo 21). `unmeasured`
   * names the signals nobody has measured, so the screen greys them out
   * instead of reading an absence as a clean bill of health.
   */
  readonly risk: {
    readonly entries: readonly RiskEntry[];
    readonly sourceLabel: string;
    readonly state: InspectionSectionState;
    readonly unmeasured: readonly UnmeasuredSignal[];
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
  // Newest decisions are the ones worth reviewing, and the input carries no
  // timestamp, so severity-then-title keeps the order stable and readable.
  const dismissedFindings = input.findings
    .filter(({ status }) => status === "dismissed")
    .sort(bySeverityThenTitle);
  const openBySeverity = { critical: 0, high: 0, low: 0, medium: 0 };
  for (const finding of openFindings) {
    openBySeverity[finding.severity] += 1;
  }

  const driftRisks = openFindings.filter(({ kind }) =>
    DRIFT_RISK_KINDS.includes(kind),
  );

  /**
   * The documents a `stale-doc` finding actually fired on (todo 21).
   *
   * This used to match a finding's **title** against a document's path, and
   * a stale-doc title names the *referenced* file — "The documented
   * `src/auth.ts` source reference does not exist" — not the document that
   * references it. So the two strings were about different files and
   * `drift-suspected` was, in practice, unreachable: the widget existed and
   * never appeared. The finding's span says which document drifted, and
   * todo 19 ⑶ is what put the span within reach here.
   */
  const driftedDocumentPaths = new Set(
    openFindings
      .filter(({ kind }) => kind === "stale-doc")
      .flatMap(({ detail }) => (detail?.spans ?? []).map(({ path }) => path)),
  );
  const documents = [...input.documents]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((document): InspectionDocumentEntry => {
      const freshness: DocumentFreshness = driftedDocumentPaths.has(
        document.path,
      )
        ? "drift-suspected"
        : input.headCommitSha !== null &&
            document.lastSeenCommitSha === input.headCommitSha
          ? "current"
          : "outdated";
      return {
        card: document.card ?? null,
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
    dismissed: {
      entries: dismissedFindings,
      sourceLabel: "findings dismissed by a workspace member or a judgment",
      state: dismissedFindings.length === 0 ? "insufficient-evidence" : "ok",
    },
    risk: {
      entries: input.riskMap?.entries ?? [],
      sourceLabel: "open findings, test edges, imports/calls fan-in, co-change",
      // A map with no entry is not evidence of safety, and neither is no map
      // at all: both read as "not enough to rank anything".
      state:
        (input.riskMap?.entries.length ?? 0) === 0
          ? "insufficient-evidence"
          : "ok",
      unmeasured: input.riskMap?.unmeasured ?? [],
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
