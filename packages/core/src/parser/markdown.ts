import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkWikiLink from "@flowershow/remark-wiki-link";
import { toString } from "mdast-util-to-string";
import type {
  Definition,
  Heading,
  InlineCode,
  Link,
  LinkReference,
  ListItem,
  Paragraph,
  Root,
} from "mdast";
import type { Node, Position } from "unist";
import { visit } from "unist-util-visit";
import { visitParents } from "unist-util-visit-parents";
import { unified } from "unified";
import { parseDocument } from "yaml";

export interface MarkdownSpan {
  endByte: number;
  endColumn: number;
  endLine: number;
  path: string;
  startByte: number;
  startColumn: number;
  startLine: number;
}

export interface ParsedHeading {
  depth: number;
  span: MarkdownSpan;
  text: string;
}

export interface ParsedTask {
  checked: boolean;
  depth: number;
  span: MarkdownSpan;
  text: string;
}

export interface ParsedNormativeStatement {
  keyword: "MUST" | "SHOULD";
  span: MarkdownSpan;
  text: string;
}

export interface ParsedFrontmatter {
  data: unknown;
  span: MarkdownSpan;
}

export interface ParsedCodeReference {
  span: MarkdownSpan;
  value: string;
}

export interface ParsedLink {
  kind: "markdown" | "reference" | "wiki";
  label: string;
  relative: boolean;
  span: MarkdownSpan;
  target: string;
}

export interface ParsedMarkdownSection {
  depth: number;
  heading: string;
  span: MarkdownSpan;
  text: string;
}

export interface ParsedParagraph {
  span: MarkdownSpan;
  text: string;
}

export interface MarkdownDiagnostic {
  message: string;
  severity: "warning" | "error";
  span: MarkdownSpan | null;
}

export interface ParsedMarkdownStructure {
  acceptanceCriteria: ParsedMarkdownSection[];
  adrSections: ParsedMarkdownSection[];
  codeReferences: ParsedCodeReference[];
  diagnostics: MarkdownDiagnostic[];
  frontmatter: ParsedFrontmatter | null;
  headings: ParsedHeading[];
  links: ParsedLink[];
  normativeStatements: ParsedNormativeStatement[];
  paragraphs: ParsedParagraph[];
  path: string;
  tasks: ParsedTask[];
}

export interface ParseMarkdownInput {
  path: string;
  source: string;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikiLink);

function requirePosition(node: Node): Position {
  if (!node.position) {
    throw new Error(`Markdown AST node ${node.type} has no source position`);
  }

  return node.position;
}

/**
 * UTF-8 byte length of a single Unicode code point, matching how Node's
 * `Buffer`/`TextEncoder` encode it (a lone surrogate — half of a split pair,
 * or a surrogate with no partner at all — is replaced with U+FFFD, 3 bytes).
 */
function utf8ByteLengthOfCodePoint(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

const REPLACEMENT_CHARACTER_BYTE_LENGTH = utf8ByteLengthOfCodePoint(0xfffd);

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * `table[i] === Buffer.byteLength(source.slice(0, i))` for every offset `i`
 * from 0 to `source.length`, built in one forward pass so every span's byte
 * offsets become an O(1) lookup afterward instead of re-encoding an
 * ever-growing prefix per AST node. Surrogate-pair aware: a prefix that cuts
 * a pair in half sees only the lone leading surrogate, which — like any lone
 * surrogate — encodes as U+FFFD, exactly matching `Buffer.byteLength`.
 */
function buildUtf8ByteOffsetTable(source: string): Uint32Array {
  const table = new Uint32Array(source.length + 1);
  let bytes = 0;
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    const next = index + 1 < source.length ? source.charCodeAt(index + 1) : -1;

    if (isHighSurrogate(code) && isLowSurrogate(next)) {
      table[index + 1] = bytes + REPLACEMENT_CHARACTER_BYTE_LENGTH;
      bytes += utf8ByteLengthOfCodePoint(source.codePointAt(index)!);
      table[index + 2] = bytes;
      index += 2;
      continue;
    }

    bytes +=
      isHighSurrogate(code) || isLowSurrogate(code)
        ? REPLACEMENT_CHARACTER_BYTE_LENGTH
        : utf8ByteLengthOfCodePoint(code);
    table[index + 1] = bytes;
    index += 1;
  }
  return table;
}

export interface DocumentOffsetIndex {
  /** O(1): UTF-8 byte offset of a character offset, equal to
   *  `Buffer.byteLength(source.slice(0, charOffset))`. */
  byteOffsetAt(charOffset: number): number;
  /** O(log lines): 1-indexed line/column of a character offset, matching
   *  `source.slice(0, charOffset).split("\n")` counting exactly. */
  lineColumnAt(charOffset: number): { column: number; line: number };
  /** O(1): character offset where a 1-indexed line begins; clamps to
   *  `source.length` past the last line, matching the original scan. */
  lineStartOffset(line: number): number;
}

