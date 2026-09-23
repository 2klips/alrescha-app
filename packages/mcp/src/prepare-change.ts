import {
  impactOf,
  type DependencyImpact,
  type ImpactBound,
  type ImpactConfidence,
} from "./graph-tools";
import { getWorkspaceArtifact, type ArtifactWithNeighbors } from "./data-brain";
import { estimateTokens } from "./repo-map";
import type { ArtifactCard, SummaryState } from "@alrescha/core";
import type {
  McpArtifactMatch,
  McpEdgeOmission,
  McpWorkspaceData,
} from "./store";

/**
 * Everything a change to one file has to account for, composed once (Codex
 * remedy §9.1, step S5; contract RE-03 ⑶a).
 *
 * **This registers no tool.** What belongs here is the composition itself, so
 * the order and the omissions are decided in one place instead of separately
 * by whichever caller assembles them next.
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
 *
 * ## What 03b changed, and why
 *
 * The brief used to hand back `dependencyImpact` alone. That field's
 * `complete` says only whether the *walk* ran out of graph; it knows nothing
 * about a table that stopped at its row budget or a relation that fell
 * outside the vocabulary. So a brief built on a truncated read reported
 * `complete: true` and an agent concluded a change was safe because it could
 * not see what it would break. `bound`, `boundReasons` and `confidence` were
 * already computed by `impactOf` and thrown away here; now they travel.
 */

/** Consumers past this are a payload, not a list. Stated, never silent. */
export const CHANGE_BRIEF_CONSUMER_CAP = 25;

/**
 * Which commit and revision this answer stands on.
 *
 * Nullable on purpose: `McpReadBasis` is optional per repository — the hosted
 * store attaches it only when its RPC returned a row, and the in-memory store
 * never sets one. A brief that invented a commit would be worse than one that
 * says it has none.
 */
export type ChangeBriefBasis =
  | {
      readonly analyzedCommit: string | null;
      readonly available: true;
      readonly dataRevision: number;
      /**
       * Typed `null` at the source: there is no immutable generation to name,
       * so none is named. Not a placeholder for a value that arrives later.
       */
      readonly graphGeneration: null;
      readonly indexedCommit: string | null;
      readonly readConsistency: string;
      readonly repositoryFullName: string | null;
      readonly repositoryId: string;
      readonly stages: {
        readonly analysis: string;
        readonly structure: string;
      };
    }
  | { readonly available: false; readonly reason: string };

/** The consumers, with how the set was reached and where it stops. */
export interface ChangeBriefConsumers extends DependencyImpact {
  /** `exact` only when the walk, the relations and every row read agree. */
  readonly bound: ImpactBound;
  /** Why it is a floor, when it is. Empty exactly when `bound` is `exact`. */
  readonly boundReasons: readonly string[];
  /** Edge tiers behind the set — how it was reached, not how big it is. */
  readonly confidence: ImpactConfidence;
}

/**
 * What this brief costs, and how that was arrived at.
 *
 * `targetCardTokens` is `target.card` serialised; `briefTokens` is the whole
 * brief serialised, its budget metadata included, less only the
 * `briefTokens` field itself. Both are `ceil(UTF-16 length / 4)` — an
 * approximation, not a provider's billed count, and the wire says so. Neither
 * changes what `token_budget` or `max_chars` mean or cap; the full
 * `get_artifact` response is metered by `emitAccessEvent`, not here.
 */
export interface ChangeBriefBudget {
  readonly approach: string;
  readonly briefTokens: number;
  readonly targetCardTokens: number;
  /** Entries a cap dropped. Empty means none were, not that none exist. */
  readonly truncatedItems: readonly { count: number; of: string }[];
}

export interface ChangeBriefTarget {
  /** True when a path named more than one repository. Nobody picks. */
  readonly ambiguous: boolean;
  /** The repositories that answered, when more than one did. */
  readonly candidates?: readonly {
    readonly artifactId: string;
    readonly repositoryFullName: string;
    readonly repositoryId: string;
  }[];
  readonly card: ArtifactCard | null;
  /** The freshness rule's answer, as the card carries it. Never re-derived. */
  readonly freshness: SummaryState["state"] | null;
  readonly nodeId: string | null;
  readonly path: string;
  /** The blob this row was scanned from; null when none was stored. */
  readonly sourceDigest: string | null;
}

