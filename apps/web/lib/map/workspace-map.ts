import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveArtifactUnit,
  deriveBrainArea,
  type BrainArea,
  type LayoutConventions,
} from "@alrescha/core/artifact-facets";
import type {
  ArtifactClassification,
  RiskLevel,
  RiskMap,
} from "@alrescha/core";

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
import { loadWorkspaceRiskMap } from "../inspection/inspection-report";
import type { GraphAccessEvent } from "../realtime/access-events";
import {
  REPOSITORY_SELECTION_COLUMNS,
  currentRepository,
  newestCreatedFirst,
} from "../shell/current-repository";
import {
  EVERY_ROW,
  readRowsById,
  readRowsByPosition,
  type Narrow,
  type TableQuery,
} from "../supabase/table-pages";

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
  /** `active` requirements are the coverage denominator (todo 15 HUD). */
  readonly status?: string | null;
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
  readonly created_at?: string | null;
  readonly full_name: string;
  readonly id: string;
  readonly last_scanned_commit_sha: string | null;
  /** Parsed `.alrescha.json` for the commit that stated it (todo 4). */
  readonly layout_config?: unknown;
  /** When the user last chose it in the connect picker; null for a local push. */
  readonly selected_at?: string | null;
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

/** An `implements` edge, by its requirement end (todo 15 HUD coverage). */
export interface MapImplementsEdgeRow {
  readonly source_node_id: string;
}

/**
 * One finished scan: a succeeded `scan` job, or a local push's `manual`
 * run, by the commit it landed (todo 15 HUD freshness).
 */
export interface MapScanCompletionRow {
  readonly commit_sha: string | null;
  readonly completed_at: string | null;
}

