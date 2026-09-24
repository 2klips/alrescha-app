import {
  buildArtifactCard,
  composeContextPack,
  deriveArtifactFacets,
  personalizedPageRank,
  summaryAbsence,
  type ArtifactCard,
  type ArtifactClassification,
  type ContextDocument,
  type ContextDocumentKind,
  type ContextTargetAgent,
  type ArtifactCardRelation,
  type FacetDomain,
  type FacetUnit,
  type PageRankEdge,
  type SummaryAbsence,
} from "@alrescha/core";

import { estimateTokens } from "./repo-map";
import { workspaceRiskEntries } from "./workspace-risk";

/** Code cards one pack will carry, whatever the budget allows beyond it. */
const MAX_CONTEXT_CODE_CARDS = 20;

import type {
  McpArtifactData,
  McpArtifactMatch,
  McpFindingData,
  McpEdgeFamily,
  McpEdgeRelation,
  McpIndexEntryData,
  McpNodeType,
  McpWorkspaceData,
} from "./store";

export type SearchRank =
  "exact" | "title-heading" | "path-symbol" | "graph-neighbor";

export interface SearchIndexResult {
  excerpt: string;
  /**
   * Why the excerpt is empty, when it is (Wave D todo 19 보완 R-02). Prose
   * written for an older blob never reaches a reader, so a file whose only
   * description is stale looks identical to one nobody has ever described —
   * unless the result says which. Absent when there is an excerpt.
   */
  excerptAbsence?: SummaryAbsence;
  id: string;
  neighborIds: string[];
  nodeId: string;
  path: string;
  rank: SearchRank;
  repositoryId: string;
  score: number;
  title: string;
  type: McpNodeType;
}

interface WorkspaceIndexEntry {
  entry: McpIndexEntryData;
  repositoryId: string;
}

export interface BrainNode {
  id: string;
  label: string;
  path?: string | undefined;
  relations: McpEdgeRelation[];
  repositoryId: string;
  status: string;
  type: McpNodeType;
}

export interface BrainQueryFilter {
  /**
   * Which area of the repository a node sits in (todo 21). Derived from the
   * path and classification the same way the map derives it — one
   * `deriveArtifactFacets`, so a chip on the graph and a filter here cannot
   * disagree about what `backend` means.
   *
   * Only nodes with a path can carry a domain; a requirement or a finding
   * inherits the domain of the file it is anchored to, and a node with no
   * path at all is filtered out rather than assigned `unclassified`.
   */
  domains?: FacetDomain[] | undefined;
  /**
   * Edge families a node touches (todo 21 / todo 22 ⑸). A band with no edges
   * answers with none rather than with everything — the same rule
   * `get_neighbors` follows, for the same reason.
   */
  families?: McpEdgeFamily[] | undefined;
  /** `table` renders the same nodes for a reader; `ids` is the default. */
  format?: "ids" | "table" | undefined;
  /**
   * Rows to keep after sorting (todo 21). The answer says how many the cap
   * left out, because a list that is shorter than the truth is only honest
   * if it admits it.
   */
  limit?: number | undefined;
  /**
   * Files that do or do not carry a description the freshness rule accepts
   * as current (todo 21). Stale prose reads as *no* summary here, because
   * that is what every reader is served.
   */
  hasSummary?: boolean | undefined;
  path?: string | undefined;
  /** `src/**\/*.ts` — segment-wise, with `*` and `**`. No regex (OQ-054). */
  pathGlob?: string | undefined;
  relations?: McpEdgeRelation[] | undefined;
  /**
   * `risk` ranks by the same builder `/app/inspection` uses, over what this
   * read carries. The signals it could not see are named in `coverage`.
   */
  sortBy?: "risk" | undefined;
  statuses?: string[] | undefined;
  types?: McpNodeType[] | undefined;
  /** `code` · `doc` · `file` · `test` — the coarse role of the file. */
  units?: FacetUnit[] | undefined;
  withoutRelations?: McpEdgeRelation[] | undefined;
}

export interface ArtifactNeighbor {
  direction: "incoming" | "outgoing";
  id: string;
  label: string;
  path?: string | undefined;
  relation: McpEdgeRelation;
  type: McpNodeType;
}

/** Repositories that answer to the same path, when more than one does. */
export interface AmbiguousArtifactTarget {
  candidates: {
    artifactId: string;
    repositoryFullName: string;
    repositoryId: string;
  }[];
  path: string;
}

export interface ArtifactWithNeighbors {
  /**
   * The same card the map inspector builds, from the same facts (Codex
   * remedy §6.1, step S5). Null when no artifact matched.
   */
  card: ArtifactCard | null;
  /**
   * Set when a path matched in more than one repository. The caller picks;
   * this layer does not pick for them and call it an answer.
   */
  ambiguous?: AmbiguousArtifactTarget;
  artifact: (McpArtifactData & { repositoryId: string }) | null;
  neighbors: ArtifactNeighbor[];
}

export interface FindingQueryFilter {
  kind?: string | undefined;
  severity?: string | undefined;
  status?: string | undefined;
}

export interface WorkspaceFinding extends McpFindingData {
  repositoryId: string;
}

