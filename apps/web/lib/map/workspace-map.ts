import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveBrainArea, type ArtifactClassification } from "@arr/core";

import {
  clusterGraph,
  forceDirectedLayout,
  type EdgeConfidenceTier,
  type EvidenceGrade,
  type GraphData,
  type GraphEdge,
  type GraphEdgeProvenance,
  type GraphNode,
  type GraphNodeType,
} from "../dashboard/graph-model";
import type { GraphAccessEvent } from "../realtime/access-events";

/**
 * `/app/map` loader (Phase 3 Wave A todo 1).
 *
 * Pure builder + thin RLS wrapper, the same split as the commits loader. The
 * builder maps the persisted graph (`graph_nodes` + satellite tables) onto the
 * display vocabulary the renderer already speaks — an empty workspace renders
 * an empty state, never the demo fixture.
 *
 * Grade mapping is deliberately conservative (ADR-001): a node is `verified`
 * only when execution evidence (a `test`/`ci` evidence row with a `supports`
 * verdict) points at it, `broken` when it carries an open finding, and
 * `inferred` otherwise — scan-only workspaces therefore show no `verified`
 * node, which is the honest reading, not a bug.
 */

/** Raw rows as Supabase returns them (snake_case). */
export interface MapGraphNodeRow {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
}

export interface MapArtifactRow {
  readonly classification: string;
  readonly id: string;
  readonly path: string;
}

export interface MapRationaleRow {
  readonly artifact_id: string;
  readonly id: string;
  readonly source_line: number;
  readonly source_path: string;
}

export interface MapRequirementRow {
  readonly id: string;
  readonly source_artifact_id: string;
  readonly source_span: unknown;
  readonly statement: string;
}

export interface MapEvidenceRow {
  readonly id: string;
  readonly kind: string;
  readonly source_artifact_id: string;
  readonly verdict: string;
}

