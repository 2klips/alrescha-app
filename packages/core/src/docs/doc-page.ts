/**
 * A page is the face of a node (Phase 4 Wave D todo 20, design ④, OQ-033).
 *
 * The graph knows what a module contains and what it touches. Nobody can
 * read a graph, so a page is the readable face of one — and the rule that
 * keeps it from becoming a second, drifting copy of the repository is that
 * **the skeleton is derived and the prose is the only written part**.
 *
 * **Which scopes get a node of their own.** A file, a directory and a
 * concept already *are* nodes; giving them a second one would double the
 * graph and make "which node is this file" a question with two answers.
 * Their page attaches by `anchor_node_id`. Only `module`, `feature` and
 * `repo` describe something the graph has no node for, so only those three
 * become `graph_nodes(kind='doc_page')`.
 *
 * **The slug is the member directory set, not the member files.** A module
 * gains and loses files constantly; it changes shape rarely. Hashing the
 * files would rename a page on every commit and break every link to it, so
 * the slug hashes the *directories* the members live in — and `previousSlugs`
 * carries the old name when even that changes, because a URL somebody
 * bookmarked is not free to break.
 *
 * **Citations are checked against a candidate set.** A page may cite only
 * nodes its own skeleton listed. A model that cites something plausible and
 * absent produces a dangling link, which is the failure mode that makes
 * generated documentation worse than none.
 */

import { createHash } from "node:crypto";

import { EnrichValidationError } from "../enrich/prose-summary";

export type DocPageScope =
  "concept" | "directory" | "feature" | "file" | "module" | "repo";

/**
 * Scopes that get their own `graph_nodes` row. Everything else attaches to
 * a node that already exists (`anchor_node_id`).
 */
export const DOC_PAGE_NODE_SCOPES: readonly DocPageScope[] = [
  "feature",
  "module",
  "repo",
];

export function docPageNeedsNode(scope: DocPageScope): boolean {
  return DOC_PAGE_NODE_SCOPES.includes(scope);
}

/** The sorted, deduplicated set of directories a member set spans. */
export function memberDirectories(
  memberPaths: readonly string[],
): readonly string[] {
  return [
    ...new Set(memberPaths.map((path) => path.replace(/\/?[^/]*$/, ""))),
  ].sort();
}

/**
 * The page's address.
 *
 * For the three scopes that *are* a member set — module, feature, repo — it
 * is md5 over the sorted set of member **directories**. Directories, not
 * files, so adding one file to a module does not rename its page and break
 * every link to it. A member at the repository root contributes the empty
 * directory, which is a real distinction: a page over root files is not the
 * page over `src/`.
 *
 * For the scopes that attach to an existing node, the member-directory rule
 * would collide — two files in one directory would hash the same — so their
 * address is their own identity: a path, or a concept's name.
 *
 * The scope is inside the hash either way, so a module page and a file page
 * over the same directory are different addresses rather than a conflict.
 */
export function docPageSlug(input: {
  readonly identityKey: string;
  readonly memberPaths?: readonly string[] | undefined;
  readonly scope: DocPageScope;
}): string {
  const addressable = docPageNeedsNode(input.scope)
    ? memberDirectories(input.memberPaths ?? []).join("\n")
    : input.identityKey;
  return createHash("md5")
    .update(`${input.scope}\n${addressable}`)
    .digest("hex");
}

/** One node a page is allowed to cite, and what it is. */
export interface DocPageCitation {
  readonly kind: string;
  readonly nodeId: string;
  readonly path: string | null;
  readonly title: string;
}

export interface DocPageSkeletonInput {
  readonly memberPaths: readonly string[];
  /** Every node in this repository, for resolving members and neighbours. */
  readonly nodes: readonly {
    readonly kind: string;
    readonly nodeId: string;
    readonly path: string | null;
    readonly title: string;
  }[];
  /** Stored edges, by node id. Only these become relations and citations. */
  readonly edges: readonly {
    readonly relation: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  }[];
  readonly scope: DocPageScope;
  /** Exported symbol names by path — names only, never signatures. */
  readonly symbolsByPath?:
    Readonly<Record<string, readonly string[]>> | undefined;
  readonly title: string;
}

/**
 * The deterministic half of a page.
 *
 * Everything here is read from stored rows. No model runs, nothing is
 * fetched and nothing is charged — which is what makes a skeleton the thing
 * a repository always has, with or without an AI budget.
 *
 * Backlinks are deliberately **not** here: they are a reverse lookup at read
 * time. Storing them would mean every new page invalidates the pages that
 * now point at it, and a cache that must be swept on every write is worse
 * than a query.
 */
export interface DocPageSkeleton {
  /** Node ids this page may cite. Nothing outside it is allowed. */
  readonly citations: readonly DocPageCitation[];
  readonly memberPaths: readonly string[];
  /** Relation name to how many edges leave or enter the member set. */
  readonly relations: Readonly<Record<string, number>>;
  readonly scope: DocPageScope;
  /** Exported names across the members, sorted and deduplicated. */
  readonly symbols: readonly string[];
  readonly title: string;
}

