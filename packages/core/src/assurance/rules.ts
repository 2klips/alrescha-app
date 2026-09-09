import { posix } from "node:path";

import type {
  ArtifactClassification,
  ExportedSymbolMetadata,
} from "../ingest/repository-scanner";
import {
  buildDocumentOffsetIndex,
  parseMarkdownStructure,
  type DocumentOffsetIndex,
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
  | "unproven-claim"
  | "untested-code";
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
  /**
   * The code file this finding is *about*, when the rule can name one
   * deterministically — the referenced path for `stale-doc`, the file owning
   * the named symbol for `missing-implementation`/`missing-test`, the file
   * itself for `untested-code`.
   *
   * Findings anchor on their source span, which for five of the seven rules
   * is a document. A repository whose risk lives in code therefore had no
   * finding on any code node at all (R5 §2.2 D8); this is the second anchor
   * that fixes it. Null when no code file can be named without guessing.
   */
  readonly targetPath: string | null;
  readonly type: AssuranceFindingType;
}

export interface AnalyzeRepositoryAssuranceInput {
  readonly aiAssist?: DisabledAssuranceAiAssist;
  readonly files: readonly AssuranceSourceFile[];
  /**
   * Paths with an incoming `tests` edge — the scan's `test-import` relation
   * (Phase 4 Wave A todo 0), which knows a test exercises a file even when
   * the two are named nothing alike. Absent means "no such edge is known",
   * not "nothing is tested", so the `untested-code` rule stays deterministic
   * on whatever the caller can actually supply.
   */
  readonly testedPaths?: Iterable<string>;
  /**
   * Precomputed via `prepareAssuranceContexts(files)`. Both
   * `analyzeRepositoryAssurance` and `assuranceCoverage` parse the same
   * files independently by default (each call computes its own); a caller
   * that needs both (e.g. one analysis job) should prepare once and pass
   * the same value to each, halving the remark parses over that file set.
   * `files` must be the exact set `prepared` was built from — this is not
   * re-validated.
   */
  readonly prepared?: PreparedAssuranceContexts;
}

export interface DocumentContext {
  /** Encoded once per document; every span slice reuses this instead of
   *  re-running `Buffer.from(source)` (an O(document length) re-encode). */
  readonly buffer: Buffer;
  readonly file: AssuranceSourceFile;
  /** Line-start + cumulative UTF-8 byte-offset table, built once per
   *  document (see `buildDocumentOffsetIndex`) so `lineSpan` below is O(1)
   *  per call instead of re-scanning from the start of the file. */
  readonly offsetIndex: DocumentOffsetIndex;
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
  readonly targetPath?: string | null;
  readonly type: AssuranceFindingType;
}

interface SourceReference {
  readonly path: string;
  readonly provenance: FindingProvenance;
  readonly symbol: string | null;
}

/**
 * Classifications the rules read as prose.
 *
 * Stated outright rather than as "not code" (Phase 4 Wave A todo 2): the
 * scanner now classifies stylesheets, schemas, config and generic `doc`
 * files, and "not code" would have handed every one of them to remark, run
 * the requirement extractor over a migration, and made the analyze job fetch
 * their bodies. The seven here are exactly the ones the six drift rules
 * target; whether a README should join them is OQ-041, a product decision.
 */
const PROSE_CLASSIFICATIONS = new Set<ArtifactClassification>([
  "adr",
  "agents",
  "claude",
  "cursor_rule",
  "skill",
  "spec",
  "todo_progress",
]);

function isDocument(classification: ArtifactClassification): boolean {
  return PROSE_CLASSIFICATIONS.has(classification);
}

function sliceSpan(buffer: Buffer, span: MarkdownSpan): string {
  return buffer.subarray(span.startByte, span.endByte).toString("utf8");
}

function provenance(buffer: Buffer, span: MarkdownSpan): FindingProvenance {
  return { ...span, excerpt: sliceSpan(buffer, span) };
}

/**
 * A single source line's span. `offsetIndex` is the document's precomputed
 * line-start + byte-offset table (see `buildDocumentOffsetIndex`): finding
 * the line's start and converting both ends to byte offsets are O(1) here.
 * Scanning to the line's end newline (bounded by that one line's length,
 * not the document's) is unchanged from before.
 */