export interface WorkspaceMapRows {
  readonly accessEvents: readonly MapAccessEventRow[];
  /**
   * Every `implements` edge in the workspace, regardless of the family
   * budgets above — coverage is a count, and a capped page would report a
   * repository as less covered the larger it grew. Absent on callers that
   * predate the HUD; the builder then reports the metric as unmeasured.
   */
  readonly implementsEdges?: readonly MapImplementsEdgeRow[] | undefined;
  /** The risk map `/app/inspection` computes, from the same rows (todo 21). */
  readonly riskMap?: RiskMap | null | undefined;
  readonly scanCompletions?: readonly MapScanCompletionRow[] | undefined;
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

/**
 * Requirement coverage on the HUD, with the same three-way basis the
 * progress ledger uses (`packages/core/src/progress/dashboard.ts`): a
 * repository whose requirements were never linked to code is *unmeasured*,
 * not 0% (WORK_SPEC §3-8).
 */
export interface WorkspaceMapCoverage {
  readonly basis: "measured" | "no-data" | "no-links";
  readonly covered: number;
  /** Null exactly when `basis` is not `measured`. */
  readonly percent: number | null;
  readonly total: number;
}

export interface WorkspaceMapRiskEntry {
  readonly level: RiskLevel;
  readonly nodeId: string;
  readonly path: string;
  readonly score: number;
}

export interface WorkspaceMapRisk {
  /** Files the map ranked at all — a file with no factor is not on it. */
  readonly ranked: number;
  /** The top of the list, in the map's own order. */
  readonly top: readonly WorkspaceMapRiskEntry[];
  /** Signals nobody measured, named rather than scored as zero. */
  readonly unmeasured: readonly ("coverage" | "dependency-audit")[];
}

export interface WorkspaceMapLastScan {
  /** Minutes between the scan's completion and the page load; null if unknown. */
  readonly ageMinutes: number | null;
  readonly commitSha: string | null;
  readonly completedAt: string | null;
}

/**
 * The HUD's real-data chips (Phase 4 Wave B todo 15, D10). Each value is
 * derived from stored rows by `buildWorkspaceMapHud`; the browser spec reads
 * the same rows through the same builder and expects the screen to agree.
 */
export interface WorkspaceMapHud {
  readonly coverage: WorkspaceMapCoverage;
  readonly lastScan: WorkspaceMapLastScan;
  readonly openFindings: number;
  /** Null when the loader did not compute a risk map. */
  readonly risk: WorkspaceMapRisk | null;
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
  readonly hud: WorkspaceMapHud;
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
  const stored = currentRepository(repositories)?.layout_config;
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

/** How many ranked files the HUD names. */
export const HUD_RISK_TOP = 3;

/**
 * The HUD from stored rows (todo 15). Pure, so the browser spec can compute
 * what the screen must show from the rows it seeded — "HUD 값이 로더 출처와
 * 일치" is then an equality, not a plausibility check.
 */
export function buildWorkspaceMapHud(
  rows: Pick<
    WorkspaceMapRows,
    | "findings"
    | "implementsEdges"
    | "repositories"
    | "requirements"
    | "riskMap"
    | "scanCompletions"
  >,
  now: number,
): WorkspaceMapHud {
  const openFindings = rows.findings.filter(
    ({ status }) => status === "open",
  ).length;

  // Coverage, the way the progress ledger measures it: active requirements
  // over those with at least one `implements` edge. No edge anywhere in the
  // workspace is "never linked", a different fact from "linked, none hit".
  const active = new Set(
    rows.requirements
      // Rows without a status column (older callers) count as active — the
      // ledger's own query reads the column, and the loader below selects it.
      .filter(({ status }) => status === undefined || status === "active")
      .map(({ id }) => id),
  );
  const links = rows.implementsEdges ?? null;
  const covered =
    links === null
      ? 0
      : new Set(
          links
            .map(({ source_node_id }) => source_node_id)
            .filter((id) => active.has(id)),
        ).size;
  const basis: WorkspaceMapCoverage["basis"] =
    active.size === 0
      ? "no-data"
      : links === null || links.length === 0
        ? "no-links"
        : "measured";
  const coverage: WorkspaceMapCoverage = {
    basis,
    covered,
    percent:
      basis === "measured" ? Math.round((covered / active.size) * 100) : null,
    total: active.size,
  };

  // The current repository's last scan (`currentRepository`, OQ-042), and
  // when it finished: the newest completion for that commit if one is
  // recorded, else the newest completion of any commit — a scan applied by
  // a path that logged no completion still has a commit, and the age is
  // then "unknown" rather than a guess.
  const repository = currentRepository(rows.repositories);
  const commitSha = repository?.last_scanned_commit_sha ?? null;
  const completions = (rows.scanCompletions ?? [])
    .filter(({ completed_at }) => typeof completed_at === "string")
    .sort((left, right) =>
      String(right.completed_at).localeCompare(String(left.completed_at)),
    );
  const completion =
    completions.find(({ commit_sha }) => commit_sha === commitSha) ?? null;
  const completedAt = completion?.completed_at ?? null;
  const completedMs =
    completedAt === null ? Number.NaN : Date.parse(completedAt);
  const lastScan: WorkspaceMapLastScan = {
    ageMinutes:
      commitSha !== null && Number.isFinite(completedMs)
        ? Math.max(0, Math.floor((now - completedMs) / 60_000))
        : null,
    commitSha,
    completedAt: commitSha !== null ? completedAt : null,
  };

  const riskMap = rows.riskMap ?? null;
  const risk: WorkspaceMapRisk | null =
    riskMap === null
      ? null
      : {
          ranked: riskMap.entries.length,
          top: riskMap.entries.slice(0, HUD_RISK_TOP).map((entry) => ({
            level: entry.level,
            nodeId: entry.nodeId,
            path: entry.path,
            score: entry.score,
          })),
          unmeasured: riskMap.unmeasured.map(({ signal }) => signal),
        };

  return { coverage, lastScan, openFindings, risk };
}

export function buildWorkspaceMapModel(
  workspaceId: string,
  rows: WorkspaceMapRows,
  now: number = Date.now(),
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
    // The symbol layer is not in the base galaxy (Wave F todo 26, R5 §2.4):
    // a file's symbols arrive as a halo through `/api/map/symbols` when the
    // file is looked at, never as nodes of this model — a row that reached
    // here through a reader that did not filter is dropped, not drawn.
    if (row.kind === "symbol") continue;

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
            // The scanner's own word for the file, so the `style` and
            // `config` layers have something to switch off (todo 13 ⓔ).
            classification: artifact.classification,
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

  // The repository the home and the header name (`currentRepository`); the
  // graph itself stays workspace-wide (OQ-042).
  const repository = currentRepository(rows.repositories);

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
    hud: buildWorkspaceMapHud(rows, now),
    isClustered,
    lastScannedCommitSha: repository?.last_scanned_commit_sha ?? null,
    repoFullName: repository?.full_name ?? null,
    revokedTokenIds: rows.tokens
      .filter((token) => token.revoked_at !== null)
      .map((token) => token.id),
    workspaceId,
  };
}

/**
 * Caps keep one pathological workspace from serializing megabytes into HTML.
 * Both are above PostgREST's own row cap (1,000), which the reads below page
 * past instead of taking it for the end of a table (RE-04).
 */
export const NODE_LIMIT = 2_000;
const EDGE_LIMIT = 6_000;
const FEED_LIMIT = 20;
/** Enough completions to find the current commit's; the newest wins anyway. */
const SCAN_COMPLETION_LIMIT = 20;

const EDGE_COLUMNS =
  "id,source_node_id,target_node_id,relation,family,confidence,provenance";

/**
 * Co-change pairs strongest first, the table's key breaking ties: a total
 * order, so the pairs the budget keeps are the same whichever page they
 * arrive on.
 */
const CO_CHANGE_ORDER = [
  ["change_count", false],
  ["repository_id", true],
  ["path_a", true],
  ["path_b", true],
] as const;

/**
 * A succeeded scan job with its run's commit embedded. PostgREST answers a
 * to-one embed as an object; the untyped client infers an array, so the
 * row admits both and the loader reads whichever arrived.
 */
interface ScanJobQueryRow {
  readonly completed_at: string | null;
  readonly runs:
    | { readonly commit_sha: string | null }
    | readonly { readonly commit_sha: string | null }[]
    | null;
}

function embeddedCommit(runs: ScanJobQueryRow["runs"]): string | null {
  const run = Array.isArray(runs) ? (runs[0] ?? null) : runs;
  return run && typeof run === "object" ? (run.commit_sha ?? null) : null;
}

/**
 * Hubs are read on their own budget (R5 §2.7, OQ-038).
 *
 * A directory node is worth more per byte than a file node — it is what makes
 * a package read as a cluster — so it must not compete with files for the
 * 2,000-node budget. Route, db_object and section hubs arrive in Wave A′ and
 * get their own lines then.
 *
 * Every hub budget is within PostgREST's row cap (1,000), so each hub read
 * is one request the cap cannot cut; a budget raised past it has to page
 * like the node reads (RE-04).
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
  now: number = Date.now(),
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

  /** The tenant predicate, on every page of every read below. */
  const inWorkspace = <Row>(query: TableQuery<Row>) =>
    query.eq("workspace_id", workspaceId);
  /**
   * One read of the map in id order, up to its budget, paged past
   * PostgREST's row cap (RE-04). The server stops every answer at 1,000 rows
   * and says nothing, so asking for 2,000 nodes in one request drew exactly
   * the first thousand — in production, on 2026-09-23 and 2026-09-24 — as
   * if they were the whole workspace.
   */
  const table = <Row extends { readonly id?: unknown }>(
    name: string,
    columns: string,
    limit: number,
    narrow: Narrow<Row> = (query) => query,
  ) =>
    readRowsById<Row>(client, name, columns, limit, (query) =>
      narrow(inWorkspace(query)),
    );

