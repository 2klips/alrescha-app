/**
 * A scan plan, read as a workspace (Phase 4 Wave C todo 17, OQ-030 ⑴).
 *
 * `alrescha push` sends a plan to the server, `apply_repository_scan` turns
 * it into nodes, edges and index entries, and the MCP tools read those back.
 * Serving a local repository has the same plan and the same readers but no
 * server in between, so this is the missing middle: the plan projected into
 * the shape `loadWorkspace` returns.
 *
 * **This is a second implementation of a rule that already exists in SQL**,
 * which is the kind of duplicate that quietly drifts — the vocabulary copies
 * this repository has already had to repair say so. `tests/local-serve.test.ts`
 * runs the same plan through `public.apply_repository_scan` on real
 * PostgreSQL and asserts the two agree on every node, edge and index entry,
 * so a rule that changes in one place fails a test rather than a session.
 *
 * The projection assumes a **full scan into an empty store**, which is what
 * `serve --local` always does: nothing is stored between runs, so there is
 * no previous state for an incremental plan to speak against. The deletes,
 * the identity migrations and the survive-if-unscanned rules in the SQL all
 * exist to reconcile with stored rows and have nothing to reconcile here.
 *
 * Ids are derived from what names a thing — a path, a URL, an object name, a
 * token — rather than generated. A local server holds no sequence and starts
 * empty every run, so a derived id is the only kind that means the same
 * thing twice.
 */

import {
  nextRouteFile,
  type CodeLink,
  type DocLink,
  type RepositoryScanPlan,
  type ScannedArtifact,
  type SchemaLink,
} from "@alrescha/core";

import {
  MCP_EDGE_RELATIONS,
  edgeOmissionReason,
  type McpArtifactData,
  type McpDbObjectData,
  type McpEdgeData,
  type McpEdgeFamily,
  type McpEdgeOmission,
  type McpEdgeRelation,
  type McpEdgeTier,
  type McpIndexEntryData,
  type McpRepositoryData,
  type McpRouteData,
  type McpSectionData,
  type McpSourceSpan,
  type McpWorkspaceData,
} from "./store";

/** The single workspace a local server serves. */
export const LOCAL_WORKSPACE_ID = "local-workspace";
export const LOCAL_USER_ID = "local-user";

export interface LocalWorkspaceInput {
  readonly defaultBranch?: string;
  readonly plan: RepositoryScanPlan;
  readonly repositoryFullName: string;
}

/** An edge before the MCP vocabulary filter — `contains` is still here. */
interface DerivedEdge {
  readonly confidence: number;
  readonly family: McpEdgeFamily;
  readonly method: string | null;
  readonly reason: string | null;
  readonly relation: string;
  readonly sourceNodeId: string;
  readonly span: McpSourceSpan | null;
  readonly targetNodeId: string;
  readonly tier: McpEdgeTier | null;
}

export function localRepositoryId(repositoryFullName: string): string {
  return `repository:${repositoryFullName}`;
}

const artifactNodeId = (path: string): string => `artifact:${path}`;
const directoryNodeId = (path: string): string => `directory:${path}`;
const rationaleNodeId = (sourceKey: string): string => `rationale:${sourceKey}`;
const routeNodeId = (url: string): string => `route:${url}`;
const dbObjectNodeId = (name: string): string => `db_object:${name}`;
const sectionNodeId = (token: string): string => `section:${token}`;

/**
 * `distinct on (key) … order by …` — the first row per key wins, after the
 * whole list is ordered. The SQL uses this shape six times and each one is a
 * decision about which of several statements describes a link; keeping it as
 * one helper is what makes those decisions comparable.
 */
function distinctOn<T>(
  items: readonly T[],
  key: (item: T) => string,
  order: (left: T, right: T) => number,
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of [...items].sort(order)) {
    const itemKey = key(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    kept.push(item);
  }
  return kept;
}

function compare(left: string | number, right: string | number): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** The confidence the SQL writes: a resolved link is certain, others are not. */
function confidenceOf(tier: string): number {
  return tier === "resolved" ? 1 : 0.6;
}