function lineSpan(
  path: string,
  source: string,
  offsetIndex: DocumentOffsetIndex,
  line: number,
): MarkdownSpan {
  const startOffset = offsetIndex.lineStartOffset(line);
  const newline = source.indexOf("\n", startOffset);
  let endOffset = newline === -1 ? source.length : newline;
  if (endOffset > startOffset && source[endOffset - 1] === "\r") {
    endOffset -= 1;
  }
  const content = source.slice(startOffset, endOffset);
  return {
    endByte: offsetIndex.byteOffsetAt(endOffset),
    endColumn: content.length + 1,
    endLine: line,
    path,
    startByte: offsetIndex.byteOffsetAt(startOffset),
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
    targetPath: draft.targetPath ?? null,
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

/**
 * Identifiers a requirement statement names, in the shapes exported code
 * actually uses.
 *
 * This used to be camelCase only, which on this repository could see 541 of
 * 1,702 exported names — a third of the vocabulary. Every `PascalCase` type
 * and every `UPPER_SNAKE` constant was invisible, so a requirement that named
 * one had no chance of a link. The ownership map is what keeps this honest:
 * a token only becomes an edge when exactly one file declares that exact
 * name, so widening what is *looked up* does not widen what is *believed*.
 *
 * **Backticks are not available as a signal.** An author marking a name as
 * code would be the cleanest way to tell an identifier from a word, but the
 * statement reaches here after a markdown parse that renders inline code to
 * plain text: 1 of this repository's 99 statements still contains a
 * backtick, and that one is unbalanced. Matching on them would be matching
 * on something that is gone.
 *
 * **So bare PascalCase needs two humps.** The first attempt at this widening
 * accepted `[A-Z][a-z]…` and the live repository immediately produced a
 * wrong edge: the heading "Theme toggle and persistence" linked to the
 * exported type `Theme`. Capitalised English is indistinguishable from a
 * one-word type once the backticks are gone, and `symbolOwners` states the
 * rule this has to obey — a wrong edge costs more than a missing one.
 * `SessionReceipt` and `CoachingProviderLoader` match; `Theme`, `Create` and
 * `Header` do not.
 *
 * Measured on `2klips/alrescha-app` (2026-09-06): one `implements` edge
 * before, two after. The reason the number is that small is not the regex —
 * see OQ-064.
 */
function explicitImplementationSymbols(statement: string): readonly string[] {
  return [
    ...new Set(
      [
        ...statement.matchAll(
          // camelCase | PascalCase (≥2 humps) | UPPER_SNAKE
          /\b(?:[a-z][A-Za-z\d]*[A-Z][A-Za-z\d]*|[A-Z][a-z\d][A-Za-z\d]*[A-Z][A-Za-z\d]*|[A-Z][A-Z\d]*(?:_[A-Z\d]+)+)\b/g,
        ),
      ].map(([symbol]) => symbol),
    ),
  ];
}

/**
 * Which file *declares* each exported symbol name; null when the answer is
 * ambiguous.
 *
 * A barrel re-exporting a name is recorded with kind `export`, the declaring
 * file with the kind of its declaration (`function`, `class`, `variable`, …).
 * Counting both as owners makes almost every name in a monorepo ambiguous —
 * on this repository 503 of 1,246 names, including every symbol a package
 * index re-exports — so a declaration wins over a re-export, and a name is
 * ambiguous only when two files declare it. A name that is re-exported and
 * never declared (its declaration is outside the scanned set) keeps the one
 * file that names it. Ambiguity yields no owner at all: the resolver's rule
 * is that a wrong edge costs more than a missing one.
 */
function symbolOwners(
  files: readonly AssuranceSourceFile[],
): ReadonlyMap<string, string | null> {
  const declared = new Map<string, string | null>();
  const reExported = new Map<string, string | null>();
  for (const file of files) {
    for (const { kind, name } of file.exportedSymbols ?? []) {
      const table = kind === "export" ? reExported : declared;
      const known = table.get(name);
      if (known === undefined) table.set(name, file.path);
      else if (known !== file.path) table.set(name, null);
    }
  }
  const owners = new Map<string, string | null>(reExported);
  for (const [name, path] of declared) owners.set(name, path);
  return owners;
}

/** The first symbol a statement names whose owning file is unambiguous. */
function namedImplementation(
  statement: string,
  owners: ReadonlyMap<string, string | null>,
): { readonly path: string; readonly symbol: string } | null {
  for (const symbol of explicitImplementationSymbols(statement)) {
    const path = owners.get(symbol);
    if (path) return { path, symbol };
  }
  return null;
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
        context.buffer,
        lineSpan(
          context.file.path,
          context.file.source,
          context.offsetIndex,
          code.span.startLine,
        ),
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
        buffer: Buffer.from(file.source),
        file,
        offsetIndex: buildDocumentOffsetIndex(file.source),
        parsed,
        requirements: extractRequirements({
          artifactKind: file.classification,
          parsed,
        }),
      };
    });
}

/**
 * Files the `untested-code` rule must never report, in the order a reader
 * would ask about them.
 *
 * A declaration file has nothing to execute, a config file is read by a tool
 * rather than called by a unit, and a generated file is a build product whose
 * test belongs to its generator. Firing on any of them would make the first
 * risk signal a documentation-free repository ever sees a list of things
 * nobody should write a test for.
 */