export function buildDocPageSkeleton(
  input: DocPageSkeletonInput,
): DocPageSkeleton {
  const members = [...new Set(input.memberPaths)].sort();
  const memberSet = new Set(members);
  const byNodeId = new Map(input.nodes.map((node) => [node.nodeId, node]));
  const memberNodeIds = new Set(
    input.nodes
      .filter((node) => node.path !== null && memberSet.has(node.path))
      .map((node) => node.nodeId),
  );

  const relations: Record<string, number> = {};
  const cited = new Map<string, DocPageCitation>();
  for (const edge of input.edges) {
    const fromMember = memberNodeIds.has(edge.sourceNodeId);
    const toMember = memberNodeIds.has(edge.targetNodeId);
    if (!fromMember && !toMember) continue;
    relations[edge.relation] = (relations[edge.relation] ?? 0) + 1;
    // The node on the other end is what this page may point at. An edge
    // between two members cites neither: a page does not link to itself.
    const otherId = fromMember ? edge.targetNodeId : edge.sourceNodeId;
    if (memberNodeIds.has(otherId)) continue;
    const node = byNodeId.get(otherId);
    // A neighbour the read did not carry is not a citation candidate — that
    // is exactly the dangling link this set exists to prevent.
    if (!node) continue;
    cited.set(node.nodeId, {
      kind: node.kind,
      nodeId: node.nodeId,
      path: node.path,
      title: node.title,
    });
  }

  const symbols = [
    ...new Set(
      members.flatMap((path) => [...(input.symbolsByPath?.[path] ?? [])]),
    ),
  ].sort();

  return {
    citations: [...cited.values()].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId),
    ),
    memberPaths: members,
    relations,
    scope: input.scope,
    symbols,
    title: input.title,
  };
}

/** A page's prose, and the node ids it points at. */
export interface DocPageProse {
  readonly citedNodeIds: readonly string[];
  readonly body: string;
}

const MAX_PAGE_CHARS = 4_000;
const MIN_PAGE_CHARS = 80;
const MAX_LINE_CHARS = 200;
const CODE_FENCE = /```|~~~/;
/** Trimmed member lines at least this long make the verbatim check. */
const VERBATIM_LINE_MIN_CHARS = 24;

/**
 * Validate one generated page against the contract.
 *
 * Returns the page; throws `EnrichValidationError` — which is never billed —
 * otherwise. The four rules are the ones that separate a page from a leak:
 *
 * - **No citation outside the candidate set.** A plausible-looking link to a
 *   node that does not exist is worse than no link.
 * - **No code fence and no verbatim member line.** A page is prose about the
 *   repository, and a page that quotes it is a place source bodies live
 *   (WORK_SPEC §3-3).
 * - **Bounded length, per page and per line.** A wall of text is not a face.
 */
export function validateDocPageProse(input: {
  readonly candidates: readonly DocPageCitation[];
  readonly memberSources?: readonly string[] | undefined;
  readonly raw: unknown;
  readonly slug: string;
}): DocPageProse {
  const raw =
    typeof input.raw === "object" && input.raw !== null
      ? (input.raw as { body?: unknown; citedNodeIds?: unknown })
      : null;
  const body = typeof raw?.body === "string" ? raw.body.trim() : null;
  if (body === null) {
    throw new EnrichValidationError(
      `Doc page ${input.slug} did not match the {body, citedNodeIds} schema.`,
    );
  }
  if (body.length < MIN_PAGE_CHARS) {
    throw new EnrichValidationError(
      `Doc page ${input.slug} is too short to describe anything.`,
    );
  }
  if (body.length > MAX_PAGE_CHARS) {
    throw new EnrichValidationError(
      `Doc page ${input.slug} exceeds ${MAX_PAGE_CHARS} characters.`,
    );
  }
  if (CODE_FENCE.test(body)) {
    throw new EnrichValidationError(
      `Doc page ${input.slug} contains a code fence; prose only.`,
    );
  }
  for (const line of body.split("\n")) {
    if (line.length > MAX_LINE_CHARS) {
      throw new EnrichValidationError(
        `Doc page ${input.slug} has a line over ${MAX_LINE_CHARS} characters.`,
      );
    }
  }
  for (const source of input.memberSources ?? []) {
    for (const line of source.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length >= VERBATIM_LINE_MIN_CHARS && body.includes(trimmed)) {
        throw new EnrichValidationError(
          `Doc page ${input.slug} quotes a member line verbatim; ` +
            "prose only — raw code is never persisted.",
        );
      }
    }
  }

  const allowed = new Set(input.candidates.map(({ nodeId }) => nodeId));
  const cited = Array.isArray(raw?.citedNodeIds)
    ? raw.citedNodeIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const stray = cited.filter((nodeId) => !allowed.has(nodeId));
  if (stray.length > 0) {
    throw new EnrichValidationError(
      `Doc page ${input.slug} cites ${stray.length} node(s) outside its ` +
        `skeleton: ${stray.slice(0, 3).join(", ")}.`,
    );
  }

  return { body, citedNodeIds: [...new Set(cited)].sort() };
}
