import type { CodeLinkSpan } from "./code-links";
import type { ParsedMarkdownStructure } from "../parser/markdown";
import type { RepositoryScanConfig } from "./repository-config";

/**
 * Section nodes for ID-token headings (Phase 4 Wave A′ todo 8, design ①·②).
 *
 * A repository that writes decisions down gives them names — `ADR-013`,
 * `OQ-041`, `MT-7` — and then cites those names everywhere: in other specs,
 * in evidence logs, in `WHY:` comments. Every one of those citations was
 * pointing at a string. Promoting the *declaring heading* to a node turns the
 * decision itself into a hub, which is what a reader means when they ask
 * "what depends on ADR-013".
 *
 * **Only headings that declare a token become nodes.** A heading that merely
 * cites one — `## Wave 2 — GitHub App 실기 완주 _(G2)_` — is a citation, not a
 * home, and giving it a node would create two homes for one decision. The
 * rule that separates them is deliberately blunt: the heading text *starts
 * with* the token and the token is followed by whitespace or nothing.
 * `# ADR-002 — 코어 설계` declares; `# ADR-002와의 관계` does not.
 *
 * Only the token, the heading line and the span travel. The section's body is
 * document text and stays in the file (WORK_SPEC §3-3).
 */

export interface DocumentSection {
  /** The heading as written, truncated — a label, not the section body. */
  readonly heading: string;
  /**
   * How good a home this heading is for the token, lower being better.
   *
   * A token can be declared twice: `## ADR-013 — OQ-013 판정` in the decision
   * record and `# ADR-013 구현 — 스코프 경계 교체` in an evidence log both
   * open with it. One of them is the decision's home and the other is a note
   * about it, and a graph with two homes for one decision is worse than one
   * with the wrong home. The rank says which, from the heading alone, so the
   * SQL can keep the better declaration without re-deriving the rule:
   * `TOKEN — title` (a titled record) outranks `TOKEN 산문…`, and a shallower
   * heading outranks a deeper one.
   */
  readonly homeRank: number;
  readonly path: string;
  readonly span: CodeLinkSpan;
  /** `ADR-013`, upper-cased. Repository-unique by construction. */
  readonly token: string;
}

export interface SectionLink {
  readonly method: "id-token";
  readonly sourcePath: string;
  readonly span: CodeLinkSpan;
  readonly targetToken: string;
  /**
   * Always `resolved`: the citation is a literal token match against a
   * heading that declares it, with both sides in this repository's own text.
   */
  readonly tier: "resolved";
  readonly via: "document" | "rationale";
}

/**
 * The prefixes a token can carry. Literal prefixes rather than user-supplied
 * regexes: `.alrescha.json` comes from the repository being scanned, and a
 * pattern from there would be an untrusted regex running over every document
 * in the tree (OQ-054).
 */
export const DEFAULT_SECTION_TOKEN_PREFIXES: readonly string[] = [
  "ADR",
  "G",
  "MT",
  "OQ",
];

/** A heading label is a label; the section it opens is not copied. */
export const MAX_SECTION_HEADING = 200;

/** Distinct sections one document may cite, for the reason doc links have one. */
export const MAX_SECTION_LINKS_PER_DOCUMENT = 200;

const PREFIX = /^[A-Z][A-Z0-9]{0,7}$/;

/** `—`, `–`, `-`, `:` or nothing at all: the shapes a titled record uses. */
const TITLE_SEPARATOR = /^\s*(?:[—–:-]|$)/;

function homeRankOf(input: {
  readonly depth: number;
  readonly rest: string;
}): number {
  const titled = TITLE_SEPARATOR.test(input.rest) ? 0 : 1;
  return titled * 100 + Math.min(input.depth, 9);
}

function prefixesOf(config?: RepositoryScanConfig): readonly string[] {
  const declared = config?.sectionTokens ?? [];
  const extra = declared
    .map((prefix) => prefix.trim().toUpperCase())
    .filter((prefix) => PREFIX.test(prefix));
  return [...new Set([...DEFAULT_SECTION_TOKEN_PREFIXES, ...extra])];
}

/**
 * `\bADR-?\d{1,4}\b` for each prefix. The hyphen is optional because `G3` and
 * `MT-7` are both written in this repository's own specs.
 */
function tokenPattern(prefixes: readonly string[]): RegExp {
  const alternatives = [...prefixes]
    .sort((left, right) => right.length - left.length)
    .join("|");
  return new RegExp(`\\b(?:${alternatives})-?\\d{1,4}\\b`, "g");
}

function normalize(token: string): string {
  return token.toUpperCase();
}

/**
 * The better of two declarations of the same token, by rank and then by the
 * only tie-breaks that are stable across scans. `apply_repository_scan`
 * compares the same way, so the plan and the database agree on one home.
 */
