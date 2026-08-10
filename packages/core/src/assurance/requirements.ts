import type { ArtifactClassification } from "../ingest/repository-scanner";
import type { MarkdownSpan, ParsedMarkdownStructure } from "../parser/markdown";

export type RequirementOrigin =
  "acceptance" | "adr-decision" | "normative" | "task";

export interface ExtractedRequirement {
  readonly artifactKind: ArtifactClassification;
  readonly fulfilled: boolean | null;
  readonly id: string | null;
  readonly origin: RequirementOrigin;
  readonly span: MarkdownSpan;
  readonly statement: string;
}

export interface ExtractRequirementsInput {
  readonly artifactKind: ArtifactClassification;
  readonly parsed: ParsedMarkdownStructure;
}

function requirementId(statement: string): string | null {
  return statement.match(/\bREQ-[A-Z\d]+(?:-[A-Z\d]+)*\b/)?.[0] ?? null;
}

function contains(container: MarkdownSpan, candidate: MarkdownSpan): boolean {
  return (
    container.path === candidate.path &&
    container.startByte <= candidate.startByte &&
    container.endByte >= candidate.endByte
  );
}

function uniqueBySpan(
  requirements: readonly ExtractedRequirement[],
): readonly ExtractedRequirement[] {
  const seen = new Set<string>();
  return requirements.filter(({ span }) => {
    const key = `${span.path}:${span.startByte}:${span.endByte}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function extractRequirements({
  artifactKind,
  parsed,
}: ExtractRequirementsInput): readonly ExtractedRequirement[] {
  const requirements: ExtractedRequirement[] = parsed.tasks.map((task) => ({
    artifactKind,
    fulfilled: task.checked,
    id: requirementId(task.text),
    origin: "task",
    span: task.span,
    statement: task.text,
  }));

  for (const section of parsed.acceptanceCriteria) {
    requirements.push({
      artifactKind,
      fulfilled: null,
      id: requirementId(section.text),
      origin: "acceptance",
      span: section.span,
      statement: section.text,
    });
  }

  if (artifactKind === "adr") {
    for (const section of parsed.adrSections) {
      if (
        !["decision", "결정"].includes(section.heading.trim().toLowerCase())
      ) {
        continue;
      }
      requirements.push({
        artifactKind,
        fulfilled: null,
        id: requirementId(section.text),
        origin: "adr-decision",
        span: section.span,
        statement: section.text,
      });
    }
  }

  for (const statement of parsed.normativeStatements) {
    if (requirements.some(({ span }) => contains(span, statement.span))) {
      continue;
    }
    requirements.push({
      artifactKind,
      fulfilled: null,
      id: requirementId(statement.text),
      origin: "normative",
      span: statement.span,
      statement: statement.text,
    });
  }

  return [...uniqueBySpan(requirements)].sort(
    (left, right) =>
      left.span.path.localeCompare(right.span.path) ||
      left.span.startByte - right.span.startByte,
  );
}
