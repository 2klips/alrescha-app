import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const FINDING_TYPES = [
  "missing-implementation",
  "missing-test",
  "stale-doc",
  "contradicting-instructions",
  "orphan-doc",
  "unproven-claim",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

export interface ExpectedSpan {
  readonly endColumn: number;
  readonly endLine: number;
  readonly excerpt: string;
  readonly path: string;
  readonly startColumn: number;
  readonly startLine: number;
}

export interface ExpectedFinding {
  readonly grade: "inferred" | "verified";
  readonly id: string;
  readonly provenance: readonly ExpectedSpan[];
  readonly severity: "high" | "low" | "medium";
  readonly summary: string;
  readonly type: FindingType;
}

export interface ExpectedFindingsManifest {
  readonly commitSha: string;
  readonly findings: readonly ExpectedFinding[];
  readonly fixture: "drifted-demo";
  readonly schemaVersion: 1;
}

type JsonRecord = Record<string, unknown>;

function object(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }

  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }

  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, options: T, label: string): T[number] {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new TypeError(`${label} must be one of: ${options.join(", ")}.`);
  }

  return value as T[number];
}

async function validateSpan(
  input: unknown,
  fixtureRoot: string,
  label: string,
): Promise<ExpectedSpan> {
  const span = object(input, label);
  const path = text(span.path, `${label}.path`);

  if (isAbsolute(path) || relative(fixtureRoot, resolve(fixtureRoot, path)).startsWith("..")) {
    throw new TypeError(`${label}.path must remain inside the fixture.`);
  }

  const startLine = integer(span.startLine, `${label}.startLine`);
  const startColumn = integer(span.startColumn, `${label}.startColumn`);
  const endLine = integer(span.endLine, `${label}.endLine`);
  const endColumn = integer(span.endColumn, `${label}.endColumn`);
  const excerpt = text(span.excerpt, `${label}.excerpt`);
  const source = await readFile(resolve(fixtureRoot, path), "utf8");
  const lines = source.split(/\r?\n/);

  if (startLine > lines.length || endLine > lines.length || endLine < startLine) {
    throw new RangeError(`${label} span ${path}:${startLine}-${endLine} is outside file (${lines.length} lines).`);
  }

  const firstLine = lines[startLine - 1] ?? "";
  const lastLine = lines[endLine - 1] ?? "";

  if (startColumn > firstLine.length + 1 || endColumn > lastLine.length + 1) {
    throw new RangeError(`${label} columns are outside ${path}:${startLine}-${endLine}.`);
  }

  const selected = lines.slice(startLine - 1, endLine);
  selected[0] = (selected[0] ?? "").slice(startColumn - 1);
  selected[selected.length - 1] = (selected.at(-1) ?? "").slice(
    0,
    endLine === startLine ? endColumn - startColumn : endColumn - 1,
  );
  const actualExcerpt = selected.join("\n");

  if (actualExcerpt !== excerpt) {
    throw new TypeError(`${label}.excerpt does not match ${path}:${startLine}-${endLine}.`);
  }

  return { endColumn, endLine, excerpt, path, startColumn, startLine };
}

export async function validateExpectedFindingsManifest(
  input: unknown,
  fixtureRoot: string,
): Promise<ExpectedFindingsManifest> {
  const manifest = object(input, "manifest");

  if (manifest.schemaVersion !== 1) {
    throw new TypeError("manifest.schemaVersion must equal 1.");
  }

  if (manifest.fixture !== "drifted-demo") {
    throw new TypeError("manifest.fixture must equal drifted-demo.");
  }

  const commitSha = text(manifest.commitSha, "manifest.commitSha");

  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new TypeError("manifest.commitSha must be a 40-character lowercase hex SHA.");
  }

  if (!Array.isArray(manifest.findings)) {
    throw new TypeError("manifest.findings must be an array.");
  }

  const findings: ExpectedFinding[] = [];

  for (const [index, inputFinding] of manifest.findings.entries()) {
    const label = `manifest.findings[${index}]`;
    const finding = object(inputFinding, label);

    if (!Array.isArray(finding.provenance) || finding.provenance.length === 0) {
      throw new TypeError(`${label}.provenance must contain at least one span.`);
    }

    const type = oneOf(finding.type, FINDING_TYPES, `${label}.type`);
    const provenance = await Promise.all(
      finding.provenance.map((span, spanIndex) =>
        validateSpan(span, fixtureRoot, `${label}.provenance[${spanIndex}]`),
      ),
    );

    if (type === "contradicting-instructions" && provenance.length !== 2) {
      throw new TypeError(`${label} must carry both conflicting instruction spans.`);
    }

    findings.push({
      grade: oneOf(finding.grade, ["inferred", "verified"] as const, `${label}.grade`),
      id: text(finding.id, `${label}.id`),
      provenance,
      severity: oneOf(finding.severity, ["high", "medium", "low"] as const, `${label}.severity`),
      summary: text(finding.summary, `${label}.summary`),
      type,
    });
  }

  const ids = findings.map(({ id }) => id);

  if (new Set(ids).size !== ids.length) {
    throw new TypeError("manifest finding IDs must be unique.");
  }

  const types = new Set(findings.map(({ type }) => type));
  const missingTypes = FINDING_TYPES.filter((type) => !types.has(type));

  if (missingTypes.length > 0) {
    throw new TypeError(`manifest is missing finding types: ${missingTypes.join(", ")}.`);
  }

  return {
    commitSha,
    findings,
    fixture: "drifted-demo",
    schemaVersion: 1,
  };
}