/**
 * A file the pack carries as a **card**, not as a document (Codex remedy
 * §9.1, step S5).
 *
 * `documentKinds` has no `code_metadata`, and casting a file into it would
 * have presented the deterministic facts about a file as if they were a
 * document somebody wrote. Code travels in its own lane, so a reader can tell
 * "this is what the scan knows about this file" from "this is what the spec
 * says".
 */
export interface ContextCodeCard {
  readonly card: ArtifactCard;
  readonly estimatedTokens: number;
  readonly id: string;
  readonly path: string;
}

export interface SelectedContextPack {
  assumption: string;
  /**
   * Cards for the code the selected documents point at. Counted against the
   * same budget as the prose, because a caller pays for the whole payload.
   */
  codeCards: ContextCodeCard[];
  estimatedTokens: number;
  excluded: Array<{ path: string; reason: string }>;
  nodeIds: string[];
  omitted: Array<{
    estimatedTokens: number;
    path: string;
    rank: number;
    reason: string;
    title: string;
  }>;
  paths: string[];
  readingOrder: Array<{
    estimatedTokens: number;
    id: string;
    path: string;
    rank: number;
    reason: string;
    title: string;
  }>;
  targetAgent: ContextTargetAgent;
  text: string;
  title: string;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function queryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
}

function includesEveryToken(value: string, tokens: readonly string[]): boolean {
  const normalized = normalizeSearchText(value);
  return tokens.every((token) => normalized.includes(token));
}

function directRank(
  entry: McpIndexEntryData,
  query: string,
  tokens: readonly string[],
): SearchRank | null {
  const exactFields = [
    entry.title,
    entry.path,
    entry.searchKey,
    ...entry.headings,
    ...entry.tags,
    ...entry.symbols,
  ];
  if (exactFields.some((field) => normalizeSearchText(field) === query))
    return "exact";
  if (
    includesEveryToken(
      [entry.title, ...entry.headings, ...entry.tags].join(" "),
      tokens,
    )
  ) {
    return "title-heading";
  }
  if (includesEveryToken([entry.path, ...entry.symbols].join(" "), tokens))
    return "path-symbol";
  return null;
}

interface Excerpt {
  readonly absence?: SummaryAbsence;
  readonly text: string;
}

function excerptFor(
  workspace: McpWorkspaceData,
  nodeId: string,
  fallback: string,
): Excerpt {
  for (const repository of workspace.repositories) {
    const artifact = repository.artifacts.find(({ id }) => id === nodeId);
    if (artifact) {
      const text = artifact.content.slice(0, 280);
      // The same rule and the same sentence `get_node_content` gives: an
      // empty excerpt with no explanation reads as "this file has nothing to
      // say", which is a different fact from every state that produces one.
      if (text.length > 0) return { text };
      const absence = summaryAbsence(
        artifact.summaryState ?? { state: "missing" },
      );
      return { ...(absence ? { absence } : {}), text };
    }
    const requirement = repository.requirements.find(({ id }) => id === nodeId);
    if (requirement) return { text: requirement.statement.slice(0, 280) };
    const evidence = repository.evidence.find(({ id }) => id === nodeId);
    if (evidence) return { text: `${evidence.kind}: ${evidence.verdict}` };
    const finding = repository.findings.find(({ id }) => id === nodeId);
    if (finding) return { text: finding.title };
  }
  return { text: fallback.slice(0, 280) };
}

/** Spread an excerpt into a result: the absence key exists only when set. */
function excerptResult(
  excerpt: Excerpt,
): Pick<SearchIndexResult, "excerpt" | "excerptAbsence"> {
  return {
    excerpt: excerpt.text,
    ...(excerpt.absence ? { excerptAbsence: excerpt.absence } : {}),
  };
}

function scoreFor(rank: SearchRank): number {
  if (rank === "exact") return 400;
  if (rank === "title-heading") return 300;
  if (rank === "path-symbol") return 200;
  return 100;
}

/**
 * PPR rerank (Phase 3 Wave B todo 5): connectivity reorders near-ties inside
 * a tier, never across tiers — the bonus (≤50) stays under the 100-point tier
 * gap, so a lexical winner cannot be overturned (the Graft weighting rule).
 * The walk is seeded by the direct lexical hits; with no direct hit there is
 * nothing to personalize and the bonus is zero everywhere.
 *
 * The graph it walks is the index's own neighbour cache (RE-04), not the
 * edges a read carried. `search_index` stopped reading edges: they were 3.6
 * of 4.7 MB and four sequential requests of every search on the pilot, for a
 * bonus that only reorders inside a tier. Over the pilot's own files the
 * cache ranked the named file where the edges did in 76 of 80 questions and
 * one place apart in the other four, and it is never cut short — the edge
 * read stops at 8,000 rows, and the pilot has 11,833. One graph, whatever
 * the read carried, so a transport cannot decide the ranking.
 */
const PPR_TIER_BONUS = 50;

