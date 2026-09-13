import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildArtifactCard,
  buildInspectionDashboard,
  buildRiskMap,
  parseNpmAuditReport,
  currentSummaryText,
  summaryState,
  type ArtifactCard,
  type ArtifactClassification,
  type DependencyAuditReport,
  type InspectionDashboard,
  type InspectionDocumentInput,
  type InspectionFindingDetail,
  type InspectionFindingInput,
  type RiskMap,
  type RuledOutAttemptInput,
} from "@alrescha/core";

/**
 * `/inspection` from stored evidence (Phase 2C todo 1).
 *
 * The builder below is pure: rows in, dashboard out. It is deliberately
 * strict — a row whose severity/kind/status is not one the contract knows is
 * dropped rather than coerced, because a mislabelled finding on this screen
 * is worse than a missing one. An empty workspace therefore yields the
 * "증거 부족" states the widgets already render; there is no demo fallback.
 */

export interface InspectionFindingRow {
  readonly confidence?: number | string | null;
  readonly dismissed_reason?: string | null;
  readonly evidence_grade?: string | null;
  readonly id: string;
  readonly kind: string;
  readonly provenance?: unknown;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
}

/**
 * The detail the analysis already stored (todo 19 ⑶).
 *
 * `findings.provenance` is written by `analysis-job.ts` as
 * `{reason, spans, suggestedAction, evidenceLinks}` and the screen read none
 * of it, so a finding arrived as a title and a severity — enough to know
 * something is wrong and not enough to do anything. Shapes that do not match
 * are dropped field by field rather than dropping the finding: a
 * hand-written or older row still shows what it has.
 */
function findingDetail(
  row: InspectionFindingRow,
): InspectionFindingDetail | undefined {
  const provenance =
    typeof row.provenance === "object" &&
    row.provenance !== null &&
    !Array.isArray(row.provenance)
      ? (row.provenance as Record<string, unknown>)
      : {};
  const spans = Array.isArray(provenance.spans)
    ? provenance.spans.flatMap((value) => {
        const span = value as Record<string, unknown>;
        return typeof span?.path === "string" &&
          typeof span.startLine === "number" &&
          typeof span.endLine === "number"
          ? [
              {
                endLine: span.endLine,
                path: span.path,
                startLine: span.startLine,
              },
            ]
          : [];
      })
    : [];
  const confidence = Number(row.confidence ?? Number.NaN);
  return {
    confidence: Number.isFinite(confidence) ? confidence : 0,
    // Anything but the stored word `verified` reads as `inferred`: a grade
    // is a claim about execution evidence, and a malformed row does not get
    // the benefit of the doubt (ADR-001).
    evidenceGrade: row.evidence_grade === "verified" ? "verified" : "inferred",
    evidenceLinks: Array.isArray(provenance.evidenceLinks)
      ? provenance.evidenceLinks.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    reason: typeof provenance.reason === "string" ? provenance.reason : null,
    spans,
    suggestedAction:
      typeof provenance.suggestedAction === "string"
        ? provenance.suggestedAction
        : null,
  };
}

export interface InspectionArtifactRow {
  /** Symbol names as stored — the card carries names, never signatures. */
  readonly exported_symbols?: unknown;
  readonly kind: string;
  readonly last_seen_commit_sha: string | null;
  readonly metadata: unknown;
  readonly path: string;
  /** The blob the scanner last saw, for the freshness rule below. */
  readonly source_blob_sha?: string | null;
}

/**
 * QW-9: the raw shape of a row from the narrowed artifacts query below.
 * Only `metadata->summary` is fetched (not the whole, unbounded jsonb
 * blob) since `artifactSummary` is the only downstream reader of
 * `metadata`. `->` (not `->>`) preserves the JSON value's native type, so
 * a non-string summary still fails `artifactSummary`'s `typeof` check
 * exactly as it would have from the full metadata object.
 *
 * Two scalars joined it for the freshness rule (Codex remedy P0-A): the
 * summary's own digest and the blob the scanner last saw. Both are short
 * strings, so the reason the metadata blob stays out still holds.
 */
interface InspectionArtifactQueryRow {
  readonly exported_symbols: unknown;
  readonly kind: string;
  readonly last_seen_commit_sha: string | null;
  readonly path: string;
  readonly source_blob_sha: string | null;
  readonly summary: unknown;
  readonly summary_blob_sha: unknown;
}