  // One read per edge family, in parallel: the budgets are per family and a
  // single query cannot express eight of them (R5 §2.5, OQ-038).
  const familyQueries = Object.entries(EDGE_FAMILY_LIMITS).map(
    ([family, limit]) =>
      table<MapEdgeRow>("edges", EDGE_COLUMNS, limit, (query) =>
        query.eq("family", family),
      ),
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
    implementsEdges,
    scanJobs,
    completedRuns,
    riskMap,
  ] = await Promise.all([
    client
      .from("access_events")
      .select("id,tool,target_node_ids,occurred_at,token_id")
      .eq("workspace_id", workspaceId)
      .order("occurred_at", { ascending: false })
      .limit(FEED_LIMIT),
    // Same key as the `graph_nodes` read below, and for the same reason:
    // both stop at NODE_LIMIT, so pages in two different orders could hold
    // different rows and leave matched code nodes with no classification
    // (R4 §3.7). An artifact's id is its node's id, so reading both in id
    // order keeps them row for row by construction. The ids are ULIDs the
    // database mints from the clock as it writes each row, so id order is
    // write order — the created-at order the budget kept before, short of
    // two writers at once — and a key a page can continue after.
    table<MapArtifactRow>(
      "artifacts",
      "id,classification,path,exported_symbols",
      NODE_LIMIT,
    ),
    table<MapAssertionRow>(
      "agent_assertions",
      "id,source_node_id,target_node_id,relation,reason",
      EDGE_LIMIT,
      (query) => query.is("invalidated_at", null),
    ),
    // No id to continue after, and the budget keeps the strongest pairs, so
    // this one pages by position in change-count order.
    readRowsByPosition<MapCoChangeRow>(
      client,
      "file_co_changes",
      "path_a,path_b,change_count",
      EDGE_LIMIT,
      CO_CHANGE_ORDER,
      (query) => inWorkspace(query).gte("change_count", CO_CHANGE_MIN_COUNT),
    ),
    table<MapConceptRow>(
      "concepts",
      "id,slug,name,kind,member_paths",
      NODE_LIMIT,
    ),
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
    table<MapEdgeRow>("edges", EDGE_COLUMNS, EDGE_LIMIT, (query) =>
      query.is("family", null),
    ),
    // `id` is selected only to continue past a page.
    table<MapFindingRow & { readonly id: string }>(
      "findings",
      "id,source_node_id,target_node_id,status",
      EVERY_ROW,
      (query) => query.eq("status", "open"),
    ),
    table<MapGraphNodeRow>(
      "graph_nodes",
      "id,kind,label",
      NODE_LIMIT,
      (query) =>
        // Symbols would otherwise spend the node budget on a layer the map
        // loads by file (todo 26).
        query.neq("kind", "symbol"),
    ),
    table<MapRationaleRow>(
      "rationales",
      "id,artifact_id,source_path,source_line",
      NODE_LIMIT,
    ),
    table<MapRepositoryRow>(
      "repositories",
      `id,full_name,last_scanned_commit_sha,layout_config,${REPOSITORY_SELECTION_COLUMNS}`,
      EVERY_ROW,
    ),
    table<MapRequirementRow>(
      "requirements",
      "id,statement,source_artifact_id,source_span,status",
      NODE_LIMIT,
    ),
    table<MapEvidenceRow>(
      "evidence",
      "id,kind,verdict,source_artifact_id",
      NODE_LIMIT,
    ),
    table<MapTokenRow>("mcp_tokens", "id,revoked_at", EVERY_ROW),
    // HUD coverage (todo 15): every `implements` edge, outside the family
    // budgets above — a count, so it must not be a capped page, the
    // server's own cap included.
    table<MapImplementsEdgeRow & { readonly id: string }>(
      "edges",
      "id,source_node_id",
      EVERY_ROW,
      (query) => query.eq("relation", "implements"),
    ),
    // HUD freshness (todo 15): when the last scan finished. A GitHub push
    // lands as a succeeded `scan` job whose run carries the commit; a local
    // push (`alrescha push`) records a completed `manual` run and no job.
    client
      .from("jobs")
      .select("completed_at,runs(commit_sha)")
      .eq("workspace_id", workspaceId)
      .eq("kind", "scan")
      .eq("status", "succeeded")
      .order("completed_at", { ascending: false })
      .limit(SCAN_COMPLETION_LIMIT),
    client
      .from("runs")
      .select("commit_sha,completed_at")
      .eq("workspace_id", workspaceId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(SCAN_COMPLETION_LIMIT),
    // HUD risk (todo 15): the inspection screen's own map, from its rows.
    loadWorkspaceRiskMap(client, workspaceId),
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
    implementsEdges,
    scanJobs,
    completedRuns,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const scanCompletions: MapScanCompletionRow[] = [
    ...((scanJobs.data ?? []) as unknown as ScanJobQueryRow[]).map((job) => ({
      commit_sha: embeddedCommit(job.runs),
      completed_at: job.completed_at,
    })),
    ...((completedRuns.data ?? []) as MapScanCompletionRow[]),
  ];

  const edgeRows = [
    ...familyEdges.flatMap((result) => result.data),
    ...legacyEdges.data,
  ];

  return buildWorkspaceMapModel(
    workspaceId,
    {
      accessEvents: (accessEvents.data ?? []) as MapAccessEventRow[],
      artifacts: artifacts.data,
      assertions: assertions.data,
      coChanges: coChanges.data,
      concepts: concepts.data,
      dbObjects: (dbObjectRows.data ?? []) as MapDbObjectRow[],
      directories: (directories.data ?? []) as MapDirectoryRow[],
      edges: edgeRows,
      routes: (routeRows.data ?? []) as MapRouteRow[],
      evidence: evidence.data,
      findings: findings.data,
      graphNodes: graphNodes.data,
      rationales: rationales.data,
      // Newest-created first, the order this read had before it paged by id.
      repositories: newestCreatedFirst(repositories.data),
      requirements: requirements.data,
      sections: (sectionRows.data ?? []) as MapSectionRow[],
      tokens: tokens.data,
      implementsEdges: implementsEdges.data,
      riskMap,
      scanCompletions,
    },
    now,
  );
}
