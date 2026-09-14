/**
 * The `docskeleton` job (Phase 4 Wave D todo 20): the derived half of every
 * doc page, from stored rows, at no cost.
 *
 * A page is the readable face of a node. What keeps it from becoming a
 * second, drifting copy of the repository is that everything here is
 * *derived* — members, symbol names, relation counts, the citation
 * candidate set — and only the prose (the `docpage` job, behind G3) is
 * written. This job reads the graph the scan and the analysis stored and
 * hands `apply_doc_page_skeletons` one page per scope it can produce today:
 *
 * - `repo` — one page over every file;
 * - `module` — one per import/call cluster, keyed like `explain_module`
 *   keys its summaries, so a module page and a module summary name the same
 *   thing;
 * - `directory` — one per scanned directory that holds at least one file,
 *   attached to the directory's own node.
 *
 * File and concept pages, and the `feature` scope, have no producer here
 * yet; the evidence file says why. Bodies are never read: the skeleton
 * carries names and counts, and `moduleMemberDigest` seals which blobs the
 * members were at so the paid prose can be written conditionally on them.
 */

import {
  buildDocPageSkeleton,
  deriveModuleClusters,
  moduleMemberDigest,
  type DocPageScope,
} from "@alrescha/core";

import type { JobHandler } from "./worker";

/** Relations that make two files one module — the same two `explain_module` uses. */
const STRUCTURE_RELATIONS = new Set(["imports", "calls"]);

/**
 * The hierarchy is structure, not meaning: a `contains` edge from a folder to
 * its files would count as a relation on every page and make every folder a
 * citation candidate of the pages under it. The MCP vocabulary excludes it
 * for the same reason (`edgeOmissionReason`).
 */
const SKELETON_EDGE_EXCLUDED = new Set(["contains"]);

export interface DocSkeletonArtifact {
  readonly blobSha: string | null;
  readonly exportedSymbols: readonly string[];
  readonly nodeId: string;
  readonly path: string;
}

export interface DocSkeletonRows {
  readonly artifacts: readonly DocSkeletonArtifact[];
  readonly directories: readonly {
    readonly nodeId: string;
    readonly path: string;
  }[];
  readonly edges: readonly {
    readonly relation: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  }[];
  /** Every graph node, for resolving citation candidates: what it is and where. */
  readonly nodes: readonly {
    readonly kind: string;
    readonly nodeId: string;
    readonly path: string | null;
    readonly title: string;
  }[];
  readonly repositoryFullName: string;
}

/** One page as `apply_doc_page_skeletons` takes it. */
export interface DocSkeletonPage {
  readonly anchorNodeId?: string;
  readonly commitSha: string | null;
  readonly identityKey: string;
  readonly memberDigest: string;
  readonly memberPaths: readonly string[];
  readonly scope: DocPageScope;
  readonly skeleton: {
    readonly citations: readonly {
      readonly kind: string;
      readonly nodeId: string;
      readonly path: string | null;
      readonly title: string;
    }[];
    readonly relations: Readonly<Record<string, number>>;
    readonly symbols: readonly string[];
  };
  readonly title: string;
}

