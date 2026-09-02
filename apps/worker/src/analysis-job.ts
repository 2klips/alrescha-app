/**
 * The `analyze` job: stored artifacts → findings → receipt.
 *
 * The rules engine has been in @alrescha/core since Phase 2B and the queue has been
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
  assuranceCoverage,
  assuranceSourceRequired,
  digestInTotoStatement,
  prepareAssuranceContexts,
  RECEIPT_PREDICATE_TYPE,
  RECEIPT_TOOL,
  type AssuranceFinding,
  type AssuranceSourceFile,
  type InTotoStatement,
} from "@alrescha/core";

import { deterministicUlid } from "./deterministic-id";
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

/**
 * A requirement the analysis extracted, shaped for the graph (OQ-023 ⑴).
 * `id` is content-derived so re-analysis converges on the same node; the
 * statement is spec-document text (graph metadata), never a source body.
 */
export interface PersistedRequirement {
  readonly id: string;
  readonly label: string;
  readonly origin: string;
  readonly sourceArtifactId: string;
  readonly sourceSpan: {
    readonly endLine: number;
    readonly path: string;
    readonly startLine: number;
  };
  readonly statement: string;
}

export interface RequirementsDelta {
  readonly active: number;
  readonly superseded: number;
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
  /**
   * Upsert the requirements this analysis extracted (graph node + row) and
   * mark the active ones that no longer appear as superseded.
   */
  reconcileRequirements(input: {
    repositoryId: string;
    requirements: readonly PersistedRequirement[];
    workspaceId: string;
  }): Promise<RequirementsDelta>;
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
  /** Clock for the receipt's analyzedAt; injectable for deterministic tests. */
  readonly now?: () => Date;
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
      reason: `deterministic ${finding.type} rule`,
      spans: finding.provenance,
      suggestedAction: finding.suggestedAction,
    },
    severity: finding.severity,
    sourceNodeId: firstPath ? (nodeByPath.get(firstPath) ?? null) : null,
    title: finding.summary,
  };
}

const REQUIREMENT_LABEL_LIMIT = 80;

/**
 * The requirements the prepared contexts extracted, keyed for the graph. The
 * REQ code is the identity when the document names one; otherwise the
 * statement itself is, so a reworded sentence supersedes rather than mutates.
 */
export function persistedRequirements(
  prepared: ReturnType<typeof prepareAssuranceContexts>,
  nodeByPath: ReadonlyMap<string, string>,
  scope: { readonly repositoryId: string; readonly workspaceId: string },
): PersistedRequirement[] {
  const seen = new Set<string>();
  const requirements: PersistedRequirement[] = [];
  for (const context of prepared.contexts) {
    const sourceArtifactId = nodeByPath.get(context.file.path);
    if (!sourceArtifactId) continue;
    for (const requirement of context.requirements) {
      const identity = requirement.id ?? requirement.statement;
      const id = deterministicUlid(
        `${scope.workspaceId}|${scope.repositoryId}|${context.file.path}|${identity}`,
      );
      if (seen.has(id)) continue;
      seen.add(id);
      const label = requirement.id ?? requirement.statement;
      requirements.push({
        id,
        label:
          label.length > REQUIREMENT_LABEL_LIMIT
            ? `${label.slice(0, REQUIREMENT_LABEL_LIMIT - 1)}…`
            : label,
        origin: requirement.origin,
        sourceArtifactId,
        sourceSpan: {
          endLine: requirement.span.endLine,
          path: requirement.span.path,
          startLine: requirement.span.startLine,
        },
        statement: requirement.statement,
      });
    }
  }
  return requirements;
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
    // Both calls below re-parse the same `files` (remark over every
    // document) independently by default; preparing once here halves that
    // work for the one job that always needs both.
    const prepared = prepareAssuranceContexts(files);
    // The requirements the rules reason about become graph rows too (OQ-023):
    // until now they were extracted, used for findings, and dropped, which
    // left every requirement surface empty in production.
    await store.reconcileRequirements({
      repositoryId,
      requirements: persistedRequirements(prepared, nodeByPath, {
        repositoryId,
        workspaceId,
      }),
      workspaceId,
    });
    const findings = analyzeRepositoryAssurance({ files, prepared });
    const delta = await store.reconcileFindings({
      findings: findings.map((finding) => persisted(finding, nodeByPath)),
      repositoryId,
      workspaceId,
    });

    const statement: InTotoStatement = {
      _type: "https://in-toto.io/Statement/v1",
      predicate: {
        analyzedAt: (dependencies.now?.() ?? new Date()).toISOString(),
        commitSha,
        coverage: assuranceCoverage({ files, prepared }),
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
        tool: RECEIPT_TOOL,
      },
      predicateType: RECEIPT_PREDICATE_TYPE,
      subject: [
        { digest: { sha1: commitSha }, name: "git:commit" as const },
        ...artifacts.map(({ digest, path }) => ({
          digest: { sha256: digest },
          name: path,
        })),
      ],
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
