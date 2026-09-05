import type { ParsedMarkdownStructure } from "../parser/markdown";
import type { CodeLinkSpan, CodeLinkTier } from "./code-links";
import {
  directoryOf,
  joinRepositoryPath,
  normalizeRepositoryPath,
} from "./path-conventions";

/**
 * Document links (Phase 4 Wave A todo 2, design ①).
 *
 * A repository's prose already points at its code — `packages/core/src/x.ts`
 * in a spec, `[ADR-001](docs/adr/ADR-001.md)` in a plan — and nothing read
 * those pointers. The rules engine walked the same inline-code nodes to
 * decide whether a reference had gone stale and then dropped them, so a
 * document and the file it describes shared no edge (R4 §3.8 ③).
 *
 * Two tiers, the same honesty the code resolver uses:
 * - `resolved` — the path exists in this commit's tree, exactly or relative
 *   to the document.
 * - `reference` — the basename matches exactly one file in the tree. A name
 *   two files answer to is ambiguous and gets no edge at all, because a wrong
 *   edge costs more than a missing one.
 *
 * **Only the resolved target travels.** The matched token itself is never
 * put in the plan or the database: a path in a document is a pointer, and
 * the pointed-at path is already a stored artifact path, but the surrounding
 * prose fragment would be document text this layer has no reason to copy
 * (WORK_SPEC §3-3, enforced by `scripts/verify-scope-boundaries.ts`).
 */

export type DocLinkKind = "references";

export type DocLinkMethod =
  /** The basename is unique in the tree; the written path did not resolve. */
  | "basename-owner"
  /** A markdown or wiki link whose target resolved against the tree. */
  | "doc-link"
  /** An inline-code path that exists, exactly or relative to the document. */
  | "path-exists";

export interface DocLink {
  readonly kind: DocLinkKind;
  readonly method: DocLinkMethod;
  readonly sourcePath: string;
  readonly span: CodeLinkSpan;
  readonly targetPath: string;
  readonly tier: CodeLinkTier;
}

/**
 * Distinct targets one document may link to. A generated index that names
 * every file in the repository is a hub, not a hairball input; past this the
 * document's remaining mentions are dropped rather than allowed to dominate
 * the layout.
 */
export const MAX_DOC_LINKS_PER_DOCUMENT = 200;

/** Longest token this will even consider as a path. */
const MAX_TOKEN_LENGTH = 400;

/** Schemes that are addresses elsewhere, not paths in this repository. */
const EXTERNAL_TARGET = /^[a-z][a-z\d+.-]*:/i;

/** A file name ends in a short alphanumeric extension. */
const FILE_NAME_WITH_EXTENSION = /\.[A-Za-z\d]{1,10}$/;

/** Characters a repository path is made of; anything else is prose. */
const PATH_SHAPED = /^[\w.@~-][\w./@~+-]*$/;

/** Extension-less wiki targets are markdown notes by convention. */
const IMPLICIT_EXTENSIONS = [".md", ".mdx"] as const;

interface ResolvedTarget {
  readonly method: DocLinkMethod;
  readonly targetPath: string;
  readonly tier: CodeLinkTier;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The path an inline-code token names, or null when the token is prose, a
 * symbol, a command, or an address somewhere else. Anchors (`#symbol`) are
 * cut: the edge is file-level, and the symbol name is the code resolver's
 * business.
 */
function inlineCodeCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_LENGTH) return null;
  if (/\s/.test(trimmed) || EXTERNAL_TARGET.test(trimmed)) return null;
  const withoutAnchor = trimmed.split("#")[0] ?? "";
  if (!PATH_SHAPED.test(withoutAnchor)) return null;
  // `useState` and `npm run dev` are not paths; `a/b.ts` and `README.md` are.
  if (!FILE_NAME_WITH_EXTENSION.test(baseName(withoutAnchor))) return null;
  return withoutAnchor;
}

/** The repository-relative part of a markdown or wiki link target. */
function linkCandidate(target: string): string | null {
  const trimmed = target.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_LENGTH) return null;
  if (trimmed.startsWith("#")) return null;
  if (EXTERNAL_TARGET.test(trimmed) || trimmed.startsWith("//")) return null;
  const withoutAnchor = (trimmed.split("#")[0] ?? "").split("?")[0] ?? "";
  const cleaned = withoutAnchor.replace(/\/+$/, "");
  if (cleaned.length === 0) return null;
  return cleaned;
}

