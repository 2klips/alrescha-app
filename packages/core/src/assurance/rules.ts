import { posix } from "node:path";

import type {
  ArtifactClassification,
  ExportedSymbolMetadata,
} from "../ingest/repository-scanner";
import {
  parseMarkdownStructure,
  type MarkdownSpan,
  type ParsedMarkdownStructure,
} from "../parser/markdown";
import { extractRequirements, type ExtractedRequirement } from "./requirements";

export const AI_ASSIST_STATUS = "worker-judgment-jobs-available" as const;

export interface DisabledAssuranceAiAssist {
  readonly enabled: false;
  readonly status: typeof AI_ASSIST_STATUS;
}

export const DISABLED_ASSURANCE_AI_ASSIST: DisabledAssuranceAiAssist =
  Object.freeze({
    enabled: false,
    status: AI_ASSIST_STATUS,
  });

export type AssuranceFindingType =
  | "contradicting-instructions"
  | "missing-implementation"
  | "missing-test"
  | "orphan-doc"
  | "stale-doc"
  | "unproven-claim";
export type AssuranceSeverity = "critical" | "high" | "low" | "medium";
export type AssuranceGrade = "inferred" | "verified";

export interface AssuranceSourceFile {
  readonly classification: ArtifactClassification;
  readonly exportedSymbols?: readonly ExportedSymbolMetadata[];
  readonly path: string;
  readonly source: string;
}

export interface FindingProvenance extends MarkdownSpan {
  readonly excerpt: string;
}

export interface FindingEvidenceLink {
  readonly description: string;
  readonly path: string;
}

export interface AssuranceFinding {
  readonly confidence: number;
  readonly evidenceLinks: readonly FindingEvidenceLink[];
  readonly grade: AssuranceGrade;
  readonly id: string;
  readonly provenance: readonly FindingProvenance[];
  readonly severity: AssuranceSeverity;
  readonly suggestedAction: string;
  readonly summary: string;
  readonly type: AssuranceFindingType;
}

export interface AnalyzeRepositoryAssuranceInput {
  readonly aiAssist?: DisabledAssuranceAiAssist;
  readonly files: readonly AssuranceSourceFile[];
}

interface DocumentContext {
  readonly file: AssuranceSourceFile;
  readonly parsed: ParsedMarkdownStructure;
  readonly requirements: readonly ExtractedRequirement[];
}

interface FindingDraft {
  readonly confidence: number;
  readonly grade?: AssuranceGrade;
  readonly provenance: readonly FindingProvenance[];
  readonly requestedSeverity: AssuranceSeverity;
  readonly suggestedAction: string;
  readonly summary: string;
  readonly type: AssuranceFindingType;
}

interface SourceReference {
  readonly path: string;
  readonly provenance: FindingProvenance;
  readonly symbol: string | null;
}

function isDocument(classification: ArtifactClassification): boolean {
  return classification !== "code_metadata";
}

function sliceSpan(source: string, span: MarkdownSpan): string {
  return Buffer.from(source)
    .subarray(span.startByte, span.endByte)
    .toString("utf8");
}

function provenance(source: string, span: MarkdownSpan): FindingProvenance {
  return { ...span, excerpt: sliceSpan(source, span) };
}

function offsetAtLine(source: string, line: number): number {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = source.indexOf("\n", offset);
    if (next === -1) {
      return source.length;
    }
    offset = next + 1;
  }
  return offset;
}

function lineSpan(path: string, source: string, line: number): MarkdownSpan {
  const startOffset = offsetAtLine(source, line);
  const newline = source.indexOf("\n", startOffset);
  let endOffset = newline === -1 ? source.length : newline;
  if (endOffset > startOffset && source[endOffset - 1] === "\r") {
    endOffset -= 1;
  }
  const content = source.slice(startOffset, endOffset);
  return {
    endByte: Buffer.byteLength(source.slice(0, endOffset)),
    endColumn: content.length + 1,
    endLine: line,
    path,
    startByte: Buffer.byteLength(source.slice(0, startOffset)),
    startColumn: 1,
    startLine: line,
  };
}

function contains(container: MarkdownSpan, candidate: MarkdownSpan): boolean {
  return (
    container.path === candidate.path &&
    container.startByte <= candidate.startByte &&
    container.endByte >= candidate.endByte
  );
}

function capSeverity(
  severity: AssuranceSeverity,
  grade: AssuranceGrade,
): AssuranceSeverity {
  if (
    grade === "inferred" &&
    (severity === "critical" || severity === "high")
  ) {
    return "medium";
  }
  return severity;
}

