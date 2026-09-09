/**
 * Which files are risky, and why (Phase 4 Wave D todo 21, risk audit P2).
 *
 * `/app/inspection` could say how many findings are open and which documents
 * look stale. It could not answer the question somebody actually opens it
 * with — *what should I look at first* — because nothing ranked files
 * against each other.
 *
 * Three rules keep this from being a number nobody can argue with:
 *
 * - **Every entry states its factors, and there is always at least one.** A
 *   file with no factor is not in the map. A score with no factors would be
 *   an opinion with a decimal point.
 * - **Every factor carries a checkable detail.** "11 files import or call
 *   this" is something a reader can verify; a PageRank value is not, so the
 *   importance weighting is *scored* by PageRank and *explained* by the
 *   count it comes from.
 * - **`grade` is always `inferred`.** None of these signals is execution
 *   evidence, and a risk map is a place to look, never a verdict (ADR-001).
 *
 * **What does not propagate risk** (보완 R-03): fan-in reads `imports` and
 * `calls` reversed and nothing else. A folder containing a file, a README
 * naming it, and a statistical co-change are all real edges and none of them
 * means "editing this breaks that". Co-change is a separate, weaker factor
 * with its own name, precisely so it is not mistaken for a dependency.
 *
 * **Absence is reported, not scored.** No coverage report and no dependency
 * audit are stated in `unmeasured` rather than counted as zero risk — the
 * difference between "measured, and clean" and "nobody looked" is the whole
 * point of this screen.
 */

import { personalizedPageRank } from "../brain/pagerank";
import type { DependencyAuditReport } from "./dependency-audit";

export type RiskLevel = "elevated" | "high" | "low" | "moderate";

export type RiskFactorKind =
  "co-changed" | "dependency-audit" | "fan-in" | "open-finding" | "untested";

/** One reason a file is on the list, in words a reader can check. */
export interface RiskFactor {
  readonly detail: string;
  readonly kind: RiskFactorKind;
  /** Contribution to `score`, rounded to three places. */
  readonly weight: number;
}

export interface RiskEntry {
  /** At least one, by construction — a file with none is not an entry. */
  readonly factors: readonly RiskFactor[];
  /** Never `verified`: no signal here is execution evidence (ADR-001). */
  readonly grade: "inferred";
  readonly level: RiskLevel;
  readonly nodeId: string;
  readonly path: string;
  readonly score: number;
}

/** A signal nobody measured, so it is grey rather than zero. */
export interface UnmeasuredSignal {
  readonly reason: string;
  readonly signal: "coverage" | "dependency-audit";
}

export interface RiskMap {
  readonly entries: readonly RiskEntry[];
  readonly unmeasured: readonly UnmeasuredSignal[];
}

export interface RiskArtifactInput {
  readonly classification: string;
  readonly nodeId: string;
  readonly path: string;
}