/**
 * QW-9: reconstructs an `InspectionArtifactRow` from the narrowed query
 * row above. Exported (only) so the projection can be exercised as a pure
 * unit — `loadWorkspaceInspectionDashboard` itself needs a live Supabase
 * client and stays untested at this layer, matching this codebase's other
 * `load*` wiring functions (e.g. `pilot-report.ts`, `team-report.ts`).
 */
export function artifactRowFromQuery(
  row: InspectionArtifactQueryRow,
): InspectionArtifactRow {
  return {
    exported_symbols: row.exported_symbols,
    kind: row.kind,
    last_seen_commit_sha: row.last_seen_commit_sha,
    metadata: { summary: row.summary, summaryBlobSha: row.summary_blob_sha },
    path: row.path,
    source_blob_sha: row.source_blob_sha,
  };
}

/**
 * The shared card for one stored row (Codex remedy §6.1, step S5).
 *
 * The same builder `get_artifact` uses, fed from this screen's own row shape.
 * Two mappings into one builder is the risk this replaces two builders with,
 * and `tests/artifact-card.test.ts` pins them against each other.
 */
export function inspectionArtifactCard(
  row: InspectionArtifactRow,
): ArtifactCard {
  const metadata =
    typeof row.metadata === "object" && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : {};
  const symbols = Array.isArray(row.exported_symbols)
    ? row.exported_symbols.filter(
        (entry): entry is { name: string } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { name?: unknown }).name === "string",
      )
    : [];
  return buildArtifactCard({
    classification: row.kind as ArtifactClassification,
    exportedSymbols: symbols,
    path: row.path,
    summary: summaryState({
      currentBlobSha: row.source_blob_sha ?? null,
      summary:
        typeof metadata["summary"] === "string" ? metadata["summary"] : null,
      summaryBlobSha:
        typeof metadata["summaryBlobSha"] === "string"
          ? metadata["summaryBlobSha"]
          : null,
    }),
  });
}

export interface InspectionRuledOutRow {
  readonly hypothesis: string;
  readonly id: string;
  readonly outcome: string;
  readonly recorded_at: string;
  readonly refs: readonly string[] | null;
}

export interface InspectionTodoRow {
  readonly status: string;
}

/**
 * The rows the risk map ranks over (Phase 4 Wave D todo 21).
 *
 * Separate from `artifacts` above because that set is documents only — the
 * freshness widget's input. Risk ranks *every* file, so it reads its own
 * narrow projection: id, path and kind, plus the edges and history that put
 * a file above another one.
 */
export interface InspectionRiskRows {
  readonly artifacts: readonly {
    readonly id: string;
    readonly kind: string;
    readonly path: string;
  }[];
  readonly coChanges: readonly {
    readonly change_count: number;
    readonly path_a: string;
    readonly path_b: string;
    readonly updated_at: string;
  }[];
  /**
   * `ci` evidence rows recording that a coverage report executed a file
   * (todo 18), by artifact id. **Null** when nothing has been measured —
   * which is a different fact from "measured, and nothing was covered".
   */
  readonly coveredArtifactIds: readonly string[] | null;
  readonly edges: readonly {
    readonly relation: string;
    readonly source_node_id: string;
    readonly target_node_id: string;
  }[];
}

export interface WorkspaceInspectionRows {
  readonly artifacts: readonly InspectionArtifactRow[];
  readonly dependencyAuditJson: unknown;
  readonly findings: readonly InspectionFindingRow[];
  readonly headCommitSha: string | null;
  /** Absent on a caller that has not moved onto the risk widget yet. */
  readonly risk?: InspectionRiskRows | undefined;
  readonly ruledOut: readonly InspectionRuledOutRow[];
  readonly todos: readonly InspectionTodoRow[];
}

/**
 * The risk map for one workspace, from stored rows only.
 *
 * Edges are stored by node id and the map ranks paths, so the artifact set is
 * the translation table. An edge whose endpoint is not an artifact — a
 * requirement, a route, an evidence node — has no path here and drops out;
 * `buildRiskMap` would ignore it anyway, and dropping it early keeps the two
 * from disagreeing about what a path is.
 */