/**
 * Precomputes, once per document, the line-start table and cumulative UTF-8
 * byte-offset table every span needs — replacing the O(document length)
 * slice-and-split (and re-encode) that used to run per AST node.
 */
export function buildDocumentOffsetIndex(source: string): DocumentOffsetIndex {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  const byteOffsets = buildUtf8ByteOffsetTable(source);

  function lineColumnAt(offset: number): { column: number; line: number } {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >>> 1;
      if (lineStarts[mid]! <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { column: offset - lineStarts[low]! + 1, line: low + 1 };
  }

  function byteOffsetAt(offset: number): number {
    return byteOffsets[offset] ?? byteOffsets[byteOffsets.length - 1]!;
  }

  function lineStartOffset(line: number): number {
    const index = line - 1;
    if (index <= 0) return 0;
    if (index >= lineStarts.length) return source.length;
    return lineStarts[index]!;
  }

  return { byteOffsetAt, lineColumnAt, lineStartOffset };
}

function toSpanAtOffsets(
  path: string,
  index: DocumentOffsetIndex,
  startOffset: number,
  endOffset: number,
): MarkdownSpan {
  const start = index.lineColumnAt(startOffset);
  const end = index.lineColumnAt(endOffset);
  return {
    endByte: index.byteOffsetAt(endOffset),
    endColumn: end.column,
    endLine: end.line,
    path,
    startByte: index.byteOffsetAt(startOffset),
    startColumn: start.column,
    startLine: start.line,
  };
}

function toSpan(
  path: string,
  index: DocumentOffsetIndex,
  node: Node,
): MarkdownSpan {
  const position = requirePosition(node);
  const startOffset = position.start.offset;
  const endOffset = position.end.offset;
  if (startOffset === undefined || endOffset === undefined) {
    throw new Error(`Markdown AST node ${node.type} has no source offsets`);
  }

  return toSpanAtOffsets(path, index, startOffset, endOffset);
}

function wikiLinkSpan(
  path: string,
  source: string,
  index: DocumentOffsetIndex,
  node: WikiLinkNode,
): MarkdownSpan {
  const position = requirePosition(node);
  const parsedStart = position.start.offset;
  const endOffset = position.end.offset;
  if (parsedStart === undefined || endOffset === undefined) {
    throw new Error("Markdown wikilink AST node has no source offsets");
  }
  const startOffset =
    source.slice(Math.max(0, parsedStart - 2), parsedStart) === "[["
      ? parsedStart - 2
      : parsedStart;

  return toSpanAtOffsets(path, index, startOffset, endOffset);
}

function listDepth(ancestors: readonly Node[]): number {
  return ancestors.filter(({ type }) => type === "list").length;
}

function taskText(node: ListItem): string {
  return node.children
    .filter((child): child is Paragraph => child.type === "paragraph")
    .map((child) => toString(child))
    .join("\n");
}

interface YamlNode extends Node {
  type: "yaml";
  value: string;
}

interface WikiLinkNode extends Node {
  data?: { alias?: unknown };
  type: "wikiLink";
  value: string;
}

function isRelativeTarget(target: string): boolean {
  return !/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith("//");
}

const ADR_SECTION_HEADINGS = new Set([
  "status",
  "context",
  "decision",
  "consequences",
  "상태",
  "맥락",
  "결정",
  "결과",
]);
const ACCEPTANCE_HEADINGS = new Set([
  "acceptance",
  "acceptance criteria",
  "수용 기준",
]);

function sectionSpan(
  path: string,
  index: DocumentOffsetIndex,
  first: Node,
  last: Node,
): MarkdownSpan {
  const startOffset = requirePosition(first).start.offset;
  const endOffset = requirePosition(last).end.offset;
  if (startOffset === undefined || endOffset === undefined) {
    throw new Error("Markdown section AST nodes have no source offsets");
  }
  return toSpanAtOffsets(path, index, startOffset, endOffset);
}

function extractSections(
  tree: Root,
  path: string,
  index: DocumentOffsetIndex,
  names: ReadonlySet<string>,
): ParsedMarkdownSection[] {
  const sections: ParsedMarkdownSection[] = [];
  for (let position = 0; position < tree.children.length; position += 1) {
    const heading = tree.children[position];
    if (heading?.type !== "heading") {
      continue;
    }
    const headingText = toString(heading);
    if (!names.has(headingText.trim().toLowerCase())) {
      continue;
    }

    let boundary = position + 1;
    while (boundary < tree.children.length) {
      const candidate = tree.children[boundary];
      if (candidate?.type === "heading" && candidate.depth <= heading.depth) {
        break;
      }
      boundary += 1;
    }
    const content = tree.children.slice(position + 1, boundary);
    const last = content.at(-1) ?? heading;
    sections.push({
      depth: heading.depth,
      heading: headingText,
      span: sectionSpan(path, index, heading, last),
      text: content
        .map((node) => toString(node))
        .filter(Boolean)
        .join("\n"),
    });
  }
  return sections;
}

function normativeStatementsIn(
  path: string,
  source: string,
  index: DocumentOffsetIndex,
  node: Paragraph,
): ParsedNormativeStatement[] {
  const position = requirePosition(node);
  const nodeStart = position.start.offset;
  const nodeEnd = position.end.offset;
  if (nodeStart === undefined || nodeEnd === undefined) {
    throw new Error("Markdown paragraph AST node has no source offsets");
  }
  const raw = source.slice(nodeStart, nodeEnd);
  const statements: ParsedNormativeStatement[] = [];
  const sentencePattern =
    /[^.!?\n]*(?:\b(?:MUST|SHOULD)\b)[^.!?\n]*(?:[.!?]+|$)/g;
  for (const match of raw.matchAll(sentencePattern)) {
    const matched = match[0];
    const leadingWhitespace = matched.length - matched.trimStart().length;
    const trailingWhitespace = matched.length - matched.trimEnd().length;
    const localStart = (match.index ?? 0) + leadingWhitespace;
    const localEnd = (match.index ?? 0) + matched.length - trailingWhitespace;
    const text = raw.slice(localStart, localEnd);
    const keyword = text.match(/\b(MUST|SHOULD)\b/)?.[1] as
      "MUST" | "SHOULD" | undefined;
    if (!keyword) {
      continue;
    }
    statements.push({
      keyword,
      span: toSpanAtOffsets(
        path,
        index,
        nodeStart + localStart,
        nodeStart + localEnd,
      ),
      text,
    });
  }
  return statements;
}

export function parseMarkdownStructure({
  path,
  source,
}: ParseMarkdownInput): ParsedMarkdownStructure {
  const tree = processor.parse(source) as Root;
  const index = buildDocumentOffsetIndex(source);
  const headings: ParsedHeading[] = [];
  const tasks: ParsedTask[] = [];
  const normativeStatements: ParsedNormativeStatement[] = [];
  const paragraphs: ParsedParagraph[] = [];
  const links: ParsedLink[] = [];
  const codeReferences: ParsedCodeReference[] = [];
  const definitions = new Map<string, Definition>();
  const diagnostics: MarkdownDiagnostic[] = [];
  let frontmatter: ParsedFrontmatter | null = null;
  const adrSections = extractSections(tree, path, index, ADR_SECTION_HEADINGS);
  const acceptanceCriteria = extractSections(
    tree,
    path,
    index,
    ACCEPTANCE_HEADINGS,
  );

  visit(tree, "yaml", (node: YamlNode) => {
    const document = parseDocument(node.value);
    frontmatter = { data: document.toJS(), span: toSpan(path, index, node) };
    for (const error of document.errors) {
      diagnostics.push({
        message: error.message,
        severity: "error",
        span: toSpan(path, index, node),
      });
    }
    for (const warning of document.warnings) {
      diagnostics.push({
        message: warning.message,
        severity: "warning",
        span: toSpan(path, index, node),
      });
    }
  });

  visit(tree, "definition", (node: Definition) => {
    definitions.set(node.identifier.toLowerCase(), node);
  });

  visit(tree, "heading", (node: Heading) => {
    headings.push({
      depth: node.depth,
      span: toSpan(path, index, node),
      text: toString(node),
    });
  });

  visitParents(tree, "listItem", (node: ListItem, ancestors) => {
    if (typeof node.checked !== "boolean") {
      return;
    }

    tasks.push({
      checked: node.checked,
      depth: listDepth(ancestors),
      span: toSpan(path, index, node),
      text: taskText(node),
    });
  });

  visit(tree, "link", (node: Link) => {
    links.push({
      kind: "markdown",
      label: toString(node),
      relative: isRelativeTarget(node.url),
      span: toSpan(path, index, node),
      target: node.url,
    });
  });

  visit(tree, "inlineCode", (node: InlineCode) => {
    codeReferences.push({
      span: toSpan(path, index, node),
      value: node.value,
    });
  });

  visit(tree, "linkReference", (node: LinkReference) => {
    const definition = definitions.get(node.identifier.toLowerCase());
    if (!definition) {
      return;
    }
    links.push({
      kind: "reference",
      label: toString(node),
      relative: isRelativeTarget(definition.url),
      span: toSpan(path, index, node),
      target: definition.url,
    });
  });

  visit(tree, "wikiLink", (node: WikiLinkNode) => {
    const alias = node.data?.alias;
    links.push({
      kind: "wiki",
      label: typeof alias === "string" ? alias : node.value,
      relative: isRelativeTarget(node.value),
      span: wikiLinkSpan(path, source, index, node),
      target: node.value,
    });
  });

  links.sort((left, right) => left.span.startByte - right.span.startByte);

  visit(tree, "paragraph", (node: Paragraph) => {
    paragraphs.push({ span: toSpan(path, index, node), text: toString(node) });
    normativeStatements.push(
      ...normativeStatementsIn(path, source, index, node),
    );
  });

  return {
    acceptanceCriteria,
    adrSections,
    codeReferences,
    diagnostics,
    frontmatter,
    headings,
    links,
    normativeStatements,
    paragraphs,
    path,
    tasks,
  };
}
