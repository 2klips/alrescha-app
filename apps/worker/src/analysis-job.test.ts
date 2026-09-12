import {
  digestInTotoStatement,
  verifyInTotoStatement,
  type InTotoStatement,
} from "@alrescha/core";
import { describe, expect, it } from "vitest";

import {
  createAnalysisJobHandler,
  type AnalysisJobStore,
  type CiEvidenceCollector,
  type FindingsDelta,
  type PersistedFinding,
  type PersistedImplementsEdge,
  type PersistedRequirement,
  type StoredArtifact,
} from "./analysis-job";
import type { PersistedEvidence, PersistedEvidenceEdge } from "./ci-evidence";
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
  ciEdges: readonly PersistedEvidenceEdge[];
  ciEvidence: readonly PersistedEvidence[];
  delta: FindingsDelta | null;
  digest: string | null;
  findings: readonly PersistedFinding[];
  implementsEdges: readonly PersistedImplementsEdge[];
  /** What `publishAnalyzedCommit` received, and whether the receipt preceded it. */
  published: { afterReceipt: boolean; commitSha: string } | null;
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
    ciEdges: [],
    ciEvidence: [],
    delta: null,
    digest: null,
    findings: [],
    implementsEdges: [],
    published: null,
    read: [],
    requirements: [],
    statement: null,
  };
  const wasOpen = new Set(options.openFingerprints ?? []);

  const store: AnalysisJobStore = {
    loadArtifacts: async () => ARTIFACTS,
    loadTestedPaths: async () => options.testedPaths ?? [],
    latestReceiptDigest: async () => null,
    publishAnalyzedCommit: async ({ commitSha }) => {
      // Ordered after the receipt: what the basis promises.
      recorded.published = {
        afterReceipt: recorded.digest !== null,
        commitSha,
      };
    },
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
    reconcileCiEvidence: async ({ edges, evidence }) => {
      recorded.ciEdges = edges;
      recorded.ciEvidence = evidence;
      return {
        removed: 0,
        supporting: evidence.filter((row) => row.verdict === "supports").length,
        written: evidence.length,
      };
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
    collectCiEvidence?: CiEvidenceCollector;
    openFingerprints?: readonly string[];
    testedPaths?: readonly string[];
  } = {},
): Promise<Recorded> {
  const { recorded, store } = fakeStore(options);
  const handler = createAnalysisJobHandler({
    ...(options.collectCiEvidence
      ? { collectCiEvidence: options.collectCiEvidence }
      : {}),
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
    // The analysis publishes the commit it covered, after the receipt — so
    // `analysis: current` on the basis means every row above exists
    // (remedy S6 left the analyze side of the publish unwritten; Wave C
    // todo 16 needs it for the progress to ever read "done").
    expect(recorded.published).toEqual({
      afterReceipt: true,
      commitSha: COMMIT,
    });
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

  it("refuses the null sha before reading a body or touching the store", async () => {
    // A deleted branch's push carries Git's null id as its commit. At that
    // "commit" every body read is a 404, which reads as "file vanished" —
    // so the old handler did not fail: it dropped every document and test,
    // superseded every requirement, resolved every finding and wrote a
    // receipt for a commit that does not exist.
    const { recorded, store } = fakeStore({
      openFingerprints: ["missing-implementation:spec/auth.md:5:3"],
    });
    const handler = createAnalysisJobHandler({
      readSource: async ({ path }) => {
        recorded.read.push(path);
        return null;
      },
      store,
    });

    await expect(
      handler(
        { ...job(), payload: { commitSha: "0".repeat(40) } },
        { heartbeat: async () => true },
      ),
    ).rejects.toThrow(/no valid commitSha/);
    expect(recorded.read).toEqual([]);
    expect(recorded.delta).toBeNull();
    expect(recorded.statement).toBeNull();
  });
});

/**
 * CI evidence (Phase 4 Wave C todo 18, D12).
 *
 * `ingestCiTestReports` has parsed Actions artifacts since Phase 2C and
 * nothing ever wrote a row, so the `verified` grade the map reads for was
 * unreachable in production. What the tests below pin is not the parsing —
 * `tests/ci-evidence.test.ts` owns that — but which claims are allowed to
 * carry the grade, and what happens when there is no CI at all.
 */
describe("analyze job — CI evidence", () => {
  const passingRun = {
    checkRuns: [
      {
        conclusion: "success",
        head_sha: COMMIT,
        name: "test",
        status: "completed",
      },
    ],
    coverage: [],
    reports: [
      {
        artifactId: 7001,
        artifactName: "test-results",
        content: JSON.stringify({
          success: true,
          testResults: [
            {
              assertionResults: [
                {
                  fullName: "REQ-AUTH-002 rotates tokens",
                  status: "passed",
                  title: "rotates tokens",
                },
              ],
              name: "/home/runner/work/app/app/tests/auth.test.ts",
              status: "passed",
            },
          ],
        }),
        format: "vitest-json" as const,
        headSha: COMMIT,
      },
    ],
  };

  it("writes nothing at all when no collector is wired", async () => {
    const recorded = await run();

    // The state most repositories are in. No evidence is the honest answer,
    // and it is what keeps a scan-only workspace free of `verified` nodes.
    expect(recorded.ciEvidence).toEqual([]);
    expect(recorded.ciEdges).toEqual([]);
  });

  it("writes nothing when the repository has no CI to collect", async () => {
    const recorded = await run({ collectCiEvidence: async () => null });

    expect(recorded.ciEvidence).toEqual([]);
  });

  /**
   * A throttled API, a revoked token, an expired artifact: none of them is a
   * defect in the repository being analysed, and failing the job over one
   * would replace a missing grade with a missing analysis.
   */
  it("analyses anyway when collection throws", async () => {
    const recorded = await run({
      collectCiEvidence: async () => {
        throw new Error("GitHub CI evidence request failed: 403");
      },
    });

    expect(recorded.ciEvidence).toEqual([]);
    expect(recorded.statement).not.toBeNull();
    expect(recorded.findings.length).toBeGreaterThan(0);
  });

  it("grades the test file that ran and the requirement it names", async () => {
    const recorded = await run({
      collectCiEvidence: async () => passingRun,
    });

    expect(recorded.ciEvidence).toHaveLength(1);
    const [evidence] = recorded.ciEvidence;
    expect(evidence).toMatchObject({
      kind: "test",
      // Anchored on the repository path, resolved out of the CI machine's.
      sourceArtifactId: "node-test",
      verdict: "supports",
    });
    expect(evidence?.label).toContain("tests/auth.test.ts");

    const relations = recorded.ciEdges.map(({ relation }) => relation).sort();
    expect(relations).toEqual(["supports", "tests"]);
    // The test file ran: a direct claim.
    expect(
      recorded.ciEdges.find(({ relation }) => relation === "tests")
        ?.targetNodeId,
    ).toBe("node-test");
    // …and the requirement its name claims, pointing at the node this same
    // analysis wrote rather than at the REQ string.
    const requirementNodeId = recorded.requirements.find(
      ({ label }) => label === "REQ-AUTH-002",
    )?.id;
    expect(requirementNodeId).toBeTruthy();
    expect(
      recorded.ciEdges.find(({ relation }) => relation === "supports")
        ?.targetNodeId,
    ).toBe(requirementNodeId);
  });

  /**
   * ADR-001, stated as an edge that is not written. The scan derives
   * file→file `tests` edges from imports; they say a test file imports a
   * source file, not that the run executed it. Promoting `src/auth.ts` here
   * would be inference wearing an execution grade.
   */
  it("does not promote the code under the test", async () => {
    const recorded = await run({
      collectCiEvidence: async () => passingRun,
      testedPaths: ["src/auth.ts"],
    });

    for (const edge of recorded.ciEdges) {
      expect(edge.targetNodeId).not.toBe("node-code");
    }
  });

  it("records a report that did not verify without a supporting verdict", async () => {
    const recorded = await run({
      collectCiEvidence: async () => ({
        ...passingRun,
        // No successful check run for the analysed commit.
        checkRuns: [],
      }),
    });

    expect(recorded.ciEvidence).toHaveLength(1);
    expect(recorded.ciEvidence[0]?.verdict).toBe("unknown");
    expect(recorded.ciEvidence[0]?.metadata).toMatchObject({
      grade: "inferred",
    });
    // The rows exist, and the map promotes nothing from them.
    expect(recorded.ciEdges.every(({ confidence }) => confidence < 1)).toBe(
      true,
    );
  });

  /**
   * Coverage is measurement, not support: it says a file was executed, which
   * is what separates "not covered" from "never measured" (todo 21). It gets
   * an `unknown` verdict and no edge, so nothing is graded by it.
   */
  it("records coverage as measurement, with no edge and no number", async () => {
    const recorded = await run({
      collectCiEvidence: async () => ({
        checkRuns: [],
        coverage: [
          {
            artifactId: 7003,
            artifactName: "coverage",
            content:
              "SF:/home/runner/work/app/app/src/audit.ts\nLH:0\nend_of_record\n",
            format: "lcov" as const,
            headSha: COMMIT,
          },
        ],
        reports: [],
      }),
    });

    expect(recorded.ciEvidence).toHaveLength(1);
    expect(recorded.ciEvidence[0]).toMatchObject({
      kind: "ci",
      sourceArtifactId: "node-audit",
      verdict: "unknown",
    });
    expect(recorded.ciEdges).toEqual([]);
    // Measured, with no hit count to be read as a grade.
    expect(JSON.stringify(recorded.ciEvidence[0]?.metadata)).not.toMatch(/LH/);
  });

  it("ignores a report naming a file this repository does not have", async () => {
    const recorded = await run({
      collectCiEvidence: async () => ({
        ...passingRun,
        reports: [
          {
            ...passingRun.reports[0]!,
            content: JSON.stringify({
              success: true,
              testResults: [
                {
                  assertionResults: [
                    {
                      fullName: "REQ-AUTH-002 elsewhere",
                      status: "passed",
                      title: "elsewhere",
                    },
                  ],
                  name: "/somewhere/else/other.test.ts",
                  status: "passed",
                },
              ],
            }),
          },
        ],
      }),
    });

    // No node to anchor it to, so no row — never a dangling one.
    expect(recorded.ciEvidence).toEqual([]);
  });
});

/**
 * The bodies as one archive (PR #9 follow-up, 2026-09-12). The job says how
 * many it is about to read before the first one, so the worker can decide
 * whether one archive request beats that many per-file reads, and drops
 * them when the reads are done — landed or not.
 */
describe("analyze job and prepared sources", () => {
  it("announces the read count before the first read, and releases after the last", async () => {
    const { recorded, store } = fakeStore();
    const events: string[] = [];
    const handler = createAnalysisJobHandler({
      prepareSources: async (input) => {
        events.push(`prepare ${input.reads} @${input.commitSha.slice(0, 7)}`);
        expect(input).toMatchObject({
          repositoryFullName: "2klips/alrescha-app",
          repositoryId: "repository-1",
          workspaceId: "workspace-1",
        });
        return () => {
          events.push("release");
        };
      },
      readSource: async ({ path }) => {
        events.push(`read ${path}`);
        recorded.read.push(path);
        return path.endsWith(".md") ? SPEC : "";
      },
      store,
    });

    await handler(job(), { heartbeat: async () => true });

    // Two of the four artifacts are read (the spec and the test file).
    expect(events).toEqual([
      "prepare 2 @aaaaaaa",
      "read spec/auth.md",
      "read tests/auth.test.ts",
      "release",
    ]);
  });

  it("releases the sources when a read fails, so the retry starts clean", async () => {
    const { store } = fakeStore();
    let released = false;
    const handler = createAnalysisJobHandler({
      prepareSources: async () => () => {
        released = true;
      },
      readSource: async () => {
        throw new Error("GitHub repository request failed: 403 forbidden");
      },
      store,
    });

    await expect(
      handler(job(), { heartbeat: async () => true }),
    ).rejects.toThrow("403 forbidden");
    expect(released).toBe(true);
  });
});
