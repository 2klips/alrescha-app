import { buildRiskMap, type RiskEntry } from "@alrescha/core";

import type { McpWorkspaceData } from "./store";

/**
 * The risk map, over what this read carries (todo 21).
 *
 * The screen builds the same map from more: co-change history is not part of
 * a workspace read. Rather than silently ranking on a smaller set of
 * signals, the missing one is named in `coverage.unanswered` — two answers
 * to one question is the failure this codebase keeps repairing, and saying
 * which signals each answer used is how the two stay comparable.
 */
export function workspaceRiskEntries(
  workspace: McpWorkspaceData,
): Map<string, RiskEntry> {
  const artifacts = workspace.repositories.flatMap((repository) =>
    repository.artifacts.map((artifact) => ({
      classification: artifact.kind,
      nodeId: artifact.id,
      path: artifact.path,
    })),
  );
  const pathById = new Map(
    artifacts.map((artifact) => [artifact.nodeId, artifact.path]),
  );
  const measured = workspace.repositories.flatMap((repository) =>
    repository.evidence
      .filter((evidence) => evidence.kind === "ci")
      .flatMap((evidence) => {
        const path = pathById.get(evidence.sourceArtifactId);
        return path ? [path] : [];
      }),
  );
  const map = buildRiskMap({
    artifacts,
    coverage: measured.length === 0 ? null : measured,
    edges: workspace.repositories.flatMap((repository) =>
      repository.edges.flatMap((edge) => {
        const sourcePath = pathById.get(edge.sourceNodeId);
        const targetPath = pathById.get(edge.targetNodeId);
        return sourcePath && targetPath
          ? [{ relation: edge.relation, sourcePath, targetPath }]
          : [];
      }),
    ),
    findings: workspace.repositories.flatMap((repository) =>
      repository.findings.map((finding) => ({
        kind: finding.kind,
        sourcePath:
          "span" in finding.provenance ? finding.provenance.span.path : null,
        status: finding.status,
        targetPath: finding.targetNodeId
          ? (pathById.get(finding.targetNodeId) ?? null)
          : null,
      })),
    ),
  });
  return new Map(map.entries.map((entry) => [entry.nodeId, entry]));
}