function riskMapFor(
  rows: WorkspaceInspectionRows,
  findings: readonly InspectionFindingInput[],
  audit: DependencyAuditReport | null,
): RiskMap | null {
  if (!rows.risk) return null;
  const pathById = new Map(
    rows.risk.artifacts.map((row) => [row.id, row.path]),
  );
  return buildRiskMap({
    artifacts: rows.risk.artifacts.map((row) => ({
      classification: row.kind,
      nodeId: row.id,
      path: row.path,
    })),
    coChanges: rows.risk.coChanges.map((row) => ({
      changeCount: row.change_count,
      observedAt: row.updated_at,
      pathA: row.path_a,
      pathB: row.path_b,
    })),
    coverage:
      rows.risk.coveredArtifactIds === null
        ? null
        : rows.risk.coveredArtifactIds.flatMap((id) => {
            const path = pathById.get(id);
            return path ? [path] : [];
          }),
    dependencyAudit: audit,
    edges: rows.risk.edges.flatMap((row) => {
      const sourcePath = pathById.get(row.source_node_id);
      const targetPath = pathById.get(row.target_node_id);
      return sourcePath && targetPath
        ? [{ relation: row.relation, sourcePath, targetPath }]
        : [];
    }),
    // A finding's anchors are its spans (the document it fired on) and, for
    // the code-anchored rules, the file itself. Both ends count.
    findings: findings.map((finding) => ({
      kind: finding.kind,
      sourcePath: finding.detail?.spans[0]?.path ?? null,
      status: finding.status,
      targetPath: null,
    })),
  });
}

const FINDING_KINDS = [
  "contradicting-instructions",
  "missing-implementation",
  "missing-test",
  "orphan-doc",
  "stale-doc",
  "unproven-claim",
] as const;
const SEVERITIES = ["critical", "high", "low", "medium"] as const;
const STATUSES = ["dismissed", "open", "resolved"] as const;
/** Artifact kinds that count as documentation for the freshness widget. */
const DOCUMENT_KINDS = ["adr", "instruction", "spec", "todo"] as const;

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: string,
): value is T {
  return (allowed as readonly string[]).includes(value);
}

/**
 * The `inferred` summary a judgment job merged into `artifacts.metadata`
 * (ADR-014 keeps metadata a merge, so the summary survives a rescan) — and
 * only when it still describes the blob the scanner last saw.
 *
 * Surviving a rescan is exactly the problem: metadata merges, so prose
 * written for blob A is still sitting there after blob B lands. This screen
 * shows it as a document's description, so it uses the same
 * `currentSummaryText` rule the MCP store and the enrich selector use
 * (Codex remedy P0-A). Any other shape reads as "no summary" rather than as
 * text to display.
 */
export function artifactSummary(
  metadata: unknown,
  sourceBlobSha?: string | null,
): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const fields = metadata as Record<string, unknown>;
  const summary = fields["summary"];
  const summaryBlobSha = fields["summaryBlobSha"];
  return currentSummaryText({
    currentBlobSha: sourceBlobSha ?? null,
    summary: typeof summary === "string" ? summary : null,
    summaryBlobSha: typeof summaryBlobSha === "string" ? summaryBlobSha : null,
  });
}

/**
 * Stored finding rows as the dashboard and the risk map read them: a row
 * whose kind, severity or status is not a word this screen knows is dropped
 * whole rather than shown under a label it does not have.
 */
function findingInputsFrom(
  rows: readonly InspectionFindingRow[],
): InspectionFindingInput[] {
  return rows.flatMap((row) =>
    isOneOf(FINDING_KINDS, row.kind) &&
    isOneOf(SEVERITIES, row.severity) &&
    isOneOf(STATUSES, row.status)
      ? [
          {
            detail: findingDetail(row),
            ...(row.dismissed_reason
              ? { dismissedReason: row.dismissed_reason }
              : {}),
            id: row.id,
            kind: row.kind,
            severity: row.severity,
            status: row.status,
            title: row.title,
          },
        ]
      : [],
  );
}

/**
 * The rows the risk map needs and nothing else — what `/app/inspection`
 * reads for its risk widget, shared with `/app/map`'s HUD (Phase 4 Wave B
 * todo 15) so the two screens rank the same files from the same rows.
 */
