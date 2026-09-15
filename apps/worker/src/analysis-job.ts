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
  ingestCiTestReports,
  ingestCoverageReports,
  isScannableCommitSha,
  prepareAssuranceContexts,
  requirementImplementationLinks,
  RECEIPT_PREDICATE_TYPE,
  RECEIPT_TOOL,
  type AssuranceFinding,
  type AssuranceSourceFile,
  type CiCheckRun,
  type CiReportArtifact,
  type CoverageReportArtifact,
  type InTotoStatement,
  type RequirementImplementationLink,
} from "@alrescha/core";

import {
  ciEvidenceRecords,
  type CiEvidenceInput,
  type PersistedEvidence,
  type PersistedEvidenceEdge,
} from "./ci-evidence";
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
  /**
   * The code node the finding is about, when the rule named one. The source
   * node stays the document that raised it; this is the second anchor, so a
   * risk view over code is reachable at all (R5 §2.2 D8).
   */
  readonly targetNodeId: string | null;
  readonly title: string;
}

/**
 * A requirement→code `implements` edge (Phase 4 Wave A todo 1).
 *
 * `reference` tier, confidence capped by the engine: the link is a name
 * match between a requirement statement and an exported symbol, which is
 * evidence of intent, not of execution (WORK_SPEC §3-1).
 */