const DECLARATION_FILE = /\.d\.[cm]?ts$/i;
/**
 * Module entry points (`index.*`, `__init__.py`) re-export the files behind
 * them; the unit a test would cover lives in those files, and the resolver
 * already routes edges through the barrel to them (Wave A todo 0). Firing
 * here would put one permanent finding on every package in a monorepo.
 */
const ENTRY_POINT_FILE = /(?:^|\/)(?:index\.[cm]?[jt]sx?|__init__\.py)$/i;
const CONFIG_FILE =
  /(?:^|\/)(?:[^/]*\.config\.[cm]?[jt]sx?|\.?[a-z]+rc\.[cm]?[jt]s|conftest\.py|setup\.py)$/i;
const GENERATED_FILE =
  /(?:^|\/)(?:__generated__|generated|dist|build|out|coverage|vendor|node_modules)(?:\/|$)|\.(?:generated|gen|min)\.[cm]?[jt]sx?$|_pb2?\.py$|\.pb\.go$/i;

function baseName(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.indexOf(".");
  return dot === -1 ? file : file.slice(0, dot);
}

/**
 * The subject names the repository's test files claim, by convention:
 * `auth.test.ts`, `test_auth.py` and `auth_test.go` all claim `auth`.
 * Matching on the name alone (rather than on the directory) keeps a test
 * suite that mirrors the source tree from reading as untested code.
 */
function testedSubjectNames(
  files: readonly AssuranceSourceFile[],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const file of files) {
    if (!TEST_PATH.test(file.path)) continue;
    const base = baseName(file.path)
      .replace(/^test_/i, "")
      .replace(/_test$/i, "");
    if (base.length > 0) names.add(base.toLowerCase());
  }
  return names;
}

export interface PreparedAssuranceContexts {
  readonly allSymbols: ReadonlySet<string>;
  readonly contexts: readonly DocumentContext[];
  readonly testedRequirementIds: ReadonlySet<string>;
}

/**
 * The parse-and-index work `analyzeRepositoryAssurance` and
 * `assuranceCoverage` each need: every document's remark parse plus the
 * exported-symbol and tested-requirement-id sets derived from `files`. A
 * caller that runs both over the same file set (the `analyze` job does)
 * should call this once and pass the result to both via `prepared`, instead
 * of letting each function redo the same remark parses independently.
 */
export function prepareAssuranceContexts(
  files: readonly AssuranceSourceFile[],
): PreparedAssuranceContexts {
  return {
    allSymbols: new Set(
      files.flatMap(({ exportedSymbols }) =>
        (exportedSymbols ?? []).map(({ name }) => name),
      ),
    ),
    contexts: documentContexts(files),
    testedRequirementIds: requirementIdsInTests(files),
  };
}

/** Confidence ceiling for a requirement→code link (BUILD_PLAN_PHASE4 A1). */
export const REQUIREMENT_IMPLEMENTATION_CONFIDENCE = 0.6;

/**
 * A requirement statement that names an exported symbol, paired with the file
 * that owns it — the `implements` edge the analysis persists.
 *
 * `reference`, never `resolved` and never `verified`: naming a symbol is
 * name matching, not an execution (WORK_SPEC §3-1). It is emitted here, next
 * to the rules that read the same ownership map, so a finding and the edge it
 * anchors to cannot disagree about which file implements a requirement.
 */
export interface RequirementImplementationLink {
  readonly confidence: number;
  /** Path of the document stating the requirement. */
  readonly documentPath: string;
  /** `REQ-…` code when the document names one, else the statement itself. */
  readonly identity: string;
  readonly method: "symbol-owner";
  readonly span: MarkdownSpan;
  readonly symbol: string;
  readonly targetPath: string;
  readonly tier: "reference";
}