export interface WorkspaceRiskRows {
  readonly dependencyAuditJson: unknown;
  readonly findings: readonly InspectionFindingRow[];
  readonly risk: InspectionRiskRows;
}

export function riskMapFromRows(rows: WorkspaceRiskRows): RiskMap {
  return (
    riskMapFor(
      {
        artifacts: [],
        dependencyAuditJson: rows.dependencyAuditJson,
        findings: rows.findings,
        headCommitSha: null,
        risk: rows.risk,
        ruledOut: [],
        todos: [],
      },
      findingInputsFrom(rows.findings),
      parseNpmAuditReport(rows.dependencyAuditJson),
    ) ?? { entries: [], unmeasured: [] }
  );
}

/**
 * The queries behind `WorkspaceRiskRows`, built once so the inspection
 * loader and the map loader cannot drift apart on a select list or a limit.
 * Callers await them inside their own `Promise.all`.
 */
export function riskRowQueries(client: SupabaseClient, workspaceId: string) {
  return {
    audit: client
      .from("dependency_audit_reports")
      .select("report")
      .eq("workspace_id", workspaceId)
      .order("uploaded_at", { ascending: false })
      .limit(1),
    coChanges: client
      .from("file_co_changes")
      .select("change_count,path_a,path_b,updated_at")
      .eq("workspace_id", workspaceId)
      .order("change_count", { ascending: false })
      .limit(500),
    // Coverage evidence (todo 18). No row anywhere means nothing has been
    // measured, which the map reports as unmeasured rather than untested.
    coverage: client
      .from("evidence")
      .select("source_artifact_id")
      .eq("workspace_id", workspaceId)
      .eq("kind", "ci"),
    findings: client
      .from("findings")
      .select(
        "id,kind,severity,status,title,confidence,evidence_grade,provenance,dismissed_reason",
      )
      .eq("workspace_id", workspaceId),
    // The risk map's own rows (todo 21). Every artifact, not just the
    // documents the freshness widget reads: risk ranks code, and code is
    // most of a repository.
    riskArtifacts: client
      .from("artifacts")
      .select("id,kind,path")
      .eq("workspace_id", workspaceId),
    riskEdges: client
      .from("edges")
      .select("relation,source_node_id,target_node_id")
      .eq("workspace_id", workspaceId)
      .in("relation", ["calls", "imports", "tests"]),
  };
}

/** The `risk` rows from the settled query results, in the loader's shape. */
export function riskRowsFromResults(results: {
  readonly coChanges: { readonly data: unknown[] | null };
  readonly coverage: { readonly data: unknown[] | null };
  readonly riskArtifacts: { readonly data: unknown[] | null };
  readonly riskEdges: { readonly data: unknown[] | null };
}): InspectionRiskRows {
  const coverage = results.coverage.data ?? [];
  return {
    artifacts: (results.riskArtifacts.data ??
      []) as InspectionRiskRows["artifacts"],
    coChanges: (results.coChanges.data ??
      []) as InspectionRiskRows["coChanges"],
    // No coverage row anywhere is "nobody measured", not "nothing is
    // covered" — the map greys the signal out instead of scoring it.
    coveredArtifactIds:
      coverage.length === 0
        ? null
        : coverage.map((row) =>
            String((row as { source_artifact_id: string }).source_artifact_id),
          ),
    edges: (results.riskEdges.data ?? []) as InspectionRiskRows["edges"],
  };
}

