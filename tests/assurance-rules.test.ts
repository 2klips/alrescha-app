import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AI_ASSIST_STATUS,
  DISABLED_ASSURANCE_AI_ASSIST,
  analyzeRepositoryAssurance,
  assuranceSourceRequired,
  extractRequirements,
  parseMarkdownStructure,
  requirementImplementationLinks,
  scanRepository,
  type AssuranceSourceFile,
  type RepositorySource,
  type RepositoryTree,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { describe, expect, it } from "vitest";

const FIXTURE_ROOT = resolve(import.meta.dirname, "../fixtures/drifted-demo");
const LAYOUT_VARIANTS = resolve(
  import.meta.dirname,
  "../fixtures/layout-variants",
);

/**
 * A repository as the analyze job sees it: stored metadata for every
 * artifact, bodies only for the files the rules actually read. Building it
 * this way is itself an assertion — a rule that started reading code bodies
 * would see an empty string here, not the file.
 */
async function scannedRepository(root: string): Promise<{
  files: AssuranceSourceFile[];
  testedPaths: string[];
}> {
  const { commitSha, source } = await createLocalRepositorySource(root);
  const plan = await scanRepository({ commitSha, source });
  const files = await Promise.all(
    plan.artifacts.map(async (artifact) => ({
      classification: artifact.classification,
      exportedSymbols: artifact.exportedSymbols,
      path: artifact.path,
      source: assuranceSourceRequired(artifact)
        ? await readFile(resolve(root, artifact.path), "utf8")
        : "",
    })),
  );
  return {
    files,
    testedPaths: plan.codeLinks
      .filter(({ kind }) => kind === "tests")
      .map(({ targetPath }) => targetPath),
  };
}

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
    const all = analyzeRepositoryAssurance({ files });
    // The manifest states the six documented drift types (WORK_SPEC §9).
    // `untested-code` is the seventh rule, structural rather than
    // document-derived, and is pinned exactly by its own test below — the
    // two together still account for every finding the engine emits.
    const findings = all.filter(({ type }) => type !== "untested-code");
    expect(all).toHaveLength(findings.length + 2);
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
        all.map(
          ({ provenance, type }) =>
            `${type}:${provenance[0]?.path}:${provenance[0]?.startLine}:${provenance[0]?.startColumn}`,
        ),
      ).size,
    ).toBe(all.length);
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
    // Two more, not one: removing the only test file also leaves
    // `src/session.ts` with nothing covering it.
    expect(withoutSessionTest).toHaveLength(baseline.length + 2);
    expect(
      withoutSessionTest
        .filter(({ type }) => type === "untested-code")
        .map(({ targetPath }) => targetPath),
    ).toEqual(["src/api/health.ts", "src/audit.ts", "src/session.ts"]);
  });
});

/**
 * Phase 4 Wave A todo 1 — the rule that fires without a document.
 *
 * Every other rule starts from a spec, ADR or instruction file, so a
 * repository written the way its owner actually writes them produced no
 * finding at all whatever its state (R5 §4.3: zero over a 370-file pilot).
 * These cases state what the rule reports on three real fixture layouts and,
 * as importantly, what it refuses to report.
 */