function spanOf(
  path: string,
  span: { readonly endLine: number; readonly startLine: number },
): McpSourceSpan {
  return { endLine: span.endLine, path, startLine: span.startLine };
}

function tierOf(value: string): McpEdgeTier | null {
  return value === "agent_asserted" ||
    value === "inferred" ||
    value === "reference" ||
    value === "resolved"
    ? value
    : null;
}

const basename = (path: string): string => path.replace(/^.*\//, "");
const parentPath = (path: string): string | null =>
  path.replace(/\/?[^/]+$/, "") || null;

/** Every ancestor directory of a tracked path, shallowest first. */
function ancestorDirectories(paths: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      const directory = parts.slice(0, depth).join("/");
      if (directory !== "") directories.add(directory);
    }
  }
  return [...directories].sort();
}

function artifactRecord(artifact: ScannedArtifact): McpArtifactData {
  // A local scan carries no prose: enrich is a server job and this store has
  // never held one. `missing` is the honest state, and it is the same state
  // the hosted reader reports for a file nothing has summarised yet — so a
  // card built from either says "no description" rather than inventing one.
  return {
    blobSha: artifact.sourceBlobSha,
    content: "",
    headings: [],
    id: artifactNodeId(artifact.path),
    kind: artifact.kind,
    path: artifact.path,
    status: "active",
    summary: artifact.path,
    summaryState: { state: "missing" },
    symbols: [],
    tags: [],
    title: artifact.path,
  };
}

function indexEntryOf(artifact: ScannedArtifact): McpIndexEntryData {
  const symbols = artifact.exportedSymbols.map((symbol) => symbol.name);
  const title = basename(artifact.path);
  return {
    headings: [],
    id: artifactNodeId(artifact.path),
    neighborIds: [],
    nodeId: artifactNodeId(artifact.path),
    path: artifact.path,
    searchKey:
      `${artifact.path} ${title} ${artifact.classification} ${symbols.join(" ")}`.toLowerCase(),
    symbols,
    tags: [artifact.classification, artifact.kind],
    title,
    type: "artifact",
  };
}

function rationaleEdges(artifacts: readonly ScannedArtifact[]): DerivedEdge[] {
  return artifacts.flatMap((artifact) =>
    artifact.rationales.map((rationale) => ({
      confidence: 1,
      family: "structure" as const,
      method: null,
      reason: null,
      relation: "references",
      sourceNodeId: rationaleNodeId(rationale.sourceKey),
      span: {
        endLine: rationale.line,
        path: artifact.path,
        startLine: rationale.line,
      },
      targetNodeId: artifactNodeId(artifact.path),
      tier: null,
    })),
  );
}

function codeLinkEdges(
  links: readonly CodeLink[],
  tracked: ReadonlySet<string>,
): DerivedEdge[] {
  return distinctOn(
    links,
    (link) => `${link.kind}\u0000${link.sourcePath}\u0000${link.targetPath}`,
    (left, right) =>
      compare(left.kind, right.kind) ||
      compare(left.sourcePath, right.sourcePath) ||
      compare(left.targetPath, right.targetPath) ||
      compare(left.span.startLine, right.span.startLine),
  ).flatMap((link) => {
    // A link whose target was skipped (oversized, binary) has no node, and
    // the SQL's join drops it. Dropping it here is the same rule, not a
    // narrower one.
    if (!tracked.has(link.sourcePath) || !tracked.has(link.targetPath)) {
      return [];
    }
    if (link.sourcePath === link.targetPath) return [];
    return [
      {
        confidence: confidenceOf(link.tier),
        family:
          link.kind === "tests"
            ? ("evidence" as const)
            : ("structure" as const),
        method: link.method,
        reason: null,
        relation: link.kind,
        sourceNodeId: artifactNodeId(link.sourcePath),
        span: spanOf(link.sourcePath, link.span),
        targetNodeId: artifactNodeId(link.targetPath),
        tier: tierOf(link.tier),
      },
    ];
  });
}

