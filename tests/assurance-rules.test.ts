import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AI_ASSIST_STATUS,
  DISABLED_ASSURANCE_AI_ASSIST,
  analyzeRepositoryAssurance,
  extractRequirements,
  parseMarkdownStructure,
  scanRepository,
  type RepositorySource,
  type RepositoryTree,
} from "../packages/core/src/index";
import { describe, expect, it } from "vitest";

const FIXTURE_ROOT = resolve(import.meta.dirname, "../fixtures/drifted-demo");

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function fixtureAnalysisFiles(commitSha: string) {
  const recording = await json<{
    sha: string;
    tree: RepositoryTree["entries"];
    truncated: boolean;
  }>(resolve(FIXTURE_ROOT, "recordings/github/tree.json"));
  const source: RepositorySource = {
    fetchContent: (path) => readFile(resolve(FIXTURE_ROOT, path)),
    listTree: async () => ({
      entries: recording.tree,
      treeSha: recording.sha,
      truncated: recording.truncated,
    }),
  };
  const scan = await scanRepository({ commitSha, source });
  return Promise.all(
    scan.artifacts.map(async (artifact) => ({
      classification: artifact.classification,
      exportedSymbols: artifact.exportedSymbols,
      path: artifact.path,
      source: await readFile(resolve(FIXTURE_ROOT, artifact.path), "utf8"),
    })),
  );
}

describe("deterministic requirement extractor", () => {
  it("prefers fixture task requirements over overlapping MUST statements", async () => {
    const source = await readFile(resolve(FIXTURE_ROOT, "spec.md"), "utf8");
    const parsed = parseMarkdownStructure({ path: "spec.md", source });
    const requirements = extractRequirements({ artifactKind: "spec", parsed });

    expect(
      requirements.map(({ id, origin, span }) => ({
        endColumn: span.endColumn,
        id,
        line: span.startLine,
        origin,
        startColumn: span.startColumn,
      })),
    ).toEqual([
      {
        endColumn: 89,
        id: "REQ-AUTH-001",
        line: 5,
        origin: "task",
        startColumn: 1,
      },
      {
        endColumn: 67,
        id: "REQ-AUTH-002",
        line: 6,
        origin: "task",
        startColumn: 1,
      },
      {
        endColumn: 85,
        id: "REQ-AUTH-003",
        line: 7,
        origin: "task",
        startColumn: 1,
      },
    ]);
    expect(
      new Set(
        requirements.map(
          ({ span }) => `${span.path}:${span.startByte}:${span.endByte}`,
        ),
      ).size,
    ).toBe(requirements.length);
  });

  it("extracts acceptance blocks, ADR decisions, and standalone normative sentences once", () => {
    const specSource = `# Search specification

## Acceptance Criteria

- Search results load.
- Results SHOULD show their source.

## Notes

Cache MUST expire after one hour.
`;
    const adrSource = `# ADR-009 Rotation

## Decision

The service MUST rotate signing keys every month.

## Consequences

Old keys remain available for verification.
`;
    const specRequirements = extractRequirements({
      artifactKind: "spec",
      parsed: parseMarkdownStructure({
        path: "spec/search.md",
        source: specSource,
      }),
    });
    const adrRequirements = extractRequirements({
      artifactKind: "adr",
      parsed: parseMarkdownStructure({
        path: "docs/adr/ADR-009.md",
        source: adrSource,
      }),
    });

    expect(
      specRequirements.map(({ origin, span }) => ({
        line: span.startLine,
        origin,
      })),
    ).toEqual([
      { line: 3, origin: "acceptance" },
      { line: 10, origin: "normative" },
    ]);
    expect(
      adrRequirements.map(({ origin, span }) => ({
        line: span.startLine,
        origin,
      })),
    ).toEqual([{ line: 3, origin: "adr-decision" }]);
    const requirements = [...specRequirements, ...adrRequirements];
    const spans = requirements.map(
      ({ span }) => `${span.path}:${span.startByte}:${span.endByte}`,
    );
    expect(new Set(spans).size).toBe(requirements.length);
  });
});

describe("deterministic drift rules", () => {
  it("reproduces the fixture findings manifest exactly with actionable provenance", async () => {
    const manifest = await json<{
      commitSha: string;
      findings: Array<{
        provenance: Array<{
          endColumn: number;
          endLine: number;
          path: string;
          startColumn: number;
          startLine: number;
        }>;
        severity: string;
        type: string;
      }>;
    }>(resolve(FIXTURE_ROOT, "expected-findings.json"));
    const files = await fixtureAnalysisFiles(manifest.commitSha);
    const findings = analyzeRepositoryAssurance({ files });
    const comparable = findings.map(({ provenance, severity, type }) => ({
      provenance: provenance.map(
        ({ endColumn, endLine, path, startColumn, startLine }) => ({
          endColumn,
          endLine,
          path,
          startColumn,
          startLine,
        }),
      ),
      severity,
      type,
    }));
    const expected = manifest.findings.map(
      ({ provenance, severity, type }) => ({
        provenance: provenance.map(
          ({ endColumn, endLine, path, startColumn, startLine }) => ({
            endColumn,
            endLine,
            path,
            startColumn,
            startLine,
          }),
        ),
        severity,
        type,
      }),
    );

    expect(comparable).toEqual(expected);
    expect(findings).toHaveLength(manifest.findings.length);
    expect(
      findings.every(({ evidenceLinks }) => evidenceLinks.length > 0),
    ).toBe(true);
    expect(
      findings.every(({ suggestedAction }) => suggestedAction.length > 0),
    ).toBe(true);
    expect(findings.every(({ provenance }) => provenance.length > 0)).toBe(
      true,
    );
    expect(
      findings.every(
        ({ grade, severity }) => grade !== "inferred" || severity !== "high",
      ),
    ).toBe(true);
    expect(
      new Set(
        findings.map(
          ({ provenance, type }) =>
            `${type}:${provenance[0]?.path}:${provenance[0]?.startLine}:${provenance[0]?.startColumn}`,
        ),
      ).size,
    ).toBe(findings.length);
    expect(AI_ASSIST_STATUS).toBe("worker-judgment-jobs-available");
    expect(DISABLED_ASSURANCE_AI_ASSIST).toEqual({
      enabled: false,
      status: "worker-judgment-jobs-available",
    });
  });

  it("adds missing-test only for REQ-AUTH-002 when its fixture test disappears", async () => {
    const commitSha = "1".repeat(40);
    const files = await fixtureAnalysisFiles(commitSha);
    const baseline = analyzeRepositoryAssurance({ files });
    const withoutSessionTest = analyzeRepositoryAssurance({
      files: files.filter(({ path }) => path !== "tests/session.test.ts"),
    });

    expect(
      baseline
        .filter(({ type }) => type === "missing-test")
        .map(({ provenance }) => provenance[0]?.startLine),
    ).toEqual([7]);
    expect(
      withoutSessionTest
        .filter(({ type }) => type === "missing-test")
        .map(({ provenance }) => provenance[0]?.startLine),
    ).toEqual([6, 7]);
    expect(withoutSessionTest).toHaveLength(baseline.length + 1);
  });
});
