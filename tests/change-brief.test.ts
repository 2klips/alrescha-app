import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHANGE_BRIEF_CONSUMER_CAP,
  InMemoryMcpStore,
  createHostedMcpEndpoint,
  prepareChange,
} from "../packages/mcp/src/index";
import type {
  McpArtifactData,
  McpEdgeData,
  McpRepositoryData,
  McpWorkspaceData,
} from "../packages/mcp/src/index";

/**
 * RE-03 ⑶b — the change brief, on the one path that already names a target.
 *
 * The defect this closes: `ChangeBrief` handed back `dependencyImpact` and
 * nothing else, and that type's `complete` reports only whether the *walk*
 * ran out of graph. A capped table and a relation outside the vocabulary are
 * invisible to it, so a brief built on a truncated read said `complete: true`
 * and an agent concluded a change was safe because it could not see what it
 * would break. `bound`, `boundReasons` and `confidence` were computed by
 * `impactOf` and thrown away; they travel now.
 *
 * Why `get_artifact` and not the context pack: the contract's first candidate
 * was to expand whichever code card the pack had already chosen. Measured on
 * this repository (998 artifacts, 12 task descriptions, three budgets) the
 * pack's `codeCards` was never exactly one — 33 of 36 runs saturated the
 * 20-card cap and 3 returned none, with an identical first path for every
 * task. A selector that cannot name a target cannot carry a brief.
 */

const WORKSPACE = "01K300000000000000000000W1";
const OTHER_WORKSPACE = "01K300000000000000000000W2";
const USER = "10000000-0000-4000-8000-000000000001";
const OTHER_USER = "10000000-0000-4000-8000-000000000002";
const REPO_A = "01K300000000000000000000R1";
const REPO_B = "01K300000000000000000000R2";
const CODE = "01K300000000000000000000A1";
const TEST = "01K300000000000000000000A2";
const CODE_B = "01K300000000000000000000B1";
const BLOB = "a".repeat(40);
const OLDER = "b".repeat(40);
const COMMIT = "c".repeat(40);

const CURRENT = {
  grade: "inferred" as const,
  sourceBlobSha: BLOB,
  state: "current" as const,
  text: "Session expiry helpers.",
};
const STALE = {
  currentBlobSha: BLOB,
  sourceBlobSha: OLDER,
  state: "stale" as const,
  text: "the description of an older version",
};

function edge(
  relation: string,
  source: string,
  target: string,
  id = `${source}-${relation}-${target}`,
): McpEdgeData {
  return {
    confidence: 1,
    family: relation === "tests" ? "evidence" : "structure",
    id,
    provenance: {
      method: relation === "imports" ? "import-binding" : null,
      reason: relation === "imports" ? null : "fixture",
      span: null,
    },
    relation: relation as McpEdgeData["relation"],
    sourceNodeId: source,
    targetNodeId: target,
    tier: "resolved",
  };
}

function artifact(
  id: string,
  path: string,
  summaryState?: McpArtifactData["summaryState"],
  blobSha: string | undefined = BLOB,
): McpArtifactData {
  return {
    ...(blobSha === undefined ? {} : { blobSha }),
    content: "",
    headings: [],
    id,
    kind: "code_metadata",
    path,
    status: "active",
    summary: "",
    ...(summaryState ? { summaryState } : {}),
    symbols: path === "src/session.ts" ? ["isSessionExpired"] : [],
    tags: [],
    title: path,
  };
}

function repository(input: {
  readonly artifacts: McpArtifactData[];
  readonly edges: McpEdgeData[];
  readonly fullName: string;
  readonly id: string;
  readonly withBasis: boolean;
}): McpRepositoryData {
  return {
    artifacts: input.artifacts,
    ...(input.withBasis
      ? {
          basis: {
            analyzedCommit: COMMIT,
            dataRevision: 42,
            graphGeneration: null,
            indexedCommit: COMMIT,
            repositoryId: input.id,
            stages: {
              analysis: "current" as const,
              structure: "ready" as const,
            },
          },
        }
      : {}),
    contextPacks: [],
    defaultBranch: "main",
    edges: input.edges,
    evidence: [],
    findings: [],
    fullName: input.fullName,
    id: input.id,
    indexEntries: [],
    overview: "brief fixture",
    receipts: [],
    requirements: [],
  };
}

/** One repository: the target, a test that imports it, a read basis. */
function healthy(
  summaryState: McpArtifactData["summaryState"] = CURRENT,
): McpWorkspaceData {
  return {
    id: WORKSPACE,
    ownerUserId: USER,
    repositories: [
      repository({
        artifacts: [
          artifact(CODE, "src/session.ts", summaryState),
          artifact(TEST, "tests/session.test.ts"),
        ],
        edges: [edge("tests", TEST, CODE), edge("imports", TEST, CODE)],
        fullName: "2klips/alrescha-app",
        id: REPO_A,
        withBasis: true,
      }),
    ],
  };
}