function connectivityBonus(
  workspace: McpWorkspaceData,
  seeds: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  if (seeds.size === 0) return new Map();
  const nodeIds = new Set<string>();
  // Undirected pairs, each once: an entry and its neighbour usually name
  // each other, and a pair counted twice would weigh twice in the walk.
  const pairs = new Map<string, PageRankEdge>();
  const link = (source: string, target: string): void => {
    const key =
      source < target ? `${source}\n${target}` : `${target}\n${source}`;
    if (!pairs.has(key)) pairs.set(key, { source, target });
  };
  for (const repository of workspace.repositories) {
    for (const artifact of repository.artifacts) nodeIds.add(artifact.id);
    for (const requirement of repository.requirements) {
      nodeIds.add(requirement.id);
      link(requirement.sourceArtifactId, requirement.id);
    }
    for (const evidence of repository.evidence) nodeIds.add(evidence.id);
    for (const finding of repository.findings) nodeIds.add(finding.id);
    for (const entry of repository.indexEntries) {
      for (const neighbour of entry.neighborIds) link(entry.nodeId, neighbour);
    }
  }
  const edges = [...pairs.values()];
  const rank = personalizedPageRank({
    edges,
    nodes: [...nodeIds],
    seeds: [...seeds],
  });
  const bonus = new Map<string, number>();
  for (const [nodeId, score] of rank) {
    bonus.set(nodeId, score * PPR_TIER_BONUS);
  }
  return bonus;
}

/**
 * Rows one search answers with when the caller names no limit (RE-02 ⑶).
 *
 * The number is unchanged; what changed is that it is now a *page* size and
 * not a ceiling. It used to be applied inside this function before any
 * filter ran, which made the tool's own `limit: 1–100` unreachable above 20.
 */
export const SEARCH_INDEX_DEFAULT_LIMIT = 20;

/**
 * The tables this ranking is built from. A workspace read that stopped short
 * on one of them cannot say the page is every match; one that stopped short
 * on `routes` has nothing to do with this answer.
 */
const SEARCH_INDEX_TABLES: ReadonlySet<string> = new Set([
  "artifacts",
  "graph_nodes",
  "index_entries",
  "memory_block_entries",
]);

export interface SearchIndexInput {
  /**
   * Which area of the repository a hit sits in — the same
   * `deriveArtifactFacets` domain the map's chips and `query_brain` use.
   *
   * Applied to the candidates, *before* the limit. `hosted.ts` used to apply
   * it to the page this function had already cut to 20, so a workspace whose
   * first twenty `auth` matches were all frontend answered "no backend file
   * matches auth" — a false negative indistinguishable from a true one
   * (research 2026-09-21).
   */
  readonly domain?: FacetDomain | undefined;
  /** Rows to answer with; `SEARCH_INDEX_DEFAULT_LIMIT` when unnamed. */
  readonly limit?: number | undefined;
  readonly query: string;
  readonly typeFilter?: McpNodeType | undefined;
}

/**
 * What the rows behind a search page were worth.
 *
 * `omitted: 0` on a capped read would say "this is every match in the
 * repository", which a read that stopped at its row budget cannot know.
 */
export interface SearchIndexCoverage {
  /** Which budgets were hit, when any were; null when the read was whole. */
  readonly reason: string | null;
  readonly result: "complete" | "partial";
}

export interface SearchIndexPage {
  readonly coverage: SearchIndexCoverage;
  /**
   * Candidates *this read reached* that passed the query, the type and the
   * domain — never a claim about the repository beyond what `coverage` says
   * the read carried.
   */
  readonly eligible: number;
  /** Eligible candidates the limit left out of `results`. */
  readonly omitted: number;
  readonly results: SearchIndexResult[];
}

function searchCoverage(workspace: McpWorkspaceData): SearchIndexCoverage {
  const capped = (workspace.coverage?.truncated ?? []).filter(({ table }) =>
    SEARCH_INDEX_TABLES.has(table),
  );
  return capped.length === 0
    ? { reason: null, result: "complete" }
    : {
        reason: capped
          .map(({ limit, table }) => `${table} stopped at ${limit} rows`)
          .join("; "),
        result: "partial",
      };
}

/**
 * The deterministic ranking, as one page with its own omission count
 * (RE-02).
 *
 * Query, type and domain all narrow the *candidates*; the limit is the last
 * thing that happens. That order is the whole fix: every filter that runs
 * after a cap turns rows the cap happened to drop into rows that do not
 * exist.
 */