function findingFromDraft(draft: FindingDraft): AssuranceFinding {
  if (draft.provenance.length === 0) {
    throw new Error(`Finding ${draft.type} requires provenance.`);
  }
  const grade = draft.grade ?? "inferred";
  const first = draft.provenance[0]!;
  return {
    confidence: draft.confidence,
    evidenceLinks: draft.provenance.map(({ path }) => ({
      description: "Source span used by the deterministic rule.",
      path,
    })),
    grade,
    id: `${draft.type}:${first.path}:${first.startLine}:${first.startColumn}`,
    provenance: draft.provenance,
    severity: capSeverity(draft.requestedSeverity, grade),
    suggestedAction: draft.suggestedAction,
    summary: draft.summary,
    type: draft.type,
  };
}

function pushUnique(
  findings: AssuranceFinding[],
  occupiedSpans: Set<string>,
  draft: FindingDraft,
): void {
  const first = draft.provenance[0];
  if (!first) {
    throw new Error(`Finding ${draft.type} requires provenance.`);
  }
  const spanKey = `${first.path}:${first.startByte}:${first.endByte}`;
  if (occupiedSpans.has(spanKey)) {
    return;
  }
  occupiedSpans.add(spanKey);
  findings.push(findingFromDraft(draft));
}

const TEST_PATH =
  /(^|\/)(?:tests?|__tests__)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/i;

/**
 * Whether the rules read this file's body.
 *
 * Only two kinds are read: documents, whose spans are sliced for provenance,
 * and test files, which are scanned for requirement ids. Everything else is
 * judged from `exportedSymbols`, which the scan already stored.
 *
 * A caller fetching bodies for analysis needs this — a repository of a few
 * hundred files usually needs a couple of dozen bodies, not all of them. It
 * lives here, beside the rules that decide it, so a rule that starts reading
 * code bodies cannot leave a fetcher elsewhere quietly under-supplying them.
 */
export function assuranceSourceRequired(file: {
  readonly classification: ArtifactClassification;
  readonly path: string;
}): boolean {
  return isDocument(file.classification) || TEST_PATH.test(file.path);
}

function requirementIdsInTests(
  files: readonly AssuranceSourceFile[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const file of files) {
    if (!TEST_PATH.test(file.path)) {
      continue;
    }
    for (const match of file.source.matchAll(
      /\bREQ-[A-Z\d]+(?:-[A-Z\d]+)*\b/g,
    )) {
      ids.add(match[0]);
    }
  }
  return ids;
}

function explicitImplementationSymbols(statement: string): readonly string[] {
  return [...statement.matchAll(/\b[a-z][A-Za-z\d]*[A-Z][A-Za-z\d]*\b/g)].map(
    ([symbol]) => symbol,
  );
}

function resolveReferencePath(
  documentPath: string,
  referencedPath: string,
  knownPaths: ReadonlySet<string>,
): string {
  if (knownPaths.has(referencedPath)) {
    return referencedPath;
  }
  return posix.normalize(
    posix.join(posix.dirname(documentPath), referencedPath),
  );
}

