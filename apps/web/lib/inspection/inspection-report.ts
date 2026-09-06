import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildArtifactCard,
  buildInspectionDashboard,
  currentSummaryText,
  summaryState,
  type ArtifactCard,
  type ArtifactClassification,
  type InspectionDashboard,
  type InspectionDocumentInput,
  type InspectionFindingInput,
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
  readonly id: string;
  readonly kind: string;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
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

export interface WorkspaceInspectionRows {
  readonly artifacts: readonly InspectionArtifactRow[];
  readonly dependencyAuditJson: unknown;
  readonly findings: readonly InspectionFindingRow[];
  readonly headCommitSha: string | null;
  readonly ruledOut: readonly InspectionRuledOutRow[];
  readonly todos: readonly InspectionTodoRow[];
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

export function buildWorkspaceInspectionDashboard(
  rows: WorkspaceInspectionRows,
): InspectionDashboard {
  const findings: InspectionFindingInput[] = rows.findings.flatMap((row) =>
    isOneOf(FINDING_KINDS, row.kind) &&
    isOneOf(SEVERITIES, row.severity) &&
    isOneOf(STATUSES, row.status)
      ? [
          {
            id: row.id,
            kind: row.kind,
            severity: row.severity,
            status: row.status,
            title: row.title,
          },
        ]
      : [],
  );

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

  const [findings, artifacts, ruledOut, todos, audit, head] = await Promise.all(
    [
      client
        .from("findings")
        .select("id,kind,severity,status,title")
        .eq("workspace_id", workspaceId),
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
      client
        .from("dependency_audit_reports")
        .select("report")
        .eq("workspace_id", workspaceId)
        .order("uploaded_at", { ascending: false })
        .limit(1),
      client
        .from("runs")
        .select("commit_sha")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1),
    ],
  );
  for (const result of [findings, artifacts, ruledOut, todos, audit, head]) {
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
      ruledOut: (ruledOut.data ?? []) as InspectionRuledOutRow[],
      todos: (todos.data ?? []) as InspectionTodoRow[],
    }),
    workspaceId,
  };
}