export interface ChangeBrief {
  readonly basis: ChangeBriefBasis;
  readonly budget: ChangeBriefBudget;
  /** Null means *not computed* — never "this file has no consumers". */
  readonly consumers: ChangeBriefConsumers | null;
  /** Where the answer is thin, from the card and the read together. */
  readonly missing: readonly string[];
  readonly omissions: readonly McpEdgeOmission[];
  readonly target: ChangeBriefTarget;
}

const TOKEN_APPROACH =
  "one token per four UTF-16 characters of the serialised value; an approximation, not a provider's billed count";

export function prepareChange(
  workspace: McpWorkspaceData,
  selector: {
    readonly id?: string | undefined;
    readonly path?: string | undefined;
  },
  found?: readonly McpArtifactMatch[],
  /**
   * An already-resolved lookup, when the caller has one. `get_artifact`
   * resolves the target before it decides whether a brief was asked for, and
   * looking the same row up twice is the duplicate read the contract forbids.
   */
  resolved?: ArtifactWithNeighbors,
): ChangeBrief {
  const artifact = resolved ?? getWorkspaceArtifact(workspace, selector, found);
  const nodeId = artifact.artifact?.id ?? null;
  // One walk per target. `impactOf` builds a graph view and expands up to its
  // edge budget; calling it twice to read two of its fields would double that
  // for nothing.
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

  const repository = artifact.artifact
    ? (workspace.repositories.find(
        ({ id }) => id === artifact.artifact?.repositoryId,
      ) ?? null)
    : null;
  const readBasis = repository?.basis ?? null;
  const basis: ChangeBriefBasis =
    readBasis === null
      ? {
          available: false,
          reason:
            "no read basis accompanied this repository; commit and revision cannot be stated",
        }
      : {
          analyzedCommit: readBasis.analyzedCommit,
          available: true,
          dataRevision: readBasis.dataRevision,
          graphGeneration: readBasis.graphGeneration,
          indexedCommit: readBasis.indexedCommit,
          readConsistency: workspace.coverage?.readConsistency ?? "unproven",
          repositoryFullName: repository?.fullName ?? null,
          repositoryId: readBasis.repositoryId,
          stages: readBasis.stages,
        };

  const truncatedItems: { count: number; of: string }[] = [];
  const walk = impact?.dependencyImpact ?? null;
  const overCap = walk
    ? Math.max(0, walk.candidates.length - CHANGE_BRIEF_CONSUMER_CAP)
    : 0;
  if (overCap > 0) truncatedItems.push({ count: overCap, of: "consumers" });

  const consumers: ChangeBriefConsumers | null =
    walk && impact
      ? {
          ...walk,
          bound: overCap > 0 ? "lower-bound" : impact.bound,
          boundReasons: [
            ...impact.boundReasons,
            ...(overCap > 0
              ? [
                  `the brief kept ${CHANGE_BRIEF_CONSUMER_CAP} of ${walk.candidates.length} consumers`,
                ]
              : []),
          ],
          candidates: walk.candidates.slice(0, CHANGE_BRIEF_CONSUMER_CAP),
          confidence: impact.confidence,
        }
      : null;

  const target: ChangeBriefTarget = {
    ambiguous: Boolean(artifact.ambiguous),
    ...(artifact.ambiguous
      ? { candidates: artifact.ambiguous.candidates }
      : {}),
    card: artifact.card,
    freshness: artifact.card?.summary.state ?? null,
    nodeId,
    path: artifact.artifact?.path ?? selector.path ?? "",
    // The hosted decoder writes `""` when the column is null, and an empty
    // digest is no digest.
    sourceDigest: artifact.artifact?.blobSha
      ? artifact.artifact.blobSha
      : null,
  };

  const targetCardTokens = artifact.card
    ? estimateTokens(JSON.stringify(artifact.card))
    : 0;
  /**
   * `briefTokens` counts the whole brief — its budget metadata included —
   * except the `briefTokens` number itself (R-01, post-merge review).
   *
   * The first version counted the brief *without its budget object*, so
   * `approach`, `targetCardTokens` and `truncatedItems` were paid for and
   * never counted, and a capped brief — the one whose metadata grows — was
   * under-reported the most. Leaving out only the one field that cannot
   * count itself is the whole scope a self-describing number can have.
   * JSON length does not depend on key order, so the count is the same
   * however the final object is assembled.
   */
  const withoutCount = {
    basis,
    budget: { approach: TOKEN_APPROACH, targetCardTokens, truncatedItems },
    consumers,
    missing,
    omissions: impact?.omissions ?? [],
    target,
  };
  return {
    ...withoutCount,
    budget: {
      ...withoutCount.budget,
      briefTokens: estimateTokens(JSON.stringify(withoutCount)),
    },
  };
}
