import type { InTotoStatement } from "@specproof/core/receipts";

import type { EvidenceGrade } from "../dashboard/graph-model";

export type FindingKind =
  | "contradicting-instructions"
  | "missing-implementation"
  | "missing-test"
  | "orphan-doc"
  | "stale-doc"
  | "unproven-claim";
export type FindingSeverity = "critical" | "high" | "low" | "medium";

export interface FindingEvidenceStep {
  grade: EvidenceGrade;
  id: string;
  label: string;
  relation: string;
  source: string;
}

export interface FindingFixture {
  action: string;
  confidence: number;
  evidence: readonly FindingEvidenceStep[];
  grade: EvidenceGrade;
  id: string;
  kind: FindingKind;
  receiptId: string;
  severity: FindingSeverity;
  source: { endLine: number; path: string; startLine: number };
  title: string;
}

export const FINDINGS: readonly FindingFixture[] = [
  {
    action: "Publish a Vitest or JUnit report for the analyzed commit and map the test case to REQ-CI-04.",
    confidence: 0.96,
    evidence: [
      { grade: "verified", id: "ev-doc-ci", label: "REQ-CI-04", relation: "declared by", source: "spec/WORK_SPEC.md:203-208" },
      { grade: "inferred", id: "ev-code-ci", label: "ingestCiTestReports", relation: "implemented by", source: "packages/core/src/evidence/ci-reports.ts:371-492" },
      { grade: "broken", id: "ev-test-ci", label: "No same-commit CI report", relation: "tested by", source: "bad0551 · GitHub Checks" },
    ],
    grade: "inferred",
    id: "finding-missing-ci",
    kind: "missing-test",
    receiptId: "receipt-current",
    severity: "high",
    source: { endLine: 208, path: "spec/WORK_SPEC.md", startLine: 203 },
    title: "CI evidence is missing for one active requirement",
  },
  {
    action: "Keep the root AGENTS.md rule and remove the conflicting nested instruction.",
    confidence: 0.88,
    evidence: [
      { grade: "verified", id: "ev-root-rule", label: "Root instruction", relation: "contradicts", source: "AGENTS.md:18-20" },
      { grade: "verified", id: "ev-nested-rule", label: "Nested instruction", relation: "contradicts", source: "apps/web/AGENTS.md:7-9" },
      { grade: "inferred", id: "ev-lint-judge", label: "Semantic overlap candidate", relation: "classified by", source: "deterministic instruction lint" },
    ],
    grade: "inferred",
    id: "finding-contradiction",
    kind: "contradicting-instructions",
    receiptId: "receipt-current",
    severity: "high",
    source: { endLine: 20, path: "AGENTS.md", startLine: 18 },
    title: "Nested agent rule conflicts with repository policy",
  },
  {
    action: "Update the scanner count in IMPLEMENTATION_GUIDE.md or remove the fixed count.",
    confidence: 1,
    evidence: [
      { grade: "verified", id: "ev-old-digest", label: "Document digest", relation: "describes", source: "spec/IMPLEMENTATION_GUIDE.md:94" },
      { grade: "verified", id: "ev-new-tree", label: "Current tree digest", relation: "supersedes", source: "bad0551 repository tree" },
    ],
    grade: "verified",
    id: "finding-stale-guide",
    kind: "stale-doc",
    receiptId: "receipt-previous",
    severity: "medium",
    source: { endLine: 96, path: "spec/IMPLEMENTATION_GUIDE.md", startLine: 92 },
    title: "Implementation guide references an older artifact count",
  },
  {
    action: "Link ADR-002 to an active requirement or mark the decision superseded.",
    confidence: 0.73,
    evidence: [
      { grade: "verified", id: "ev-adr", label: "ADR-002", relation: "indexed as", source: "spec/decisions/ADR-002.md" },
      { grade: "inferred", id: "ev-orphan", label: "No inbound requirement edge", relation: "not referenced by", source: "latest graph index" },
    ],
    grade: "inferred",
    id: "finding-orphan-adr",
    kind: "orphan-doc",
    receiptId: "receipt-current",
    severity: "low",
    source: { endLine: 12, path: "spec/decisions/ADR-002.md", startLine: 8 },
    title: "ADR-002 has no active requirement link",
  },
] as const;

export function filterFindings(
  findings: readonly FindingFixture[],
  filters: { kind?: FindingKind | "all"; severity?: FindingSeverity | "all" },
): FindingFixture[] {
  return findings.filter(
    (finding) =>
      (!filters.kind || filters.kind === "all" || finding.kind === filters.kind) &&
      (!filters.severity || filters.severity === "all" || finding.severity === filters.severity),
  );
}

export interface SourceFixture {
  lines: readonly string[];
  path: string;
  startLine: number;
}