export function searchWorkspaceIndexPage(
  workspace: McpWorkspaceData,
  input: SearchIndexInput,
): SearchIndexPage {
  const coverage = searchCoverage(workspace);
  const query = normalizeSearchText(input.query);
  const tokens = queryTokens(input.query);
  /**
   * A conjunction over no terms is true of everything (RE-02 ⑵). `!!!`
   * normalises to no searchable term, and `tokens.every(...)` on an empty
   * list answered `true` for every title in the workspace — so punctuation
   * returned the first twenty files as though they were hits. A query with
   * nothing to search for has no matches, and saying so is the only answer
   * that is not a lie about the repository.
   */
  if (tokens.length === 0) {
    return { coverage, eligible: 0, omitted: 0, results: [] };
  }
  const entries: WorkspaceIndexEntry[] = workspace.repositories.flatMap(
    (repository) =>
      repository.indexEntries.map((entry) => ({
        entry,
        repositoryId: repository.id,
      })),
  );
  const ranks = new Map<string, SearchRank>();
  const directNodeIds = new Set<string>();

  for (const { entry } of entries) {
    const rank = directRank(entry, query, tokens);
    if (!rank) continue;
    ranks.set(entry.id, rank);
    directNodeIds.add(entry.nodeId);
  }
  const neighborNodeIds = new Set(
    entries
      .filter(({ entry }) => directNodeIds.has(entry.nodeId))
      .flatMap(({ entry }) => entry.neighborIds),
  );
  for (const { entry } of entries) {
    if (!ranks.has(entry.id) && neighborNodeIds.has(entry.nodeId)) {
      ranks.set(entry.id, "graph-neighbor");
    }
  }

  const bonus = connectivityBonus(workspace, directNodeIds);

  // Memory blocks surface next to code (Wave D todo 10): what an earlier
  // agent distilled is retrievable through the same search the next agent
  // already uses. Path-symbol tier — a stored note is never an exact hit.
  const memoryResults: SearchIndexResult[] = (workspace.memoryEntries ?? [])
    .filter((entry) =>
      !input.typeFilter || input.typeFilter === "memory"
        ? includesEveryToken(
            `${entry.name} ${entry.entryKey} ${entry.text}`,
            tokens,
          )
        : false,
    )
    .map((entry) => ({
      excerpt: entry.text.slice(0, 280),
      id: entry.id,
      neighborIds: entry.anchorNodeId ? [entry.anchorNodeId] : [],
      nodeId: entry.id,
      path: entry.anchorPath ?? `memory/${entry.name}/${entry.entryKey}`,
      rank: "path-symbol" as const,
      repositoryId: "",
      score: scoreFor("path-symbol"),
      title: `${entry.name}: ${entry.entryKey}`,
      type: "memory" as const,
    }));

  const entryResults: SearchIndexResult[] = entries.flatMap(
    ({ entry, repositoryId }) => {
      const rank = ranks.get(entry.id);
      if (!rank || (input.typeFilter && entry.type !== input.typeFilter))
        return [];
      return [
        {
          ...excerptResult(
            excerptFor(workspace, entry.nodeId, entry.searchKey),
          ),
          id: entry.id,
          neighborIds: [...entry.neighborIds],
          nodeId: entry.nodeId,
          path: entry.path,
          rank,
          repositoryId,
          score: scoreFor(rank) + (bonus.get(entry.nodeId) ?? 0),
          title: entry.title,
          type: entry.type,
        },
      ];
    },
  );

  /**
   * The domain narrows the candidates, and it is derived from the path the
   * same way the map's chips are — one definition of `backend`, so a filter
   * here and a chip on the graph cannot disagree.
   *
   * `code_metadata` is passed as the classification because that is what
   * `hosted.ts` passed when it ran this filter: only a `schema` row would
   * read differently, and changing that is a facet decision, not this one.
   */
  const eligible = [...entryResults, ...memoryResults]
    .filter(
      (result) =>
        input.domain === undefined ||
        deriveArtifactFacets(result.path, "code_metadata").domain ===
          input.domain,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.localeCompare(right.path) ||
        left.id.localeCompare(right.id),
    );
  const limit = Math.max(0, input.limit ?? SEARCH_INDEX_DEFAULT_LIMIT);
  const results = eligible.slice(0, limit);
  return {
    coverage,
    eligible: eligible.length,
    omitted: eligible.length - results.length,
    results,
  };
}

/**
 * The same ranking as an array, capped at the default page.
 *
 * Kept because `searchWorkspaceNodes`, both benchmarks and four test files
 * index the array this has always returned. They get exactly what they got
 * before: the first `SEARCH_INDEX_DEFAULT_LIMIT` hits.
 */
export function searchWorkspaceIndex(
  workspace: McpWorkspaceData,
  input: { query: string; typeFilter?: McpNodeType },
): SearchIndexResult[] {
  return searchWorkspaceIndexPage(workspace, input).results;
}

function repositoryNodes(workspace: McpWorkspaceData): BrainNode[] {
  return workspace.repositories.flatMap((repository) => {
    const artifactPaths = new Map(
      repository.artifacts.map((artifact) => [artifact.id, artifact.path]),
    );
    const nodes: BrainNode[] = [
      ...repository.artifacts.map((artifact) => ({
        id: artifact.id,
        label: artifact.title,
        path: artifact.path,
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: artifact.status,
        type: "artifact" as const,
      })),
      ...repository.requirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.statement,
        path: artifactPaths.get(requirement.sourceArtifactId),
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: requirement.status,
        type: "requirement" as const,
      })),
      ...repository.evidence.map((evidence) => ({
        id: evidence.id,
        label: `${evidence.kind}: ${evidence.verdict}`,
        path: artifactPaths.get(evidence.sourceArtifactId),
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: evidence.status ?? evidence.verdict,
        type: "evidence" as const,
      })),
      ...repository.findings.map((finding) => ({
        id: finding.id,
        label: finding.title,
        path:
          "span" in finding.provenance
            ? finding.provenance.span.path
            : undefined,
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: finding.status,
        type: "finding" as const,
      })),
      ...repository.receipts.map((receipt) => ({
        id: receipt.id,
        label: `Receipt ${receipt.commitSha.slice(0, 7)}`,
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: receipt.status,
        type: "receipt" as const,
      })),
      ...repository.contextPacks.map((pack) => ({
        id: pack.id,
        label: pack.title,
        path: pack.paths[0],
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: "available",
        type: "context_pack" as const,
      })),
      // A concept has no lifecycle of its own; its status names what it is —
      // synthesised — so a status filter cannot mistake it for a stored fact.
      ...(repository.concepts ?? []).map((concept) => ({
        id: concept.id,
        label: concept.name,
        path: concept.memberPaths[0],
        relations: [] as McpEdgeRelation[],
        repositoryId: repository.id,
        status: "synthesized",
        type: "concept" as const,
      })),
    ];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of repository.edges) {
      for (const nodeId of [edge.sourceNodeId, edge.targetNodeId]) {
        const node = byId.get(nodeId);
        if (node && !node.relations.includes(edge.relation))
          node.relations.push(edge.relation);
      }
    }
    for (const node of nodes) node.relations.sort();
    return nodes;
  });
}

