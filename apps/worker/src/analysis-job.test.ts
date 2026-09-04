import {
  digestInTotoStatement,
  verifyInTotoStatement,
  type InTotoStatement,
} from "@alrescha/core";
import { describe, expect, it } from "vitest";

import {
  createAnalysisJobHandler,
  type AnalysisJobStore,
  type FindingsDelta,
  type PersistedFinding,
  type PersistedImplementsEdge,
  type PersistedRequirement,
  type StoredArtifact,
} from "./analysis-job";
import type { ClaimedJob } from "./queue";

const COMMIT = "a".repeat(40);

/**
 * One unfulfilled task naming a symbol nothing exports — a drift the
 * deterministic rules must report as `missing-implementation` — and one
 * checked task naming a symbol `src/auth.ts` does export, which is both an
 * `implements` edge and a `missing-test` finding anchored on that file.
 */
const SPEC = `# Authentication

## Session

- [ ] REQ-AUTH-001: The app MUST issue sessions through \`createSession\`.
- [x] REQ-AUTH-002: The app MUST rotate tokens through \`rotateToken\`.
`;

function symbol(name: string, line: number) {
  return {
    endColumn: 1,
    endLine: line,
    kind: "function",
    name,
    startColumn: 1,
    startLine: line,
  };
}

const ARTIFACTS: readonly StoredArtifact[] = [
  {
    classification: "spec",
    digest: "1".repeat(64),
    exportedSymbols: [],
    nodeId: "node-spec",
    path: "spec/auth.md",
  },
  {
    classification: "code_metadata",
    digest: "2".repeat(64),
    exportedSymbols: [symbol("rotateToken", 12)],
    nodeId: "node-code",
    path: "src/auth.ts",
  },
  {
    classification: "code_metadata",
    digest: "3".repeat(64),
    exportedSymbols: [],
    nodeId: "node-test",
    path: "tests/auth.test.ts",
  },
  {
    // Exported, and no test names it: the `untested-code` rule's case.
    classification: "code_metadata",
    digest: "4".repeat(64),
    exportedSymbols: [symbol("recordAudit", 4)],
    nodeId: "node-audit",
    path: "src/audit.ts",
  },
];

interface Recorded {
  delta: FindingsDelta | null;
  digest: string | null;
  findings: readonly PersistedFinding[];
  implementsEdges: readonly PersistedImplementsEdge[];
  read: string[];
  requirements: readonly PersistedRequirement[];
  statement: InTotoStatement | null;
}

function fakeStore(
  options: {
    openFingerprints?: readonly string[];
    testedPaths?: readonly string[];
  } = {},
) {
  const recorded: Recorded = {
    delta: null,
    digest: null,
    findings: [],
    implementsEdges: [],
    read: [],
    requirements: [],
    statement: null,
  };
  const wasOpen = new Set(options.openFingerprints ?? []);

  const store: AnalysisJobStore = {
    loadArtifacts: async () => ARTIFACTS,
    loadTestedPaths: async () => options.testedPaths ?? [],
    latestReceiptDigest: async () => null,
    recordReceipt: async ({ delta, digest, statement }) => {
      recorded.delta = delta;
      recorded.digest = digest;
      recorded.statement = statement;
      return "receipt-1";
    },
    repositoryFullName: async () => "2klips/alrescha-app",
    reconcileFindings: async ({ findings }) => {
      recorded.findings = findings;
      const fingerprints = findings.map(({ fingerprint }) => fingerprint);
      const delta: FindingsDelta = {
        openTotal: fingerprints.length,
        opened: fingerprints.filter((value) => !wasOpen.has(value)),
        resolved: [...wasOpen].filter((value) => !fingerprints.includes(value)),
      };
      return delta;
    },
    reconcileRequirements: async ({ implementsEdges, requirements }) => {
      recorded.implementsEdges = implementsEdges;
      recorded.requirements = requirements;
      return { active: requirements.length, superseded: 0 };
    },
  };
  return { recorded, store };
}