describe("the change brief, composed", () => {
  it("states the commit and revision it stands on", () => {
    const brief = prepareChange(healthy(), { path: "src/session.ts" });
    expect(brief.basis).toMatchObject({
      analyzedCommit: COMMIT,
      available: true,
      dataRevision: 42,
      // Typed null at the source: no immutable generation exists to name.
      graphGeneration: null,
      repositoryFullName: "2klips/alrescha-app",
    });
    expect(brief.target).toMatchObject({
      ambiguous: false,
      freshness: "current",
      nodeId: CODE,
      path: "src/session.ts",
      sourceDigest: BLOB,
    });
  });

  it("says it has no basis rather than inventing one", () => {
    const workspace = healthy();
    const [repo] = workspace.repositories;
    if (!repo) throw new Error("fixture");
    const withoutBasis: McpRepositoryData = { ...repo };
    delete withoutBasis.basis;
    const brief = prepareChange(
      { ...workspace, repositories: [withoutBasis] },
      { path: "src/session.ts" },
    );
    expect(brief.basis.available).toBe(false);
    expect(brief.basis).toHaveProperty("reason");
    // No commit key at all — an absent value is not a null-shaped one.
    expect(brief.basis).not.toHaveProperty("analyzedCommit");
  });

  it("reports no digest when the row stored none", () => {
    const workspace = healthy();
    const [repo] = workspace.repositories;
    if (!repo) throw new Error("fixture");
    const brief = prepareChange(
      {
        ...workspace,
        repositories: [
          {
            ...repo,
            // The hosted decoder writes "" when the column is null.
            artifacts: [
              artifact(CODE, "src/session.ts", CURRENT, ""),
              artifact(TEST, "tests/session.test.ts"),
            ],
          },
        ],
      },
      { path: "src/session.ts" },
    );
    expect(brief.target.sourceDigest).toBeNull();
  });

  it("carries the evidence grade and the bound, not just the walk", () => {
    const brief = prepareChange(healthy(), { path: "src/session.ts" });
    expect(brief.consumers?.bound).toBe("exact");
    expect(brief.consumers?.boundReasons).toEqual([]);
    expect(brief.consumers?.confidence).toMatchObject({
      agent_asserted: 0,
      resolved: 1,
    });
    // The fields the old brief carried are still there, unrenamed.
    expect(brief.consumers?.complete).toBe(true);
    expect(brief.consumers?.candidates.map(({ nodeId }) => nodeId)).toEqual([
      TEST,
    ]);
    expect(brief.consumers?.relatedTests).toEqual([TEST]);
  });

  it("calls a truncated read a floor, where the walk alone called it whole", () => {
    const base = healthy();
    const [repo] = base.repositories;
    if (!repo) throw new Error("fixture");
    const brief = prepareChange(
      {
        ...base,
        coverage: {
          readConsistency: "unproven",
          result: "partial",
          truncated: [{ limit: 2_000, table: "edges" }],
        },
        repositories: [
          {
            ...repo,
            edgeOmissions: [
              {
                count: 12,
                reason: "the directory hierarchy is excluded",
                relation: "contains",
              },
            ],
          },
        ],
      },
      { path: "src/session.ts" },
    );

    // This is the defect, pinned: the walk ran out of graph, so `complete`
    // is true and `stoppedBy` is null — and the answer is still a floor,
    // because the rows behind it were short.
    expect(brief.consumers?.complete).toBe(true);
    expect(brief.consumers?.stoppedBy).toBeNull();
    expect(brief.consumers?.bound).toBe("lower-bound");
    expect(brief.consumers?.boundReasons.join(" ")).toContain(
      "2000-row budget",
    );
    expect(brief.consumers?.boundReasons.join(" ")).toContain("contains");
    expect(brief.omissions).toHaveLength(1);
  });

  it("does not pick between two repositories that answer to one path", () => {
    const brief = prepareChange(
      {
        id: WORKSPACE,
        ownerUserId: USER,
        repositories: [
          repository({
            artifacts: [artifact(CODE, "src/session.ts", CURRENT)],
            edges: [],
            fullName: "2klips/alrescha-app",
            id: REPO_A,
            withBasis: true,
          }),
          repository({
            artifacts: [artifact(CODE_B, "src/session.ts", CURRENT)],
            edges: [],
            fullName: "2klips/other-app",
            id: REPO_B,
            withBasis: true,
          }),
        ],
      },
      { path: "src/session.ts" },
    );
    expect(brief.target.ambiguous).toBe(true);
    expect(brief.target.nodeId).toBeNull();
    expect(brief.target.candidates?.map(({ repositoryId }) => repositoryId)).toEqual(
      [REPO_A, REPO_B],
    );
    // Not computed — which is a different statement from "no consumers".
    expect(brief.consumers).toBeNull();
    expect(brief.missing.join(" ")).toContain("name one");
  });

  it("reports stale prose as stale, without re-deriving it", () => {
    const brief = prepareChange(healthy(STALE), { path: "src/session.ts" });
    expect(brief.target.freshness).toBe("stale");
    expect(brief.missing.join(" ")).toContain("older version");
  });

  it("says nothing is stored when the path names nothing", () => {
    const brief = prepareChange(healthy(), { path: "src/nowhere.ts" });
    expect(brief.target.nodeId).toBeNull();
    expect(brief.target.ambiguous).toBe(false);
    expect(brief.consumers).toBeNull();
    expect(brief.missing).toContain("no artifact is stored at this path");
    expect(brief.basis.available).toBe(false);
  });

  it("caps the consumer list and says how many it dropped", () => {
    const many = CHANGE_BRIEF_CONSUMER_CAP + 7;
    const consumers = Array.from({ length: many }, (_, i) =>
      artifact(`01K300000000000000000000C${String(i).padStart(2, "0")}`,
        `src/consumer-${String(i).padStart(2, "0")}.ts`),
    );
    const brief = prepareChange(
      {
        id: WORKSPACE,
        ownerUserId: USER,
        repositories: [
          repository({
            artifacts: [artifact(CODE, "src/session.ts", CURRENT), ...consumers],
            edges: consumers.map((consumer) =>
              edge("imports", consumer.id, CODE),
            ),
            fullName: "2klips/alrescha-app",
            id: REPO_A,
            withBasis: true,
          }),
        ],
      },
      { path: "src/session.ts" },
    );
    expect(brief.consumers?.candidates).toHaveLength(
      CHANGE_BRIEF_CONSUMER_CAP,
    );
    expect(brief.budget.truncatedItems).toEqual([
      { count: many - CHANGE_BRIEF_CONSUMER_CAP, of: "consumers" },
    ]);
    // A capped list is a floor, and says so in the same field as every other
    // reason it might be one.
    expect(brief.consumers?.bound).toBe("lower-bound");
    expect(brief.consumers?.boundReasons.join(" ")).toContain(
      `kept ${CHANGE_BRIEF_CONSUMER_CAP} of ${many}`,
    );
  });

  it("estimates its own size and says the estimate is an approximation", () => {
    const brief = prepareChange(healthy(), { path: "src/session.ts" });
    expect(brief.budget.targetCardTokens).toBeGreaterThan(0);
    expect(brief.budget.briefTokens).toBeGreaterThan(
      brief.budget.targetCardTokens,
    );
    expect(brief.budget.approach).toContain("not a provider's billed count");
  });

  it("carries no source body", () => {
    const workspace = healthy();
    const [repo] = workspace.repositories;
    if (!repo) throw new Error("fixture");
    const withBody = {
      ...workspace,
      repositories: [
        {
          ...repo,
          artifacts: [
            { ...artifact(CODE, "src/session.ts", CURRENT), content: "SECRET_BODY" },
            artifact(TEST, "tests/session.test.ts"),
          ],
        },
      ],
    };
    const brief = prepareChange(withBody, { path: "src/session.ts" });
    expect(JSON.stringify(brief)).not.toContain("SECRET_BODY");
  });
});