describe("untested-code rule", () => {
  async function untested(root: string): Promise<string[]> {
    const { files, testedPaths } = await scannedRepository(root);
    return analyzeRepositoryAssurance({ files, testedPaths })
      .filter(({ type }) => type === "untested-code")
      .map(({ targetPath }) => targetPath ?? "");
  }

  it("fires on the demo fixture's uncovered files only", async () => {
    // `src/session.ts` is covered twice over — a same-named test and a
    // `tests` edge — and neither the test file, the vitest config nor the
    // documents are candidates at all.
    expect(await untested(FIXTURE_ROOT)).toEqual([
      "src/api/health.ts",
      "src/audit.ts",
    ]);
  });

  it("fires across a workspace with no tests, skipping package barrels", async () => {
    expect(
      await untested(resolve(LAYOUT_VARIANTS, "monorepo-aliases")),
    ).toEqual([
      "apps/web/src/helpers.ts",
      "apps/web/src/other.ts",
      "apps/web/src/page.ts",
      "apps/web/src/star.ts",
      "packages/core/src/greet.ts",
      "packages/core/src/util.ts",
    ]);
  });

  it("reads Python and TypeScript coverage the same way", async () => {
    // `backend/app/api/routes.py` and `frontend/lib/format.ts` both have a
    // `tests` edge; `__init__.py` and `components/index.ts` are entry points.
    expect(await untested(resolve(LAYOUT_VARIANTS, "next-fastapi"))).toEqual([
      "backend/app/core/config.py",
      "backend/app/main.py",
      "frontend/app/page.tsx",
      "frontend/components/card.tsx",
      "frontend/lib/api.ts",
    ]);
  });

  it("stays inferred, low, and free of any source body", async () => {
    const { files, testedPaths } = await scannedRepository(FIXTURE_ROOT);
    const findings = analyzeRepositoryAssurance({ files, testedPaths }).filter(
      ({ type }) => type === "untested-code",
    );

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.grade).toBe("inferred");
      expect(finding.severity).toBe("low");
      expect(finding.confidence).toBeLessThanOrEqual(0.6);
      expect(finding.suggestedAction.length).toBeGreaterThan(0);
      const [span] = finding.provenance;
      // A line anchor from stored symbol metadata, never a slice of the file
      // (WORK_SPEC §3-3): this rule never reads a code body.
      expect(span?.path).toBe(finding.targetPath);
      expect(span?.excerpt).toBe("");
      expect(span?.startLine).toBeGreaterThan(0);
    }
  });

  it("refuses the file shapes a test would never cover", () => {
    const candidate = (path: string, symbols = 1): AssuranceSourceFile => ({
      classification: "code_metadata",
      exportedSymbols: Array.from({ length: symbols }, (_, index) => ({
        endColumn: 1,
        endLine: index + 1,
        kind: "function",
        name: `symbol${index}`,
        startColumn: 1,
        startLine: index + 1,
      })),
      path,
      source: "",
    });
    const excluded = [
      "src/types.d.ts",
      "vitest.config.ts",
      "next.config.mjs",
      ".eslintrc.js",
      "backend/conftest.py",
      "src/__generated__/schema.ts",
      "dist/bundle.js",
      "src/api.generated.ts",
      "proto/service_pb2.py",
      "src/index.ts",
      "app/__init__.py",
      "tests/helper.ts",
      "src/thing.test.ts",
    ];

    const findings = analyzeRepositoryAssurance({
      files: [
        ...excluded.map((path) => candidate(path)),
        // ...and one file that is none of those, so this case cannot pass
        // by the rule simply never firing.
        candidate("src/real-work.ts", 2),
        // An exported surface is the premise: nothing here to cover.
        candidate("src/side-effects.ts", 0),
      ],
    });

    expect(
      findings
        .filter(({ type }) => type === "untested-code")
        .map(({ targetPath }) => targetPath),
    ).toEqual(["src/real-work.ts"]);
  });
});

describe("requirement implementation links", () => {
  function declaration(
    path: string,
    name: string,
    kind = "function",
  ): AssuranceSourceFile {
    return {
      classification: "code_metadata",
      exportedSymbols: [
        {
          endColumn: 1,
          endLine: 1,
          kind,
          name,
          startColumn: 1,
          startLine: 1,
        },
      ],
      path,
      source: "",
    };
  }

  it("links a requirement to the single file declaring the symbol it names", async () => {
    const { files } = await scannedRepository(FIXTURE_ROOT);
    const links = requirementImplementationLinks({ files });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      documentPath: "docs/adr/ADR-001-session-timeout.md",
      method: "symbol-owner",
      symbol: "isSessionExpired",
      targetPath: "src/session.ts",
      tier: "reference",
    });
    // The ceiling is the point: a requirement naming a symbol is intent,
    // not an execution, so it can never reach a verified grade (ADR-001).
    expect(links.every(({ confidence }) => confidence <= 0.6)).toBe(true);
    expect(links.every(({ tier }) => tier === "reference")).toBe(true);
  });

  it("refuses a symbol two files declare", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/auth.md",
        source:
          "# Auth\n\n- [ ] REQ-1: sessions expire through `isSessionExpired`.\n- [ ] REQ-2: tokens rotate through `rotateToken`.\n",
      },
      declaration("src/a.ts", "isSessionExpired"),
      declaration("src/b.ts", "isSessionExpired"),
      declaration("src/tokens.ts", "rotateToken"),
    ];

    // Two owners is not an owner — the same rule the link resolver applies
    // to basename matches, for the same reason.
    expect(
      requirementImplementationLinks({ files }).map(
        ({ identity, targetPath }) => [identity, targetPath],
      ),
    ).toEqual([["REQ-2", "src/tokens.ts"]]);
  });

  it("prefers the declaring file over a barrel that re-exports it", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/auth.md",
        source: "# Auth\n\n- [ ] REQ-1: tokens rotate through `rotateToken`.\n",
      },
      declaration("src/index.ts", "rotateToken", "export"),
      declaration("src/tokens.ts", "rotateToken"),
    ];

    // Counting a re-export as an owner made 503 of this repository's 1,246
    // exported names ambiguous — most of its packages' surface.
    expect(
      requirementImplementationLinks({ files }).map(
        ({ targetPath }) => targetPath,
      ),
    ).toEqual(["src/tokens.ts"]);
  });
});