export interface PersistedImplementsEdge {
  readonly confidence: number;
  readonly provenance: unknown;
  readonly requirementId: string;
  readonly targetNodeId: string;
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
   * Paths carrying an incoming `tests` edge — what the scan derived from the
   * repository's own test imports. Read from the graph rather than guessed
   * here so both ingest paths (GitHub, CLI) feed the rules the same set.
   */
  loadTestedPaths(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<readonly string[]>;
  /**
   * Upsert the requirements this analysis extracted (graph node + row), the
   * `implements` edges they carry, and mark the active ones that no longer
   * appear as superseded. One call because the edges reference the nodes:
   * a separate write could land between the two and violate the key.
   */
  reconcileRequirements(input: {
    implementsEdges: readonly PersistedImplementsEdge[];
    repositoryId: string;
    requirements: readonly PersistedRequirement[];
    workspaceId: string;
  }): Promise<RequirementsDelta>;
  /**
   * Replace this repository's CI-sourced evidence with what this analysis
   * found (Wave C todo 18). Wholesale, because an evidence row is a claim
   * about one commit: keeping the previous commit's rows would leave the map
   * showing a `verified` file whose test no longer runs.
   */
  reconcileCiEvidence(input: {
    edges: readonly PersistedEvidenceEdge[];
    evidence: readonly PersistedEvidence[];
    repositoryId: string;
    workspaceId: string;
  }): Promise<EvidenceDelta>;
  /**
   * Record the commit this analysis covered and bump the repository's data
   * revision (`publish_repository_change`, remedy S6). Until this call
   * existed the scan published and the analysis never did, so every reader
   * of the basis saw `analysis: pending` forever (Wave C todo 16).
   */
  publishAnalyzedCommit(input: {
    commitSha: string;
    repositoryId: string;
    workspaceId: string;
  }): Promise<void>;
}

export interface EvidenceDelta {
  readonly removed: number;
  /** Rows with a `supports` verdict — the only ones that carry a grade. */
  readonly supporting: number;
  readonly written: number;
}

/**
 * The CI artifacts and check runs for one commit, fetched from the host
 * (Wave C todo 18). Optional: a repository with no installation, no Actions,
 * or a throttled API still analyses — it simply produces no execution
 * evidence, which is the honest reading rather than a failed job.
 */
export interface CiEvidenceCollector {
  (input: {
    analyzedCommitSha: string;
    repositoryFullName: string;
    repositoryId: string;
    workspaceId: string;
  }): Promise<CollectedCiEvidence | null>;
}

export interface CollectedCiEvidence {
  readonly checkRuns: readonly CiCheckRun[];
  readonly coverage: readonly CoverageReportArtifact[];
  readonly reports: readonly CiReportArtifact[];
}

export interface AnalysisJobDependencies {
  /** Fetches CI evidence for the analysed commit; omitted disables it. */
  readonly collectCiEvidence?: CiEvidenceCollector;
  /**
   * Told how many bodies the job is about to read, before the first one, so
   * a source can fetch them all at once (one archive request instead of one
   * per file — PR #9 follow-up) and hand back the release that drops them.
   * Omitted, every body is read on its own as before.
   */
  readonly prepareSources?: (input: {
    commitSha: string;
    reads: number;
    repositoryFullName: string;
    repositoryId: string;
    workspaceId: string;
  }) => Promise<() => void>;
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
  /**
   * Queue the doc-page skeleton pass once the analysis is published (todo
   * 20). After, not before: the skeleton's citation candidates are the
   * edges that touch a member, and `implements` and `tests` edges are this
   * job's. Omitted, no pass is queued — the local runner and the tests
   * that do not care about pages leave it out.
   */
  readonly enqueueDocSkeleton?: (input: {
    commitSha: string;
    repositoryId: string;
    runId: string;
    workspaceId: string;
  }) => Promise<void>;
}

/**
 * The commit this job analyses. The null sha is refused with the malformed
 * ones: at a commit GitHub cannot serve, every body read is a 404, which
 * `readSource` must treat as "file vanished" — so the job would not fail, it
 * would drop every document and test, supersede every requirement, resolve
 * every finding and write a receipt for a commit that does not exist.
 */
function commitShaOf(job: ClaimedJob): string {
  const commitSha = (job.payload as { commitSha?: unknown }).commitSha;
  if (typeof commitSha !== "string" || !isScannableCommitSha(commitSha)) {
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
    targetNodeId: finding.targetPath
      ? (nodeByPath.get(finding.targetPath) ?? null)
      : null,
    title: finding.summary,
  };
}

const REQUIREMENT_LABEL_LIMIT = 80;

/**
 * The requirements the prepared contexts extracted, keyed for the graph. The
 * REQ code is the identity when the document names one; otherwise the
 * statement itself is, so a reworded sentence supersedes rather than mutates.
 */
function requirementNodeId(
  documentPath: string,
  identity: string,
  scope: { readonly repositoryId: string; readonly workspaceId: string },
): string {
  return deterministicUlid(
    `${scope.workspaceId}|${scope.repositoryId}|${documentPath}|${identity}`,
  );
}

/**
 * The `implements` edges the same requirements carry (Phase 4 Wave A todo 1).
 *
 * Until this, `reconcileRequirements` wrote requirement nodes and rows and no
 * edge at all, so every requirement was an isolated node and coverage was not
 * a low number but an unmeasurable one (R5 §2.2 D6). The identity keying is
 * the same one `persistedRequirements` uses, so an edge cannot point at a
 * requirement node this analysis did not also write.
 */
export function persistedImplementsEdges(
  links: readonly RequirementImplementationLink[],
  nodeByPath: ReadonlyMap<string, string>,
  scope: { readonly repositoryId: string; readonly workspaceId: string },
): PersistedImplementsEdge[] {
  const seen = new Set<string>();
  const edges: PersistedImplementsEdge[] = [];
  for (const link of links) {
    const sourceArtifactId = nodeByPath.get(link.documentPath);
    const targetNodeId = nodeByPath.get(link.targetPath);
    if (!sourceArtifactId || !targetNodeId) continue;
    const requirementId = requirementNodeId(
      link.documentPath,
      link.identity,
      scope,
    );
    const key = `${requirementId}|${targetNodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      confidence: link.confidence,
      provenance: {
        method: link.method,
        reason: `requirement statement names the exported symbol ${link.symbol}`,
        sourceArtifactId,
        span: {
          endLine: link.span.endLine,
          path: link.span.path,
          startLine: link.span.startLine,
        },
        symbol: link.symbol,
        tier: link.tier,
      },
      requirementId,
      targetNodeId,
    });
  }
  return edges;
}

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
      const id = requirementNodeId(context.file.path, identity, scope);
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

/**
 * Requirement graph nodes by the REQ code they carry.
 *
 * `ingestCiTestReports` keys evidence by the code it finds in a test name;
 * the graph keys requirements by a content-derived id. This is the join, and
 * it is a multimap because two documents may state the same code — a report
 * naming it supports both, and picking one would be a guess.
 */
export function requirementNodesByCode(
  requirements: readonly PersistedRequirement[],
): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  for (const requirement of requirements) {
    if (!/^REQ-[A-Z\d]+(?:-[A-Z\d]+)*$/.test(requirement.label)) continue;
    byCode.set(requirement.label, [
      ...(byCode.get(requirement.label) ?? []),
      requirement.id,
    ]);
  }
  return byCode;
}

/**
 * Collect and parse the CI evidence for one commit, or return an empty set.
 *
 * Every failure mode ends the same way — no evidence — because none of them
 * is a defect in the repository being analysed: no collector wired, no
 * installation, no Actions, a throttled API, a report that will not parse.
 * Failing the analysis over any of them would replace a missing grade with a
 * missing analysis.
 */
async function collectedCiEvidence(input: {
  analyzedCommitSha: string;
  collect: CiEvidenceCollector | undefined;
  nodeByPath: ReadonlyMap<string, string>;
  repositoryFullName: string;
  requirementNodesByCode: ReadonlyMap<string, readonly string[]>;
  scope: { readonly repositoryId: string; readonly workspaceId: string };
}): Promise<CiEvidenceInput> {
  const empty = {
    analyzedCommitSha: input.analyzedCommitSha,
    measured: [],
    nodeByPath: input.nodeByPath,
    requirementNodesByCode: input.requirementNodesByCode,
    scope: input.scope,
    testFiles: [],
  } satisfies CiEvidenceInput;
  if (!input.collect) return empty;

  let collected: CollectedCiEvidence | null;
  try {
    collected = await input.collect({
      analyzedCommitSha: input.analyzedCommitSha,
      repositoryFullName: input.repositoryFullName,
      repositoryId: input.scope.repositoryId,
      workspaceId: input.scope.workspaceId,
    });
  } catch (error) {
    // Still not a job failure — but not silent either. The production
    // rollout of 2026-09-15 ran with every artifact download refused (415)
    // and nothing said so; the analysis succeeded with zero evidence and
    // the only trace was a grade that never appeared. The message names the
    // endpoint class and status, never a body or a token.
    console.warn(
      `  ci evidence collection failed: ${
        error instanceof Error ? error.message : String(error)
      } — no evidence recorded for ${input.analyzedCommitSha}`,
    );
    return empty;
  }
  if (!collected) return empty;

  const ingestion = ingestCiTestReports({
    analyzedCommitSha: input.analyzedCommitSha,
    checkRuns: collected.checkRuns,
    reports: collected.reports,
  });
  if (ingestion.diagnostics.length > 0) {
    // A report that would not parse discards the whole run's evidence
    // (`tests/ci-evidence.test.ts`); say which artifact, not what was in it.
    console.warn(
      `  ci evidence: ${ingestion.diagnostics.length} report(s) failed to parse (${ingestion.diagnostics
        .map(({ artifactName }) => artifactName)
        .join(", ")}) — no evidence recorded for ${input.analyzedCommitSha}`,
    );
  }
  return {
    ...empty,
    measured: ingestCoverageReports(collected.coverage).measured,
    testFiles: ingestion.testFiles,
  };
}

export function createAnalysisJobHandler(
  dependencies: AnalysisJobDependencies,
): JobHandler {
  const { collectCiEvidence, prepareSources, readSource, store } = dependencies;

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
    const reads = artifacts.filter(assuranceSourceRequired).length;
    const releaseSources = prepareSources
      ? await prepareSources({
          commitSha,
          reads,
          repositoryFullName,
          repositoryId,
          workspaceId,
        })
      : () => {};
    try {
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
    } finally {
      releaseSources();
    }

    const nodeByPath = new Map(
      artifacts.map((artifact) => [artifact.path, artifact.nodeId]),
    );
    // Both calls below re-parse the same `files` (remark over every
    // document) independently by default; preparing once here halves that
    // work for the one job that always needs both.
    const prepared = prepareAssuranceContexts(files);
    const scope = { repositoryId, workspaceId };
    // The requirements the rules reason about become graph rows too (OQ-023):
    // until now they were extracted, used for findings, and dropped, which
    // left every requirement surface empty in production. Their `implements`
    // edges land in the same call (Phase 4 Wave A todo 1).
    const requirements = persistedRequirements(prepared, nodeByPath, scope);
    await store.reconcileRequirements({
      implementsEdges: persistedImplementsEdges(
        requirementImplementationLinks({ files, prepared }),
        nodeByPath,
        scope,
      ),
      repositoryId,
      requirements,
      workspaceId,
    });
    // CI evidence, after the requirements so a `supports` edge has a node to
    // point at (Wave C todo 18). It runs whatever the collector returns,
    // including nothing: a repository with no Actions produces no evidence
    // and no `verified` node, which is the honest reading of "we have not
    // seen this run".
    const evidenceDelta = await store.reconcileCiEvidence({
      ...ciEvidenceRecords(
        await collectedCiEvidence({
          analyzedCommitSha: commitSha,
          collect: collectCiEvidence,
          nodeByPath,
          repositoryFullName,
          requirementNodesByCode: requirementNodesByCode(requirements),
          scope,
        }),
      ),
      repositoryId,
      workspaceId,
    });
    if (evidenceDelta.written > 0 || evidenceDelta.removed > 0) {
      // The one number worth saying out loud: how much of this run's evidence
      // actually carries a grade. Rows with an `unknown` verdict are recorded
      // and promote nothing, and a silent count would hide that difference.
      console.log(
        `  ci evidence ${evidenceDelta.written} row(s), ${evidenceDelta.supporting} supporting, ${evidenceDelta.removed} removed`,
      );
    }
    // What the repository's own tests reach, as the scan resolved it — the
    // input the `untested-code` rule needs and cannot derive from metadata.
    const testedPaths = await store.loadTestedPaths({
      repositoryId,
      workspaceId,
    });
    const findings = analyzeRepositoryAssurance({
      files,
      prepared,
      testedPaths,
    });
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
    // Last, so a reader that sees `analysis: current` at this commit can
    // rely on every row above being there.
    await store.publishAnalyzedCommit({ commitSha, repositoryId, workspaceId });
    // And the pages, from the rows that now exist. Idempotent per commit,
    // so a retried analysis queues the same pass once.
    await dependencies.enqueueDocSkeleton?.({
      commitSha,
      repositoryId,
      runId: job.runId ?? job.id,
      workspaceId,
    });
  };
}