function job(): ClaimedJob {
  return {
    attemptCount: 0,
    creditCost: 0,
    id: "job-1",
    kind: "analyze",
    maxAttempts: 3,
    payload: { commitSha: COMMIT },
    repositoryId: "repository-1",
    runId: "run-1",
    workspaceId: "workspace-1",
  };
}

async function run(
  options: {
    openFingerprints?: readonly string[];
    testedPaths?: readonly string[];
  } = {},
): Promise<Recorded> {
  const { recorded, store } = fakeStore(options);
  const handler = createAnalysisJobHandler({
    readSource: async ({ path }) => {
      recorded.read.push(path);
      return path.endsWith(".md") ? SPEC : "";
    },
    store,
  });
  await handler(job(), { heartbeat: async () => true });
  return recorded;
}

describe("analyze job", () => {
  it("fetches bodies only for the files the rules read", async () => {
    const recorded = await run();

    // The spec is span-sliced and the test file is scanned for requirement ids.
    // `src/auth.ts` is judged from stored symbols, so its body is never fetched
    // — on a real repository that is the difference between tens of requests
    // and hundreds.
    expect(recorded.read.sort()).toEqual([
      "spec/auth.md",
      "tests/auth.test.ts",
    ]);
  });

  it("persists findings under the engine's deterministic fingerprint", async () => {
    const recorded = await run();

    expect(recorded.findings.length).toBeGreaterThan(0);
    for (const finding of recorded.findings) {
      // `<type>:<path>:<line>:<column>` — stable across runs, which is what
      // lets a re-analysis update instead of duplicate.
      expect(finding.fingerprint).toMatch(/^[a-z-]+:.+:\d+:\d+$/);
      expect(finding.title.length).toBeGreaterThan(0);
      // The source node is whichever node's span raised it: the spec for the
      // document rules, the code file itself for `untested-code`.
      expect(finding.sourceNodeId).toBe(
        finding.kind === "untested-code" ? "node-audit" : "node-spec",
      );
      expect(finding.provenance).toMatchObject({
        reason: expect.stringMatching(/\S/),
      });
    }
    expect(recorded.delta?.opened).toEqual(
      recorded.findings.map(({ fingerprint }) => fingerprint),
    );
  });

  it("reports findings that no longer reproduce as resolved", async () => {
    const recorded = await run({ openFingerprints: ["stale-doc:gone.md:1:1"] });

    expect(recorded.delta?.resolved).toEqual(["stale-doc:gone.md:1:1"]);
    expect(recorded.delta?.opened).not.toContain("stale-doc:gone.md:1:1");
  });

  it("issues a receipt whose digest verifies against its own statement", async () => {
    const recorded = await run();
    const statement = recorded.statement!;

    expect(statement.predicate.commitSha).toBe(COMMIT);
    expect(statement.predicate.repository).toBe("2klips/alrescha-app");
    expect(statement.predicate.runId).toBe("run-1");
    expect(statement.predicate.previousReceiptDigest).toBeNull();
    // The production predicate carries the WORK_SPEC §13 reserved fields.
    expect(statement.predicateType).toBe(
      "https://arr-app-web.vercel.app/receipt/v1",
    );
    expect(statement.predicate.tool).toEqual({
      name: "alrescha",
      version: "0.1.0",
    });
    expect(Date.parse(statement.predicate.analyzedAt)).not.toBeNaN();
    expect(statement.predicate.coverage).toMatchObject({
      implVerified: expect.any(Number),
      requirements: expect.any(Number),
      testVerified: expect.any(Number),
    });
    // The analyzed commit leads the subjects under its canonical name, then
    // every scanned artifact with the digest the scan stored.
    expect(statement.subject[0]).toEqual({
      digest: { sha1: COMMIT },
      name: "git:commit",
    });
    expect(statement.subject.slice(1).map(({ name }) => name)).toEqual(
      ARTIFACTS.map(({ path }) => path),
    );

    expect(recorded.digest).toBe(await digestInTotoStatement(statement));
    await expect(
      verifyInTotoStatement(statement, recorded.digest!),
    ).resolves.toMatchObject({ state: "verified" });
  });

  it("detects a tampered statement against the stored digest", async () => {
    const recorded = await run();
    const tampered = {
      ...recorded.statement!,
      predicate: {
        ...recorded.statement!.predicate,
        commitSha: "b".repeat(40),
      },
    };

    await expect(
      verifyInTotoStatement(tampered, recorded.digest!),
    ).resolves.toMatchObject({ state: "tampered" });
  });

  it("persists the extracted requirements as graph rows with content-derived ids", async () => {
    const recorded = await run();

    // The spec's tasks are requirements; each lands keyed to its source
    // artifact with the REQ code as identity (OQ-023 ⑴).
    expect(recorded.requirements.map(({ label }) => label)).toEqual([
      "REQ-AUTH-001",
      "REQ-AUTH-002",
    ]);
    const [requirement] = recorded.requirements;
    expect(requirement).toMatchObject({
      label: "REQ-AUTH-001",
      origin: "task",
      sourceArtifactId: "node-spec",
      sourceSpan: { endLine: 5, path: "spec/auth.md", startLine: 5 },
    });
    expect(requirement!.statement).toContain("REQ-AUTH-001");
    expect(requirement!.id).toMatch(/^0[0-9A-HJKMNP-TV-Z]{25}$/);
    // Re-analysis converges: the same document yields the same id.
    const again = await run();
    expect(again.requirements[0]?.id).toBe(requirement!.id);
  });

  it("links a requirement to the file owning the symbol it names", async () => {
    const recorded = await run();

    // Requirement nodes carried no edge at all before Phase 4 Wave A todo 1,
    // which is why requirement coverage read 0% over 99 requirements.
    const rotate = recorded.requirements.find(
      ({ label }) => label === "REQ-AUTH-002",
    );
    expect(recorded.implementsEdges).toEqual([
      {
        confidence: 0.6,
        provenance: {
          method: "symbol-owner",
          reason: expect.stringContaining("rotateToken"),
          sourceArtifactId: "node-spec",
          span: { endLine: 6, path: "spec/auth.md", startLine: 6 },
          symbol: "rotateToken",
          tier: "reference",
        },
        requirementId: rotate!.id,
        targetNodeId: "node-code",
      },
    ]);
    // `reference`, never `resolved` and never an evidence grade: naming a
    // symbol is a name match, not an execution (WORK_SPEC §3-1).
    expect(
      recorded.implementsEdges.every(({ confidence }) => confidence <= 0.6),
    ).toBe(true);
    expect(JSON.stringify(recorded.implementsEdges)).not.toContain("verified");
  });

  it("anchors findings to the code file each rule can name", async () => {
    const recorded = await run();
    const byKind = new Map(
      recorded.findings.map((finding) => [finding.kind, finding]),
    );

    // Every finding used to hang off a document node, so a repository whose
    // risk lives in code had an empty risk view (R5 §2.2 D8).
    expect(byKind.get("missing-test")).toMatchObject({
      sourceNodeId: "node-spec",
      targetNodeId: "node-code",
    });
    expect(byKind.get("untested-code")).toMatchObject({
      sourceNodeId: "node-audit",
      targetNodeId: "node-audit",
    });
    // REQ-AUTH-001 names a symbol nothing exports: no file can be named
    // without guessing, so none is.
    expect(byKind.get("missing-implementation")).toMatchObject({
      sourceNodeId: "node-spec",
      targetNodeId: null,
    });
  });

  it("takes the tests relation the scan stored as coverage", async () => {
    const covered = await run({ testedPaths: ["src/audit.ts"] });

    // A test that imports the file without sharing its name is still
    // coverage — that edge is exactly what todo 0 derived.
    expect(covered.findings.map(({ kind }) => kind)).not.toContain(
      "untested-code",
    );
  });

  it("refuses to issue a receipt when no artifact has been stored", async () => {
    const { store } = fakeStore();
    const handler = createAnalysisJobHandler({
      readSource: async () => "",
      store: { ...store, loadArtifacts: async () => [] },
    });

    // A receipt over nothing would be an assurance about nothing.
    await expect(
      handler(job(), { heartbeat: async () => true }),
    ).rejects.toThrow(/has not applied its plan/);
  });
});