export interface RiskEdgeInput {
  readonly relation: string;
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface RiskFindingInput {
  readonly kind: string;
  /** The document or file the rule fired on. */
  readonly sourcePath: string | null;
  readonly status: string;
  /** The code the rule pointed at, when it named one. */
  readonly targetPath: string | null;
}

export interface RiskCoChangeInput {
  readonly changeCount: number;
  readonly observedAt: string;
  readonly pathA: string;
  readonly pathB: string;
}

export interface BuildRiskMapInput {
  readonly artifacts: readonly RiskArtifactInput[];
  readonly coChanges?: readonly RiskCoChangeInput[] | undefined;
  /**
   * Repository paths a coverage report executed, or **null** when nothing
   * has been measured (todo 18 writes these). Null and empty are different:
   * empty means a report ran and covered nothing.
   */
  readonly coverage?: readonly string[] | null | undefined;
  readonly dependencyAudit?: DependencyAuditReport | null | undefined;
  readonly edges: readonly RiskEdgeInput[];
  readonly findings: readonly RiskFindingInput[];
  /** Clock for the co-change decay; injectable so the map is testable. */
  readonly now?: string | undefined;
}

/** Relations that carry a dependency. Everything else is not a channel. */
const DEPENDENCY_RELATIONS = new Set(["calls", "imports"]);
/** Classifications the map ranks. A spec has no test edge and never will. */
const CODE_CLASSIFICATION = "code_metadata";

/** Per open finding. Severities are only {low, medium}, so this counts. */
const FINDING_WEIGHT = 1;
const UNTESTED_WEIGHT = 1;
/** Fan-in is scaled by importance; this is the ceiling it approaches. */
const FAN_IN_WEIGHT = 2;
const CO_CHANGE_WEIGHT = 1;
const AUDIT_WEIGHT = 1.5;

/** Co-change older than this contributes nothing: the pair moved on. */
const CO_CHANGE_HALF_LIFE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEVELS: readonly { level: RiskLevel; min: number }[] = [
  { level: "high", min: 4 },
  { level: "elevated", min: 2.5 },
  { level: "moderate", min: 1 },
  { level: "low", min: 0 },
];

function levelFor(score: number): RiskLevel {
  return LEVELS.find(({ min }) => score >= min)?.level ?? "low";
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * How much a co-change still says. A pair that moved together forty times
 * two years ago is history; the same pair last week is a coupling.
 */
function decay(observedAt: string, now: number): number {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return 0;
  const days = Math.max(0, (now - observed) / DAY_MS);
  return 0.5 ** (days / CO_CHANGE_HALF_LIFE_DAYS);
}

/**
 * Rank the files worth looking at first.
 *
 * Deterministic: the same inputs always produce the same map, in the same
 * order. Nothing is fetched and nothing is charged — every signal is already
 * stored.
 */
export function buildRiskMap(input: BuildRiskMapInput): RiskMap {
  const now = input.now ? Date.parse(input.now) : Date.now();
  const byPath = new Map(
    input.artifacts.map((artifact) => [artifact.path, artifact]),
  );
  const codePaths = new Set(
    input.artifacts
      .filter(({ classification }) => classification === CODE_CLASSIFICATION)
      .map(({ path }) => path),
  );

  // Open findings anchored on a file, from either end: the rule fires on a
  // document and names the code, or fires on the code itself.
  const findingCounts = new Map<string, number>();
  for (const finding of input.findings) {
    if (finding.status !== "open") continue;
    for (const path of [finding.sourcePath, finding.targetPath]) {
      if (!path || !byPath.has(path)) continue;
      findingCounts.set(path, (findingCounts.get(path) ?? 0) + 1);
    }
  }

  // Fan-in, from `imports` and `calls` only (보완 R-03). The count is what a
  // reader can check; PageRank over the same subgraph is what scales it, so
  // a file every hub imports outranks one with the same raw count in a
  // corner of the tree.
  const dependencyEdges = input.edges.filter(
    (edge) =>
      DEPENDENCY_RELATIONS.has(edge.relation) &&
      byPath.has(edge.sourcePath) &&
      byPath.has(edge.targetPath) &&
      edge.sourcePath !== edge.targetPath,
  );
  const fanIn = new Map<string, number>();
  for (const edge of dependencyEdges) {
    fanIn.set(edge.targetPath, (fanIn.get(edge.targetPath) ?? 0) + 1);
  }
  const importance = personalizedPageRank({
    // Reversed: mass flows to what is depended upon, which is what fan-in
    // means. Seeding is uniform — no file is the question here.
    edges: dependencyEdges.map((edge) => ({
      source: edge.targetPath,
      target: edge.sourcePath,
    })),
    nodes: [...byPath.keys()],
  });
  const topImportance = Math.max(0, ...importance.values());

  // Tested, as the graph resolved it: an incoming `tests` edge.
  const testedPaths = new Set(
    input.edges
      .filter((edge) => edge.relation === "tests")
      .map((edge) => edge.targetPath),
  );
  const measured = input.coverage ? new Set(input.coverage) : null;

  const coupling = new Map<string, { partners: number; weight: number }>();
  for (const pair of input.coChanges ?? []) {
    const strength =
      Math.min(1, pair.changeCount / 10) * decay(pair.observedAt, now);
    if (strength <= 0) continue;
    for (const [path, partner] of [
      [pair.pathA, pair.pathB],
      [pair.pathB, pair.pathA],
    ] as const) {
      if (!byPath.has(path) || !byPath.has(partner)) continue;
      const held = coupling.get(path) ?? { partners: 0, weight: 0 };
      coupling.set(path, {
        partners: held.partners + 1,
        weight: held.weight + strength,
      });
    }
  }

  // An advisory names a package, not a file. The manifest that declares the
  // dependency is the file somebody would open, so that is where it lands.
  const auditWeight =
    input.dependencyAudit && input.dependencyAudit.counts.total > 0
      ? Math.min(1, input.dependencyAudit.counts.total / 5)
      : 0;
  const manifestPaths = input.dependencyAudit
    ? [...byPath.keys()].filter((path) =>
        /(^|\/)(package\.json|pyproject\.toml)$/.test(path),
      )
    : [];
  const manifests = new Set(manifestPaths);

  const entries: RiskEntry[] = [];
  for (const artifact of input.artifacts) {
    const factors: RiskFactor[] = [];

    const findings = findingCounts.get(artifact.path) ?? 0;
    if (findings > 0) {
      factors.push({
        detail: `${findings} open finding${findings === 1 ? "" : "s"} anchored here`,
        kind: "open-finding",
        weight: round(findings * FINDING_WEIGHT),
      });
    }

    if (codePaths.has(artifact.path) && !testedPaths.has(artifact.path)) {
      const covered = measured?.has(artifact.path) ?? false;
      if (!covered) {
        factors.push({
          detail:
            measured === null
              ? "no test edge points at this file, and no coverage report has been read"
              : "no test edge points at this file, and no coverage report executed it",
          kind: "untested",
          weight: UNTESTED_WEIGHT,
        });
      }
    }

    const dependents = fanIn.get(artifact.path) ?? 0;
    if (dependents > 0) {
      const share =
        topImportance > 0
          ? (importance.get(artifact.path) ?? 0) / topImportance
          : 0;
      factors.push({
        detail: `${dependents} file${dependents === 1 ? "" : "s"} import or call this file`,
        kind: "fan-in",
        weight: round(share * FAN_IN_WEIGHT),
      });
    }

    const coupled = coupling.get(artifact.path);
    if (coupled && coupled.weight > 0) {
      factors.push({
        detail: `changes with ${coupled.partners} other file${coupled.partners === 1 ? "" : "s"} in recent history`,
        kind: "co-changed",
        weight: round(Math.min(1, coupled.weight) * CO_CHANGE_WEIGHT),
      });
    }

    if (auditWeight > 0 && manifests.has(artifact.path)) {
      const total = input.dependencyAudit?.counts.total ?? 0;
      factors.push({
        detail: `${total} dependency advisor${total === 1 ? "y" : "ies"} against this manifest`,
        kind: "dependency-audit",
        weight: round(auditWeight * AUDIT_WEIGHT),
      });
    }

    if (factors.length === 0) continue;
    const score = round(
      factors.reduce((total, factor) => total + factor.weight, 0),
    );
    entries.push({
      factors,
      grade: "inferred",
      level: levelFor(score),
      nodeId: artifact.nodeId,
      path: artifact.path,
      score,
    });
  }

  const unmeasured: UnmeasuredSignal[] = [];
  if (input.coverage === null || input.coverage === undefined) {
    unmeasured.push({
      reason:
        "no coverage report has been read for this repository, so execution of untested files is unknown rather than absent",
      signal: "coverage",
    });
  }
  if (!input.dependencyAudit) {
    unmeasured.push({
      reason:
        "no dependency audit has been uploaded, so advisories are unknown rather than zero",
      signal: "dependency-audit",
    });
  }

  return {
    // Riskiest first; ties by path so the order never depends on input order.
    entries: entries.sort(
      (left, right) =>
        right.score - left.score || left.path.localeCompare(right.path),
    ),
    unmeasured,
  };
}