function docLinkEdges(
  links: readonly DocLink[],
  tracked: ReadonlySet<string>,
): DerivedEdge[] {
  return distinctOn(
    links,
    (link) => `${link.sourcePath}\u0000${link.targetPath}`,
    (left, right) =>
      compare(left.sourcePath, right.sourcePath) ||
      compare(left.targetPath, right.targetPath) ||
      compare(left.span.startLine, right.span.startLine),
  ).flatMap((link) => {
    if (!tracked.has(link.sourcePath) || !tracked.has(link.targetPath)) {
      return [];
    }
    if (link.sourcePath === link.targetPath) return [];
    return [
      {
        confidence: confidenceOf(link.tier),
        family: "doc" as const,
        method: link.method,
        reason: null,
        relation: "references",
        sourceNodeId: artifactNodeId(link.sourcePath),
        span: spanOf(link.sourcePath, link.span),
        targetNodeId: artifactNodeId(link.targetPath),
        tier: tierOf(link.tier),
      },
    ];
  });
}

/**
 * Containment, derived from the path set rather than carried in the plan —
 * the rule the SQL states for the same reason (ADR-013): a property of the
 * paths cannot be a place where two ingest paths disagree.
 */
function containsEdges(paths: readonly string[]): DerivedEdge[] {
  const directories = new Set(ancestorDirectories(paths));
  const childOf: Array<{ child: string; parent: string | null }> = [
    ...[...directories].map((directory) => ({
      child: directoryNodeId(directory),
      parent: parentPath(directory),
    })),
    ...paths.map((path) => ({
      child: artifactNodeId(path),
      parent: parentPath(path),
    })),
  ];
  return childOf.flatMap(({ child, parent }) => {
    if (parent === null || !directories.has(parent)) return [];
    const source = directoryNodeId(parent);
    if (source === child) return [];
    return [
      {
        confidence: 1,
        family: "hierarchy" as const,
        method: null,
        reason: "path containment",
        relation: "contains",
        sourceNodeId: source,
        span: null,
        targetNodeId: child,
        tier: "resolved" as const,
      },
    ];
  });
}

interface RouteProjection {
  readonly edges: DerivedEdge[];
  readonly routes: McpRouteData[];
}

/**
 * Routes, and the files that serve them (Wave A′ todo 6).
 *
 * A Next.js URL is in the path, so it is derived; a decorator route is in a
 * body, so it travels in the plan. A URL claimed by both keeps the resolved
 * reading: a file the tree names is a stronger statement than a prefix the
 * scan cannot see.
 */
function routeProjection(
  plan: RepositoryScanPlan,
  paths: readonly string[],
  tracked: ReadonlySet<string>,
): RouteProjection {
  const routeFiles = paths.flatMap((path) => {
    const route = nextRouteFile(path);
    return route === null ? [] : [{ ...route, path }];
  });
  const byUrl = new Map<
    string,
    { methods: Set<string>; tier: McpRouteData["tier"] }
  >();
  for (const file of routeFiles) {
    if (file.entry === "layout") continue;
    byUrl.set(file.url, { methods: new Set(), tier: "resolved" });
  }
  for (const declaration of plan.routes) {
    const existing = byUrl.get(declaration.path);
    if (existing) {
      existing.methods.add(declaration.method);
      continue;
    }
    byUrl.set(declaration.path, {
      methods: new Set([declaration.method]),
      tier: "reference",
    });
  }

  const handlers = [
    ...routeFiles
      .filter((file) => file.entry !== "layout")
      .map((file) => ({
        line: 1,
        path: file.path,
        reason: "route entry",
        url: file.url,
      })),
    // A layout serves every URL beneath it *by path*: a route group's layout
    // has the same URL as the root one, and only the directory says that
    // `/api/health` is outside it.
    ...routeFiles.flatMap((layout) =>
      layout.entry !== "layout"
        ? []
        : routeFiles
            .filter(
              (served) =>
                served.entry !== "layout" &&
                served.path.startsWith(layout.path.replace(/[^/]+$/, "")),
            )
            .map((served) => ({
              line: 1,
              path: layout.path,
              reason: "shared layout",
              url: served.url,
            })),
    ),
    ...plan.routes.flatMap((declaration) =>
      tracked.has(declaration.sourcePath)
        ? [
            {
              line: declaration.line,
              path: declaration.sourcePath,
              reason: "route decorator",
              url: declaration.path,
            },
          ]
        : [],
    ),
  ].filter((handler) => byUrl.has(handler.url));

  const edges = distinctOn(
    handlers,
    (handler) => `${handler.url}\u0000${handler.path}`,
    (left, right) =>
      compare(left.url, right.url) ||
      compare(left.path, right.path) ||
      compare(left.line, right.line),
  ).map((handler) => {
    const route = byUrl.get(handler.url) as { tier: McpRouteData["tier"] };
    return {
      confidence: confidenceOf(route.tier),
      family: "route" as const,
      method: null,
      reason: handler.reason,
      relation: "handles",
      sourceNodeId: routeNodeId(handler.url),
      span: {
        endLine: handler.line,
        path: handler.path,
        startLine: handler.line,
      },
      targetNodeId: artifactNodeId(handler.path),
      tier: tierOf(route.tier),
    };
  });

  return {
    edges,
    routes: [...byUrl]
      .map(([url, route]) => ({
        methods: [...route.methods].sort(),
        nodeId: routeNodeId(url),
        tier: route.tier,
        url,
      }))
      .sort((left, right) => compare(left.url, right.url)),
  };
}