/** The workspace's risk map from stored rows — the HUD's source (todo 15). */
export async function loadWorkspaceRiskMap(
  client: SupabaseClient,
  workspaceId: string,
): Promise<RiskMap> {
  const queries = riskRowQueries(client, workspaceId);
  const [audit, coChanges, coverage, findings, riskArtifacts, riskEdges] =
    await Promise.all([
      queries.audit,
      queries.coChanges,
      queries.coverage,
      queries.findings,
      queries.riskArtifacts,
      queries.riskEdges,
    ]);
  for (const result of [
    audit,
    coChanges,
    coverage,
    findings,
    riskArtifacts,
    riskEdges,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
  const latestAudit = (audit.data ?? [])[0] as { report?: unknown } | undefined;
  return riskMapFromRows({
    dependencyAuditJson: latestAudit?.report ?? null,
    findings: (findings.data ?? []) as InspectionFindingRow[],
    risk: riskRowsFromResults({
      coChanges,
      coverage,
      riskArtifacts,
      riskEdges,
    }),
  });
}

export function buildWorkspaceInspectionDashboard(
  rows: WorkspaceInspectionRows,
): InspectionDashboard {
  const findings = findingInputsFrom(rows.findings);

  const documents: InspectionDocumentInput[] = rows.artifacts.flatMap((row) =>
    isOneOf(DOCUMENT_KINDS, row.kind) && row.last_seen_commit_sha
      ? [
          {
            card: inspectionArtifactCard(row),
            lastSeenCommitSha: row.last_seen_commit_sha,
            path: row.path,
            summary: artifactSummary(row.metadata, row.source_blob_sha),
          },
        ]
      : [],
  );

  const ruledOutAttempts: RuledOutAttemptInput[] = rows.ruledOut.map((row) => ({
    hypothesis: row.hypothesis,
    id: row.id,
    outcome: row.outcome,
    recordedAt: row.recorded_at,
    refs: row.refs ?? [],
  }));

  return buildInspectionDashboard({
    dependencyAuditJson: rows.dependencyAuditJson,
    documents,
    findings,
    headCommitSha: rows.headCommitSha,
    riskMap: riskMapFor(
      rows,
      findings,
      parseNpmAuditReport(rows.dependencyAuditJson),
    ),
    ruledOutAttempts,
    // No todos stored is a different fact from "0 of 0 done": the widget
    // must say "증거 부족", so the absent case stays null.
    todos:
      rows.todos.length === 0
        ? null
        : {
            done: rows.todos.filter(({ status }) => status === "done").length,
            total: rows.todos.length,
          },
  });
}

export async function loadWorkspaceInspectionDashboard(
  client: SupabaseClient,
  userId: string,
): Promise<{ dashboard: InspectionDashboard; workspaceId: string }> {
  const workspaceResult = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspaceResult.data.id);

  // The risk rows come from the one builder `/app/map` also reads, so the
  // two screens cannot rank different files from different limits.
  const risk = riskRowQueries(client, workspaceId);
  const [
    findings,
    artifacts,
    ruledOut,
    todos,
    audit,
    head,
    riskArtifacts,
    riskEdges,
    coChanges,
    coverage,
  ] = await Promise.all([
    risk.findings,
    client
      .from("artifacts")
      .select(
        "path,kind,last_seen_commit_sha,source_blob_sha,exported_symbols," +
          "summary:metadata->summary,summary_blob_sha:metadata->summaryBlobSha",
      )
      .eq("workspace_id", workspaceId)
      .in("kind", DOCUMENT_KINDS),
    client
      .from("ruled_out_attempts")
      .select("id,hypothesis,outcome,refs,recorded_at")
      .eq("workspace_id", workspaceId)
      .order("recorded_at", { ascending: false })
      .limit(50),
    client.from("todos").select("status").eq("workspace_id", workspaceId),
    risk.audit,
    client
      .from("runs")
      .select("commit_sha")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1),
    risk.riskArtifacts,
    risk.riskEdges,
    risk.coChanges,
    risk.coverage,
  ]);
  for (const result of [
    findings,
    artifacts,
    ruledOut,
    todos,
    audit,
    head,
    riskArtifacts,
    riskEdges,
    coChanges,
    coverage,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const latestAudit = (audit.data ?? [])[0] as { report?: unknown } | undefined;
  const latestRun = (head.data ?? [])[0] as { commit_sha?: string } | undefined;

  const artifactRows: InspectionArtifactRow[] = (
    (artifacts.data ?? []) as unknown as InspectionArtifactQueryRow[]
  ).map(artifactRowFromQuery);

  return {
    dashboard: buildWorkspaceInspectionDashboard({
      artifacts: artifactRows,
      dependencyAuditJson: latestAudit?.report ?? null,
      findings: (findings.data ?? []) as InspectionFindingRow[],
      headCommitSha: latestRun?.commit_sha ?? null,
      risk: riskRowsFromResults({
        coChanges,
        coverage,
        riskArtifacts,
        riskEdges,
      }),
      ruledOut: (ruledOut.data ?? []) as InspectionRuledOutRow[],
      todos: (todos.data ?? []) as InspectionTodoRow[],
    }),
    workspaceId,
  };
}