export function bestHome(
  left: DocumentSection,
  right: DocumentSection,
): DocumentSection {
  if (left.homeRank !== right.homeRank) {
    return left.homeRank < right.homeRank ? left : right;
  }
  if (left.path !== right.path) return left.path < right.path ? left : right;
  return left.span.startLine <= right.span.startLine ? left : right;
}

/**
 * The sections a document declares.
 *
 * Headings arrive already parsed, so this reads no source: the markdown pass
 * ran over the body while it was in memory and kept the heading text.
 */
export function parseDocumentSections(input: {
  readonly config?: RepositoryScanConfig;
  readonly document: ParsedMarkdownStructure;
  readonly path: string;
}): readonly DocumentSection[] {
  const pattern = tokenPattern(prefixesOf(input.config));
  const sections: DocumentSection[] = [];
  const declared = new Set<string>();
  for (const heading of input.document.headings) {
    const text = heading.text.trim();
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    // A declaration opens with its own name. Anything else is a citation.
    if (!match || match.index !== 0) continue;
    const after = text.charAt(match[0].length);
    if (after !== "" && !/\s/.test(after)) continue;
    const token = normalize(match[0]);
    if (declared.has(token)) continue;
    declared.add(token);
    sections.push({
      heading: text.slice(0, MAX_SECTION_HEADING),
      homeRank: homeRankOf({
        depth: heading.depth,
        rest: text.slice(match[0].length),
      }),
      path: input.path,
      span: {
        endLine: heading.span.endLine,
        startLine: heading.span.startLine,
      },
      token,
    });
  }
  return sections;
}

export interface ParsedSectionReference {
  readonly line: number;
  readonly token: string;
}

/**
 * Tokens a document's text cites, one entry per distinct token with the line
 * of its first mention. `spec/OPEN_QUESTIONS.md` names `OQ-041` eleven times;
 * eleven edges would say nothing the first one does not (the rule `queries`
 * follows, and the reason both have a per-document cap).
 */
export function parseSectionReferences(input: {
  readonly config?: RepositoryScanConfig;
  readonly source: string;
}): readonly ParsedSectionReference[] {
  const pattern = tokenPattern(prefixesOf(input.config));
  const references: ParsedSectionReference[] = [];
  const seen = new Set<string>();
  const lines = input.source.split(/\r?\n/);
  for (const [index, text] of lines.entries()) {
    pattern.lastIndex = 0;
    for (const [written] of text.matchAll(pattern)) {
      const token = normalize(written);
      if (seen.has(token)) continue;
      seen.add(token);
      references.push({ line: index + 1, token });
      if (references.length >= MAX_SECTION_LINKS_PER_DOCUMENT) {
        return references;
      }
    }
  }
  return references;
}

export interface ResolveSectionLinksInput {
  /** Token cited by each rationale that names one, keyed by its source key. */
  readonly rationales: readonly {
    readonly adrRef: string | null;
    readonly line: number;
    readonly sourcePath: string;
  }[];
  /** Citation candidates per document path, as parsed. */
  readonly references: ReadonlyMap<string, readonly ParsedSectionReference[]>;
  readonly sections: readonly DocumentSection[];
}

/**
 * Citations, minus the ones that point at their own home.
 *
 * Ownership is **not** filtered here, unlike the schema layer: the apply
 * function joins against the persisted `sections` table, so a citation of
 * `ADR-013` still resolves when the ADR file itself was not re-read this
 * pass. Filtering against this plan's sections would make an incremental scan
 * and a full relink of the same commit produce different graphs (OQ-055).
 */
export function resolveSectionLinks({
  rationales,
  references,
  sections,
}: ResolveSectionLinksInput): readonly SectionLink[] {
  const homeOf = new Map<string, DocumentSection>();
  for (const section of sections) {
    const held = homeOf.get(section.token);
    if (!held || bestHome(section, held) === section) {
      homeOf.set(section.token, section);
    }
  }
  const links: SectionLink[] = [];
  const seen = new Set<string>();

  const add = (link: SectionLink): void => {
    if (homeOf.get(link.targetToken)?.path === link.sourcePath) return;
    const key = `${link.via}|${link.sourcePath}|${link.targetToken}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };

  for (const [path, cited] of references) {
    for (const { line, token } of cited) {
      add({
        method: "id-token",
        sourcePath: path,
        span: { endLine: line, startLine: line },
        targetToken: token,
        tier: "resolved",
        via: "document",
      });
    }
  }

  for (const { adrRef, line, sourcePath } of rationales) {
    if (!adrRef) continue;
    add({
      method: "id-token",
      sourcePath,
      span: { endLine: line, startLine: line },
      targetToken: normalize(adrRef),
      tier: "resolved",
      via: "rationale",
    });
  }

  return links.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.targetToken.localeCompare(right.targetToken) ||
      left.via.localeCompare(right.via) ||
      left.span.startLine - right.span.startLine,
  );
}