interface SchemaProjection {
  readonly dbObjects: McpDbObjectData[];
  readonly edges: DerivedEdge[];
}

function schemaProjection(
  plan: RepositoryScanPlan,
  tracked: ReadonlySet<string>,
): SchemaProjection {
  // A migration chain re-declares the same function many times. The newest
  // file that declares a name wins, because that is where its current
  // definition is and that is the file a reader wants opened.
  const objects = distinctOn(
    plan.schemaObjects,
    (object) => object.name,
    (left, right) =>
      compare(left.name, right.name) ||
      compare(right.sourcePath, left.sourcePath) ||
      compare(left.span.startLine, right.span.startLine),
  );
  const declared = new Set(objects.map((object) => object.name));

  const reasonOf = (kind: SchemaLink["kind"]): string => {
    if (kind === "queries") return "code names the object in a literal";
    if (kind === "references") return "foreign key";
    return "schema statement";
  };
  const sourceOf = (link: SchemaLink): string | null => {
    if (link.sourceObject === null) {
      return tracked.has(link.sourcePath)
        ? artifactNodeId(link.sourcePath)
        : null;
    }
    return declared.has(link.sourceObject)
      ? dbObjectNodeId(link.sourceObject)
      : null;
  };

  const edges = distinctOn(
    plan.schemaLinks.filter(
      (link) => declared.has(link.targetObject) && sourceOf(link) !== null,
    ),
    (link) =>
      `${String(sourceOf(link))}\u0000${link.targetObject}\u0000${link.kind}`,
    (left, right) =>
      compare(String(sourceOf(left)), String(sourceOf(right))) ||
      compare(left.targetObject, right.targetObject) ||
      compare(left.kind, right.kind) ||
      compare(left.span.startLine, right.span.startLine),
  ).flatMap((link) => {
    const source = sourceOf(link) as string;
    const target = dbObjectNodeId(link.targetObject);
    if (source === target) return [];
    return [
      {
        confidence: confidenceOf(link.tier),
        family: "database" as const,
        method: link.method,
        reason: reasonOf(link.kind),
        relation: link.kind,
        sourceNodeId: source,
        span: spanOf(link.sourcePath, link.span),
        targetNodeId: target,
        tier: tierOf(link.tier),
      },
    ];
  });

  return {
    dbObjects: objects
      .map((object) => ({
        kind: object.kind,
        name: object.name,
        nodeId: dbObjectNodeId(object.name),
        sourceLine: object.span.startLine,
        sourcePath: object.sourcePath,
      }))
      .sort((left, right) => compare(left.name, right.name)),
    edges,
  };
}

