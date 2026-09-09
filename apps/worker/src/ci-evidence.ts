/**
 * CI reports, shaped for the graph (Phase 4 Wave C todo 18, D12).
 *
 * `ingestCiTestReports` has parsed GitHub Actions artifacts since Phase 2C
 * and `GitHubCiEvidenceSource` has fetched them, but nothing ever wrote an
 * `evidence` row: the `verified` grade the map reads for
 * (`workspace-map.ts` — a `test`/`ci` row with a `supports` verdict, and the
 * edges out of it) was unreachable in production. This is the join.
 *
 * **What becomes verified, and what does not.** Two claims are direct enough
 * to carry the grade:
 *
 * - the **test file** ran and passed at the analysed commit — a `tests` edge
 *   out of the evidence node onto the file;
 * - the **requirement** its test name names is supported by that run — a
 *   `supports` edge onto the requirement node.
 *
 * The code *under* the test is not promoted. The scan's file→file `tests`
 * edges are import-derived: they say a test file imports a source file, not
 * that the run executed it. Turning that into `verified` would be inference
 * wearing an execution grade, which is the one thing ADR-001 forbids.
 *
 * Coverage says which files a run actually executed, and it is recorded —
 * as measurement, with an `unknown` verdict and no edge. It promotes
 * nothing; it is the difference between "this file has no coverage" and
 * "nobody measured", which is what the risk map needs to grey a file out
 * instead of reddening it (todo 21).
 */

import {
  resolveReportedPath,
  type CiRequirementEvidence,
  type MeasuredFile,
} from "@alrescha/core";

import { deterministicUlid } from "./deterministic-id";

/** An `evidence` row, with the graph node it needs. */
export interface PersistedEvidence {
  readonly id: string;
  readonly kind: "ci" | "test";
  /** Node label — short, and never a report body. */
  readonly label: string;
  readonly metadata: Record<string, unknown>;
  readonly sourceArtifactId: string;
  readonly verdict: "supports" | "unknown";
}

/** An edge out of an evidence node. Nothing else writes one. */
export interface PersistedEvidenceEdge {
  readonly confidence: number;
  readonly evidenceId: string;
  readonly provenance: Record<string, unknown>;
  readonly relation: "supports" | "tests";
  readonly targetNodeId: string;
}

export interface CiEvidenceRecords {
  readonly edges: readonly PersistedEvidenceEdge[];
  readonly evidence: readonly PersistedEvidence[];
}

export interface CiEvidenceInput {
  readonly analyzedCommitSha: string;
  /** Files a coverage report executed, as the report named them. */
  readonly measured: readonly MeasuredFile[];
  readonly nodeByPath: ReadonlyMap<string, string>;
  /** Requirement graph nodes by the REQ code they carry, from this analysis. */
  readonly requirementNodesByCode: ReadonlyMap<string, readonly string[]>;
  readonly scope: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  };
  readonly testEvidence: readonly CiRequirementEvidence[];
}

const LABEL_LIMIT = 80;

function truncated(value: string): string {
  return value.length > LABEL_LIMIT
    ? `${value.slice(0, LABEL_LIMIT - 1)}…`
    : value;
}

function evidenceId(
  scope: CiEvidenceInput["scope"],
  parts: readonly string[],
): string {
  return deterministicUlid(
    [scope.workspaceId, scope.repositoryId, ...parts].join("|"),
  );
}

/**
 * The evidence rows and edges one analysis should hold.
 *
 * Ids are derived from the analysed commit and what the evidence is about, so
 * re-analysing a commit converges on the same rows and a new commit produces
 * new ones — which is what lets the store replace a repository's CI evidence
 * wholesale rather than accumulating every run it ever saw.
 */