function sourceReferences(
  context: DocumentContext,
  knownPaths: ReadonlySet<string>,
): readonly SourceReference[] {
  const references: SourceReference[] = [];
  for (const code of context.parsed.codeReferences) {
    const match = code.value.match(
      /^(.+\.(?:[cm]?[jt]sx?))(?:#([A-Za-z_$][\w$]*))?$/,
    );
    if (!match?.[1]) {
      continue;
    }
    references.push({
      path: resolveReferencePath(context.file.path, match[1], knownPaths),
      provenance: provenance(
        context.file.source,
        lineSpan(context.file.path, context.file.source, code.span.startLine),
      ),
      symbol: match[2] ?? null,
    });
  }
  return references;
}

function referenceExists(
  reference: SourceReference,
  symbolsByPath: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const symbols = symbolsByPath.get(reference.path);
  if (!symbols) {
    return false;
  }
  return reference.symbol === null || symbols.has(reference.symbol);
}

function instructionScope(path: string): string {
  const directory = posix.dirname(path);
  return directory === "." ? "" : `${directory}/`;
}

function scopesOverlap(left: string, right: string): boolean {
  return left.startsWith(right) || right.startsWith(left);
}

function instructionConvention(
  text: string,
): "camelCase" | "snake_case" | null {
  if (!/api responses?/i.test(text) || !/json keys?/i.test(text)) {
    return null;
  }
  if (/snake_case/i.test(text)) {
    return "snake_case";
  }
  if (/camelcase/i.test(text)) {
    return "camelCase";
  }
  return null;
}

function documentContexts(
  files: readonly AssuranceSourceFile[],
): readonly DocumentContext[] {
  return files
    .filter(({ classification }) => isDocument(classification))
    .map((file) => {
      const parsed = parseMarkdownStructure({
        path: file.path,
        source: file.source,
      });
      return {
        file,
        parsed,
        requirements: extractRequirements({
          artifactKind: file.classification,
          parsed,
        }),
      };
    });
}

export function analyzeRepositoryAssurance({
  files,
}: AnalyzeRepositoryAssuranceInput): readonly AssuranceFinding[] {
  const contexts = documentContexts(files);
  const findings: AssuranceFinding[] = [];
  const occupiedSpans = new Set<string>();
  const knownPaths = new Set(files.map(({ path }) => path));
  const symbolsByPath = new Map(
    files.map((file) => [
      file.path,
      new Set((file.exportedSymbols ?? []).map(({ name }) => name)),
    ]),
  );
  const allSymbols = new Set(
    files.flatMap(({ exportedSymbols }) =>
      (exportedSymbols ?? []).map(({ name }) => name),
    ),
  );
  const testedRequirementIds = requirementIdsInTests(files);
  const referencesByDocument = new Map(
    contexts.map((context) => [
      context.file.path,
      sourceReferences(context, knownPaths),
    ]),
  );
  const staleLines = new Set<string>();

  for (const context of contexts.filter(
    ({ file }) => file.classification === "spec",
  )) {
    for (const requirement of context.requirements.filter(
      ({ fulfilled, origin }) => origin === "task" && fulfilled === false,
    )) {
      const explicitSymbols = explicitImplementationSymbols(
        requirement.statement,
      );
      if (
        explicitSymbols.length > 0 &&
        explicitSymbols.every((symbol) => allSymbols.has(symbol))
      ) {
        continue;
      }
      pushUnique(findings, occupiedSpans, {
        confidence: explicitSymbols.length > 0 ? 0.95 : 0.75,
        provenance: [provenance(context.file.source, requirement.span)],
        requestedSeverity: "high",
        suggestedAction:
          "Implement the requirement or link it to an existing exported symbol.",
        summary: `${requirement.id ?? "Requirement"} has no implementation symbol.`,
        type: "missing-implementation",
      });
    }
  }

  for (const context of contexts.filter(
    ({ file }) => file.classification === "spec",
  )) {
    for (const requirement of context.requirements.filter(
      ({ fulfilled, id, origin }) =>
        origin === "task" && fulfilled === true && id !== null,
    )) {
      if (requirement.id && testedRequirementIds.has(requirement.id)) {
        continue;
      }
      pushUnique(findings, occupiedSpans, {
        confidence: 0.9,
        provenance: [provenance(context.file.source, requirement.span)],
        requestedSeverity: "medium",
        suggestedAction:
          "Add a CI-mapped test whose name includes the requirement ID.",
        summary: `${requirement.id ?? "Requirement"} has implementation metadata but no test mapping.`,
        type: "missing-test",
      });
    }
  }

  for (const context of contexts.filter(({ file }) =>
    ["adr", "spec"].includes(file.classification),
  )) {
    for (const reference of referencesByDocument.get(context.file.path) ?? []) {
      if (referenceExists(reference, symbolsByPath)) {
        continue;
      }
      staleLines.add(
        `${reference.provenance.path}:${reference.provenance.startLine}`,
      );
      pushUnique(findings, occupiedSpans, {
        confidence: 0.98,
        provenance: [reference.provenance],
        requestedSeverity: "medium",
        suggestedAction:
          "Update or remove the stale path and symbol reference.",
        summary: `The documented ${reference.symbol ?? reference.path} source reference does not exist.`,
        type: "stale-doc",
      });
    }
  }

  const instructions = contexts
    .filter(({ file }) =>
      ["agents", "claude", "cursor_rule"].includes(file.classification),
    )
    .flatMap((context) =>
      context.parsed.normativeStatements.flatMap((statement) => {
        const convention = instructionConvention(statement.text);
        return convention
          ? [
              {
                context,
                convention,
                scope: instructionScope(context.file.path),
                statement,
              },
            ]
          : [];
      }),
    );
  for (let leftIndex = 0; leftIndex < instructions.length; leftIndex += 1) {
    const left = instructions[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < instructions.length;
      rightIndex += 1
    ) {
      const right = instructions[rightIndex]!;
      if (
        left.convention === right.convention ||
        !scopesOverlap(left.scope, right.scope)
      ) {
        continue;
      }
      const ordered = [left, right].sort(
        (a, b) => a.context.file.path.length - b.context.file.path.length,
      );
      pushUnique(findings, occupiedSpans, {
        confidence: 0.96,
        provenance: ordered.map(({ context, statement }) =>
          provenance(
            context.file.source,
            lineSpan(
              context.file.path,
              context.file.source,
              statement.span.startLine,
            ),
          ),
        ),
        requestedSeverity: "medium",
        suggestedAction:
          "Choose one JSON key convention and update both overlapping instructions.",
        summary: "Overlapping API response key conventions conflict.",
        type: "contradicting-instructions",
      });
    }
  }

  for (const context of contexts.filter(
    ({ file }) => file.classification === "adr",
  )) {
    const references = referencesByDocument.get(context.file.path) ?? [];
    if (
      references.some((reference) => referenceExists(reference, symbolsByPath))
    ) {
      continue;
    }
    const decision = context.parsed.adrSections.find(({ heading }) =>
      ["decision", "결정"].includes(heading.trim().toLowerCase()),
    );
    if (!decision) {
      continue;
    }
    const decisionStatement = context.parsed.normativeStatements.find(
      ({ span }) => contains(decision.span, span),
    );
    const span = decisionStatement?.span ?? decision.span;
    pushUnique(findings, occupiedSpans, {
      confidence: 0.85,
      provenance: [provenance(context.file.source, span)],
      requestedSeverity: "low",
      suggestedAction:
        "Link the ADR decision to a requirement, implementation, or test.",
      summary: `${posix.basename(context.file.path, posix.extname(context.file.path))} has no external relationship.`,
      type: "orphan-doc",
    });
  }

  for (const context of contexts.filter(
    ({ file }) => file.classification === "spec",
  )) {
    for (const paragraph of context.parsed.paragraphs) {
      if (
        !/\b(?:supports?|provides?|implements?|guarantees?|ensures?)\b/i.test(
          paragraph.text,
        )
      ) {
        continue;
      }
      if (
        context.requirements.some(({ span }) => contains(span, paragraph.span))
      ) {
        continue;
      }
      const sourceLine = `${context.file.path}:${paragraph.span.startLine}`;
      if (staleLines.has(sourceLine)) {
        continue;
      }
      const span = lineSpan(
        context.file.path,
        context.file.source,
        paragraph.span.startLine,
      );
      pushUnique(findings, occupiedSpans, {
        confidence: 0.8,
        provenance: [provenance(context.file.source, span)],
        requestedSeverity: "medium",
        suggestedAction:
          "Link the claim to implementation and passing test evidence or soften it.",
        summary:
          "Product capability is claimed without implementation or test evidence.",
        type: "unproven-claim",
      });
    }
  }

  return findings;
}

export interface AssuranceCoverage {
  readonly implVerified: number;
  readonly requirements: number;
  readonly testVerified: number;
}

/**
 * The receipt's coverage summary (WORK_SPEC §13): task-origin requirements
 * across spec documents, of which implVerified have implementation metadata
 * (a checked task, or every explicitly named symbol present) and
 * testVerified have a requirement-id-mapped test. Deterministic — the same
 * inputs the findings rules read, reduced to counts.
 */
export function assuranceCoverage({
  files,
}: AnalyzeRepositoryAssuranceInput): AssuranceCoverage {
  const contexts = documentContexts(files);
  const allSymbols = new Set(
    files.flatMap(({ exportedSymbols }) =>
      (exportedSymbols ?? []).map(({ name }) => name),
    ),
  );
  const testedRequirementIds = requirementIdsInTests(files);
  let requirements = 0;
  let implVerified = 0;
  let testVerified = 0;
  for (const context of contexts.filter(
    ({ file }) => file.classification === "spec",
  )) {
    for (const requirement of context.requirements.filter(
      ({ origin }) => origin === "task",
    )) {
      requirements += 1;
      const explicitSymbols = explicitImplementationSymbols(
        requirement.statement,
      );
      if (
        requirement.fulfilled === true ||
        (explicitSymbols.length > 0 &&
          explicitSymbols.every((symbol) => allSymbols.has(symbol)))
      ) {
        implVerified += 1;
      }
      if (requirement.id && testedRequirementIds.has(requirement.id)) {
        testVerified += 1;
      }
    }
  }
  return { implVerified, requirements, testVerified };
}