interface SectionProjection {
  readonly edges: DerivedEdge[];
  readonly sections: McpSectionData[];
}

function sectionProjection(
  plan: RepositoryScanPlan,
  tracked: ReadonlySet<string>,
): SectionProjection {
  // One home per token, chosen by `homeRank` — computed in the scanner from
  // the heading alone, so this is a tie-break rather than a second reading
  // of the rule.
  const homes = distinctOn(
    plan.sections,
    (section) => section.token,
    (left, right) =>
      compare(left.token, right.token) ||
      compare(left.homeRank, right.homeRank) ||
      compare(left.path, right.path) ||
      compare(left.span.startLine, right.span.startLine),
  );
  const homeByToken = new Map(homes.map((home) => [home.token, home]));

  const edges = distinctOn(
    plan.sectionLinks.filter((link) => {
      const home = homeByToken.get(link.targetToken);
      // A citation inside the home itself is the heading, not a reference.
      return (
        home !== undefined &&
        tracked.has(link.sourcePath) &&
        home.path !== link.sourcePath
      );
    }),
    (link) => `${link.sourcePath}\u0000${link.targetToken}`,
    (left, right) =>
      compare(left.sourcePath, right.sourcePath) ||
      compare(left.targetToken, right.targetToken) ||
      compare(left.span.startLine, right.span.startLine),
  ).map((link) => ({
    confidence: 1,
    family: "doc" as const,
    method: link.method,
    reason:
      link.via === "rationale"
        ? "comment cites the section"
        : "document names the section",
    relation: "references",
    sourceNodeId: artifactNodeId(link.sourcePath),
    span: spanOf(link.sourcePath, link.span),
    targetNodeId: sectionNodeId(link.targetToken),
    tier: tierOf(link.tier),
  }));

  return {
    edges,
    sections: homes
      .map((home) => ({
        heading: home.heading,
        nodeId: sectionNodeId(home.token),
        sourcePath: home.path,
        token: home.token,
      }))
      .sort((left, right) => compare(left.token, right.token)),
  };
}

function isVocabularyRelation(value: string): value is McpEdgeRelation {
  return (MCP_EDGE_RELATIONS as readonly string[]).includes(value);
}

/**
 * The vocabulary filter, and what it left behind.
 *
 * The hosted reader applies exactly this to the rows it reads back, so a
 * relation an agent cannot see over HTTP must not appear over stdio either —
 * `contains` being the live case. Reporting the count is what separates
 * "this file is in no folder" from "this view does not carry folders".
 */
function partitionEdges(derived: readonly DerivedEdge[]): {
  edgeOmissions: McpEdgeOmission[];
  edges: McpEdgeData[];
} {
  const edges: McpEdgeData[] = [];
  const omitted = new Map<string, number>();
  for (const edge of derived) {
    if (!isVocabularyRelation(edge.relation)) {
      omitted.set(edge.relation, (omitted.get(edge.relation) ?? 0) + 1);
      continue;
    }
    edges.push({
      confidence: edge.confidence,
      family: edge.family,
      id: `${edge.relation}:${edge.sourceNodeId}->${edge.targetNodeId}`,
      provenance: {
        method: edge.method,
        reason: edge.reason,
        span: edge.span,
      },
      relation: edge.relation,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      tier: edge.tier,
    });
  }
  return {
    edgeOmissions: [...omitted]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relation, count]) => ({
        count,
        reason: edgeOmissionReason(relation),
        relation,
      })),
    edges,
  };
}

/**
 * Project one scan plan into the workspace shape the MCP tools read.
 *
 * The order below is the SQL's order, because parts of it depend on earlier
 * parts: a link only becomes an edge when both of its files are artifacts,
 * and an index entry's neighbours are read from the edges that exist once
 * every writer has run.
 */
