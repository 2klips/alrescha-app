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
  type StoredArtifact,
} from "./analysis-job";
import type { ClaimedJob } from "./queue";

const COMMIT = "a".repeat(40);

/** One unfulfilled task naming a symbol nothing exports — a drift the
    deterministic rules must report as `missing-implementation`. */
const SPEC = `# Authentication

## Session

- [ ] REQ-AUTH-001: The app MUST issue sessions through \`createSession\`.
`;

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
    exportedSymbols: [],
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
];

interface Recorded {
  delta: FindingsDelta | null;
  digest: string | null;
  findings: readonly PersistedFinding[];
  read: string[];
  statement: InTotoStatement | null;
}

function fakeStore(options: { openFingerprints?: readonly string[] } = {}) {
  const recorded: Recorded = {
    delta: null,
    digest: null,
    findings: [],
    read: [],
    statement: null,
  };
  const wasOpen = new Set(options.openFingerprints ?? []);

  const store: AnalysisJobStore = {
    loadArtifacts: async () => ARTIFACTS,
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
  options: { openFingerprints?: readonly string[] } = {},
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
      expect(finding.sourceNodeId).toBe("node-spec");
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