export function requirementImplementationLinks({
  files,
  prepared,
}: AnalyzeRepositoryAssuranceInput): readonly RequirementImplementationLink[] {
  const { contexts } = prepared ?? prepareAssuranceContexts(files);
  const owners = symbolOwners(files);
  const links: RequirementImplementationLink[] = [];
  const seen = new Set<string>();
  for (const context of contexts) {
    for (const requirement of context.requirements) {
      const named = namedImplementation(requirement.statement, owners);
      if (!named) continue;
      const identity = requirement.id ?? requirement.statement;
      const key = `${context.file.path}|${identity}|${named.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        confidence: REQUIREMENT_IMPLEMENTATION_CONFIDENCE,
        documentPath: context.file.path,
        identity,
        method: "symbol-owner",
        span: requirement.span,
        symbol: named.symbol,
        targetPath: named.path,
        tier: "reference",
      });
    }
  }
  return links;
}

export function analyzeRepositoryAssurance({
  files,
  prepared,
  testedPaths,
}: AnalyzeRepositoryAssuranceInput): readonly AssuranceFinding[] {
  const { allSymbols, contexts, testedRequirementIds } =
    prepared ?? prepareAssuranceContexts(files);
  const findings: AssuranceFinding[] = [];
  const occupiedSpans = new Set<string>();
  const knownPaths = new Set(files.map(({ path }) => path));
  const owners = symbolOwners(files);
  const symbolsByPath = new Map(
    files.map((file) => [
      file.path,
      new Set((file.exportedSymbols ?? []).map(({ name }) => name)),
    ]),
  );
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
        provenance: [provenance(context.buffer, requirement.span)],
        requestedSeverity: "high",
        suggestedAction:
          "Implement the requirement or link it to an existing exported symbol.",
        summary: `${requirement.id ?? "Requirement"} has no implementation symbol.`,
        // A partially implemented requirement still names a file: anchor
        // there so the gap shows on the code the work started in.
        targetPath:
          namedImplementation(requirement.statement, owners)?.path ?? null,
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
        provenance: [provenance(context.buffer, requirement.span)],
        requestedSeverity: "medium",
        suggestedAction:
          "Add a CI-mapped test whose name includes the requirement ID.",
        summary: `${requirement.id ?? "Requirement"} has implementation metadata but no test mapping.`,
        // The same file the `implements` edge points at — the untested one.
        targetPath:
          namedImplementation(requirement.statement, owners)?.path ?? null,
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
        // The file exists and the symbol does not: that file is where the
        // documentation drifted. A missing file has no node to anchor to.
        targetPath: knownPaths.has(reference.path) ? reference.path : null,
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
            context.buffer,
            lineSpan(
              context.file.path,
              context.file.source,
              context.offsetIndex,
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
      provenance: [provenance(context.buffer, span)],
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
        context.offsetIndex,
        paragraph.span.startLine,
      );
      pushUnique(findings, occupiedSpans, {
        confidence: 0.8,
        provenance: [provenance(context.buffer, span)],
        requestedSeverity: "medium",
        suggestedAction:
          "Link the claim to implementation and passing test evidence or soften it.",
        summary:
          "Product capability is claimed without implementation or test evidence.",
        type: "unproven-claim",
      });
    }
  }

  // The one rule that needs no document at all (Phase 4 Wave A todo 1).
  //
  // Every rule above starts from a spec, ADR or instruction file, so a
  // repository written without documentation produced no findings whatever
  // its state (R5 §4.3 — a 370-file pilot returned zero). This one reads the
  // structure the scan already stored: an exported unit that no test names
  // and no `tests` edge reaches. `inferred` and `low` by construction —
  // "no test was found" is not "no test exists", and the absence of a test
  // is a risk signal, not a defect.
  const tested = new Set(testedPaths ?? []);
  const testedNames = testedSubjectNames(files);
  for (const file of files) {
    if (file.classification !== "code_metadata") continue;
    if (TEST_PATH.test(file.path)) continue;
    if (
      DECLARATION_FILE.test(file.path) ||
      ENTRY_POINT_FILE.test(file.path) ||
      CONFIG_FILE.test(file.path) ||
      GENERATED_FILE.test(file.path)
    )
      continue;
    const symbols = file.exportedSymbols ?? [];
    // Nothing is exported, so nothing here has a surface a test could take.
    if (symbols.length === 0) continue;
    if (tested.has(file.path)) continue;
    if (testedNames.has(baseName(file.path).toLowerCase())) continue;
    const first = symbols[0]!;
    pushUnique(findings, occupiedSpans, {
      confidence: 0.6,
      provenance: [
        {
          // A code anchor, never a code body: the line comes from the symbol
          // metadata the scan stored, and the excerpt stays empty because
          // this rule never reads the file (WORK_SPEC §3-3).
          endByte: 0,
          endColumn: first.endColumn,
          endLine: first.endLine,
          excerpt: "",
          path: file.path,
          startByte: 0,
          startColumn: first.startColumn,
          startLine: first.startLine,
        },
      ],
      requestedSeverity: "low",
      suggestedAction:
        "Add a test that imports this file, or name it after the unit it covers.",
      summary: `${posix.basename(file.path)} exports ${symbols.length} symbol${
        symbols.length === 1 ? "" : "s"
      } with no test covering it.`,
      targetPath: file.path,
      type: "untested-code",
    });
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
  prepared,
}: AnalyzeRepositoryAssuranceInput): AssuranceCoverage {
  const { allSymbols, contexts, testedRequirementIds } =
    prepared ?? prepareAssuranceContexts(files);
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