export function buildLocalWorkspace(
  input: LocalWorkspaceInput,
): McpWorkspaceData {
  const { plan } = input;
  const artifacts = [...plan.artifacts].sort((left, right) =>
    compare(left.path, right.path),
  );
  const paths = artifacts.map((artifact) => artifact.path);
  const tracked = new Set(paths);

  const routes = routeProjection(plan, paths, tracked);
  const schema = schemaProjection(plan, tracked);
  const sections = sectionProjection(plan, tracked);
  // The three writers that run before the neighbour cache is built, and the
  // four that run after it. The split is not cosmetic: the SQL fills
  // `index_entries.neighbor_ids` immediately after the document links and
  // before it derives the hierarchy, the routes, the database objects and
  // the sections, so a stored neighbour set names files and rationales and
  // nothing else. Building a fuller one here would look like an improvement
  // and would be a divergence (recorded as OQ-057).
  const indexedEdges = [
    ...rationaleEdges(artifacts),
    ...codeLinkEdges(plan.codeLinks, tracked),
    ...docLinkEdges(plan.docLinks, tracked),
  ];
  const laterEdges = [
    ...containsEdges(paths),
    ...routes.edges,
    ...schema.edges,
    ...sections.edges,
  ];

  const { edgeOmissions, edges } = partitionEdges([
    ...indexedEdges,
    ...laterEdges,
  ]);

  const neighbours = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    const partners = neighbours.get(from) ?? new Set<string>();
    partners.add(to);
    neighbours.set(from, partners);
  };
  for (const edge of indexedEdges) {
    link(edge.sourceNodeId, edge.targetNodeId);
    link(edge.targetNodeId, edge.sourceNodeId);
  }

  const indexEntries = artifacts.map((artifact) => {
    const entry = indexEntryOf(artifact);
    return {
      ...entry,
      neighborIds: [...(neighbours.get(entry.nodeId) ?? [])].sort(),
    };
  });

  const repositoryId = localRepositoryId(input.repositoryFullName);
  const defaultBranch = input.defaultBranch ?? "local";
  const repository: McpRepositoryData = {
    artifacts: artifacts.map(artifactRecord),
    // The read stands on the commit that was scanned, and nothing else can
    // have moved underneath it: the plan was built and projected in one
    // process with no writer but this one. `analysis` is `unavailable`
    // rather than `pending`, because nothing is coming — a local server runs
    // no analyze job and never will (OQ-030).
    basis: {
      analyzedCommit: null,
      dataRevision: 1,
      graphGeneration: null,
      indexedCommit: plan.commitSha,
      repositoryId,
      stages: { analysis: "unavailable", structure: "ready" },
    },
    contextPacks:
      indexEntries.length === 0
        ? []
        : [
            {
              content: indexEntries
                .map((entry) => `${entry.title} (${entry.path})`)
                .join("\n\n"),
              id: repositoryId,
              nodeIds: indexEntries.map((entry) => entry.nodeId),
              paths: [...new Set(indexEntries.map((entry) => entry.path))],
              title: `${input.repositoryFullName} indexed context`,
            },
          ],
    // Concepts are written by the enrich synthesis, a server job that has
    // never run for a local repository — the same empty answer the hosted
    // reader gives before enrich (todo 19 ⑴).
    concepts: [],
    dbObjects: schema.dbObjects,
    defaultBranch,
    edgeOmissions,
    edges,
    // Analysis, enrichment and receipts are server jobs. A local server has
    // never run one, and an empty list here is the same answer the hosted
    // reader gives for a repository nothing has analysed yet.
    evidence: [],
    findings: [],
    fullName: input.repositoryFullName,
    id: repositoryId,
    indexEntries,
    overview: `${input.repositoryFullName} on ${defaultBranch}`,
    receipts: [],
    requirements: [],
    routes: routes.routes,
    sections: sections.sections,
  };

  return {
    // One process, one plan, one projection — there is no second read for a
    // writer to slip between, and no row budget for it to hit.
    coverage: {
      readConsistency: "single-statement",
      result: "complete",
      truncated: [],
    },
    id: LOCAL_WORKSPACE_ID,
    memoryEntries: [],
    ownerUserId: LOCAL_USER_ID,
    repositories: [repository],
  };
}