function ownersByBaseName(
  knownPaths: ReadonlySet<string>,
): ReadonlyMap<string, string | null> {
  const owners = new Map<string, string | null>();
  for (const path of knownPaths) {
    const name = baseName(path);
    const known = owners.get(name);
    owners.set(name, known === undefined ? path : null);
  }
  return owners;
}

function exactMatch(
  documentPath: string,
  candidate: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  const normalized = normalizeRepositoryPath(candidate);
  if (normalized && knownPaths.has(normalized)) return normalized;
  const joined = joinRepositoryPath(directoryOf(documentPath), candidate);
  return joined && knownPaths.has(joined) ? joined : null;
}

function resolveTarget(input: {
  readonly candidate: string;
  readonly documentPath: string;
  readonly knownPaths: ReadonlySet<string>;
  readonly method: DocLinkMethod;
  readonly owners: ReadonlyMap<string, string | null>;
}): ResolvedTarget | null {
  const { candidate, documentPath, knownPaths, owners } = input;
  const attempts = FILE_NAME_WITH_EXTENSION.test(baseName(candidate))
    ? [candidate]
    : // `[[WORK_SPEC]]` and `./guide` name a note without saying so.
      IMPLICIT_EXTENSIONS.map((extension) => `${candidate}${extension}`);

  for (const attempt of attempts) {
    const exact = exactMatch(documentPath, attempt, knownPaths);
    if (exact) {
      return { method: input.method, targetPath: exact, tier: "resolved" };
    }
  }
  for (const attempt of attempts) {
    // A single owner is a match; two owners is silence. `index.ts` names
    // dozens of files in a monorepo and points at none of them.
    const owner = owners.get(baseName(attempt));
    if (owner) {
      return { method: "basename-owner", targetPath: owner, tier: "reference" };
    }
  }
  return null;
}

export interface ResolveDocLinksInput {
  /** Parsed structure per document path — markdown artifacts only. */
  readonly documents: ReadonlyMap<string, ParsedMarkdownStructure>;
  /** Every artifact path in this commit's tree, documents included. */
  readonly knownPaths: ReadonlySet<string>;
}

/**
 * Deterministic `references` links out of the parsed documents.
 *
 * One edge per (document, target) pair whatever the document's mention
 * count, carrying the span of the first mention — the graph says "this
 * document points at that file", and the count is not evidence of anything.
 */
export function resolveDocLinks({
  documents,
  knownPaths,
}: ResolveDocLinksInput): DocLink[] {
  const owners = ownersByBaseName(knownPaths);
  const links: DocLink[] = [];

  for (const [documentPath, parsed] of documents) {
    const seen = new Set<string>();
    const mentions: {
      candidate: string;
      method: DocLinkMethod;
      span: CodeLinkSpan;
    }[] = [];

    for (const reference of parsed.codeReferences) {
      const candidate = inlineCodeCandidate(reference.value);
      if (candidate === null) continue;
      mentions.push({
        candidate,
        method: "path-exists",
        span: {
          endLine: reference.span.endLine,
          startLine: reference.span.startLine,
        },
      });
    }
    for (const link of parsed.links) {
      const candidate = linkCandidate(link.target);
      if (candidate === null) continue;
      mentions.push({
        candidate,
        method: "doc-link",
        span: { endLine: link.span.endLine, startLine: link.span.startLine },
      });
    }

    mentions.sort(
      (left, right) =>
        left.span.startLine - right.span.startLine ||
        left.candidate.localeCompare(right.candidate),
    );

    for (const mention of mentions) {
      if (seen.size >= MAX_DOC_LINKS_PER_DOCUMENT) break;
      const resolved = resolveTarget({
        candidate: mention.candidate,
        documentPath,
        knownPaths,
        method: mention.method,
        owners,
      });
      if (!resolved) continue;
      // A document pointing at itself says nothing; the graph already knows.
      if (resolved.targetPath === documentPath) continue;
      if (seen.has(resolved.targetPath)) continue;
      seen.add(resolved.targetPath);
      links.push({
        kind: "references",
        method: resolved.method,
        sourcePath: documentPath,
        span: mention.span,
        targetPath: resolved.targetPath,
        tier: resolved.tier,
      });
    }
  }

  return links.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.targetPath.localeCompare(right.targetPath),
  );
}