/**
 * Todos as brain nodes (todo 21).
 *
 * They hang off the workspace rather than a repository — a checkbox can name
 * no repository at all — so they are added once here instead of inside the
 * per-repository walk. A todo that *does* name one carries it, so
 * `repositoryId` on the answer is the truth rather than a placeholder.
 */
function todoNodes(workspace: McpWorkspaceData): BrainNode[] {
  return (workspace.todos ?? []).map((todo) => ({
    id: todo.id,
    label: todo.title,
    // The document the checkbox lives in, when the scan recorded one — so a
    // path filter and a path glob reach todos the same way they reach files.
    ...(todo.sourcePath ? { path: todo.sourcePath } : {}),
    relations: [] as McpEdgeRelation[],
    repositoryId: todo.repositoryId ?? "",
    status: todo.status,
    type: "todo" as const,
  }));
}

/**
 * What a query could and could not answer (Codex remedy P0-B / R-01).
 *
 * A negative question — "which files have no test" — is only as good as the
 * edge read behind it. If that read stopped at its row budget, every node
 * beyond it looks unconnected, and answering "none" is a confident statement
 * about rows nobody looked at. The filter still runs; the coverage says what
 * the answer is worth.
 */
export interface BrainQueryCoverage {
  readonly result: "complete" | "partial";
  /** Filters this read cannot answer as an absence, and why. */
  readonly unanswered: readonly {
    readonly filter: string;
    readonly reason: string;
  }[];
}

export interface BrainQueryResult {
  readonly coverage: BrainQueryCoverage;
  /**
   * Rows a `limit` dropped after sorting (todo 21). Zero when the answer is
   * the whole match — a list shorter than the truth is only honest if it
   * says by how much.
   */
  readonly droppedByLimit: number;
  readonly nodes: BrainNode[];
  /**
   * A fixed-width rendering of the same nodes (todo 21), present only when
   * the caller asked for `format: "table"`. Six columns and fifty rows,
   * because a table is for reading and an unbounded one is a payload.
   */
  readonly table?: {
    readonly columns: readonly string[];
    readonly rows: readonly (readonly string[])[];
    /** Rows the cap left out. Zero when the table is the whole answer. */
    readonly truncated: number;
  };
}

/** A table is for reading; past this it is a payload pretending to be one. */
export const BRAIN_TABLE_ROWS = 50;
export const BRAIN_TABLE_COLUMNS = [
  "type",
  "path",
  "label",
  "status",
  "relations",
  "risk",
] as const;

/** Reads that decide whether a relation filter can be trusted. */
const RELATION_TABLES = new Set(["edges", "graph_nodes"]);

function queryCoverage(
  workspace: McpWorkspaceData,
  filter: BrainQueryFilter,
): BrainQueryCoverage {
  const truncated = (workspace.coverage?.truncated ?? []).filter((entry) =>
    RELATION_TABLES.has(entry.table),
  );
  if (truncated.length === 0) {
    return { result: "complete", unanswered: [] };
  }
  const reason = `the ${truncated
    .map(({ table }) => table)
    .sort()
    .join(
      " and ",
    )} read stopped at its row budget, so a node with no listed relation may simply be past it`;
  const unanswered = (
    [
      ["withoutRelations", filter.withoutRelations],
      ["relations", filter.relations],
    ] as const
  )
    .filter(([, value]) => value && value.length > 0)
    .map(([name]) => ({ filter: name, reason }));
  return {
    result: unanswered.length === 0 ? "complete" : "partial",
    unanswered,
  };
}

/**
 * A path glob, as a matcher (todo 21).
 *
 * Literal segments, `*` inside one, `**` across many — the shape people
 * already write for file paths, and nothing that can backtrack
 * catastrophically over a repository's worth of paths (OQ-054's rule, and
 * the reason this is not a regex the caller supplies).
 */
function globMatcher(glob: string): (path: string) => boolean {
  const pattern = glob
    .split("/")
    .map((segment) =>
      segment === "**"
        ? "(?:.*)"
        : segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*"),
    )
    .join("/")
    .replaceAll("(?:.*)/", "(?:.*/)?");
  const expression = new RegExp(`^${pattern}$`);
  return (path) => expression.test(path);
}