describe("get_artifact carries the brief only when asked", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function connect(
    store: InMemoryMcpStore,
    workspaceId = WORKSPACE,
    actorUserId = USER,
  ) {
    const issued = await store.issueAccessToken({
      actorUserId,
      name: "RE-03 03b",
      scopes: ["mcp:read"],
      workspaceId,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const client = new Client(
      { name: "re-03b-test", version: "1.0.0" },
      {
        cachePartition: issued.secret.slice(0, 12),
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("https://mcp.alrescha.test/mcp"),
        {
          authProvider: { token: async () => issued.secret },
          fetch: endpoint.fetch,
        },
      ),
    );
    return client;
  }

  it("omits the key entirely by default", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [healthy()] }),
    );
    const answer = await client.callTool({
      arguments: { path: "src/session.ts" },
      name: "get_artifact",
    });
    const payload = answer.structuredContent as Record<string, unknown>;
    expect(payload).not.toHaveProperty("changeBrief");
    // The existing answer is untouched.
    expect(payload).toHaveProperty("artifact");
    expect(payload).toHaveProperty("card");
    expect(payload).toHaveProperty("neighbors");
  });

  it("attaches it on request, with the bound and the grade", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [healthy()] }),
    );
    const answer = await client.callTool({
      arguments: { include_change_brief: true, path: "src/session.ts" },
      name: "get_artifact",
    });
    const payload = answer.structuredContent as {
      changeBrief: {
        basis: { available: boolean };
        budget: { briefTokens: number };
        consumers: { bound: string; confidence: { resolved: number } };
        target: { freshness: string; nodeId: string; sourceDigest: string };
      };
    };
    expect(payload.changeBrief.target).toMatchObject({
      freshness: "current",
      nodeId: CODE,
      sourceDigest: BLOB,
    });
    expect(payload.changeBrief.consumers.bound).toBe("exact");
    expect(payload.changeBrief.consumers.confidence.resolved).toBe(1);
    expect(payload.changeBrief.basis.available).toBe(true);
    expect(payload.changeBrief.budget.briefTokens).toBeGreaterThan(0);
  });

  it("reads the target once for the answer and the brief together", async () => {
    const store = new InMemoryMcpStore({ workspaces: [healthy()] });
    const spy = vi.spyOn(store, "findArtifacts");
    const client = await connect(store);
    await client.callTool({
      arguments: { include_change_brief: true, path: "src/session.ts" },
      name: "get_artifact",
    });
    // The handler resolves the row and hands that result to the brief; a
    // second lookup would be a second round trip for the same row.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("answers an ambiguous path with the ambiguity, not a guess", async () => {
    const client = await connect(
      new InMemoryMcpStore({
        workspaces: [
          {
            id: WORKSPACE,
            ownerUserId: USER,
            repositories: [
              repository({
                artifacts: [artifact(CODE, "src/session.ts", CURRENT)],
                edges: [],
                fullName: "2klips/alrescha-app",
                id: REPO_A,
                withBasis: true,
              }),
              repository({
                artifacts: [artifact(CODE_B, "src/session.ts", CURRENT)],
                edges: [],
                fullName: "2klips/other-app",
                id: REPO_B,
                withBasis: true,
              }),
            ],
          },
        ],
      }),
    );
    const answer = await client.callTool({
      arguments: { include_change_brief: true, path: "src/session.ts" },
      name: "get_artifact",
    });
    const payload = answer.structuredContent as {
      changeBrief: {
        consumers: unknown;
        target: { ambiguous: boolean; candidates: { repositoryId: string }[] };
      };
    };
    expect(payload.changeBrief.target.ambiguous).toBe(true);
    expect(payload.changeBrief.consumers).toBeNull();
    expect(
      payload.changeBrief.target.candidates.map((c) => c.repositoryId).sort(),
    ).toEqual([REPO_A, REPO_B].sort());
  });

  it("keeps one tenant's brief out of another's workspace", async () => {
    const store = new InMemoryMcpStore({
      workspaces: [
        healthy(),
        {
          id: OTHER_WORKSPACE,
          ownerUserId: OTHER_USER,
          repositories: [
            repository({
              artifacts: [artifact(CODE_B, "src/session.ts", CURRENT)],
              edges: [],
              fullName: "2klips/other-app",
              id: REPO_B,
              withBasis: true,
            }),
          ],
        },
      ],
    });
    const theirs = await connect(store, OTHER_WORKSPACE, OTHER_USER);
    const answer = await theirs.callTool({
      arguments: { include_change_brief: true, path: "src/session.ts" },
      name: "get_artifact",
    });
    const payload = answer.structuredContent as {
      changeBrief: {
        basis: { repositoryId: string };
        target: { nodeId: string };
      };
    };
    expect(payload.changeBrief.target.nodeId).toBe(CODE_B);
    expect(payload.changeBrief.basis.repositoryId).toBe(REPO_B);
    expect(JSON.stringify(payload)).not.toContain(CODE);
  });

  it("does not attach a brief to the multi-id read", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [healthy()] }),
    );
    const answer = await client.callTool({
      arguments: { ids: [CODE, TEST], include_change_brief: true },
      name: "get_artifact",
    });
    const payload = answer.structuredContent as Record<string, unknown>;
    // Four ids are four targets; a brief is about one.
    expect(payload).not.toHaveProperty("changeBrief");
    expect(payload).toHaveProperty("nodes");
  });

  it("keeps the catalogue at 21 tools inside its ratchet", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [healthy()] }),
    );
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(21);
    const artifactTool = listed.tools.find(
      ({ name }) => name === "get_artifact",
    );
    expect(
      Object.keys(
        (artifactTool?.inputSchema.properties ?? {}) as Record<string, unknown>,
      ),
    ).toContain("include_change_brief");
  });
});
