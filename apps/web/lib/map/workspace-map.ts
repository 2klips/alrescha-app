import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveArtifactUnit,
  deriveBrainArea,
  type BrainArea,
  type LayoutConventions,
} from "@alrescha/core/artifact-facets";
import type { ArtifactClassification } from "@alrescha/core";

import {
  DISPLAY_RELATIONS,
  type EdgeConfidenceTier,
  type EvidenceGrade,
  type GraphData,
  type GraphEdge,
  type GraphEdgeFamily,
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
  /** Symbol names the scan stored — the `component` unit reads these. */
  readonly exported_symbols?: readonly { readonly name: string }[] | null;
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
  /** Absent only on rows written before the column existed (todo 2). */
  readonly family?: string | null;
  readonly id: string;
  readonly provenance: unknown;
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

export interface MapDirectoryRow {
  readonly id: string;
  readonly path: string;
  readonly role: string | null;
}

export interface MapRouteRow {
  readonly id: string;
  readonly methods: readonly string[] | null;
  readonly url: string;
}

export interface MapDbObjectRow {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly source_line: number;
  readonly source_path: string;
}

export interface MapSectionRow {
  readonly heading: string;
  readonly id: string;
  readonly source_path: string;
  readonly token: string;
}

export interface MapFindingRow {
  readonly source_node_id: string | null;
  readonly status: string;
  /** Code node the finding is about, when a rule could name one (todo 1). */
  readonly target_node_id?: string | null;
}

export interface MapRepositoryRow {
  readonly full_name: string;
  readonly id: string;
  readonly last_scanned_commit_sha: string | null;
  /** Parsed `.alrescha.json` for the commit that stated it (todo 4). */
  readonly layout_config?: unknown;
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

export interface MapAssertionRow {
  readonly id: string;
  readonly reason: string;
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

export interface MapConceptRow {
  readonly id: string;
  readonly kind: string;
  readonly member_paths: readonly string[];
  readonly name: string;
  readonly slug: string;
}

export interface WorkspaceMapRows {
  readonly accessEvents: readonly MapAccessEventRow[];
  readonly artifacts: readonly MapArtifactRow[];
  readonly assertions: readonly MapAssertionRow[];
  readonly coChanges: readonly MapCoChangeRow[];
  readonly concepts: readonly MapConceptRow[];
  readonly dbObjects: readonly MapDbObjectRow[];
  readonly directories: readonly MapDirectoryRow[];
  readonly edges: readonly MapEdgeRow[];
  readonly routes: readonly MapRouteRow[];
  readonly findings: readonly MapFindingRow[];
  readonly graphNodes: readonly MapGraphNodeRow[];
  readonly rationales: readonly MapRationaleRow[];
  readonly repositories: readonly MapRepositoryRow[];
  readonly requirements: readonly MapRequirementRow[];
  readonly sections: readonly MapSectionRow[];
  readonly evidence: readonly MapEvidenceRow[];
  readonly tokens: readonly MapTokenRow[];
}

export interface WorkspaceMapModel {
  readonly counts: {
    readonly artifacts: number;
    readonly concepts: number;
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
 * Above this the client folds the graph by hierarchy assignment rather than
 * drawing every node (Wave B todo 12 owns the folding itself).
 *
 * It replaces the old 600-node cluster threshold, which collapsed the whole
 * graph into fifteen `type:grade` super-nodes joined in an arbitrary chain —
 * the more a repository grew, the less its map said (R5 §2.2 D4).
 */
export const MAP_HIERARCHY_FOLD_THRESHOLD = 3_000;

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
  "config",
  "cursor_rule",
  "doc",
  "schema",
  "skill",
  "spec",
  "style",
  "todo_progress",
];

/**
 * Classifications that are prose. The rest of the text files the scan now
 * stores — schemas, stylesheets, config — are source, and typing them as
 * documents would put a migration in the docs band beside the specs, which
 * is the shape R5 §2.2 D5 measured. Their own node kinds arrive with the hub
 * families (Wave A′) and the `unit` tag (todo 4).
 */
const PROSE_CLASSIFICATIONS: readonly ArtifactClassification[] = [
  "adr",
  "agents",
  "claude",
  "cursor_rule",
  "doc",
  "skill",
  "spec",
  "todo_progress",
];

function isClassification(value: string): value is ArtifactClassification {
  return (CLASSIFICATIONS as readonly string[]).includes(value);
}

/**
 * The repository's declared layout, if it stated one. Read defensively: the
 * column is free-form jsonb and a repository scanned by an older build has
 * an empty object there.
 */
function layoutConventionsOf(
  repositories: readonly MapRepositoryRow[],
): LayoutConventions | undefined {
  const stored = repositories[0]?.layout_config;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return undefined;
  }
  const layout = (stored as Record<string, unknown>)["layout"];
  if (typeof layout !== "object" || layout === null || Array.isArray(layout)) {
    return undefined;
  }
  const source = layout as Record<string, unknown>;
  const conventions: Record<string, string[]> = {};
  for (const domain of ["backend", "database", "frontend", "shared"]) {
    const prefixes = source[domain];
    if (!Array.isArray(prefixes)) continue;
    const strings = prefixes.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
    if (strings.length > 0) conventions[domain] = strings;
  }
  return Object.keys(conventions).length > 0 ? conventions : undefined;
}

function artifactNodeType(artifact: MapArtifactRow): GraphNodeType {
  // A classification this build does not know is not a document either.
  if (!isClassification(artifact.classification)) return "unknown";
  if (
    (PROSE_CLASSIFICATIONS as readonly string[]).includes(
      artifact.classification,
    )
  ) {
    return "document";
  }
  return deriveBrainArea(artifact.path, "code_metadata") === "tests"
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

const EDGE_FAMILIES: readonly GraphEdgeFamily[] = [
  "database",
  "doc",
  "evidence",
  "hierarchy",
  "route",
  "semantic",
  "statistical",
  "structure",
];

function isEdgeFamily(value: unknown): value is GraphEdgeFamily {
  return (EDGE_FAMILIES as readonly unknown[]).includes(value);
}

function isDisplayRelation(
  value: string,
): value is GraphEdgeProvenance["relation"] {
  return (DISPLAY_RELATIONS as readonly string[]).includes(value);
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
  const conceptById = new Map(rows.concepts.map((row) => [row.id, row]));
  const requirementById = new Map(
    rows.requirements.map((row) => [row.id, row]),
  );
  const evidenceById = new Map(rows.evidence.map((row) => [row.id, row]));

  const openFindingCounts = new Map<string, number>();
  let openFindings = 0;
  for (const finding of rows.findings) {
    if (finding.status !== "open") continue;
    openFindings += 1;
    // Both anchors count (Phase 4 Wave A todo 1): the document the finding
    // was raised from, and the code node it is about. A finding whose two
    // anchors are the same node still counts once for that node.
    for (const nodeId of new Set(
      [finding.source_node_id, finding.target_node_id].filter(
        (value): value is string => typeof value === "string" && value !== "",
      ),
    )) {
      openFindingCounts.set(nodeId, (openFindingCounts.get(nodeId) ?? 0) + 1);
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

  const directoryById = new Map(rows.directories.map((row) => [row.id, row]));
  const routeById = new Map(rows.routes.map((row) => [row.id, row]));
  const dbObjectById = new Map(rows.dbObjects.map((row) => [row.id, row]));
  const sectionById = new Map(rows.sections.map((row) => [row.id, row]));
  /**
   * A route's anchor path: the file it is served by. Every non-file node
   * carries one so `graphNodeArea` can put it in the band of the code it
   * belongs to (Wave A todo 4) — for a URL that is its handler.
   */
  const handlerPathByRoute = new Map<string, string>();
  for (const edge of rows.edges) {
    if (edge.relation !== "handles") continue;
    const path = artifactPaths.get(edge.target_node_id);
    const known = handlerPathByRoute.get(edge.source_node_id);
    // Prefer the shortest handler path: the page, not the root layout.
    if (path && (!known || path.length > known.length)) {
      handlerPathByRoute.set(edge.source_node_id, path);
    }
  }
  const layout = layoutConventionsOf(rows.repositories);

  /**
   * The node's colour axis. A directory's path is read as a prefix so a
   * folder sits with what it holds, and a node with no artifact row behind
   * it (requirement, concept, evidence) is derived from whatever path
   * anchors it — that anchor is why every non-file node carries one.
   */
  function nodeDomain(input: {
    classification: string | undefined;
    path: string;
    type: GraphNodeType;
  }): BrainArea {
    const classification =
      input.classification && isClassification(input.classification)
        ? input.classification
        : input.type === "document" || input.type === "requirement"
          ? "spec"
          : "code_metadata";
    const path =
      input.type === "directory" && input.path.length > 0
        ? `${input.path}/`
        : input.path;
    return deriveBrainArea(path, classification, layout);
  }

  const nodes: GraphNode[] = [];
  for (const row of rows.graphNodes) {
    // Findings surface as counts on their source node, not as nodes.
    if (row.kind === "finding") continue;

    let type: GraphNodeType;
    let label = row.label;
    let path: string;
    /** `package` for a workspace root; the Far label ranking is the only reader. */
    let role: string | null = null;
    if (row.kind === "requirement") {
      const requirement = requirementById.get(row.id);
      type = "requirement";
      label = truncate(requirement?.statement ?? row.label, 96);
      path = requirement ? requirementPath(requirement, artifactPaths) : "";
    } else if (row.kind === "rationale") {
      const rationale = rationaleById.get(row.id);
      type = "rationale";
      label = truncate(row.label, 96);
      path = rationale
        ? `${rationale.source_path}:${rationale.source_line}`
        : "";
    } else if (row.kind === "directory") {
      // Derived by the scan SQL from the artifact paths (todo 3). The path
      // is the anchor `graphNodeArea` derives the domain from, so a folder
      // sits in the same band as the files it holds.
      const directory = directoryById.get(row.id);
      type = "directory";
      path = directory?.path ?? row.label;
      label = truncate(basename(path), 96);
      // A workspace root is a landmark, not just another folder: the Far
      // label ranking puts a package name ahead of a busier file, because at
      // that zoom a label answers "where am I" rather than "what is this".
      if (directory?.role === "package") role = "package";
    } else if (row.kind === "route") {
      // A URL is a hub: its handlers hang off it (Wave A′ todo 6). The
      // anchor path is one of them, so the route sits in their band.
      const route = routeById.get(row.id);
      type = "route";
      label = truncate(route?.url ?? row.label, 96);
      path = handlerPathByRoute.get(row.id) ?? "";
    } else if (row.kind === "section") {
      // An ID-token heading — a decision, an open question, a gate — is the
      // hub everything that cites it hangs off (Wave A′ todo 8). Its anchor
      // is the document that declares it, so it sits in the docs band.
      const section = sectionById.get(row.id);
      type = "section";
      label = truncate(section?.heading ?? row.label, 96);
      path = section?.source_path ?? "";
    } else if (row.kind === "db_object") {
      // A table is a hub the repository already had (Wave A′ todo 7). Its
      // anchor is the migration that declares it, so it lands in the
      // database band with the schema rather than floating loose.
      const object = dbObjectById.get(row.id);
      type = "database";
      label = truncate(object?.name ?? row.label, 96);
      path = object?.source_path ?? "";
    } else if (row.kind === "concept") {
      // AI-synthesized concept layer (Wave C todo 7) — always inferred;
      // the path anchors facets to the first member file.
      const concept = conceptById.get(row.id);
      type = "concept";
      label = truncate(concept?.name ?? row.label, 96);
      path = concept?.member_paths[0] ?? concept?.slug ?? "";
    } else if (row.kind === "evidence") {
      const evidence = evidenceById.get(row.id);
      type = evidenceNodeType(evidence?.kind ?? "");
      path = evidence
        ? (artifactPaths.get(evidence.source_artifact_id) ?? "")
        : "";
    } else {
      const artifact = artifactById.get(row.id);
      // `unknown`, not `document`: when the artifact row is missing the node
      // has no classification to read, and calling it a document inflated
      // the docs band with code (R5 §2.2 D5). The loader's matched ordering
      // is what keeps this branch empty; naming it is what makes a
      // regression visible instead of silent.
      type = artifact ? artifactNodeType(artifact) : "unknown";
      path = artifact?.path ?? row.label;
      label = truncate(basename(path), 96);
    }

    const artifact = artifactById.get(row.id);
    nodes.push({
      // Derived once, here, with the repository's own conventions — the
      // renderer and the overview then read the same answer instead of each
      // re-deriving one from the path (R5 §2.6, todo 4).
      domain: nodeDomain({
        classification: artifact?.classification,
        path,
        type,
      }),
      findingCount: openFindingCounts.get(row.id) ?? 0,
      grade: gradeOf(row.id),
      id: row.id,
      label,
      path,
      ...(role ? { role } : {}),
      type,
      ...(artifact && isClassification(artifact.classification)
        ? {
            unit: deriveArtifactUnit({
              classification: artifact.classification,
              exportedSymbols: artifact.exported_symbols ?? [],
              path: artifact.path,
            }),
          }
        : {}),
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
    const family = isEdgeFamily(row.family) ? row.family : undefined;
    const grade: EvidenceGrade = broken
      ? "broken"
      : executionEvidenceIds.has(row.source_node_id)
        ? "verified"
        : "inferred";
    const provenance = parseEdgeProvenance(row.provenance);
    edges.push({
      broken,
      ...(family ? { family } : {}),
      grade,
      id: row.id,
      // Containment is a force-field input, not a relationship to draw: 885
      // folder lines over this repository would bury the imports they exist
      // to make legible (OQ-037).
      ...(family === "hierarchy" ? { layoutOnly: true } : {}),
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

  // Agent assertions (Wave D todo 9): active bi-temporal edges, rendered in
  // the agent_asserted style (dashed accent) — visibly an agent's claim.
  for (const assertion of rows.assertions) {
    if (
      !nodeIds.has(assertion.source_node_id) ||
      !nodeIds.has(assertion.target_node_id)
    )
      continue;
    edges.push({
      broken: false,
      grade: "inferred",
      id: `assert:${assertion.id}`,
      provenance: {
        confidence: 0.5,
        endLine: 0,
        grade: "inferred",
        relation: isDisplayRelation(assertion.relation)
          ? assertion.relation
          : "references",
        sourcePath: "",
        startLine: 0,
      },
      source: assertion.source_node_id,
      target: assertion.target_node_id,
      tier: "agent_asserted",
    });
  }

  // No server-side layout (MT-6). The renderer simulates in a Web Worker and
  // discards whatever coordinates arrive, so computing an O(n²) layout here
  // bought nothing but time-to-first-byte — 48 iterations over 730 nodes is
  // ~12.8M distance calculations per request.
  const isClustered = nodes.length > MAP_HIERARCHY_FOLD_THRESHOLD;
  const graph: GraphData = { edges, nodes };

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
      concepts: rows.concepts.length,
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

/**
 * Hubs are read on their own budget (R5 §2.7, OQ-038).
 *
 * A directory node is worth more per byte than a file node — it is what makes
 * a package read as a cluster — so it must not compete with files for the
 * 2,000-node budget. Route, db_object and section hubs arrive in Wave A′ and
 * get their own lines then.
 */
export const DIRECTORY_LIMIT = 300;

/** Routes are hubs too, on their own budget (R5 §2.7). */
export const ROUTE_LIMIT = 100;

/**
 * Tables and functions, likewise. This repository declares 43 tables and 59
 * functions, and a schema-heavy project has more; 400 leaves headroom without
 * letting the schema outweigh the code it belongs to.
 */
export const DB_OBJECT_LIMIT = 400;

/**
 * Decision records, open questions and gates. This repository declares 86 of
 * them and cites 79; 300 leaves room for a repository that documents more
 * without letting the prose layer outweigh the code.
 */
export const SECTION_LIMIT = 300;

/**
 * Per-family read budgets (R5 §2.5). One shared 6,000-edge cap let whichever
 * family happened to sort first fill it: on this repository the containment
 * layer alone is ~890 edges and the structure layer ~1,700, so a single cap
 * silently decided which half of the graph a user saw. Wave A′ todo 6 gave
 * `route` its writer and todo 7 gave `database` one; both inherited the
 * budgets stated here rather than inventing them.
 */
export const EDGE_FAMILY_LIMITS: Readonly<Record<GraphEdgeFamily, number>> = {
  database: 3_000,
  doc: 6_000,
  evidence: 6_000,
  hierarchy: 6_000,
  route: 1_000,
  semantic: 3_000,
  statistical: 3_000,
  structure: 6_000,
};

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

  // One query per edge family, in parallel: the budgets are per family and a
  // single query cannot express eight of them (R5 §2.5, OQ-038).
  const familyQueries = Object.entries(EDGE_FAMILY_LIMITS).map(
    ([family, limit]) =>
      client
        .from("edges")
        .select(
          "id,source_node_id,target_node_id,relation,family,confidence,provenance",
        )
        .eq("workspace_id", workspaceId)
        .eq("family", family)
        .limit(limit),
  );

  const [
    accessEvents,
    artifacts,
    assertions,
    coChanges,
    concepts,
    directories,
    routeRows,
    dbObjectRows,
    sectionRows,
    familyEdges,
    legacyEdges,
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
      .select("id,classification,path,exported_symbols")
      .eq("workspace_id", workspaceId)
      // Same key as the `graph_nodes` query below, and for the same reason:
      // both are capped at NODE_LIMIT, so an unordered artifacts page could
      // return a different 2,000 rows than the nodes page and leave matched
      // code nodes with no classification (R4 §3.7). A scan writes a node
      // and its artifact in one transaction, so the two keys agree row for
      // row; `id` breaks the tie those shared timestamps create.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(NODE_LIMIT),
    client
      .from("agent_assertions")
      .select("id,source_node_id,target_node_id,relation,reason")
      .eq("workspace_id", workspaceId)
      .is("invalidated_at", null)
      .limit(EDGE_LIMIT),
    client
      .from("file_co_changes")
      .select("path_a,path_b,change_count")
      .eq("workspace_id", workspaceId)
      .gte("change_count", CO_CHANGE_MIN_COUNT)
      .order("change_count", { ascending: false })
      .limit(EDGE_LIMIT),
    client
      .from("concepts")
      .select("id,slug,name,kind,member_paths")
      .eq("workspace_id", workspaceId)
      .limit(NODE_LIMIT),
    client
      .from("directories")
      .select("id,path,role")
      .eq("workspace_id", workspaceId)
      .order("path", { ascending: true })
      .limit(DIRECTORY_LIMIT),
    client
      .from("routes")
      .select("id,url,methods")
      .eq("workspace_id", workspaceId)
      .order("url", { ascending: true })
      .limit(ROUTE_LIMIT),
    client
      .from("db_objects")
      .select("id,name,kind,source_path,source_line")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true })
      .limit(DB_OBJECT_LIMIT),
    client
      .from("sections")
      .select("id,token,heading,source_path")
      .eq("workspace_id", workspaceId)
      .order("token", { ascending: true })
      .limit(SECTION_LIMIT),
    Promise.all(familyQueries),
    // Rows written before the column existed carry no family. The migration
    // backfilled every one of them, so this is an empty set on a migrated
    // database — and a visible one, rather than a silent omission, if it is
    // ever not.
    client
      .from("edges")
      .select(
        "id,source_node_id,target_node_id,relation,family,confidence,provenance",
      )
      .eq("workspace_id", workspaceId)
      .is("family", null)
      .limit(EDGE_LIMIT),
    client
      .from("findings")
      .select("source_node_id,target_node_id,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "open"),
    client
      .from("graph_nodes")
      .select("id,kind,label")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(NODE_LIMIT),
    client
      .from("rationales")
      .select("id,artifact_id,source_path,source_line")
      .eq("workspace_id", workspaceId)
      .limit(NODE_LIMIT),
    client
      .from("repositories")
      .select("id,full_name,last_scanned_commit_sha,layout_config")
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
    assertions,
    coChanges,
    concepts,
    directories,
    routeRows,
    dbObjectRows,
    sectionRows,
    ...familyEdges,
    legacyEdges,
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

  const edgeRows = [
    ...familyEdges.flatMap((result) => (result.data ?? []) as MapEdgeRow[]),
    ...((legacyEdges.data ?? []) as MapEdgeRow[]),
  ];

  return buildWorkspaceMapModel(workspaceId, {
    accessEvents: (accessEvents.data ?? []) as MapAccessEventRow[],
    artifacts: (artifacts.data ?? []) as MapArtifactRow[],
    assertions: (assertions.data ?? []) as MapAssertionRow[],
    coChanges: (coChanges.data ?? []) as MapCoChangeRow[],
    concepts: (concepts.data ?? []) as MapConceptRow[],
    dbObjects: (dbObjectRows.data ?? []) as MapDbObjectRow[],
    directories: (directories.data ?? []) as MapDirectoryRow[],
    edges: edgeRows,
    routes: (routeRows.data ?? []) as MapRouteRow[],
    evidence: (evidence.data ?? []) as MapEvidenceRow[],
    findings: (findings.data ?? []) as MapFindingRow[],
    graphNodes: (graphNodes.data ?? []) as MapGraphNodeRow[],
    rationales: (rationales.data ?? []) as MapRationaleRow[],
    repositories: (repositories.data ?? []) as MapRepositoryRow[],
    requirements: (requirements.data ?? []) as MapRequirementRow[],
    sections: (sectionRows.data ?? []) as MapSectionRow[],
    tokens: (tokens.data ?? []) as MapTokenRow[],
  });
}