export function queryWorkspaceBrain(
  workspace: McpWorkspaceData,
  filter: BrainQueryFilter,
): BrainQueryResult {
  const normalizedPath = filter.path
    ? normalizeSearchText(filter.path)
    : undefined;
  const matchesGlob = filter.pathGlob ? globMatcher(filter.pathGlob) : null;
  const summaryByNodeId = new Map(
    workspace.repositories.flatMap((repository) =>
      repository.artifacts.map(
        (artifact) =>
          [
            artifact.id,
            (artifact.summaryState?.state ?? "missing") === "current",
          ] as const,
      ),
    ),
  );
  const risk =
    filter.sortBy === "risk" ? workspaceRiskEntries(workspace) : null;
  /**
   * Domain and unit per node, from the same deriver the map uses (todo 21) —
   * one definition of `backend`, so a chip on the graph and a filter here
   * cannot mean different things.
   *
   * Keyed by node id, not by path: a requirement and the document stating it
   * share a path and are different nodes. Anchored nodes inherit the facets
   * of the file they hang off.
   */
  const facets = new Map<string, { domain: FacetDomain; unit: FacetUnit }>();
  const familiesByNode = new Map<string, Set<McpEdgeFamily>>();
  for (const repository of workspace.repositories) {
    for (const artifact of repository.artifacts) {
      const { domain, unit } = deriveArtifactFacets(
        artifact.path,
        artifact.kind as ArtifactClassification,
      );
      facets.set(artifact.id, { domain, unit });
    }
    for (const requirement of repository.requirements) {
      const owner = facets.get(requirement.sourceArtifactId);
      if (owner) facets.set(requirement.id, owner);
    }
    for (const evidence of repository.evidence) {
      const owner = facets.get(evidence.sourceArtifactId);
      if (owner) facets.set(evidence.id, owner);
    }
    for (const edge of repository.edges) {
      if (!edge.family) continue;
      for (const end of [edge.sourceNodeId, edge.targetNodeId]) {
        const held = familiesByNode.get(end);
        if (held) held.add(edge.family);
        else familiesByNode.set(end, new Set([edge.family]));
      }
    }
  }
  const nodes = [...repositoryNodes(workspace), ...todoNodes(workspace)]
    .filter(
      (node) =>
        filter.hasSummary === undefined ||
        (summaryByNodeId.get(node.id) ?? false) === filter.hasSummary,
    )
    .filter((node) => !matchesGlob || matchesGlob(node.path ?? ""))
    .filter((node) => !filter.types || filter.types.includes(node.type))
    .filter(
      (node) =>
        !filter.domains ||
        // A node with no facet has no path to derive one from. Excluded
        // rather than bucketed as `unclassified`, which is a real answer
        // some files give and would be wrong to invent for a node that has
        // no path at all.
        filter.domains.includes(facets.get(node.id)?.domain as FacetDomain),
    )
    .filter(
      (node) =>
        !filter.units ||
        filter.units.includes(facets.get(node.id)?.unit as FacetUnit),
    )
    .filter(
      (node) =>
        !filter.families ||
        filter.families.some((family) =>
          familiesByNode.get(node.id)?.has(family),
        ),
    )
    .filter((node) => !filter.statuses || filter.statuses.includes(node.status))
    .filter(
      (node) =>
        !filter.relations ||
        filter.relations.every((relation) => node.relations.includes(relation)),
    )
    .filter(
      (node) =>
        !filter.withoutRelations ||
        filter.withoutRelations.every(
          (relation) => !node.relations.includes(relation),
        ),
    )
    .filter(
      (node) =>
        !normalizedPath ||
        normalizeSearchText(node.path ?? "").includes(normalizedPath),
    )
    .sort((left, right) =>
      risk
        ? (risk.get(right.id)?.score ?? 0) - (risk.get(left.id)?.score ?? 0) ||
          left.id.localeCompare(right.id)
        : left.type.localeCompare(right.type) ||
          (left.path ?? "").localeCompare(right.path ?? "") ||
          left.id.localeCompare(right.id),
    );

  const capped =
    filter.limit === undefined ? nodes : nodes.slice(0, filter.limit);
  const coverage = queryCoverage(workspace, filter);
  const unanswered = [
    ...coverage.unanswered,
    // The screen's map counts co-change; a workspace read does not carry it.
    // Saying so is what keeps the two rankings comparable instead of
    // quietly different.
    ...(risk
      ? [
          {
            filter: "sortBy",
            reason:
              "co-change history is not part of a workspace read, so this ranking omits the coupling factor the inspection screen includes",
          },
        ]
      : []),
  ];

  return {
    coverage: {
      result: unanswered.length === 0 ? "complete" : "partial",
      unanswered,
    },
    // What the caller asked for, and — when a cap dropped rows — how many.
    // A list shorter than the truth is only honest if it says so.
    droppedByLimit: nodes.length - capped.length,
    nodes: capped,
    ...(filter.format === "table"
      ? {
          table: {
            columns: [...BRAIN_TABLE_COLUMNS],
            rows: capped.slice(0, BRAIN_TABLE_ROWS).map((node) => [
              node.type,
              node.path ?? "",
              // One line per cell: a table with a wrapped label is not a
              // table, and the full label is in `nodes` either way.
              node.label.replace(/\s+/g, " ").slice(0, 80),
              node.status,
              node.relations.join(","),
              risk ? String(risk.get(node.id)?.score ?? 0) : "",
            ]),
            truncated: Math.max(0, capped.length - BRAIN_TABLE_ROWS),
          },
        }
      : {}),
  };
}

