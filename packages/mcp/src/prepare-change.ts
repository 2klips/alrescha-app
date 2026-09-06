import { impactOf, type DependencyImpact } from "./graph-tools";
import { getWorkspaceArtifact } from "./data-brain";
import type { ArtifactCard } from "@alrescha/core";
import type {
  McpArtifactMatch,
  McpEdgeOmission,
  McpWorkspaceData,
} from "./store";

/**
 * Everything a change to one file has to account for, composed once (Codex
 * remedy §9.1, step S5).
 *
 * **This registers no tool.** The tool catalogue is budgeted at ≤16 and todo
 * 22 owns where these pieces surface; what belongs here is the composition
 * itself, so the order and the omissions are decided in one place instead of
 * separately by whichever caller assembles them next.
 *
 * Deterministic selection, in the order a person would want it:
 *
 * 1. the target's card — what the file is, from stored facts;
 * 2. the consumers a change reaches, directionally (S4);
 * 3. the tests that reach any of them;
 * 4. what is missing, from the card and from the read's own omissions.
 *
 * It does not write prose and it does not claim to replace reading the
 * source. What it hands back are **locations** — a card, node ids and paths —
 * so the reader opens the right files instead of the nearest ones.
 */

export interface ChangeBrief {
  /** Consumers to look at, with the path each was reached by. */
  readonly consumers: DependencyImpact | null;
  /** Where the answer is thin, from the card and the read together. */
  readonly missing: readonly string[];
  readonly omissions: readonly McpEdgeOmission[];
  readonly target: {
    readonly card: ArtifactCard | null;
    readonly nodeId: string | null;
    readonly path: string;
  };
}

export function prepareChange(
  workspace: McpWorkspaceData,
  selector: { readonly id?: string; readonly path?: string },
  found?: readonly McpArtifactMatch[],
): ChangeBrief {
  const artifact = getWorkspaceArtifact(workspace, selector, found);
  const nodeId = artifact.artifact?.id ?? null;
  const impact = nodeId
    ? impactOf(workspace, nodeId, 2, "dependency-impact")
    : null;

  const missing = [...(artifact.card?.missing ?? [])];
  if (artifact.ambiguous) {
    missing.push(
      `${artifact.ambiguous.candidates.length} repositories answer to this path; name one`,
    );
  }
  if (nodeId === null && !artifact.ambiguous) {
    missing.push("no artifact is stored at this path");
  }
  if (impact?.dependencyImpact && !impact.dependencyImpact.complete) {
    missing.push(
      `the consumer walk stopped on its ${impact.dependencyImpact.stoppedBy} budget, so the list is a floor`,
    );
  }

  return {
    consumers: impact?.dependencyImpact ?? null,
    missing,
    omissions: impact?.omissions ?? [],
    target: {
      card: artifact.card,
      nodeId,
      path: artifact.artifact?.path ?? selector.path ?? "",
    },
  };
}
