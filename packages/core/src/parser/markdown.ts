import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkWikiLink from "@flowershow/remark-wiki-link";
import { toString } from "mdast-util-to-string";
import type {
  Definition,
  Heading,
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

export interface MarkdownDiagnostic {
  message: string;
  severity: "warning" | "error";
  span: MarkdownSpan | null;
}

export interface ParsedMarkdownStructure {
  acceptanceCriteria: ParsedMarkdownSection[];
  adrSections: ParsedMarkdownSection[];
  diagnostics: MarkdownDiagnostic[];
  frontmatter: ParsedFrontmatter | null;
  headings: ParsedHeading[];
  links: ParsedLink[];
  normativeStatements: ParsedNormativeStatement[];
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

function toSpanAtOffsets(
  path: string,
  source: string,
  startOffset: number,
  endOffset: number,
): MarkdownSpan {
  const startLines = source.slice(0, startOffset).split("\n");
  const endLines = source.slice(0, endOffset).split("\n");
  return {
    endByte: Buffer.byteLength(source.slice(0, endOffset)),
    endColumn: (endLines.at(-1)?.length ?? 0) + 1,
    endLine: endLines.length,
    path,
    startByte: Buffer.byteLength(source.slice(0, startOffset)),
    startColumn: (startLines.at(-1)?.length ?? 0) + 1,
    startLine: startLines.length,
  };
}

function toSpan(path: string, source: string, node: Node): MarkdownSpan {
  const position = requirePosition(node);
  const startOffset = position.start.offset;
  const endOffset = position.end.offset;
  if (startOffset === undefined || endOffset === undefined) {
    throw new Error(`Markdown AST node ${node.type} has no source offsets`);
  }

  return toSpanAtOffsets(path, source, startOffset, endOffset);
}

function wikiLinkSpan(
  path: string,
  source: string,
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

  return toSpanAtOffsets(path, source, startOffset, endOffset);
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
  source: string,
  first: Node,
  last: Node,
): MarkdownSpan {
  const startOffset = requirePosition(first).start.offset;
  const endOffset = requirePosition(last).end.offset;
  if (startOffset === undefined || endOffset === undefined) {
    throw new Error("Markdown section AST nodes have no source offsets");
  }
  return toSpanAtOffsets(path, source, startOffset, endOffset);
}

function extractSections(
  tree: Root,
  path: string,
  source: string,
  names: ReadonlySet<string>,
): ParsedMarkdownSection[] {
  const sections: ParsedMarkdownSection[] = [];
  for (let index = 0; index < tree.children.length; index += 1) {
    const heading = tree.children[index];
    if (heading?.type !== "heading") {
      continue;
    }
    const headingText = toString(heading);
    if (!names.has(headingText.trim().toLowerCase())) {
      continue;
    }

    let boundary = index + 1;
    while (boundary < tree.children.length) {
      const candidate = tree.children[boundary];
      if (candidate?.type === "heading" && candidate.depth <= heading.depth) {
        break;
      }
      boundary += 1;
    }
    const content = tree.children.slice(index + 1, boundary);
    const last = content.at(-1) ?? heading;
    sections.push({
      depth: heading.depth,
      heading: headingText,
      span: sectionSpan(path, source, heading, last),
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
        source,
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
  const headings: ParsedHeading[] = [];
  const tasks: ParsedTask[] = [];
  const normativeStatements: ParsedNormativeStatement[] = [];
  const links: ParsedLink[] = [];
  const definitions = new Map<string, Definition>();
  const diagnostics: MarkdownDiagnostic[] = [];
  let frontmatter: ParsedFrontmatter | null = null;
  const adrSections = extractSections(tree, path, source, ADR_SECTION_HEADINGS);
  const acceptanceCriteria = extractSections(
    tree,
    path,
    source,
    ACCEPTANCE_HEADINGS,
  );

  visit(tree, "yaml", (node: YamlNode) => {
    const document = parseDocument(node.value);
    frontmatter = { data: document.toJS(), span: toSpan(path, source, node) };
    for (const error of document.errors) {
      diagnostics.push({
        message: error.message,
        severity: "error",
        span: toSpan(path, source, node),
      });
    }
    for (const warning of document.warnings) {
      diagnostics.push({
        message: warning.message,
        severity: "warning",
        span: toSpan(path, source, node),
      });
    }
  });

  visit(tree, "definition", (node: Definition) => {
    definitions.set(node.identifier.toLowerCase(), node);
  });

  visit(tree, "heading", (node: Heading) => {
    headings.push({
      depth: node.depth,
      span: toSpan(path, source, node),
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
      span: toSpan(path, source, node),
      text: taskText(node),
    });
  });

  visit(tree, "link", (node: Link) => {
    links.push({
      kind: "markdown",
      label: toString(node),
      relative: isRelativeTarget(node.url),
      span: toSpan(path, source, node),
      target: node.url,
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
      span: toSpan(path, source, node),
      target: definition.url,
    });
  });

  visit(tree, "wikiLink", (node: WikiLinkNode) => {
    const alias = node.data?.alias;
    links.push({
      kind: "wiki",
      label: typeof alias === "string" ? alias : node.value,
      relative: isRelativeTarget(node.value),
      span: wikiLinkSpan(path, source, node),
      target: node.value,
    });
  });

  links.sort((left, right) => left.span.startByte - right.span.startByte);

  visit(tree, "paragraph", (node: Paragraph) => {
    normativeStatements.push(...normativeStatementsIn(path, source, node));
  });

  return {
    acceptanceCriteria,
    adrSections,
    diagnostics,
    frontmatter,
    headings,
    links,
    normativeStatements,
    path,
    tasks,
  };
}