/**
 * The artifact a selector names, plus its neighbours from the workspace read.
 *
 * `matches` comes from a **targeted** store read, so the artifact is found
 * whether or not it fell inside the workspace load's row budget (Codex remedy
 * P0-B). The neighbours still come from that budgeted read, which is why the
 * caller is told when it was truncated rather than left to read an empty
 * neighbour list as "this file is connected to nothing".
 */
export function getWorkspaceArtifact(
  workspace: McpWorkspaceData,
  selector: { id?: string | undefined; path?: string | undefined },
  found?: readonly McpArtifactMatch[],
): ArtifactWithNeighbors {
  const matches: McpArtifactMatch[] = [
    ...(found ??
      workspace.repositories.flatMap((repository) =>
        repository.artifacts
          .filter((artifact) =>
            selector.id
              ? artifact.id === selector.id
              : artifact.path === selector.path,
          )
          .map((artifact) => ({
            artifact,
            repositoryFullName: repository.fullName,
            repositoryId: repository.id,
          })),
      )),
  ].sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
  /**
   * Two repositories can hold the same path — `src/index.ts` is not a name
   * one project owns. Picking the lexicographically first repository
   * answered a different question than the one asked, and said nothing about
   * having chosen (Codex remedy §9.1). An id selector cannot be ambiguous:
   * ids are unique.
   */
  if (!selector.id && matches.length > 1) {
    return {
      ambiguous: {
        candidates: matches.map((match) => ({
          artifactId: match.artifact.id,
          repositoryFullName: match.repositoryFullName,
          repositoryId: match.repositoryId,
        })),
        path: selector.path ?? "",
      },
      artifact: null,
      card: null,
      neighbors: [],
    };
  }
  const match = matches[0];
  if (!match) return { artifact: null, card: null, neighbors: [] };
  const repository = workspace.repositories.find(
    ({ id }) => id === match.repositoryId,
  );

  const nodes = new Map(
    repositoryNodes(workspace).map((node) => [node.id, node]),
  );
  const neighbors: ArtifactNeighbor[] = [];
  for (const edge of repository?.edges ?? []) {
    if (edge.targetNodeId === match.artifact.id) {
      const node = nodes.get(edge.sourceNodeId);
      if (node) {
        neighbors.push({
          direction: "incoming",
          id: node.id,
          label: node.label,
          ...(node.path ? { path: node.path } : {}),
          relation: edge.relation,
          type: node.type,
        });
      }
    }
    if (edge.sourceNodeId === match.artifact.id) {
      const node = nodes.get(edge.targetNodeId);
      if (node) {
        neighbors.push({
          direction: "outgoing",
          id: node.id,
          label: node.label,
          ...(node.path ? { path: node.path } : {}),
          relation: edge.relation,
          type: node.type,
        });
      }
    }
  }

  return {
    artifact: { ...match.artifact, repositoryId: match.repositoryId },
    // Stored facts, not prose: a repository that has never paid for enrich
    // still gets path, kind, domain, unit, exported names and relations, and
    // `missing` says what is absent.
    card: buildArtifactCard({
      classification: match.artifact.kind as ArtifactClassification,
      exportedSymbols: match.artifact.symbols,
      path: match.artifact.path,
      relations: neighbors.map(({ direction, relation }) => ({
        direction,
        relation,
      })),
      summary: match.artifact.summaryState ?? { state: "missing" },
    }),
    neighbors: neighbors.sort(
      (left, right) =>
        left.relation.localeCompare(right.relation) ||
        left.direction.localeCompare(right.direction) ||
        left.id.localeCompare(right.id),
    ),
  };
}

/**
 * Severity order, worst first. Alphabetical ordering put `low` above
 * `medium` and `critical` below both, so the one thing a caller reads this
 * list for — what to look at first — was the one thing it did not say.
 */
const SEVERITY_RANK: Readonly<Record<string, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? Object.keys(SEVERITY_RANK).length;
}

/** Ask for every status explicitly; the default is the open ones. */
export const ALL_FINDING_STATUSES = "all";

