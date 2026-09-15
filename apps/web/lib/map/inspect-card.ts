import {
  deriveModuleClusters,
  moduleClusterOf,
  moduleMemberDigest,
  type ArtifactCard,
} from "@alrescha/core";

import {
  artifactRowFromQuery,
  inspectionArtifactCard,
} from "../inspection/inspection-report";

/**
 * What the map inspector asks for when a node is selected (Phase 4 Wave D
 * todo 19 ⑴): the shared artifact card for a file, the module card for the
 * import/call cluster it sits in, or the concept card for a synthesised
 * concept. Pure builders — the route handler reads rows, these decide what
 * the rows say.
 *
 * Every rule here is one that already exists somewhere else, reused rather
 * than restated: the artifact card is `inspectionArtifactCard` (the builder
 * `get_artifact` and `/app/inspection` share), the module state is the
 * member digest `explain_module` compares, and a concept summary is a
 * model's prose and says `inferred`.
 */

/** The narrowed artifact row the inspection dashboard already reads. */
export interface InspectArtifactRow {
  readonly exported_symbols: unknown;
  readonly kind: string;
  readonly last_seen_commit_sha: string | null;
  readonly path: string;
  readonly source_blob_sha: string | null;
  readonly summary: unknown;
  readonly summary_blob_sha: unknown;
}

export function artifactInspectorCard(row: InspectArtifactRow): ArtifactCard {
  return inspectionArtifactCard(artifactRowFromQuery(row));
}

/** Relations that make two files one module — the same two `explain_module` uses. */
const STRUCTURE_RELATIONS = new Set(["imports", "calls"]);

export interface ModuleCardInputs {
  readonly artifacts: readonly {
    readonly blobSha: string | null;
    readonly id: string;
    readonly path: string;
  }[];
  readonly edges: readonly {
    readonly relation: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  }[];
  readonly summaries: readonly {
    readonly memberDigest: string;
    readonly memberPaths: readonly string[];
    readonly moduleKey: string;
    readonly name: string;
    readonly summary: string;
  }[];
}

export type ModuleCardState = "pending" | "ready" | "stale";

export interface ModuleCard {
  readonly key: string;
  readonly memberCount: number;
  /** The first few members, sorted; the count says how many there are. */
  readonly members: readonly string[];
  readonly name: string;
  /**
   * `ready`: cached prose whose member digest matches the files as scanned
   * now. `stale`: prose written for an older member set — shown, and said
   * to be so. `pending`: nothing cached; `explain_module` would enqueue it.
   */
  readonly state: ModuleCardState;
  readonly summary: string | null;
}

const MEMBERS_SHOWN = 8;

/**
 * The module a file belongs to, or null when it is in no import/call
 * cluster of two or more files — which is a fact about the file, not a
 * missing card.
 */
export function moduleCardForPath(
  inputs: ModuleCardInputs,
  path: string,
): ModuleCard | null {
  const pathById = new Map(
    inputs.artifacts.map((artifact) => [artifact.id, artifact.path]),
  );
  const edges = inputs.edges
    .filter((edge) => STRUCTURE_RELATIONS.has(edge.relation))
    .flatMap((edge) => {
      const source = pathById.get(edge.sourceNodeId);
      const target = pathById.get(edge.targetNodeId);
      return source && target ? [{ source, target }] : [];
    });
  const clusters = deriveModuleClusters({
    edges,
    paths: inputs.artifacts.map((artifact) => artifact.path),
  });
  const cluster = moduleClusterOf(clusters, path);
  if (!cluster) return null;
  const digest = moduleMemberDigest(
    inputs.artifacts
      .filter((artifact) => cluster.members.includes(artifact.path))
      .map((artifact) => ({
        blobSha: artifact.blobSha ?? "",
        path: artifact.path,
      })),
  );
  const cached =
    inputs.summaries.find((summary) => summary.moduleKey === cluster.key) ??
    null;
  return {
    key: cluster.key,
    memberCount: cluster.members.length,
    members: cluster.members.slice(0, MEMBERS_SHOWN),
    name: cluster.name,
    state: cached
      ? cached.memberDigest === digest
        ? "ready"
        : "stale"
      : "pending",
    summary: cached?.summary ?? null,
  };
}

export interface ConceptCard {
  readonly id: string;
  readonly kind: "api" | "concept" | "system";
  readonly memberCount: number;
  readonly members: readonly string[];
  readonly name: string;
  readonly slug: string;
  /** A model's prose — `inferred`, always. */
  readonly summary: string;
}

export interface ConceptRow {
  readonly id: string;
  readonly kind: string;
  readonly member_paths: readonly string[] | null;
  readonly name: string;
  readonly slug: string;
  readonly summary: string;
}

export function conceptInspectorCard(row: ConceptRow): ConceptCard {
  const members = [...(row.member_paths ?? [])].sort();
  return {
    id: row.id,
    kind:
      row.kind === "api" || row.kind === "system" || row.kind === "concept"
        ? row.kind
        : "concept",
    memberCount: members.length,
    members: members.slice(0, MEMBERS_SHOWN),
    name: row.name,
    slug: row.slug,
    summary: row.summary,
  };
}

/** The route's answer, one shape per node kind. */
export type InspectorCardPayload =
  | {
      readonly card: ArtifactCard;
      readonly kind: "artifact";
      readonly module: ModuleCard | null;
      readonly nodeId: string;
    }
  | {
      readonly concept: ConceptCard;
      readonly kind: "concept";
      readonly nodeId: string;
    }
  | {
      readonly kind: "other";
      readonly nodeId: string;
      readonly nodeKind: string;
    };