export interface MapEdgeRow {
  readonly confidence: number | string;
  readonly id: string;
  readonly provenance: unknown;
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

export interface MapFindingRow {
  readonly source_node_id: string | null;
  readonly status: string;
}

export interface MapRepositoryRow {
  readonly full_name: string;
  readonly id: string;
  readonly last_scanned_commit_sha: string | null;
}

export interface MapAccessEventRow {
  readonly id: string;
  readonly occurred_at: string;
  readonly target_node_ids: readonly string[];
  readonly token_id: string;
  readonly tool: string;
}

export interface MapTokenRow {
  readonly id: string;
  readonly revoked_at: string | null;
}

export interface MapCoChangeRow {
  readonly change_count: number;
  readonly path_a: string;
  readonly path_b: string;
}

export interface WorkspaceMapRows {
  readonly accessEvents: readonly MapAccessEventRow[];
  readonly artifacts: readonly MapArtifactRow[];
  readonly coChanges: readonly MapCoChangeRow[];
  readonly edges: readonly MapEdgeRow[];
  readonly findings: readonly MapFindingRow[];
  readonly graphNodes: readonly MapGraphNodeRow[];
  readonly rationales: readonly MapRationaleRow[];
  readonly repositories: readonly MapRepositoryRow[];
  readonly requirements: readonly MapRequirementRow[];
  readonly evidence: readonly MapEvidenceRow[];
  readonly tokens: readonly MapTokenRow[];
}

export interface WorkspaceMapModel {
  readonly counts: {
    readonly artifacts: number;
    readonly edges: number;
    readonly openFindings: number;
    readonly rationales: number;
    readonly requirements: number;
  };
  readonly feed: readonly GraphAccessEvent[];
  readonly graph: GraphData;
  readonly isClustered: boolean;
  readonly lastScannedCommitSha: string | null;
  readonly repoFullName: string | null;
  readonly revokedTokenIds: readonly string[];
  readonly workspaceId: string;
}

/**
 * Above this the map clusters by type·grade. Aligned with the stage's
 * `HIT_TARGET_LIMIT` — up to here every node keeps a DOM hit target, so the
 * pilot-scale graph (370 nodes) renders as individual nodes, not clusters.
 */
export const MAP_CLUSTER_THRESHOLD = 600;

/** A pair must co-change this often before it earns a coupling edge. */
export const CO_CHANGE_MIN_COUNT = 3;

/** Relations that carry execution-evidence support onto their target. */
const SUPPORTING_RELATIONS = new Set(["implements", "supports", "tests"]);

const EXECUTION_EVIDENCE_KINDS = new Set(["ci", "test"]);

const CLASSIFICATIONS: readonly ArtifactClassification[] = [
  "adr",
  "agents",
  "claude",
  "code_metadata",
  "cursor_rule",
  "skill",
  "spec",
  "todo_progress",
];

function isClassification(value: string): value is ArtifactClassification {
  return (CLASSIFICATIONS as readonly string[]).includes(value);
}

function artifactNodeType(artifact: MapArtifactRow): GraphNodeType {
  if (!isClassification(artifact.classification)) return "document";
  if (artifact.classification !== "code_metadata") return "document";
  return deriveBrainArea(artifact.path, artifact.classification) === "tests"
    ? "test"
    : "code";
}

function evidenceNodeType(kind: string): GraphNodeType {
  if (EXECUTION_EVIDENCE_KINDS.has(kind)) return "test";
  return kind === "implementation" ? "code" : "document";
}

function basename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

interface ParsedProvenance {
  readonly endLine: number;
  readonly sourcePath: string;
  readonly startLine: number;
}

/** `edges.provenance` is `{sourceArtifactId, span}` or `{reason}` (schema-checked). */
function parseEdgeProvenance(value: unknown): ParsedProvenance {
  if (typeof value === "object" && value !== null) {
    const span = (value as Record<string, unknown>)["span"];
    if (typeof span === "object" && span !== null) {
      const record = span as Record<string, unknown>;
      const path = record["path"];
      const startLine = record["startLine"];
      const endLine = record["endLine"];
      if (
        typeof path === "string" &&
        typeof startLine === "number" &&
        typeof endLine === "number"
      ) {
        return { endLine, sourcePath: path, startLine };
      }
    }
  }
  return { endLine: 0, sourcePath: "", startLine: 0 };
}

const CONFIDENCE_TIERS: readonly EdgeConfidenceTier[] = [
  "agent_asserted",
  "inferred",
  "reference",
  "resolved",
];

/**
 * Derivation tier (todo 2). An explicit `provenance.tier` wins (Waves B–D
 * write it); otherwise a source span marks deterministic extraction
 * (`resolved`) and a reason-only provenance stays `inferred`.
 */
function edgeConfidenceTier(
  provenance: unknown,
  parsed: ParsedProvenance,
): EdgeConfidenceTier {
  if (typeof provenance === "object" && provenance !== null) {
    const tier = (provenance as Record<string, unknown>)["tier"];
    if (
      typeof tier === "string" &&
      (CONFIDENCE_TIERS as readonly string[]).includes(tier)
    ) {
      return tier as EdgeConfidenceTier;
    }
  }
  return parsed.sourcePath.length > 0 ? "resolved" : "inferred";
}

function isDisplayRelation(
  value: string,
): value is GraphEdgeProvenance["relation"] {
  return [
    "calls",
    "contradicts",
    "declares",
    "implements",
    "imports",
    "references",
    "requires",
    "supersedes",
    "supports",
    "tests",
  ].includes(value);
}

function requirementPath(
  requirement: MapRequirementRow,
  artifactPaths: ReadonlyMap<string, string>,
): string {
  const span =
    typeof requirement.source_span === "object" &&
    requirement.source_span !== null
      ? (requirement.source_span as Record<string, unknown>)
      : null;
  const path = span?.["path"];
  if (typeof path === "string" && path.length > 0) return path;
  return artifactPaths.get(requirement.source_artifact_id) ?? "";
}

export function buildWorkspaceMapModel(
  workspaceId: string,
  rows: WorkspaceMapRows,
): WorkspaceMapModel {
  const artifactById = new Map(rows.artifacts.map((row) => [row.id, row]));
  const artifactPaths = new Map(
    rows.artifacts.map((row) => [row.id, row.path]),
  );
  const rationaleById = new Map(rows.rationales.map((row) => [row.id, row]));
  const requirementById = new Map(
    rows.requirements.map((row) => [row.id, row]),
  );
  const evidenceById = new Map(rows.evidence.map((row) => [row.id, row]));

  const openFindingCounts = new Map<string, number>();
  let openFindings = 0;
  for (const finding of rows.findings) {
    if (finding.status !== "open") continue;
    openFindings += 1;
    if (finding.source_node_id) {
      openFindingCounts.set(
        finding.source_node_id,
        (openFindingCounts.get(finding.source_node_id) ?? 0) + 1,
      );
    }
  }

  const executionEvidenceIds = new Set(
    rows.evidence
      .filter(
        (row) =>
          EXECUTION_EVIDENCE_KINDS.has(row.kind) && row.verdict === "supports",
      )
      .map((row) => row.id),
  );
  const verifiedTargets = new Set<string>();
  for (const edge of rows.edges) {
    if (
      executionEvidenceIds.has(edge.source_node_id) &&
      SUPPORTING_RELATIONS.has(edge.relation)
    ) {
      verifiedTargets.add(edge.target_node_id);
    }
  }

  function gradeOf(nodeId: string): EvidenceGrade {
    if ((openFindingCounts.get(nodeId) ?? 0) > 0) return "broken";
    if (executionEvidenceIds.has(nodeId) || verifiedTargets.has(nodeId))
      return "verified";
    return "inferred";
  }

  const nodes: GraphNode[] = [];
  for (const row of rows.graphNodes) {
    // Findings surface as counts on their source node, not as nodes.
    if (row.kind === "finding") continue;

    let type: GraphNodeType;
    let label = row.label;
    let path: string;
    if (row.kind === "requirement") {
      const requirement = requirementById.get(row.id);
      type = "requirement";
      label = truncate(requirement?.statement ?? row.label, 96);
      path = requirement ? requirementPath(requirement, artifactPaths) : "";
    } else if (row.kind === "rationale") {
      const rationale = rationaleById.get(row.id);
      type = "document";
      label = truncate(row.label, 96);
      path = rationale
        ? `${rationale.source_path}:${rationale.source_line}`
        : "";
    } else if (row.kind === "evidence") {
      const evidence = evidenceById.get(row.id);
      type = evidenceNodeType(evidence?.kind ?? "");
      path = evidence
        ? (artifactPaths.get(evidence.source_artifact_id) ?? "")
        : "";
    } else {
      const artifact = artifactById.get(row.id);
      type = artifact ? artifactNodeType(artifact) : "document";
      path = artifact?.path ?? row.label;
      label = truncate(basename(path), 96);
    }

    nodes.push({
      findingCount: openFindingCounts.get(row.id) ?? 0,
      grade: gradeOf(row.id),
      id: row.id,
      label,
      path,
      type,
      x: 0,
      y: 0,
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GraphEdge[] = [];
  for (const row of rows.edges) {
    if (!nodeIds.has(row.source_node_id) || !nodeIds.has(row.target_node_id))
      continue;
    const broken = row.relation === "contradicts";
    const grade: EvidenceGrade = broken
      ? "broken"
      : executionEvidenceIds.has(row.source_node_id)
        ? "verified"
        : "inferred";
    const provenance = parseEdgeProvenance(row.provenance);
    edges.push({
      broken,
      grade,
      id: row.id,
      provenance: {
        confidence: Number(row.confidence),
        endLine: provenance.endLine,
        grade,
        relation: isDisplayRelation(row.relation) ? row.relation : "references",
        sourcePath: provenance.sourcePath,
        startLine: provenance.startLine,
      },
      source: row.source_node_id,
      target: row.target_node_id,
      tier: edgeConfidenceTier(row.provenance, provenance),
    });
  }

  // Co-change coupling (todo 4): derived display edges between artifact
  // nodes, keyed by path. `reference` tier (statistical, not resolved) and a
  // reason-only provenance — the evidence is the count, not a span.
  const nodeIdByPath = new Map<string, string>();
  for (const row of rows.artifacts) {
    nodeIdByPath.set(row.path, row.id);
  }
  for (const coChange of rows.coChanges) {
    if (coChange.change_count < CO_CHANGE_MIN_COUNT) continue;
    const sourceId = nodeIdByPath.get(coChange.path_a);
    const targetId = nodeIdByPath.get(coChange.path_b);
    if (
      !sourceId ||
      !targetId ||
      !nodeIds.has(sourceId) ||
      !nodeIds.has(targetId)
    )
      continue;
    edges.push({
      broken: false,
      grade: "inferred",
      id: `co:${sourceId}:${targetId}`,
      provenance: {
        confidence: Math.min(1, coChange.change_count / 10),
        endLine: 0,
        grade: "inferred",
        relation: "co_changed",
        sourcePath: "",
        startLine: 0,
      },
      source: sourceId,
      target: targetId,
      tier: "reference",
    });
  }

  const isClustered = nodes.length > MAP_CLUSTER_THRESHOLD;
  const graph = isClustered
    ? clusterGraph({ edges, nodes }, MAP_CLUSTER_THRESHOLD)
    : forceDirectedLayout({ edges, nodes });

  const labelsById = new Map(nodes.map((node) => [node.id, node.path]));
  const feed: GraphAccessEvent[] = rows.accessEvents.map((event) => ({
    id: event.id,
    occurredAt: new Date(event.occurred_at).getTime(),
    targetNodeIds: event.target_node_ids,
    targetPath:
      event.target_node_ids
        .map((nodeId) => labelsById.get(nodeId))
        .find((path) => path && path.length > 0) ?? event.tool,
    tokenId: event.token_id,
    tool: event.tool,
    workspaceId,
  }));

  const repository = rows.repositories[0] ?? null;

  return {
    counts: {
      artifacts: rows.artifacts.length,
      edges: edges.length,
      openFindings,
      rationales: rows.rationales.length,
      requirements: rows.requirements.length,
    },
    feed,
    graph,
    isClustered,
    lastScannedCommitSha: repository?.last_scanned_commit_sha ?? null,
    repoFullName: repository?.full_name ?? null,
    revokedTokenIds: rows.tokens
      .filter((token) => token.revoked_at !== null)
      .map((token) => token.id),
    workspaceId,
  };
}

/** Caps keep one pathological workspace from serializing megabytes into HTML. */
const NODE_LIMIT = 2_000;
const EDGE_LIMIT = 6_000;
const FEED_LIMIT = 20;

export async function loadWorkspaceMap(
  client: SupabaseClient,
  userId: string,
): Promise<WorkspaceMapModel> {
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

  const [
    accessEvents,
    artifacts,
    coChanges,
    edges,
    findings,
    graphNodes,
    rationales,
    repositories,
    requirements,
    evidence,
    tokens,
  ] = await Promise.all([
    client
      .from("access_events")
      .select("id,tool,target_node_ids,occurred_at,token_id")
      .eq("workspace_id", workspaceId)
      .order("occurred_at", { ascending: false })
      .limit(FEED_LIMIT),
    client
      .from("artifacts")
      .select("id,classification,path")
      .eq("workspace_id", workspaceId)
      .limit(NODE_LIMIT),
    client
      .from("file_co_changes")
      .select("path_a,path_b,change_count")
      .eq("workspace_id", workspaceId)
      .gte("change_count", CO_CHANGE_MIN_COUNT)
      .order("change_count", { ascending: false })
      .limit(EDGE_LIMIT),
    client
      .from("edges")
      .select("id,source_node_id,target_node_id,relation,confidence,provenance")
      .eq("workspace_id", workspaceId)
      .limit(EDGE_LIMIT),
    client
      .from("findings")
      .select("source_node_id,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "open"),
    client
      .from("graph_nodes")
      .select("id,kind,label")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(NODE_LIMIT),
    client
      .from("rationales")
      .select("id,artifact_id,source_path,source_line")
      .eq("workspace_id", workspaceId)
      .limit(NODE_LIMIT),
    client
      .from("repositories")
      .select("id,full_name,last_scanned_commit_sha")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    client
      .from("requirements")
      .select("id,statement,source_artifact_id,source_span")
      .eq("workspace_id", workspaceId)
      .limit(NODE_LIMIT),
    client
      .from("evidence")
      .select("id,kind,verdict,source_artifact_id")
      .eq("workspace_id", workspaceId)
      .limit(NODE_LIMIT),
    client
      .from("mcp_tokens")
      .select("id,revoked_at")
      .eq("workspace_id", workspaceId),
  ]);

  for (const result of [
    accessEvents,
    artifacts,
    coChanges,
    edges,
    findings,
    graphNodes,
    rationales,
    repositories,
    requirements,
    evidence,
    tokens,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return buildWorkspaceMapModel(workspaceId, {
    accessEvents: (accessEvents.data ?? []) as MapAccessEventRow[],
    artifacts: (artifacts.data ?? []) as MapArtifactRow[],
    coChanges: (coChanges.data ?? []) as MapCoChangeRow[],
    edges: (edges.data ?? []) as MapEdgeRow[],
    evidence: (evidence.data ?? []) as MapEvidenceRow[],
    findings: (findings.data ?? []) as MapFindingRow[],
    graphNodes: (graphNodes.data ?? []) as MapGraphNodeRow[],
    rationales: (rationales.data ?? []) as MapRationaleRow[],
    repositories: (repositories.data ?? []) as MapRepositoryRow[],
    requirements: (requirements.data ?? []) as MapRequirementRow[],
    tokens: (tokens.data ?? []) as MapTokenRow[],
  });
}