const SOURCES: Readonly<Record<string, SourceFixture>> = {
  "finding-missing-ci": {
    lines: [
      "### CI evidence policy",
      "",
      "- Every active requirement MUST map to an implementation edge.",
      "- Test evidence is verified only when a parsed CI report",
      "  comes from the exact analyzed commit.",
      "- Missing reports remain inferred with visible guidance.",
      "",
      "Raw repository bodies are never persisted by default.",
    ],
    path: "spec/WORK_SPEC.md",
    startLine: 201,
  },
  "finding-contradiction": {
    lines: [
      "## Repository policy",
      "All generated changes require one commit per task.",
      "Run acceptance tests before marking a task complete.",
      "Never bypass a failing check.",
    ],
    path: "AGENTS.md",
    startLine: 17,
  },
  "finding-stale-guide": {
    lines: [
      "## Scanner inventory",
      "The initial scanner indexes nine artifact categories.",
      "Generated context remains load-on-demand.",
      "Source bodies are fetched transiently.",
      "",
    ],
    path: "spec/IMPLEMENTATION_GUIDE.md",
    startLine: 91,
  },
  "finding-orphan-adr": {
    lines: [
      "# ADR-002: local context cache",
      "",
      "Status: accepted",
      "Decision: maintain a local generated cache.",
      "This decision predates the hosted Data Brain.",
      "",
    ],
    path: "spec/decisions/ADR-002.md",
    startLine: 7,
  },
};

export function sourceForFinding(findingId: string): SourceFixture | undefined {
  return SOURCES[findingId];
}

export function renderSourceSpan(
  source: SourceFixture,
  span: { endLine: number; startLine: number },
): { highlighted: boolean; line: string; lineNumber: number }[] {
  return source.lines.map((line, index) => {
    const lineNumber = source.startLine + index;
    return {
      highlighted: lineNumber >= span.startLine && lineNumber <= span.endLine,
      line,
      lineNumber,
    };
  });
}

export const TOKENIZER_ASSUMPTION =
  "Estimate: cl100k_base-compatible tokenizer · LF normalized · frontmatter included · ±8%.";

export const INSTRUCTION_COSTS = [
  { agents: "Codex · Claude", findings: 1, path: "AGENTS.md", tokens: 712 },
  { agents: "Codex", findings: 1, path: "apps/web/AGENTS.md", tokens: 438 },
  { agents: "Claude", findings: 0, path: "CLAUDE.md", tokens: 11 },
  { agents: "Cursor", findings: 0, path: ".cursor/rules/evidence.mdc", tokens: 679 },
] as const;

export const OVERLAPS = [
  { left: "AGENTS.md:18-28", overlap: "Acceptance test and commit rules", right: "apps/web/AGENTS.md:4-11", tokens: 96 },
  { left: "AGENTS.md:43-49", overlap: "Metadata-only storage boundary", right: ".cursor/rules/evidence.mdc:12-19", tokens: 73 },
] as const;

export const CONTRADICTIONS = [
  {
    confidence: 0.88,
    left: { path: "AGENTS.md", quote: "Run acceptance tests before marking a task complete.", span: "18-20" },
    right: { path: "apps/web/AGENTS.md", quote: "UI changes may be committed before browser checks.", span: "7-9" },
  },
] as const;

const CURRENT_STATEMENT: InTotoStatement = {
  _type: "https://in-toto.io/Statement/v1",
  predicate: {
    commitSha: "b".repeat(40),
    evidence: { inferred: 1, verified: 3 },
    previousReceiptDigest: "9".repeat(64),
    repository: "2klips/specproof-app",
    runId: "run-bad0551",
  },
  predicateType: "https://specproof.dev/receipt/v1",
  subject: [{ digest: { sha256: "a".repeat(64) }, name: "2klips/specproof-app" }],
};

export interface ReceiptFixture {
  createdAt: string;
  expectedDigest: string;
  id: string;
  label: string;
  stale: boolean;
  statement: InTotoStatement;
}

export const RECEIPTS: readonly ReceiptFixture[] = [
  {
    createdAt: "2026-08-10T13:42:00.000Z",
    expectedDigest: "8b8e940fe1b20a3c2c7a7b260a988fb2cf0f093ee84ec7b356481a8b5cd95d59",
    id: "receipt-current",
    label: "bad0551 · deterministic analysis",
    stale: false,
    statement: CURRENT_STATEMENT,
  },
  {
    createdAt: "2026-08-09T17:08:00.000Z",
    expectedDigest: "8b8e940fe1b20a3c2c7a7b260a988fb2cf0f093ee84ec7b356481a8b5cd95d59",
    id: "receipt-tampered",
    label: "bad0551 · tampered fixture",
    stale: false,
    statement: {
      ...CURRENT_STATEMENT,
      predicate: { ...CURRENT_STATEMENT.predicate, evidence: { inferred: 9, verified: 3 } },
    },
  },
  {
    createdAt: "2026-08-08T09:12:00.000Z",
    expectedDigest: "47440141a41d2d46f8ae922da2fcf6be4d0a5633eb42b3d927e319de3e30b27b",
    id: "receipt-previous",
    label: "e9101b5 · previous analysis",
    stale: true,
    statement: {
      ...CURRENT_STATEMENT,
      predicate: {
        ...CURRENT_STATEMENT.predicate,
        commitSha: "e".repeat(40),
        evidence: { inferred: 2, verified: 2 },
        previousReceiptDigest: null,
        runId: "run-e9101b5",
      },
    },
  },
] as const;
