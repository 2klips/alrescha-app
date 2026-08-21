/**
 * The `analyze` job: stored artifacts → findings → receipt.
 *
 * The rules engine has been in @arr/core since Phase 2B and the queue has been
 * enqueuing `analyze` jobs since the first webhook, but nothing joined the two
 * — and nothing anywhere wrote a receipt row. This is that join.
 *
 * Three properties the shape is chosen to protect:
 *
 *  - **Bodies stay transient.** The store hands over metadata only; the file
 *    text arrives from an injected `readSource` and is never returned, stored,
 *    or logged. Only the bodies the rules actually read are fetched, decided by
 *    `assuranceSourceRequired` in core rather than by a guess here.
 *  - **Re-analysis converges.** Findings carry the engine's own deterministic
 *    id as a fingerprint, so a second run over the same commit updates rather
 *    than duplicates, and a finding that no longer reproduces is resolved.
 *  - **The receipt describes what was analysed.** Its subjects are the scanned
 *    artifacts with the digests the scan recorded, and its digest is computed
 *    over the canonical statement — so a later verify can catch tampering.
 */

import {
  analyzeRepositoryAssurance,
  assuranceSourceRequired,
  digestInTotoStatement,
  type AssuranceFinding,
  type AssuranceSourceFile,
  type InTotoStatement,
} from "@arr/core";

import type { ClaimedJob } from "./queue";
import type { JobHandler } from "./worker";

/** Metadata the scan already stored. Never carries a file body. */
export interface StoredArtifact {
  readonly classification: AssuranceSourceFile["classification"];
  /** sha256 of the file at the scanned commit — the receipt's subject digest. */
  readonly digest: string;
  readonly exportedSymbols: NonNullable<AssuranceSourceFile["exportedSymbols"]>;
  readonly nodeId: string;
  readonly path: string;
}

export interface PersistedFinding {
  readonly confidence: number;
  readonly evidenceGrade: AssuranceFinding["grade"];
  readonly fingerprint: string;
  readonly kind: AssuranceFinding["type"];
  readonly provenance: unknown;
  readonly severity: AssuranceFinding["severity"];
  readonly sourceNodeId: string | null;
  readonly title: string;
}

export interface FindingsDelta {
  readonly openTotal: number;
  readonly opened: readonly string[];
  readonly resolved: readonly string[];
}

export interface AnalysisJobStore {
  /** Metadata for every artifact the scan recorded at this commit. */
  loadArtifacts(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<readonly StoredArtifact[]>;
  /** Digest of the newest receipt, so receipts chain. */
  latestReceiptDigest(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<string | null>;
  recordReceipt(input: {
    commitSha: string;
    delta: FindingsDelta;
    digest: string;
    repositoryId: string;
    runId: string;
    statement: InTotoStatement;
    workspaceId: string;
  }): Promise<string>;
  repositoryFullName(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<string>;
  /**
   * Upsert the findings that reproduce and resolve the ones that no longer do,
   * returning the delta the receipt reports.
   */
  reconcileFindings(input: {
    findings: readonly PersistedFinding[];
    repositoryId: string;
    workspaceId: string;
  }): Promise<FindingsDelta>;
}

export interface AnalysisJobDependencies {
  /**
   * Transient read of one file at the analysed commit. Returning null drops the
   * file from the analysis rather than failing the job: a file can vanish
   * between the scan and the analysis, and a missing body is not a defect.
   */
  readSource(input: {
    commitSha: string;
    path: string;
    repositoryFullName: string;
    repositoryId: string;
    workspaceId: string;
  }): Promise<string | null>;
  readonly store: AnalysisJobStore;
}

function commitShaOf(job: ClaimedJob): string {
  const commitSha = (job.payload as { commitSha?: unknown }).commitSha;
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error("analyze job payload has no valid commitSha");
  }
  return commitSha;
}

function persisted(
  finding: AssuranceFinding,
  nodeByPath: ReadonlyMap<string, string>,
): PersistedFinding {
  const firstPath = finding.provenance[0]?.path;
  return {
    confidence: finding.confidence,
    evidenceGrade: finding.grade,
    fingerprint: finding.id,
    kind: finding.type,
    provenance: {
      evidenceLinks: finding.evidenceLinks,
      spans: finding.provenance,
      suggestedAction: finding.suggestedAction,
    },
    severity: finding.severity,
    sourceNodeId: firstPath ? (nodeByPath.get(firstPath) ?? null) : null,
    title: finding.summary,
  };
}

export function createAnalysisJobHandler(
  dependencies: AnalysisJobDependencies,
): JobHandler {
  const { readSource, store } = dependencies;

  return async (job, context) => {
    const commitSha = commitShaOf(job);
    const { repositoryId, workspaceId } = job;
    const repositoryFullName = await store.repositoryFullName({
      repositoryId,
      workspaceId,
    });
    const artifacts = await store.loadArtifacts({ repositoryId, workspaceId });
    if (artifacts.length === 0) {
      throw new Error(
        "analyze ran before any artifact was stored — the scan job for this run has not applied its plan",
      );
    }

    const files: AssuranceSourceFile[] = [];
    for (const artifact of artifacts) {
      const needsSource = assuranceSourceRequired(artifact);
      const source = needsSource
        ? await readSource({
            commitSha,
            path: artifact.path,
            repositoryFullName,
            repositoryId,
            workspaceId,
          })
        : "";
      if (source === null) continue;
      files.push({
        classification: artifact.classification,
        exportedSymbols: artifact.exportedSymbols,
        path: artifact.path,
        source,
      });
      // Fetching bodies is the long part of this job; keep the lease alive.
      if (needsSource) await context.heartbeat();
    }

    const nodeByPath = new Map(
      artifacts.map((artifact) => [artifact.path, artifact.nodeId]),
    );
    const findings = analyzeRepositoryAssurance({ files });
    const delta = await store.reconcileFindings({
      findings: findings.map((finding) => persisted(finding, nodeByPath)),
      repositoryId,
      workspaceId,
    });

    const statement: InTotoStatement = {
      _type: "https://in-toto.io/Statement/v1",
      predicate: {
        commitSha,
        evidence: {
          inferred: findings.filter(({ grade }) => grade === "inferred").length,
          verified: findings.filter(({ grade }) => grade === "verified").length,
        },
        previousReceiptDigest: await store.latestReceiptDigest({
          repositoryId,
          workspaceId,
        }),
        repository: repositoryFullName,
        runId: job.runId ?? job.id,
      },
      predicateType: "https://arr.dev/receipt/v1",
      subject: artifacts.map(({ digest, path }) => ({
        digest: { sha256: digest },
        name: path,
      })),
    };

    await store.recordReceipt({
      commitSha,
      delta,
      digest: await digestInTotoStatement(statement),
      repositoryId,
      runId: job.runId ?? job.id,
      statement,
      workspaceId,
    });
  };
}