export function getWorkspaceFindings(
  workspace: McpWorkspaceData,
  filter: FindingQueryFilter = {},
): WorkspaceFinding[] {
  // Resolved findings are history: an agent asking what is wrong with the
  // repository was handed them alongside the open ones, unlabelled by
  // recency, until this default landed (R5 §4.3).
  const status = filter.status ?? "open";
  return workspace.repositories
    .flatMap((repository) =>
      repository.findings.map((finding) => ({
        ...finding,
        repositoryId: repository.id,
      })),
    )
    .filter((finding) => !filter.kind || finding.kind === filter.kind)
    .filter(
      (finding) => !filter.severity || finding.severity === filter.severity,
    )
    .filter(
      (finding) => status === ALL_FINDING_STATUSES || finding.status === status,
    )
    .sort(
      (left, right) =>
        severityRank(left.severity) - severityRank(right.severity) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
}

export function selectWorkspaceContextPack(
  workspace: McpWorkspaceData,
  input: {
    targetAgent?: ContextTargetAgent;
    taskDescription: string;
    tokenBudget: number;
  },
): SelectedContextPack {
  const documentKinds = new Set<ContextDocumentKind>([
    "agents",
    "claude",
    "skill",
    "cursor_rule",
    "spec",
    "adr",
    "todo_progress",
  ]);
  const documents: ContextDocument[] = workspace.repositories.flatMap(
    (repository) => {
      const relatedNodeIds = new Map<string, Set<string>>();
      const connect = (left: string, right: string) => {
        const leftConnections = relatedNodeIds.get(left) ?? new Set<string>();
        leftConnections.add(right);
        relatedNodeIds.set(left, leftConnections);
      };

      for (const edge of repository.edges) {
        connect(edge.sourceNodeId, edge.targetNodeId);
        connect(edge.targetNodeId, edge.sourceNodeId);
      }
      for (const requirement of repository.requirements) {
        connect(requirement.sourceArtifactId, requirement.id);
        connect(requirement.id, requirement.sourceArtifactId);
      }

      return repository.artifacts.flatMap((artifact) => {
        if (!documentKinds.has(artifact.kind as ContextDocumentKind)) return [];

        return [
          {
            content: artifact.content,
            id: artifact.id,
            kind: artifact.kind as ContextDocumentKind,
            path: artifact.path,
            relatedNodeIds: [...(relatedNodeIds.get(artifact.id) ?? [])],
            title: artifact.title,
          },
        ];
      });
    },
  );
  const relations = workspace.repositories.flatMap((repository) => [
    ...repository.edges.map((edge) => ({
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      type: edge.relation,
    })),
    ...repository.requirements.map((requirement) => ({
      sourceId: requirement.id,
      sourceLabel: requirement.statement,
      targetId: requirement.sourceArtifactId,
      type: "specified_by",
    })),
  ]);
  const pack = composeContextPack({
    documents,
    relations,
    targetAgent: input.targetAgent ?? "generic",
    taskDescription: input.taskDescription,
    tokenBudget: input.tokenBudget,
  });
  const selectedNodeIds = new Set(pack.readingOrder.map(({ id }) => id));

  for (const repository of workspace.repositories) {
    for (const requirement of repository.requirements) {
      if (selectedNodeIds.has(requirement.sourceArtifactId))
        selectedNodeIds.add(requirement.id);
    }
    for (const edge of repository.edges) {
      if (selectedNodeIds.has(edge.sourceNodeId))
        selectedNodeIds.add(edge.targetNodeId);
      if (selectedNodeIds.has(edge.targetNodeId))
        selectedNodeIds.add(edge.sourceNodeId);
    }
  }

  /**
   * Code the pack's documents actually point at, as cards. Bounded by what
   * is left of the budget after the prose, and by a hard count — a pack that
   * carried every file it touched would be a repository dump.
   */
  const codeCards: ContextCodeCard[] = [];
  let cardTokens = 0;
  for (const repository of workspace.repositories) {
    const neighbours = new Map<string, ArtifactCardRelation[]>();
    for (const edge of repository.edges) {
      const outgoing = neighbours.get(edge.sourceNodeId) ?? [];
      outgoing.push({ direction: "outgoing", relation: edge.relation });
      neighbours.set(edge.sourceNodeId, outgoing);
      const incoming = neighbours.get(edge.targetNodeId) ?? [];
      incoming.push({ direction: "incoming", relation: edge.relation });
      neighbours.set(edge.targetNodeId, incoming);
    }
    for (const artifact of repository.artifacts) {
      if (documentKinds.has(artifact.kind as ContextDocumentKind)) continue;
      if (!selectedNodeIds.has(artifact.id)) continue;
      if (codeCards.length >= MAX_CONTEXT_CODE_CARDS) break;
      const card = buildArtifactCard({
        classification: artifact.kind as ArtifactClassification,
        exportedSymbols: artifact.symbols,
        path: artifact.path,
        relations: neighbours.get(artifact.id) ?? [],
        summary: artifact.summaryState ?? { state: "missing" },
      });
      // The estimate is of the serialized card, not of its prose: the
      // omissions and the relation counts are payload too (REMEDY §9.1).
      const estimatedTokens = estimateTokens(JSON.stringify(card));
      if (
        pack.estimatedTokens + cardTokens + estimatedTokens >
        input.tokenBudget
      ) {
        break;
      }
      cardTokens += estimatedTokens;
      codeCards.push({
        card,
        estimatedTokens,
        id: artifact.id,
        path: artifact.path,
      });
    }
  }

  const omitted = pack.omitted.map(
    ({ estimatedTokens, path, rank, reason, title }) => ({
      estimatedTokens,
      path,
      rank,
      reason,
      title,
    }),
  );

  return {
    assumption: pack.assumption,
    codeCards,
    // What the caller pays for is the whole payload, prose and cards alike.
    estimatedTokens: pack.estimatedTokens + cardTokens,
    excluded: omitted.map(({ path, reason }) => ({ path, reason })),
    nodeIds: [...selectedNodeIds],
    omitted,
    paths: pack.readingOrder.map(({ path }) => path),
    readingOrder: pack.readingOrder.map(
      ({ estimatedTokens, id, path, rank, reason, title }) => ({
        estimatedTokens,
        id,
        path,
        rank,
        reason,
        title,
      }),
    ),
    targetAgent: pack.targetAgent,
    text: pack.formattedText,
    title: `Context for ${input.taskDescription}`,
  };
}