export function ciEvidenceRecords(input: CiEvidenceInput): CiEvidenceRecords {
  const scannedPaths = new Set(input.nodeByPath.keys());
  const evidence: PersistedEvidence[] = [];
  const edges: PersistedEvidenceEdge[] = [];
  const seen = new Set<string>();

  for (const requirement of input.testEvidence) {
    // Group the run's sources by the repository file they came from: one
    // evidence row per (requirement, test file) is the finest grain the
    // report supports, and the coarsest that still names a file.
    const byTestPath = new Map<string, typeof requirement.sources>();
    for (const source of requirement.sources) {
      const path = resolveReportedPath(source.testFile, scannedPaths);
      if (path === null) continue;
      byTestPath.set(path, [...(byTestPath.get(path) ?? []), source]);
    }

    for (const [testPath, sources] of [...byTestPath].sort(([left], [right]) =>
      left < right ? -1 : 1,
    )) {
      const testNodeId = input.nodeByPath.get(testPath);
      if (testNodeId === undefined) continue;
      const id = evidenceId(input.scope, [
        "ci-test",
        input.analyzedCommitSha,
        requirement.requirementId,
        testPath,
      ]);
      if (seen.has(id)) continue;
      seen.add(id);

      evidence.push({
        id,
        kind: "test",
        label: truncated(`${requirement.requirementId} · ${testPath}`),
        metadata: {
          analyzedCommitSha: input.analyzedCommitSha,
          artifacts: sources.map((source) => ({
            artifactId: source.artifactId,
            artifactName: source.artifactName,
            format: source.format,
            headSha: source.headSha,
          })),
          grade: requirement.grade,
          reason: requirement.reason,
          requirementCode: requirement.requirementId,
          source: "ci",
          testNames: sources.map((source) => source.testName).sort(),
        },
        sourceArtifactId: testNodeId,
        // `unknown` where the run did not verify: the row records what was
        // found, and the map promotes nothing from it (ADR-001).
        verdict: requirement.verdict === "supports" ? "supports" : "unknown",
      });

      // The file ran and passed — the one claim the report makes directly.
      edges.push({
        confidence: requirement.grade === "verified" ? 1 : 0.6,
        evidenceId: id,
        provenance: {
          method: "ci-report",
          reason: `CI ran ${testPath} at ${input.analyzedCommitSha}`,
          tier: requirement.grade === "verified" ? "resolved" : "reference",
        },
        relation: "tests",
        targetNodeId: testNodeId,
      });

      // …and the requirement its test name claims, when this analysis wrote
      // a node for that code. A report naming a requirement no document
      // states gets no edge rather than a dangling one.
      for (const requirementNodeId of input.requirementNodesByCode.get(
        requirement.requirementId,
      ) ?? []) {
        edges.push({
          confidence: requirement.grade === "verified" ? 1 : 0.6,
          evidenceId: id,
          provenance: {
            method: "ci-report",
            reason: `test name names ${requirement.requirementId}`,
            tier: requirement.grade === "verified" ? "resolved" : "reference",
          },
          relation: "supports",
          targetNodeId: requirementNodeId,
        });
      }
    }
  }

  // Coverage: measurement, not support. No edge, `unknown` verdict — a
  // measured file is not a verified one, and the absence of this row is what
  // separates "not covered" from "never measured".
  for (const file of input.measured) {
    const path = resolveReportedPath(file.reportedPath, scannedPaths);
    const nodeId = path === null ? undefined : input.nodeByPath.get(path);
    if (path === null || nodeId === undefined) continue;
    const id = evidenceId(input.scope, [
      "ci-coverage",
      input.analyzedCommitSha,
      path,
    ]);
    if (seen.has(id)) continue;
    seen.add(id);
    evidence.push({
      id,
      kind: "ci",
      label: truncated(`coverage · ${path}`),
      metadata: {
        analyzedCommitSha: input.analyzedCommitSha,
        artifactId: file.artifactId,
        artifactName: file.artifactName,
        format: file.format,
        // Measured, with no number attached: a percentage on a repository
        // that never ran a coverage job reads as 0%, and "not measured" is a
        // different fact from "measured at zero".
        measured: true,
        reportedPath: file.reportedPath,
        source: "ci",
      },
      sourceArtifactId: nodeId,
      verdict: "unknown",
    });
  }

  return { edges, evidence };
}