export interface DocSkeletonStore {
  applySkeletons(input: {
    pages: readonly DocSkeletonPage[];
    repositoryId: string;
    workspaceId: string;
  }): Promise<{ renamed: number; written: number }>;
  loadSkeletonRows(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<DocSkeletonRows>;
}

/**
 * The pages a repository's rows produce, in a stable order: the repository,
 * then modules by key, then directories by path. Pure, so the same rows
 * always produce the same pages and a test can say exactly which.
 */
export function buildDocSkeletonPages(
  rows: DocSkeletonRows,
  commitSha: string | null,
): DocSkeletonPage[] {
  const blobByPath = new Map(
    rows.artifacts.map((artifact) => [artifact.path, artifact.blobSha ?? ""]),
  );
  const symbolsByPath: Record<string, readonly string[]> = {};
  for (const artifact of rows.artifacts) {
    symbolsByPath[artifact.path] = artifact.exportedSymbols;
  }
  const edges = rows.edges.filter(
    (edge) => !SKELETON_EDGE_EXCLUDED.has(edge.relation),
  );
  const pathById = new Map(
    rows.artifacts.map((artifact) => [artifact.nodeId, artifact.path]),
  );

  const page = (input: {
    readonly anchorNodeId?: string;
    readonly identityKey: string;
    readonly memberPaths: readonly string[];
    readonly scope: DocPageScope;
    readonly title: string;
  }): DocSkeletonPage => {
    const skeleton = buildDocPageSkeleton({
      edges,
      memberPaths: input.memberPaths,
      nodes: rows.nodes,
      scope: input.scope,
      symbolsByPath,
      title: input.title,
    });
    return {
      ...(input.anchorNodeId === undefined
        ? {}
        : { anchorNodeId: input.anchorNodeId }),
      commitSha,
      identityKey: input.identityKey,
      memberDigest: moduleMemberDigest(
        skeleton.memberPaths.map((path) => ({
          blobSha: blobByPath.get(path) ?? "",
          path,
        })),
      ),
      memberPaths: skeleton.memberPaths,
      scope: input.scope,
      skeleton: {
        citations: skeleton.citations,
        relations: skeleton.relations,
        symbols: skeleton.symbols,
      },
      title: input.title,
    };
  };

  const allPaths = rows.artifacts.map((artifact) => artifact.path);
  const pages: DocSkeletonPage[] = [];
  if (allPaths.length > 0) {
    pages.push(
      page({
        identityKey: `repo:${rows.repositoryFullName}`,
        memberPaths: allPaths,
        scope: "repo",
        title: rows.repositoryFullName,
      }),
    );
  }

  const clusters = deriveModuleClusters({
    edges: edges
      .filter((edge) => STRUCTURE_RELATIONS.has(edge.relation))
      .flatMap((edge) => {
        const source = pathById.get(edge.sourceNodeId);
        const target = pathById.get(edge.targetNodeId);
        return source && target ? [{ source, target }] : [];
      }),
    paths: allPaths,
  });
  for (const cluster of [...clusters].sort((left, right) =>
    left.key.localeCompare(right.key),
  )) {
    pages.push(
      page({
        identityKey: cluster.key,
        memberPaths: cluster.members,
        scope: "module",
        title: cluster.name,
      }),
    );
  }

  for (const directory of [...rows.directories].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const prefix = `${directory.path}/`;
    const members = allPaths.filter((path) => path.startsWith(prefix));
    // A folder with nothing scanned under it has no page: a page with no
    // members would be a face with nothing behind it.
    if (members.length === 0) continue;
    pages.push(
      page({
        anchorNodeId: directory.nodeId,
        identityKey: `directory:${directory.path}`,
        memberPaths: members,
        scope: "directory",
        title: directory.path,
      }),
    );
  }

  return pages;
}

function commitShaOf(job: {
  readonly payload: Readonly<Record<string, unknown>>;
}): string | null {
  const sha = job.payload["commitSha"];
  return typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

export function createDocSkeletonJobHandler(dependencies: {
  readonly store: DocSkeletonStore;
}): JobHandler {
  const { store } = dependencies;
  return async (job) => {
    const { repositoryId, workspaceId } = job;
    const rows = await store.loadSkeletonRows({ repositoryId, workspaceId });
    if (rows.artifacts.length === 0) {
      throw new Error(
        "docskeleton ran before any artifact was stored — the scan job for this run has not applied its plan",
      );
    }
    await store.applySkeletons({
      pages: buildDocSkeletonPages(rows, commitShaOf(job)),
      repositoryId,
      workspaceId,
    });
  };
}

/**
 * `docpage` is the billable half and calls a model. Nothing enqueues it yet
 * (G3, todo 20); a claimed one fails with the pointer rather than being a
 * hole in the handler table, the way the reserved `pack` kind does.
 */
export function reservedDocPageHandler(): JobHandler {
  return async () => {
    throw new Error(
      "'docpage' has no producer yet: the model-backed half of todo 20 is " +
        "behind G3 (spec/BUILD_PLAN_PHASE4.md todo 20). Nothing should " +
        "enqueue it until that job exists.",
    );
  };
}