/**
 * Phase 4, live-scan follow-up (2026-09-06). The matcher could only see
 * camelCase, so a third of the exported vocabulary was invisible to it.
 * Widening what it looks up does not widen what it believes: the ownership
 * rule still decides, and these hold that line.
 */
describe("what a requirement statement can name", () => {
  function declaration(
    path: string,
    name: string,
    kind = "function",
  ): AssuranceSourceFile {
    return {
      classification: "code_metadata",
      exportedSymbols: [
        { endColumn: 1, endLine: 1, kind, name, startColumn: 1, startLine: 1 },
      ],
      path,
      source: "",
    };
  }

  it("sees a PascalCase type and an UPPER_SNAKE constant, not only camelCase", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/api.md",
        source: [
          "# API",
          "",
          "- [ ] REQ-1: every answer carries a `SessionReceipt`.",
          "- [ ] REQ-2: the cap is `MAX_PACK_TOKENS`.",
          "- [ ] REQ-3: tokens rotate through `rotateToken`.",
          "",
        ].join("\n"),
      },
      declaration("src/receipt.ts", "SessionReceipt", "interface"),
      declaration("src/budget.ts", "MAX_PACK_TOKENS", "variable"),
      declaration("src/tokens.ts", "rotateToken"),
    ];

    expect(
      requirementImplementationLinks({ files })
        .map(({ identity, symbol, targetPath }) => [
          identity,
          symbol,
          targetPath,
        ])
        .sort(),
    ).toEqual([
      ["REQ-1", "SessionReceipt", "src/receipt.ts"],
      ["REQ-2", "MAX_PACK_TOKENS", "src/budget.ts"],
      ["REQ-3", "rotateToken", "src/tokens.ts"],
    ]);
  });

  it("still refuses a name two files declare, whatever its shape", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/api.md",
        source: "# API\n\n- [ ] REQ-1: answers carry a `SessionReceipt`.\n",
      },
      declaration("src/a.ts", "SessionReceipt", "interface"),
      declaration("src/b.ts", "SessionReceipt", "interface"),
    ];

    // Looking a name up is not believing it. Two owners is still no owner.
    expect(requirementImplementationLinks({ files })).toEqual([]);
  });

  it("treats a backticked span as one name rather than its word pieces", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/api.md",
        source: "# API\n\n- [ ] REQ-1: the cap is `REQ_TIMEOUT_MS`.\n",
      },
      declaration("src/limits.ts", "REQ_TIMEOUT_MS", "variable"),
    ];

    expect(
      requirementImplementationLinks({ files }).map(({ symbol }) => symbol),
    ).toEqual(["REQ_TIMEOUT_MS"]);
  });

  it("names nothing when the statement is prose about behaviour", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/product.md",
        source:
          "# Product\n\n- [ ] REQ-1: 사용자가 푸시하면 서버가 자동으로 분석한다.\n",
      },
      declaration("src/scan.ts", "runRepositoryScan"),
    ];

    // The live-scan finding, as a test: 60 of this repository's 99
    // requirements are prose like this, and no widening of the lookup
    // reaches them. Coverage on such a corpus is honest and near-zero.
    expect(requirementImplementationLinks({ files })).toEqual([]);
  });
});

describe("capitalised English is not a type name", () => {
  function declaration(
    path: string,
    name: string,
    kind = "function",
  ): AssuranceSourceFile {
    return {
      classification: "code_metadata",
      exportedSymbols: [
        { endColumn: 1, endLine: 1, kind, name, startColumn: 1, startLine: 1 },
      ],
      path,
      source: "",
    };
  }

  it("refuses a one-word capital that is also an exported type", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/ui.md",
        source: "# UI\n\n- [ ] REQ-1: Theme toggle and persistence.\n",
      },
      declaration("apps/web/lib/theme/tokens.ts", "Theme", "type"),
    ];

    // The live scan produced exactly this edge before the two-hump rule.
    // A heading is not a reference, and a wrong edge costs more than a
    // missing one — the rule `symbolOwners` already states.
    expect(requirementImplementationLinks({ files })).toEqual([]);
  });

  it("cannot use backticks as the signal, because the parse removes them", () => {
    const files: AssuranceSourceFile[] = [
      {
        classification: "spec",
        exportedSymbols: [],
        path: "spec/ui.md",
        source: "# UI\n\n- [ ] REQ-1: every surface reads `Theme`.\n",
      },
      declaration("apps/web/lib/theme/tokens.ts", "Theme", "type"),
    ];

    // Marking a name as code would be the cleanest signal there is, and it
    // is gone by the time the matcher sees the statement: inline code is
    // rendered to plain text, so `Theme` and Theme arrive identical. On the
    // live repository 1 of 99 statements still held a backtick, and that
    // one was unbalanced. This test exists so nobody adds a backtick branch
    // that silently matches nothing.
    expect(requirementImplementationLinks({ files })).toEqual([]);
  });
});
