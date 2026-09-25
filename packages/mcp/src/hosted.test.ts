import {
  Client,
  InMemoryResponseCacheStore,
  ProtocolError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createHostedMcpEndpoint,
  estimateTokens,
  InMemoryMcpStore,
} from "./index";
import { GRAPH_EDGE_SCHEMA, NODE_TYPE_SCHEMA, RELATION_SCHEMA } from "./hosted";
import { MCP_EDGE_RELATIONS, MCP_NODE_TYPES } from "./store";
import { agentFlowTools } from "@alrescha/core";
import type {
  McpEdgeData,
  McpEdgeFamily,
  McpEdgeRelation,
  McpEdgeTier,
  McpFindingData,
  McpScope,
  McpSymbolData,
  McpWorkspaceData,
} from "./index";

/**
 * A stored edge as the decoder delivers it (Codex remedy P0-D): the relation
 * plus the family, tier, confidence and provenance that used to be dropped
 * between the database and the tool answer.
 */
function edge(input: {
  readonly family?: McpEdgeFamily;
  readonly id: string;
  readonly reason?: string;
  readonly relation: McpEdgeRelation;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly tier?: McpEdgeTier;
}): McpEdgeData {
  return {
    confidence: 1,
    family: input.family ?? "evidence",
    id: input.id,
    provenance: {
      method: null,
      reason: input.reason ?? "fixture",
      span: null,
    },
    relation: input.relation,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    tier: input.tier ?? "resolved",
  };
}

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";
const USER_ID = "user-owner";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Y10";

function workspaceFixture(): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [
      {
        artifacts: [
          {
            content:
              "# CI evidence policy\nEvery active requirement needs same-commit test evidence.",
            headings: ["CI evidence policy"],
            id: "01K287J3D18V7A1MZG9E8D1Y11",
            kind: "spec",
            path: "spec/WORK_SPEC.md",
            status: "active",
            summary: "CI evidence requirements",
            symbols: [],
            tags: ["ci", "evidence"],
            title: "CI evidence policy",
          },
          {
            content: "export function ingestCiTestReports() {}",
            headings: [],
            id: "01K287J3D18V7A1MZG9E8D1Y12",
            kind: "code_metadata",
            path: "packages/core/src/evidence/ci-reports.ts",
            status: "active",
            summary: "CI report ingestion implementation",
            symbols: ["ingestCiTestReports"],
            tags: ["ci"],
            title: "ingestCiTestReports",
          },
        ],
        contextPacks: [
          {
            content:
              "Read spec/WORK_SPEC.md before changing CI evidence ingestion.",
            id: "01K287J3D18V7A1MZG9E8D1Y41",
            nodeIds: [
              "01K287J3D18V7A1MZG9E8D1Y11",
              "01K287J3D18V7A1MZG9E8D1Y21",
            ],
            paths: ["spec/WORK_SPEC.md"],
            title: "CI evidence context",
          },
        ],
        defaultBranch: "main",
        edges: [
          edge({
            id: "01K287J3D18V7A1MZG9E8D1Y51",
            relation: "implements",
            sourceNodeId: "01K287J3D18V7A1MZG9E8D1Y21",
            targetNodeId: "01K287J3D18V7A1MZG9E8D1Y12",
          }),
        ],
        evidence: [],
        findings: [
          {
            confidence: 0.96,
            evidenceGrade: "inferred",
            id: "01K287J3D18V7A1MZG9E8D1Y31",
            kind: "missing-test",
            provenance: {
              sourceArtifactId: "01K287J3D18V7A1MZG9E8D1Y11",
              span: { endLine: 2, path: "spec/WORK_SPEC.md", startLine: 2 },
            },
            severity: "high",
            sourceNodeId: "01K287J3D18V7A1MZG9E8D1Y21",
            status: "open",
            title: "CI evidence missing",
          },
        ],
        fullName: "2klips/alrescha-app",
        id: REPOSITORY_ID,
        indexEntries: [
          {
            headings: ["CI evidence policy"],
            id: "01K287J3D18V7A1MZG9E8D1Y61",
            neighborIds: ["01K287J3D18V7A1MZG9E8D1Y21"],
            nodeId: "01K287J3D18V7A1MZG9E8D1Y11",
            path: "spec/WORK_SPEC.md",
            searchKey: "CI evidence policy spec/WORK_SPEC.md ci evidence",
            symbols: [],
            tags: ["ci", "evidence"],
            title: "CI evidence policy",
            type: "artifact",
          },
          {
            headings: [],
            id: "01K287J3D18V7A1MZG9E8D1Y62",
            neighborIds: ["01K287J3D18V7A1MZG9E8D1Y12"],
            nodeId: "01K287J3D18V7A1MZG9E8D1Y21",
            path: "spec/WORK_SPEC.md#L2",
            searchKey: "same commit test evidence requirement ci",
            symbols: [],
            tags: ["ci", "requirement"],
            title: "Same-commit test evidence",
            type: "requirement",
          },
        ],
        overview: "GitHub-first assurance demo repository",
        receipts: [
          {
            commitSha: "b".repeat(40),
            digest: "a".repeat(64),
            id: "01K287J3D18V7A1MZG9E8D1Y71",
            status: "generated",
            summary: { inferred: 1, verified: 3 },
          },
        ],
        requirements: [
          {
            id: "01K287J3D18V7A1MZG9E8D1Y21",
            sourceArtifactId: "01K287J3D18V7A1MZG9E8D1Y11",
            statement:
              "Every active requirement needs same-commit test evidence.",
            status: "active",
          },
        ],
      },
    ],
  };
}

function createSdkClient(fetch: typeof globalThis.fetch, token: string) {
  const client = new Client(
    { name: "arr-contract-test", version: "1.0.0" },
    {
      cachePartition: token.slice(0, 12),
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.alrescha.test/mcp"),
    {
      authProvider: { token: async () => token },
      fetch,
    },
  );
  return { client, transport };
}

describe("hosted MCP contract", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("connects with a settings-issued token and discovers the modern private surface", async () => {
    const store = new InMemoryMcpStore({
      workspaces: [
        { id: WORKSPACE_ID, ownerUserId: USER_ID, repositories: [] },
      ],
    });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Codex",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);

    const tokenList = await store.listAccessTokens({
      actorUserId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(tokenList).toHaveLength(1);
    expect(tokenList[0]).toMatchObject({
      name: "Codex",
      tokenPrefix: issued.secret.slice(0, 12),
    });
    expect(JSON.stringify(tokenList)).not.toContain(issued.secret);
    expect(tokenList[0]).not.toHaveProperty("tokenHash");

    await client.connect(transport);

    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getServerVersion()).toEqual({
      name: "alrescha",
      version: "0.1.0",
    });
    expect(client.getDiscoverResult()).toMatchObject({
      cacheScope: "private",
      capabilities: { resources: {}, tools: {} },
      supportedVersions: ["2026-07-28"],
      ttlMs: 60_000,
    });
    expect(client.getServerCapabilities()).not.toHaveProperty("logging");
    expect(client.getServerCapabilities()).not.toHaveProperty("sampling");
    expect(client.getServerCapabilities()).not.toHaveProperty("roots");
  });

  it("rejects a revoked token at the HTTP authentication boundary", async () => {
    const store = new InMemoryMcpStore({
      workspaces: [
        { id: WORKSPACE_ID, ownerUserId: USER_ID, repositories: [] },
      ],
    });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Revoked token",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    await store.revokeAccessToken({
      actorUserId: USER_ID,
      tokenId: issued.record.id,
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );

    await expect(client.connect(transport)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("does not expose or read another tenant resource", async () => {
    const otherWorkspaceId = "01K287J3D18V7A1MZG9E8D1Y02";
    const store = new InMemoryMcpStore({
      workspaces: [
        { id: WORKSPACE_ID, ownerUserId: USER_ID, repositories: [] },
        { id: otherWorkspaceId, ownerUserId: "user-other", repositories: [] },
      ],
    });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Owner token",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const listed = await client.listResources();
    expect(listed.resources).toHaveLength(5);
    expect(
      listed.resources.every((resource) =>
        resource.uri.startsWith(`alrescha://workspace/${WORKSPACE_ID}/`),
      ),
    ).toBe(true);
    expect(
      listed.resources.some((resource) =>
        resource.uri.includes(otherWorkspaceId),
      ),
    ).toBe(false);
    await expect(
      client.readResource({
        uri: `alrescha://workspace/${otherWorkspaceId}/overview`,
      }),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it("lists and reads the five private workspace resources with cache hints", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Claude",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const listed = await client.listResources();
    expect(listed).toMatchObject({ cacheScope: "private", ttlMs: 60_000 });
    expect(listed.resources.map(({ name, uri }) => ({ name, uri }))).toEqual([
      {
        name: "overview",
        uri: `alrescha://workspace/${WORKSPACE_ID}/overview`,
      },
      {
        name: "artifacts",
        uri: `alrescha://workspace/${WORKSPACE_ID}/artifacts`,
      },
      {
        name: "findings",
        uri: `alrescha://workspace/${WORKSPACE_ID}/findings`,
      },
      {
        name: "receipts-summary",
        uri: `alrescha://workspace/${WORKSPACE_ID}/receipts-summary`,
      },
      {
        name: "context-packs",
        uri: `alrescha://workspace/${WORKSPACE_ID}/context-packs`,
      },
    ]);

    const result = await client.readResource({
      uri: `alrescha://workspace/${WORKSPACE_ID}/findings`,
    });
    expect(result).toMatchObject({ cacheScope: "private", ttlMs: 60_000 });
    const content = result.contents[0];
    if (!content || !("text" in content))
      throw new Error("Expected a text resource");
    const payload = JSON.parse(content.text) as {
      findings: Array<{ severity: string; title: string }>;
    };
    expect(payload.findings).toEqual([
      expect.objectContaining({
        severity: "high",
        title: "CI evidence missing",
      }),
    ]);
  });

  it("advertises every allowed tool with input and output schemas in deterministic order", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Tool catalog",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed).toMatchObject({ cacheScope: "private", ttlMs: 60_000 });
    expect(listed.tools.map(({ name }) => name)).toEqual([
      "assert_link",
      "explain_module",
      "get_artifact",
      "get_findings",
      "get_graph_schema",
      "get_neighbors",
      "impact_of",
      "log_progress",
      "memory_read",
      "memory_write",
      "query_brain",
      "record_note",
      "record_prompt",
      "record_ruled_out",
      "repo_map",
      "repo_overview",
      "report_session_usage",
      "request_context_pack",
      "request_rescan",
      "search_index",
      "trace_path",
    ]);
    expect(
      listed.tools.every((tool) => tool.inputSchema.type === "object"),
    ).toBe(true);
    /**
     * The catalogue is a payload every session pays for before it asks
     * anything (todo 22 ⑴). `outputSchema` was 65% of it — 9,995 tokens down
     * to 3,501 by dropping an optional field — and the three merged tools and
     * one-line descriptions took it to 2,704.
     *
     * The cap is a ratchet just above the measured value, so the number can
     * only go down. The plan's ≤1,500 is not reachable on this SDK: an empty
     * tool still serialises its name, its `$schema` URL and its annotations,
     * which is ~65 tokens before a single parameter (OQ-059).
     *
     * 2,704 → 2,890 when `report_session_usage` arrived (todo 23) → 2,914
     * when `memory_read` gained its cap (todo 22 ⑴) → 3,009 when
     * `query_brain` took the domain, unit and family filters (todo 21) →
     * 3,076 when `log_progress` took its three attribution fields → 3,131
     * when the concept vocabulary joined (todo 19 ⑴: one node type and six
     * relations, paid once per schema that carries the relation enum) →
     * 3,141 when `get_artifact` took `include_change_brief` (RE-03 ⑶b: one
     * optional boolean, +10, measured before it was written and again
     * after). Each rise was caught here first, which is the whole point of a
     * ratchet: it does not forbid growth, it makes growth say its price.
     */
    expect(estimateTokens(JSON.stringify(listed.tools))).toBeLessThanOrEqual(
      3_150,
    );
    expect(listed.tools).toHaveLength(21);
    expect(
      listed.tools.every((tool) => tool.annotations?.destructiveHint === false),
    ).toBe(true);
    expect(listed.tools.map(({ name }) => name)).not.toContain(
      "create_pull_request",
    );
    expect(listed.tools.map(({ name }) => name)).not.toContain("write_file");
    // Todo 22 ⑵: the shared flow may only name tools that exist. The copy
    // that outlived its tools is the failure this pin prevents from
    // happening a second time, from the other direction.
    const names = new Set(listed.tools.map(({ name }) => name));
    for (const tool of agentFlowTools()) expect(names.has(tool)).toBe(true);
  });

  it("serves two tenants from one process with identical, unmutated tool schemas", async () => {
    // The tool definitions are module-scope constants shared by every request
    // (perf research MT-10). If the SDK ever mutated one during registration,
    // the second server built in the same process would drift from the first
    // — this is the assertion that would catch it.
    const otherWorkspaceId = "01K287J3D18V7A1MZG9E8D1Y02";
    const store = new InMemoryMcpStore({
      workspaces: [
        workspaceFixture(),
        {
          id: otherWorkspaceId,
          ownerUserId: "user-other",
          repositories: [],
        },
      ],
    });
    const first = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "First tenant",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const second = await store.issueAccessToken({
      actorUserId: "user-other",
      name: "Second tenant",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: otherWorkspaceId,
    });
    const endpoint = createHostedMcpEndpoint({ store });

    const catalogs: unknown[] = [];
    for (const token of [first, second, first]) {
      const { client, transport } = createSdkClient(
        endpoint.fetch,
        token.secret,
      );
      clients.push(client);
      await client.connect(transport);
      const listed = await client.listTools();
      catalogs.push(
        listed.tools.map((tool) => ({
          annotations: tool.annotations,
          description: tool.description,
          inputSchema: tool.inputSchema,
          name: tool.name,
        })),
      );
    }

    expect(catalogs[1]).toEqual(catalogs[0]);
    expect(catalogs[2]).toEqual(catalogs[0]);
    // 20 after todo 22 merged `search_nodes` into `search_index`,
    // `get_node_content` into `get_artifact`, and moved `route_query` into
    // the instruction block. The plan budgets ≤16; the remaining four are
    // named in OQ-059 rather than removed by guesswork.
    expect((catalogs[0] as unknown[]).length).toBe(21);
  });

  it("ranks index results deterministically and applies the type filter", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Index search",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({
      arguments: { query: "CI evidence policy" },
      name: "search_index",
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query: "CI evidence policy",
      results: [
        {
          nodeId: "01K287J3D18V7A1MZG9E8D1Y11",
          path: "spec/WORK_SPEC.md",
          rank: "exact",
          type: "artifact",
        },
        {
          nodeId: "01K287J3D18V7A1MZG9E8D1Y21",
          rank: "graph-neighbor",
          type: "requirement",
        },
      ],
      workspaceId: WORKSPACE_ID,
    });
    // Scores = tier base plus the connectivity bonus (Phase 3 Wave B todo 5).
    // The bonus is capped under the 100-point tier gap, so an exact hit can
    // never be outranked by a neighbor whatever the graph looks like.
    const scored = (
      result.structuredContent as {
        results: { rank: string; score: number }[];
      }
    ).results;
    const exact = scored.find((entry) => entry.rank === "exact");
    const neighbor = scored.find((entry) => entry.rank === "graph-neighbor");
    expect(exact?.score).toBeGreaterThanOrEqual(400);
    expect(exact?.score).toBeLessThan(450);
    expect(neighbor?.score).toBeGreaterThanOrEqual(100);
    expect(neighbor?.score).toBeLessThan(200);

    const filtered = await client.callTool({
      arguments: { query: "CI evidence policy", type_filter: "requirement" },
      name: "search_index",
    });
    expect(filtered.structuredContent).toMatchObject({
      results: [{ nodeId: "01K287J3D18V7A1MZG9E8D1Y21", type: "requirement" }],
    });
  });

  it("queries graph relations and returns artifact neighbor summaries", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Brain query",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const query = await client.callTool({
      arguments: {
        filter: {
          statuses: ["active"],
          types: ["requirement"],
          withoutRelations: ["tests"],
        },
      },
      name: "query_brain",
    });
    expect(query.structuredContent).toMatchObject({
      count: 1,
      nodes: [
        {
          id: "01K287J3D18V7A1MZG9E8D1Y21",
          label: "Every active requirement needs same-commit test evidence.",
          path: "spec/WORK_SPEC.md",
          relations: ["implements"],
          status: "active",
          type: "requirement",
        },
      ],
    });

    const artifact = await client.callTool({
      arguments: { path: "packages/core/src/evidence/ci-reports.ts" },
      name: "get_artifact",
    });
    expect(artifact.structuredContent).toMatchObject({
      artifact: {
        id: "01K287J3D18V7A1MZG9E8D1Y12",
        path: "packages/core/src/evidence/ci-reports.ts",
        repositoryId: REPOSITORY_ID,
      },
      neighbors: [
        {
          direction: "incoming",
          id: "01K287J3D18V7A1MZG9E8D1Y21",
          relation: "implements",
          type: "requirement",
        },
      ],
    });
  });

  it("filters labeled findings and selects a budgeted context pack", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Context reader",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const findings = await client.callTool({
      arguments: { filter: { severity: "high", status: "open" } },
      name: "get_findings",
    });
    expect(findings.structuredContent).toMatchObject({
      findings: [
        {
          evidenceGrade: "inferred",
          kind: "missing-test",
          severity: "high",
          title: "CI evidence missing",
        },
      ],
      workspaceId: WORKSPACE_ID,
    });

    const context = await client.callTool({
      arguments: {
        target_agent: "codex",
        task_description: "Update CI evidence ingestion",
        token_budget: 128,
      },
      name: "request_context_pack",
    });
    expect(context.structuredContent).toMatchObject({
      estimatedTokens: expect.any(Number),
      assumption: expect.stringContaining("one token per four"),
      omitted: [],
      readingOrder: [
        {
          path: "spec/WORK_SPEC.md",
          rank: 1,
          reason: expect.stringMatching(/Connected|Matched/),
        },
      ],
      nodeIds: [
        "01K287J3D18V7A1MZG9E8D1Y11",
        "01K287J3D18V7A1MZG9E8D1Y21",
        "01K287J3D18V7A1MZG9E8D1Y12",
      ],
      paths: ["spec/WORK_SPEC.md"],
      targetAgent: "codex",
      title: "Context for Update CI evidence ingestion",
    });
    expect(
      (context.structuredContent as { estimatedTokens: number })
        .estimatedTokens,
    ).toBeLessThanOrEqual(128);
  });

  it("validates structured writes atomically and enforces read/write scopes", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const readWrite = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Progress writer",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      readWrite.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const started = await client.callTool({
      arguments: {
        refs: ["spec/BUILD_PLAN.md"],
        status: "started",
        summary: "Started hosted MCP contract.",
        task: "Task 21",
      },
      name: "log_progress",
    });
    const progressed = await client.callTool({
      arguments: {
        refs: ["packages/mcp/src/hosted.ts"],
        status: "progress",
        summary: "Linked progress events to the todo.",
        task: "Task 21",
      },
      name: "log_progress",
    });
    const done = await client.callTool({
      arguments: {
        refs: ["spec/WORK_SPEC.md", "0f00bfb"],
        status: "done",
        summary: "Implemented hosted MCP contract.",
        task: "Task 21",
      },
      name: "log_progress",
    });
    expect(started.isError).not.toBe(true);
    expect(progressed.isError).not.toBe(true);
    expect(done.isError).not.toBe(true);
    expect(done.structuredContent).toMatchObject({
      event: {
        id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
        status: "done",
        summary: "Implemented hosted MCP contract.",
        task: "Task 21",
        todoId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    });
    expect(store.progressEventsForWorkspace(WORKSPACE_ID)).toHaveLength(3);
    expect(store.todosForWorkspace(WORKSPACE_ID)).toEqual([
      expect.objectContaining({ status: "done", title: "Task 21" }),
    ]);
    expect(
      new Set(
        store
          .progressEventsForWorkspace(WORKSPACE_ID)
          .map(({ todoId }) => todoId),
      ),
    ).toHaveLength(1);

    const invalid = await client.callTool({
      arguments: {
        status: "progress",
        summary: "x".repeat(201),
        task: "Task 15",
      },
      name: "log_progress",
    });
    expect(invalid.isError).toBe(true);
    expect(store.progressEventsForWorkspace(WORKSPACE_ID)).toHaveLength(3);
    expect(store.todosForWorkspace(WORKSPACE_ID)).toHaveLength(1);

    const note = await client.callTool({
      arguments: {
        target: "REQ-CI-04",
        text: "Re-run CI after report parser changes.",
      },
      name: "record_note",
    });
    expect(note.isError).not.toBe(true);
    expect(store.notesForWorkspace(WORKSPACE_ID)).toEqual([
      expect.objectContaining({
        target: "REQ-CI-04",
        text: "Re-run CI after report parser changes.",
      }),
    ]);

    const readOnly = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Read only",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const readOnlySdk = createSdkClient(endpoint.fetch, readOnly.secret);
    clients.push(readOnlySdk.client);
    await readOnlySdk.client.connect(readOnlySdk.transport);
    const deniedWrite = await readOnlySdk.client.callTool({
      arguments: {
        status: "done",
        summary: "Must not persist",
        task: "Denied",
      },
      name: "log_progress",
    });
    expect(deniedWrite.isError).toBe(true);
    expect(store.progressEventsForWorkspace(WORKSPACE_ID)).toHaveLength(3);
    expect(store.todosForWorkspace(WORKSPACE_ID)).toHaveLength(1);

    const writeOnly = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Write only",
      scopes: ["mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const writeOnlySdk = createSdkClient(endpoint.fetch, writeOnly.secret);
    clients.push(writeOnlySdk.client);
    await writeOnlySdk.client.connect(writeOnlySdk.transport);
    const deniedRead = await writeOnlySdk.client.callTool({
      arguments: { query: "CI" },
      name: "search_index",
    });
    expect(deniedRead.isError).toBe(true);
  });

  it("emits minimal fire-and-forget access events for every read resource and tool", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Graph glow",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const resources = await client.listResources();
    for (const resource of resources.resources) {
      await client.readResource({ uri: resource.uri });
    }
    await client.callTool({
      arguments: { path: "spec/WORK_SPEC.md" },
      name: "get_artifact",
    });
    await client.callTool({ arguments: { filter: {} }, name: "get_findings" });
    await client.callTool({
      arguments: { filter: { types: ["requirement"] } },
      name: "query_brain",
    });
    await client.callTool({
      arguments: {
        task_description:
          "CI evidence policy; private prompt content must not be logged",
      },
      name: "request_context_pack",
    });
    await client.callTool({
      arguments: { query: "private search query" },
      name: "search_index",
    });

    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(10),
    );
    const events = store.accessEventsForWorkspace(WORKSPACE_ID);
    expect(events.map(({ tool }) => tool)).toEqual([
      "resource:overview",
      "resource:artifacts",
      "resource:findings",
      "resource:receipts-summary",
      "resource:context-packs",
      "get_artifact",
      "get_findings",
      "query_brain",
      "request_context_pack",
      "search_index",
    ]);
    expect(
      events.every(
        (event) =>
          JSON.stringify(Object.keys(event).sort()) ===
          JSON.stringify([
            "estimatedTokens",
            "id",
            "occurredAt",
            "responseChars",
            "targetNodeIds",
            "tokenId",
            "tool",
            "workspaceId",
          ]),
      ),
    ).toBe(true);
    // Two keys wider than it was, and the reason it can be: the size is a
    // number. This loop is also the guard on the wiring — the sizer is passed
    // per handler, so a new tool that forgets it fails here rather than
    // quietly recording nothing (todo 23).
    for (const event of events) {
      expect(event.responseChars).toBeGreaterThan(0);
      expect(event.estimatedTokens).toBe(
        Math.ceil((event.responseChars ?? 0) / 4),
      );
    }
    expect(JSON.stringify(events)).not.toContain("private prompt content");
    expect(JSON.stringify(events)).not.toContain("private search query");
    const packEvent = events.find(
      ({ tool }) => tool === "request_context_pack",
    );
    const measurements = store.packMeasurementsForWorkspace(WORKSPACE_ID);
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      accessEventId: packEvent?.id,
      workspaceId: WORKSPACE_ID,
    });
    expect(measurements[0]?.baselineTokens).toBeGreaterThanOrEqual(
      measurements[0]?.selectedTokens ?? 0,
    );
    expect(measurements[0]?.selectedTokens).toBeGreaterThan(0);
    expect(store.publishedAccessEventsForWorkspace(WORKSPACE_ID)).toEqual(
      events.map((event) => ({
        channel: `workspace:${WORKSPACE_ID}:access-events`,
        event,
      })),
    );
  });

  it("keeps read responses successful when access event persistence and realtime fail", async () => {
    const store = new InMemoryMcpStore({
      accessEventFailures: true,
      workspaces: [workspaceFixture()],
    });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Failure isolation",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const response = await client.callTool({
      arguments: { query: "CI evidence policy" },
      name: "search_index",
    });
    expect(response.isError).not.toBe(true);
    expect(
      (response.structuredContent as { results: unknown[] }).results.length,
    ).toBeGreaterThan(0);
  });

  it("honors private TTL caching without sessions or cross-tenant cache bleed", async () => {
    const otherWorkspaceId = "01K287J3D18V7A1MZG9E8D1Y02";
    const store = new InMemoryMcpStore({
      workspaces: [
        workspaceFixture(),
        { id: otherWorkspaceId, ownerUserId: "user-other", repositories: [] },
      ],
    });
    const ownerToken = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Cache owner",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const otherToken = await store.issueAccessToken({
      actorUserId: "user-other",
      name: "Cache other",
      scopes: ["mcp:read"],
      workspaceId: otherWorkspaceId,
    });
    const endpoint = createHostedMcpEndpoint({ cacheTtlMs: 15, store });
    const sharedCache = new InMemoryResponseCacheStore();
    let ownerRequests = 0;
    let otherRequests = 0;
    let sawSessionHeader = false;
    const trackedFetch =
      (tenant: "owner" | "other"): typeof globalThis.fetch =>
      async (input, init) => {
        const request = new Request(input, init);
        sawSessionHeader ||= request.headers.has("mcp-session-id");
        if (tenant === "owner") ownerRequests += 1;
        else otherRequests += 1;
        const response = await endpoint.fetch(request);
        sawSessionHeader ||= response.headers.has("mcp-session-id");
        return response;
      };
    const makeCachedClient = (
      token: string,
      workspaceId: string,
      fetch: typeof globalThis.fetch,
    ) => {
      const client = new Client(
        { name: "cache-contract", version: "1.0.0" },
        {
          cachePartition: workspaceId,
          responseCacheStore: sharedCache,
          versionNegotiation: { mode: { pin: "2026-07-28" } },
        },
      );
      const transport = new StreamableHTTPClientTransport(
        new URL("https://mcp.alrescha.test/mcp"),
        {
          authProvider: { token: async () => token },
          fetch,
        },
      );
      return { client, transport };
    };
    const owner = makeCachedClient(
      ownerToken.secret,
      WORKSPACE_ID,
      trackedFetch("owner"),
    );
    const other = makeCachedClient(
      otherToken.secret,
      otherWorkspaceId,
      trackedFetch("other"),
    );
    clients.push(owner.client, other.client);
    await Promise.all([
      owner.client.connect(owner.transport),
      other.client.connect(other.transport),
    ]);

    const ownerFirst = await owner.client.listResources();
    const ownerSecond = await owner.client.listResources();
    const otherFirst = await other.client.listResources();
    expect(ownerFirst).toMatchObject({ cacheScope: "private", ttlMs: 15 });
    expect(ownerSecond.resources).toEqual(ownerFirst.resources);
    expect(ownerRequests).toBe(2);
    expect(otherRequests).toBe(2);
    expect(
      otherFirst.resources.every(({ uri }) => uri.includes(otherWorkspaceId)),
    ).toBe(true);
    expect(
      otherFirst.resources.some(({ uri }) => uri.includes(WORKSPACE_ID)),
    ).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await owner.client.listResources();
    expect(ownerRequests).toBe(3);
    expect(sawSessionHeader).toBe(false);
  });

  it("traverses the fixture chain ID-first; bodies come only from the explicit second step", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Graph traversal",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const doc = "01K287J3D18V7A1MZG9E8D1Y11";
    const requirement = "01K287J3D18V7A1MZG9E8D1Y21";
    const code = "01K287J3D18V7A1MZG9E8D1Y12";

    const search = await client.callTool({
      arguments: { include_excerpt: false, query: "CI evidence policy" },
      name: "search_index",
    });
    expect(search.structuredContent).toMatchObject({
      results: [
        { nodeId: doc, rank: "exact", type: "artifact" },
        { nodeId: requirement, rank: "graph-neighbor", type: "requirement" },
      ],
    });

    // Phase 2D todo 5 — the optional facet filter narrows by derived domain
    // and stays backward compatible (the unfiltered call above is unchanged).
    const facetSearch = await client.callTool({
      arguments: {
        domain_filter: "frontend",
        include_excerpt: false,
        query: "CI evidence policy",
      },
      name: "search_index",
    });
    const facetResults = (
      facetSearch.structuredContent as { results: { path: string }[] }
    ).results;
    expect(facetResults.every(({ path }) => path.startsWith("apps/web/"))).toBe(
      true,
    );

    const neighbors = await client.callTool({
      arguments: { depth: 2, node_id: doc },
      name: "get_neighbors",
    });
    const neighborhood = neighbors.structuredContent as {
      edges: { derived: boolean; relation: string }[];
      nodes: { id: string }[];
    };
    expect(neighborhood.nodes.map(({ id }) => id).sort()).toEqual(
      [doc, requirement, code].sort(),
    );
    expect(
      neighborhood.edges.some(
        (edge) => edge.derived && edge.relation === "references",
      ),
    ).toBe(true);

    const traced = await client.callTool({
      arguments: { from_node_id: doc, to_node_id: code },
      name: "trace_path",
    });
    expect(traced.structuredContent).toMatchObject({
      found: true,
      path: {
        explain: [
          `${doc} -references*-> ${requirement}`,
          `${requirement} -implements-> ${code}`,
        ],
        hops: 2,
        nodeIds: [doc, requirement, code],
      },
    });

    const impact = await client.callTool({
      arguments: { node_id: code },
      name: "impact_of",
    });
    expect(impact.structuredContent).toMatchObject({
      found: true,
      impact: {
        // The default answer is unchanged, and now says which answer it is
        // (Codex remedy §7.3, OQ-052).
        dependencyImpact: null,
        dependents: { nodeIds: [requirement] },
        mode: "related-neighborhood",
      },
    });

    // The directional answer is opt-in and arrives labelled, with a path
    // back to the change for every consumer it names.
    const directional = await client.callTool({
      arguments: { mode: "dependency-impact", node_id: code },
      name: "impact_of",
    });
    const report = (
      directional.structuredContent as {
        impact: {
          dependencyImpact: {
            candidates: { nodeId: string; via: unknown[] }[];
            complete: boolean;
            stoppedBy: string | null;
          };
          mode: string;
          semanticsVersion: number;
        };
      }
    ).impact;
    expect(report.mode).toBe("dependency-impact");
    expect(report.semanticsVersion).toBeGreaterThan(1);
    expect(report.dependencyImpact.complete).toBe(true);
    expect(report.dependencyImpact.stoppedBy).toBeNull();
    for (const candidate of report.dependencyImpact.candidates) {
      expect([candidate.nodeId, candidate.via.length]).toEqual([
        candidate.nodeId,
        expect.any(Number),
      ]);
      expect(candidate.via.length).toBeGreaterThan(0);
    }

    // ID-first: none of the traversal responses carries stored text.
    const traversalJson = JSON.stringify([
      search.structuredContent,
      neighbors.structuredContent,
      traced.structuredContent,
      impact.structuredContent,
    ]);
    expect(traversalJson).not.toContain("Every active requirement");
    expect(traversalJson).not.toContain("excerpt");
    expect(traversalJson).not.toContain('"content"');

    // The explicit second step is where content appears.
    const content = await client.callTool({
      arguments: { id: requirement },
      name: "get_artifact",
    });
    expect(content.structuredContent).toMatchObject({
      node: {
        content: "Every active requirement needs same-commit test evidence.",
        id: requirement,
        type: "requirement",
      },
    });

    // The batch form fetches up to four nodes in one round-trip; an unknown
    // id does not error the whole batch.
    const batch = await client.callTool({
      arguments: { ids: [requirement, "01K287J3D18V7A1MZG9E8D1Y11"] },
      name: "get_artifact",
    });
    const batchContent = batch.structuredContent as {
      nodes: { found: boolean; id?: string; requestedId: string }[];
    };
    expect(batchContent.nodes.map(({ id }) => id)).toEqual([
      requirement,
      "01K287J3D18V7A1MZG9E8D1Y11",
    ]);

    // One result per requested id, in the order asked (Codex remedy §9.1).
    // A miss used to vanish from the array, so a batch of two came back as
    // one with no way to tell which id had failed — and a caller cannot
    // retry, or report, an id it was never handed back.
    const missing = await client.callTool({
      arguments: { ids: [requirement, "unknown-node-id"] },
      name: "get_artifact",
    });
    expect(
      (
        missing.structuredContent as {
          nodes: { found: boolean; requestedId: string }[];
        }
      ).nodes,
    ).toEqual([
      expect.objectContaining({ found: true, requestedId: requirement }),
      { found: false, requestedId: "unknown-node-id" },
    ]);
  });

  it("emits access events for every graph tool without storing the question", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Graph events",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const doc = "01K287J3D18V7A1MZG9E8D1Y11";
    const code = "01K287J3D18V7A1MZG9E8D1Y12";
    await client.callTool({
      arguments: { query: "CI evidence" },
      name: "search_index",
    });
    await client.callTool({
      arguments: { node_id: doc },
      name: "get_neighbors",
    });
    await client.callTool({
      arguments: { from_node_id: doc, to_node_id: code },
      name: "trace_path",
    });
    await client.callTool({ arguments: { node_id: code }, name: "impact_of" });
    await client.callTool({
      arguments: { id: doc },
      name: "get_artifact",
    });

    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(5),
    );
    const events = store.accessEventsForWorkspace(WORKSPACE_ID);
    expect(events.map(({ tool }) => tool)).toEqual([
      "search_index",
      "get_neighbors",
      "trace_path",
      "impact_of",
      "get_artifact",
    ]);
    for (const event of events) {
      expect(event.targetNodeIds.length).toBeGreaterThan(0);
    }
    // The query text itself is never stored (WORK_SPEC §11).
    expect(JSON.stringify(events)).not.toContain("CI evidence");
  });

  it("keeps graph traversal tenant-scoped: another workspace's node ids resolve to nothing", async () => {
    const otherWorkspaceId = "01K287J3D18V7A1MZG9E8D1XW2";
    const otherUserId = "20000000-0000-4000-8000-000000000002";
    const store = new InMemoryMcpStore({
      workspaces: [
        workspaceFixture(),
        { id: otherWorkspaceId, ownerUserId: otherUserId, repositories: [] },
      ],
    });
    const issued = await store.issueAccessToken({
      actorUserId: otherUserId,
      name: "Other tenant",
      scopes: ["mcp:read"],
      workspaceId: otherWorkspaceId,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const foreignNode = "01K287J3D18V7A1MZG9E8D1Y11";
    const neighbors = await client.callTool({
      arguments: { node_id: foreignNode },
      name: "get_neighbors",
    });
    expect(neighbors.structuredContent).toMatchObject({
      found: false,
      nodes: [],
    });
    const content = await client.callTool({
      arguments: { id: foreignNode },
      name: "get_artifact",
    });
    // Neither reader answers for another tenant's id.
    expect(content.structuredContent).toMatchObject({
      artifact: null,
      neighbors: [],
    });
    expect(content.structuredContent).not.toHaveProperty("node");
  });

  it("records a prompt without emitting an access event or leaking its text", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const writable = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Prompt capture",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      writable.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({
      arguments: {
        raw_text: "PRIVATE_MCP_PROMPT_7ab3 인증 흐름을 고쳐줘",
        rubric: { verifiability: 2 },
        target_node_ids: ["01K287J3D18V7A1MZG9E8D1Y11"],
        token_count: 120,
        tool_name: "log_progress",
      },
      name: "record_prompt",
    });
    expect(result.isError).not.toBe(true);
    expect(store.promptRecordsForWorkspace(WORKSPACE_ID)).toHaveLength(1);

    // ADR-004/ADR-011: prompt capture and the glow stream stay separate.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const events = store.accessEventsForWorkspace(WORKSPACE_ID);
    expect(events.map(({ tool }) => tool)).not.toContain("record_prompt");
    expect(JSON.stringify(events)).not.toContain("PRIVATE_MCP_PROMPT_7ab3");
  });

  it("refuses prompt capture on a read-only token", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const readOnly = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Read only",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      readOnly.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({
      arguments: { token_count: 10, tool_name: "log_progress" },
      name: "record_prompt",
    });
    expect(result.isError).toBe(true);
    expect(store.promptRecordsForWorkspace(WORKSPACE_ID)).toEqual([]);
  });

  it("appends a ruled-out attempt without touching the glow stream", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const writable = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Ruled out",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      writable.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({
      arguments: {
        hypothesis: "웹훅 서명 검증이 실패 원인이다",
        outcome: "재현되지 않음 — 서명은 정상이었다",
        refs: ["spec/WORK_SPEC.md"],
      },
      name: "record_ruled_out",
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });

    const logged = store.ruledOutForWorkspace(WORKSPACE_ID);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      hypothesis: "웹훅 서명 검증이 실패 원인이다",
      refs: ["spec/WORK_SPEC.md"],
      userId: USER_ID,
    });

    // The inspection log is not the graph: no nodes were touched, so nothing
    // should light up (ADR-004).
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      store.accessEventsForWorkspace(WORKSPACE_ID).map(({ tool }) => tool),
    ).not.toContain("record_ruled_out");
  });

  it("refuses a ruled-out write on a read-only token", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const readOnly = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Read only",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      readOnly.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({
      arguments: { hypothesis: "무언가", outcome: "무언가" },
      name: "record_ruled_out",
    });
    expect(result.isError).toBe(true);
    expect(store.ruledOutForWorkspace(WORKSPACE_ID)).toEqual([]);
  });

  /**
   * `route_query` is gone (todo 22 ⑴). Choosing a route was one round trip
   * spent deciding which round trip to spend next, and the decision is a
   * sentence — it belongs in the instruction block, not in the catalogue
   * every session pays for. `tests/query-router.test.ts` still holds the
   * rule itself.
   */
  it("no longer spends a round trip choosing a route", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Router",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const names = (await client.listTools()).tools.map(({ name }) => name);
    expect(names).not.toContain("route_query");
    // The tools the sentence names are all still here, which is what makes
    // the sentence usable without the tool.
    for (const tool of ["search_index", "get_neighbors", "trace_path"]) {
      expect(names).toContain(tool);
    }
  });
});

/**
 * Phase 4 Wave A todo 1 — what `get_findings` answers by default.
 *
 * Two defects met here in production. The filter had no default, so an agent
 * asking what is wrong with the repository was handed resolved history
 * alongside open work; and the sort compared severity strings, which orders
 * `critical` after `high` and `low` above `medium` — the one question the
 * list exists to answer (R5 §4.3).
 */
describe("get_findings contract", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    while (clients.length > 0) await clients.pop()?.close();
  });

  function finding(
    overrides: Partial<McpFindingData> & { id: string },
  ): McpFindingData {
    return {
      confidence: 0.8,
      evidenceGrade: "inferred",
      kind: "stale-doc",
      provenance: { reason: "deterministic stale-doc rule" },
      severity: "medium",
      sourceNodeId: "01K287J3D18V7A1MZG9E8D1Y11",
      status: "open",
      title: overrides.id,
      ...overrides,
    };
  }

  function workspaceWithFindings(
    findings: readonly McpFindingData[],
  ): McpWorkspaceData {
    const base = workspaceFixture();
    const [repository] = base.repositories;
    return {
      ...base,
      repositories: [{ ...repository!, findings: [...findings] }],
    };
  }

  async function connect(workspace: McpWorkspaceData) {
    const store = new InMemoryMcpStore({ workspaces: [workspace] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Findings reader",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);
    return client;
  }

  async function titles(
    client: Client,
    filter: Record<string, string> | undefined,
  ): Promise<string[]> {
    const result = await client.callTool({
      arguments: filter ? { filter } : {},
      name: "get_findings",
    });
    const structured = result.structuredContent as {
      findings: { title: string }[];
    };
    return structured.findings.map(({ title }) => title);
  }

  it("returns open findings unless asked for more", async () => {
    const client = await connect(
      workspaceWithFindings([
        finding({ id: "open-one" }),
        finding({ id: "resolved-one", status: "resolved" }),
        finding({ id: "dismissed-one", status: "dismissed" }),
      ]),
    );

    expect(await titles(client, undefined)).toEqual(["open-one"]);
    expect(await titles(client, {})).toEqual(["open-one"]);
    expect((await titles(client, { status: "all" })).sort()).toEqual([
      "dismissed-one",
      "open-one",
      "resolved-one",
    ]);
    expect(await titles(client, { status: "resolved" })).toEqual([
      "resolved-one",
    ]);
  });

  it("says whether the findings it read were every finding", async () => {
    // The workspace read keeps a budget of rows per table and records what
    // it cut in `coverage.truncated`. A list read from a cut `findings`
    // table is not every finding, and answering it bare lets an agent read
    // a missing finding as a clean bill.
    const coverageOf = async (
      truncated: { limit: number; table: string }[],
    ): Promise<unknown> => {
      const client = await connect({
        ...workspaceWithFindings([finding({ id: "open-one" })]),
        coverage: {
          readConsistency: "single-statement",
          result: truncated.length > 0 ? "partial" : "complete",
          truncated,
        },
      });
      const result = await client.callTool({
        arguments: {},
        name: "get_findings",
      });
      return (result.structuredContent as { coverage?: unknown }).coverage;
    };

    expect(await coverageOf([])).toEqual({ reason: null, result: "complete" });
    expect(await coverageOf([{ limit: 2_000, table: "findings" }])).toEqual({
      reason: "findings stopped at 2000 rows",
      result: "partial",
    });
    // A table this answer does not come from leaves it whole.
    expect(await coverageOf([{ limit: 2_000, table: "sections" }])).toEqual({
      reason: null,
      result: "complete",
    });
  });

  it("orders by severity, worst first", async () => {
    const client = await connect(
      workspaceWithFindings([
        finding({ id: "a-low", severity: "low" }),
        finding({ id: "b-critical", severity: "critical" }),
        finding({ id: "c-medium", severity: "medium" }),
        finding({ id: "d-high", severity: "high" }),
      ]),
    );

    // Alphabetically this is critical, high, low, medium — which is why the
    // dashboard's severity sort was a dead path.
    expect(await titles(client, undefined)).toEqual([
      "b-critical",
      "d-high",
      "c-medium",
      "a-low",
    ]);
  });

  it("keeps the path, span and suggested action the rules recorded", async () => {
    const client = await connect(
      workspaceWithFindings([
        finding({
          id: "anchored",
          provenance: {
            reason: "deterministic stale-doc rule",
            spans: [
              { endLine: 15, path: "spec/auth.md", startLine: 15 },
              { endLine: 20, path: "spec/auth.md", startLine: 20 },
            ],
            suggestedAction: "Update or remove the stale reference.",
          },
          targetNodeId: "01K287J3D18V7A1MZG9E8D1Y12",
        }),
      ]),
    );

    const result = await client.callTool({
      arguments: {},
      name: "get_findings",
    });

    // An agent that cannot see the line cannot act on the finding.
    expect(result.structuredContent).toMatchObject({
      findings: [
        {
          provenance: {
            reason: "deterministic stale-doc rule",
            spans: [
              { endLine: 15, path: "spec/auth.md", startLine: 15 },
              { endLine: 20, path: "spec/auth.md", startLine: 20 },
            ],
            suggestedAction: "Update or remove the stale reference.",
          },
          targetNodeId: "01K287J3D18V7A1MZG9E8D1Y12",
          title: "anchored",
        },
      ],
    });
  });

  it("labels evidence grade on every finding it returns", async () => {
    const client = await connect(
      workspaceWithFindings([
        finding({ id: "one" }),
        finding({ id: "two", severity: "low" }),
      ]),
    );

    const result = await client.callTool({
      arguments: { filter: { status: "all" } },
      name: "get_findings",
    });
    const structured = result.structuredContent as {
      findings: { evidenceGrade: string }[];
    };

    // WORK_SPEC §11: the inferred label is never omitted in MCP responses.
    expect(structured.findings).toHaveLength(2);
    expect(
      structured.findings.every(
        ({ evidenceGrade }) => evidenceGrade === "inferred",
      ),
    ).toBe(true);
  });
});

/**
 * Codex remedy P0-D. Four copies of one vocabulary had drifted apart: the
 * source union, the Supabase decoder's guard, and these two output enums.
 * Both enums are now built from the source arrays, and this pins them there —
 * a value added to the graph fails a test instead of a live request.
 */
describe("the tool output vocabulary tracks the source of truth", () => {
  it("accepts every node type and relation the graph can produce", () => {
    for (const type of MCP_NODE_TYPES) {
      expect([type, NODE_TYPE_SCHEMA.safeParse(type).success]).toEqual([
        type,
        true,
      ]);
    }
    for (const relation of MCP_EDGE_RELATIONS) {
      expect([relation, RELATION_SCHEMA.safeParse(relation).success]).toEqual([
        relation,
        true,
      ]);
    }
    // And nothing beyond it: `contains` is excluded from graph answers on
    // purpose, so the schema must not quietly start accepting it.
    expect(RELATION_SCHEMA.safeParse("contains").success).toBe(false);
  });

  it("validates a full edge, including the reason it exists", () => {
    expect(
      GRAPH_EDGE_SCHEMA.safeParse({
        confidence: 0.6,
        derived: false,
        family: "database",
        id: "01K287J3D18V7A1MZG9E8D1Y40",
        provenance: {
          method: "table-literal",
          reason: "code names the object in a literal",
          span: { endLine: 22, path: "lib/store.ts", startLine: 22 },
        },
        relation: "queries",
        sourceNodeId: "a",
        targetNodeId: "b",
        tier: "reference",
      }).success,
    ).toBe(true);

    // A writer that stated nothing reports nothing, and that is valid.
    expect(
      GRAPH_EDGE_SCHEMA.safeParse({
        confidence: null,
        derived: true,
        family: null,
        id: "derived:a:b",
        provenance: { method: null, reason: null, span: null },
        relation: "references",
        sourceNodeId: "a",
        targetNodeId: "b",
        tier: null,
      }).success,
    ).toBe(true);
  });
});

/**
 * Write tools leave a trace too (Wave D todo 19 ⑹).
 *
 * `log_progress` and `record_note` changed the workspace and emitted
 * nothing, so the live map never lit up for them and the telemetry that
 * counts what a session did counted only its reads. `record_prompt` stays
 * silent on purpose — a separate store with separate consent, and the glow
 * stream must never carry prompt text (ADR-004).
 */
describe("write tools and the access stream", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("emits an event for the write tools that touch the graph, and not for prompts", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Writer",
      scopes: ["mcp:read", "mcp:write"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    await client.callTool({
      arguments: {
        refs: ["spec/WORK_SPEC.md"],
        status: "done",
        summary: "wrote it down",
        task: "Task 19",
      },
      name: "log_progress",
    });
    await client.callTool({
      arguments: { target: "spec/WORK_SPEC.md", text: "a note" },
      name: "record_note",
    });
    await client.callTool({
      arguments: { token_count: 12, tool_name: "search_index" },
      name: "record_prompt",
    });

    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(2),
    );
    const events = store.accessEventsForWorkspace(WORKSPACE_ID);
    expect(events.map(({ tool }) => tool)).toEqual([
      "log_progress",
      "record_note",
    ]);
    // The nodes each one named, so the live map lights the right ones.
    expect(events[0]?.targetNodeIds).toEqual(["spec/WORK_SPEC.md"]);
    expect(events[1]?.targetNodeIds).toEqual(["spec/WORK_SPEC.md"]);
    // And still nothing from `record_prompt`, after the other two arrived.
    expect(events.map(({ tool }) => tool)).not.toContain("record_prompt");
  });
});

/**
 * The session meter (Phase 4 Wave E todo 23).
 *
 * Todo 22 measured what a session pays before it asks anything. This is the
 * other line of the bill — what the answers weigh — and the rule that keeps
 * it honest: the number is the wire, not a flattering projection of it.
 */
describe("the session meter", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function connected(scopes: McpScope[] = ["mcp:read", "mcp:write"]) {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Meter",
      scopes,
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);
    return { client, store };
  }

  it("records the bytes the client actually received, duplicate included", async () => {
    const { client, store } = await connected();
    const answer = await client.callTool({
      arguments: { path: "spec/WORK_SPEC.md" },
      name: "get_artifact",
    });

    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(1),
    );
    const [event] = store.accessEventsForWorkspace(WORKSPACE_ID);
    // Reconstructed from what the client was handed: the JSON text block and
    // the structured copy of the same payload. The server still sends both
    // (the compat pass is todo 22's open item), and a meter that counted one
    // of them would advertise a saving nobody received.
    const payload = answer.structuredContent as Record<string, unknown>;
    const onTheWire = JSON.stringify({
      content: [{ text: JSON.stringify(payload), type: "text" }],
      structuredContent: payload,
    });
    expect(event?.responseChars).toBe(onTheWire.length);
    expect(event?.estimatedTokens).toBe(Math.ceil(onTheWire.length / 4));
  });

  it("sizes a resource read as well as a tool call", async () => {
    const { client, store } = await connected(["mcp:read"]);
    const resources = await client.listResources();
    const overview = resources.resources.find(({ uri }) =>
      uri.endsWith("/overview"),
    );
    await client.readResource({ uri: overview?.uri ?? "" });

    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(1),
    );
    const [event] = store.accessEventsForWorkspace(WORKSPACE_ID);
    expect(event?.tool).toBe("resource:overview");
    expect(event?.responseChars).toBeGreaterThan(0);
  });

  it("answers report_session_usage with a status instead of an error", async () => {
    const { client } = await connected();
    const answer = await client.callTool({
      arguments: {
        cache_read_tokens: 8_000,
        input_tokens: 1_200,
        model: "claude-opus-5",
        output_tokens: 340,
      },
      name: "report_session_usage",
    });

    // The in-memory store has nowhere to put it and says so. What matters is
    // that a client reporting its own cost is never punished with a failure.
    expect(answer.isError).not.toBe(true);
    expect(answer.structuredContent).toMatchObject({
      status: "unavailable",
      workspaceId: WORKSPACE_ID,
    });
    expect(
      await client.callTool({
        arguments: { input_tokens: 1, repository_id: "not-a-repository" },
        name: "report_session_usage",
      }),
    ).toMatchObject({ structuredContent: { status: "unknown_repository" } });
  });

  it("does not meter itself", async () => {
    const { client, store } = await connected();
    await client.callTool({
      arguments: { input_tokens: 10 },
      name: "report_session_usage",
    });
    await client.callTool({ arguments: { filter: {} }, name: "get_findings" });

    // One event, from the read. A meter that logged its own traffic would
    // make a session look more expensive for having been measured.
    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(1),
    );
    expect(
      store.accessEventsForWorkspace(WORKSPACE_ID).map(({ tool }) => tool),
    ).toEqual(["get_findings"]);
  });

  it("needs the write scope, like every other tool that stores something", async () => {
    const { client } = await connected(["mcp:read"]);
    expect(
      await client.callTool({
        arguments: { input_tokens: 10 },
        name: "report_session_usage",
      }),
    ).toMatchObject({ isError: true });
  });

  it("refuses a model field that is a sentence rather than an identifier", async () => {
    const { client } = await connected();
    // The same rule as the database CHECK, one layer earlier: this field can
    // never become somewhere to put a sentence.
    expect(
      await client.callTool({
        arguments: { input_tokens: 10, model: "fix the auth bug" },
        name: "report_session_usage",
      }),
    ).toMatchObject({ isError: true });
  });
});

/**
 * The budgeted surface (Phase 4 Wave E todo 22).
 *
 * A catalogue is a payload every session pays for before it asks anything,
 * and this one had grown to 23 tools and 9,995 tokens — of which 65% was an
 * optional `outputSchema` field. What the tests below hold is not the number
 * but the properties behind it: two doors onto one query are one door now,
 * a traversal can name the band it cares about, and the workflow sentence
 * lives in one place rather than in a copy that outlived its tools.
 */
describe("the budgeted tool surface", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function connected() {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Budget",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);
    return client;
  }

  it("answers the ID-first search without shipping prose", async () => {
    const client = await connected();

    const lean = await client.callTool({
      arguments: { include_excerpt: false, query: "CI evidence policy" },
      name: "search_index",
    });
    const rich = await client.callTool({
      arguments: { query: "CI evidence policy" },
      name: "search_index",
    });

    // Omitted, not blanked: an empty string is still a key on the wire, and
    // the point of the ID-first entry point is paying for ids and paths.
    expect(JSON.stringify(lean.structuredContent)).not.toContain("excerpt");
    expect(JSON.stringify(lean.structuredContent)).not.toContain("title");
    expect(JSON.stringify(rich.structuredContent)).toContain("excerpt");
    // Same ranking either way — it was always one query behind two names.
    const ids = (structured: unknown) =>
      (structured as { results: { nodeId: string }[] }).results.map(
        ({ nodeId }) => nodeId,
      );
    expect(ids(lean.structuredContent)).toEqual(ids(rich.structuredContent));
  });

  it("caps the result count and says what it left out", async () => {
    const client = await connected();

    const capped = await client.callTool({
      arguments: { limit: 1, query: "CI evidence policy" },
      name: "search_index",
    });
    expect(capped.structuredContent).toMatchObject({ truncated: 1 });
    expect(
      (capped.structuredContent as { results: unknown[] }).results,
    ).toHaveLength(1);
  });

  it("clips an excerpt to the requested width", async () => {
    const client = await connected();

    const clipped = await client.callTool({
      arguments: { excerpt_chars: 10, query: "CI evidence policy" },
      name: "search_index",
    });
    for (const result of (
      clipped.structuredContent as {
        results: { excerpt: string }[];
      }
    ).results) {
      expect(result.excerpt.length).toBeLessThanOrEqual(10);
    }
  });

  /**
   * todo 22 ⑸. A traversal that cannot name its band answers with every
   * band, and most questions are about one.
   */
  it("narrows a traversal to the families asked for", async () => {
    const client = await connected();
    const requirement = "01K287J3D18V7A1MZG9E8D1Y21";

    const all = await client.callTool({
      arguments: { node_id: requirement },
      name: "get_neighbors",
    });
    const evidenceOnly = await client.callTool({
      arguments: { families: ["evidence"], node_id: requirement },
      name: "get_neighbors",
    });
    const databaseOnly = await client.callTool({
      arguments: { families: ["database"], node_id: requirement },
      name: "get_neighbors",
    });

    const families = (structured: unknown) =>
      (structured as { edges: { family: string | null }[] }).edges.map(
        ({ family }) => family,
      );
    expect(families(all.structuredContent)).toContain("evidence");
    expect(new Set(families(evidenceOnly.structuredContent))).toEqual(
      new Set(["evidence"]),
    );
    // A band this workspace has no edges in answers with none — not with
    // everything, which is what an ignored filter would do.
    expect(families(databaseOnly.structuredContent)).toEqual([]);
  });

  it("advertises the families a traversal can name", async () => {
    const client = await connected();

    const schema = await client.callTool({
      arguments: {},
      name: "get_graph_schema",
    });
    const result = schema.structuredContent as {
      familyCounts: Record<string, number>;
      text: string;
    };

    expect(result.familyCounts).toMatchObject({ evidence: 1 });
    expect(result.text).toContain("families: ");
    // The flow line names tools that exist. It used to name three that had
    // been removed, which is how a second copy of a rule fails.
    for (const removed of ["search_nodes", "get_node_content", "route_query"]) {
      expect(result.text).not.toContain(removed);
    }
    expect(result.text).toContain("search_index");
  });
});

/**
 * The rest of the budget work (Phase 4 Wave E todo 22 ⑷⑹).
 *
 * `impact_of` says how it reached its set and whether the set is the answer
 * or a floor; the workspace read carries only the bands a call needs, and a
 * band it cannot answer for says so instead of answering empty.
 */
describe("impact confidence and the banded read", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function connected(workspace = workspaceFixture()) {
    const store = new InMemoryMcpStore({ workspaces: [workspace] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Impact",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);
    return client;
  }

  it("says how it reached the set, and whether the set is a floor", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { node_id: "01K287J3D18V7A1MZG9E8D1Y11" },
      name: "impact_of",
    });
    const { impact: report } = answer.structuredContent as {
      impact: {
        affected: Record<string, string[]>;
        bound: string;
        boundReasons: string[];
        confidence: Record<string, number>;
        targetRisk: unknown;
      };
    };

    // Tiers, counted from the edges that carried the walk. A set reached
    // through one resolved import and one agent assertion is not one claim.
    expect(Object.keys(report.confidence).sort()).toEqual([
      "agent_asserted",
      "inferred",
      "reference",
      "resolved",
      "unstated",
    ]);
    expect(
      Object.values(report.confidence).reduce((sum, count) => sum + count, 0),
    ).toBeGreaterThan(0);
    // Nothing was omitted and nothing truncated in this fixture, so the set
    // is the answer rather than a floor under it.
    expect(report.bound).toBe("exact");
    expect(report.boundReasons).toEqual([]);
    expect(Object.keys(report.affected).sort()).toEqual([
      "docs",
      "requirements",
      "routes",
      "tables",
      "tests",
    ]);
    // Absent from the risk map is not "safe": it is `null`, not a zero.
    expect(
      report.targetRisk === null || typeof report.targetRisk === "object",
    ).toBe(true);
  });

  it("calls the set a lower bound when the read left something out", async () => {
    const fixture = workspaceFixture();
    const withOmission = {
      ...fixture,
      repositories: fixture.repositories.map((repository) => ({
        ...repository,
        edgeOmissions: [
          {
            count: 3,
            reason: "the directory hierarchy is excluded from graph answers",
            relation: "contains",
          },
        ],
      })),
    };
    const client = await connected(withOmission);
    const answer = await client.callTool({
      arguments: { node_id: "01K287J3D18V7A1MZG9E8D1Y11" },
      name: "impact_of",
    });
    const { impact: report } = answer.structuredContent as {
      impact: { bound: string; boundReasons: string[] };
    };

    // An agent that reads a truncated impact set as complete concludes the
    // change is safe because it could not see what it would break.
    expect(report.bound).toBe("lower-bound");
    expect(report.boundReasons[0]).toContain("contains");
  });

  it("asks for a band by naming it, and answers `none` for a band with no edges", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: {
        families: ["route"],
        node_id: "01K287J3D18V7A1MZG9E8D1Y11",
      },
      name: "get_neighbors",
    });

    // The fixture has no route edges, so a filter that was being ignored
    // would answer with the structure edges instead of with none.
    expect(answer.structuredContent).toMatchObject({ edges: [] });
    expect(answer.isError).not.toBe(true);
  });

  it("names two repositories rather than picking one", async () => {
    const fixture = workspaceFixture();
    const [first] = fixture.repositories;
    const twin = {
      ...first!,
      fullName: "2klips/twin",
      id: "01K287J3D18V7A1MZG9E8D1Y90",
      artifacts: first!.artifacts.map((artifact) => ({
        ...artifact,
        id: `${artifact.id.slice(0, -1)}9`,
      })),
    };
    const client = await connected({
      ...fixture,
      repositories: [...fixture.repositories, twin],
    });
    const answer = await client.callTool({
      arguments: { path: "spec/WORK_SPEC.md" },
      name: "get_artifact",
    });
    const result = answer.structuredContent as {
      ambiguous?: { candidates: { repositoryFullName: string }[] };
      artifact: unknown;
    };

    // `src/index.ts` is not a name one project owns. Answering for the
    // lexicographically first repository answers a different question and
    // says nothing about having chosen (보완 R-01, todo 22 ⑹).
    expect(result.artifact).toBeNull();
    expect(
      result.ambiguous?.candidates.map(
        ({ repositoryFullName }) => repositoryFullName,
      ),
    ).toEqual(["2klips/alrescha-app", "2klips/twin"]);
  });

  it("caps a memory read and says how many it left out", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { limit: 1 },
      name: "memory_read",
    });

    // An answer shorter than the store is only honest if it says so.
    expect(answer.structuredContent).toMatchObject({ truncated: 0 });
  });
});

/**
 * The symbol layer (Phase 4 Wave F todo 26, OQ-031 ⑴).
 *
 * A default read carries no symbol. Naming one is how a caller asks, and
 * what arrives is that symbol's file, its declaration and its `extends`
 * neighbours — one hop, both directions — merged into the same workspace
 * the other tools read. The catalogue does not change: the layer is not a
 * search type, not a relation filter, not a band. It is a node id.
 */
describe("the symbol layer", () => {
  const FILE = "01K287J3D18V7A1MZG9E8D1Y12";
  const REQUIREMENT = "01K287J3D18V7A1MZG9E8D1Y21";
  const INGEST = "01K287J3D18V7A1MZG9E8D1Y81";
  const PARSER = "01K287J3D18V7A1MZG9E8D1Y82";
  const BASE = "01K287J3D18V7A1MZG9E8D1Y83";
  const PATH = "packages/core/src/evidence/ci-reports.ts";
  const clients: Client[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
  });

  function symbol(
    nodeId: string,
    name: string,
    kind: string,
    startLine: number,
    endLine: number,
  ): McpSymbolData {
    return {
      artifactNodeId: FILE,
      container: null,
      endLine,
      engine: "typescript-ast",
      kind,
      name,
      nodeId,
      path: PATH,
      repositoryId: REPOSITORY_ID,
      stableKey: `k-${name}`,
      startLine,
    };
  }

  /** The fixture with one file's layer: two classes, one extending the other. */
  function layered(): McpWorkspaceData {
    const workspace = workspaceFixture();
    const repository = workspace.repositories[0];
    if (!repository) throw new Error("fixture has no repository");
    return {
      ...workspace,
      repositories: [
        {
          ...repository,
          indexEntries: [
            ...repository.indexEntries,
            {
              headings: [],
              id: "01K287J3D18V7A1MZG9E8D1Y63",
              neighborIds: [],
              nodeId: FILE,
              path: PATH,
              searchKey:
                "packages/core/src/evidence/ci-reports.ts ci-reports.ts code_metadata ingestcitestreports reportparser baseparser",
              symbols: ["ingestCiTestReports", "ReportParser", "BaseParser"],
              tags: ["code_metadata", "code_metadata"],
              title: "ci-reports.ts",
              type: "artifact",
            },
          ],
          symbolEdges: [
            edge({
              family: "hierarchy",
              id: `declares:${FILE}->${INGEST}`,
              relation: "declares",
              sourceNodeId: FILE,
              targetNodeId: INGEST,
              tier: "resolved",
            }),
            edge({
              family: "hierarchy",
              id: `declares:${FILE}->${PARSER}`,
              relation: "declares",
              sourceNodeId: FILE,
              targetNodeId: PARSER,
              tier: "resolved",
            }),
            edge({
              family: "hierarchy",
              id: `declares:${FILE}->${BASE}`,
              relation: "declares",
              sourceNodeId: FILE,
              targetNodeId: BASE,
              tier: "resolved",
            }),
            edge({
              family: "structure",
              id: `extends:${PARSER}->${BASE}`,
              relation: "extends",
              sourceNodeId: PARSER,
              targetNodeId: BASE,
              tier: "resolved",
            }),
          ],
          symbols: [
            symbol(INGEST, "ingestCiTestReports", "function", 1, 40),
            symbol(PARSER, "ReportParser", "class", 42, 60),
            symbol(BASE, "BaseParser", "class", 62, 70),
          ],
        },
      ],
    };
  }

  async function connected() {
    const store = new InMemoryMcpStore({ workspaces: [layered()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Symbols",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const { client, transport } = createSdkClient(
      endpoint.fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);
    return client;
  }

  it("stays out of a default read", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { node_id: FILE },
      name: "get_neighbors",
    });
    const result = answer.structuredContent as {
      edges: { relation: string }[];
      found: boolean;
      nodes: { id: string; type: string }[];
    };
    expect(result.found).toBe(true);
    // The file's neighbourhood is what it was: no symbol, no `declares`.
    expect(result.nodes.some((node) => node.type === "symbol")).toBe(false);
    expect(result.edges.some((e) => e.relation === "declares")).toBe(false);
  });

  it("arrives when a symbol is named, one hop and no further", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { node_id: PARSER },
      name: "get_neighbors",
    });
    const result = answer.structuredContent as {
      edges: { relation: string; sourceNodeId: string; targetNodeId: string }[];
      found: boolean;
      nodes: { id: string; path: string | null; type: string }[];
    };
    expect(result.found).toBe(true);
    // The file that declares it, the base it extends — and not the sibling
    // function nobody asked about.
    expect(result.nodes.map(({ id }) => id).sort()).toEqual(
      [FILE, PARSER, BASE].sort(),
    );
    expect(result.nodes.find(({ id }) => id === PARSER)).toMatchObject({
      path: PATH,
      type: "symbol",
    });
    expect(
      result.edges
        .map((e) => `${e.relation} ${e.sourceNodeId} -> ${e.targetNodeId}`)
        .sort(),
    ).toEqual(
      [`declares ${FILE} -> ${PARSER}`, `extends ${PARSER} -> ${BASE}`].sort(),
    );
  });

  it("answers impact for a base class with what extends it and what declares it", async () => {
    const client = await connected();
    const related = await client.callTool({
      arguments: { node_id: BASE },
      name: "impact_of",
    });
    expect(related.structuredContent).toMatchObject({
      found: true,
      impact: { dependents: { nodeIds: [FILE, PARSER].sort() } },
    });

    const directional = await client.callTool({
      arguments: { mode: "dependency-impact", node_id: BASE },
      name: "impact_of",
    });
    const report = (
      directional.structuredContent as {
        impact: { dependencyImpact: { candidates: { nodeId: string }[] } };
      }
    ).impact.dependencyImpact;
    // The subclass depends on the base; so does the file that declares it.
    expect(report.candidates.map(({ nodeId }) => nodeId).sort()).toEqual(
      [FILE, PARSER].sort(),
    );
  });

  it("traces a path from a symbol into the file graph", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { from_node_id: PARSER, to_node_id: REQUIREMENT },
      name: "trace_path",
    });
    expect(answer.structuredContent).toMatchObject({
      found: true,
      path: {
        explain: [
          `${FILE} -declares-> ${PARSER}`,
          `${REQUIREMENT} -implements-> ${FILE}`,
        ],
        hops: 2,
        nodeIds: [PARSER, FILE, REQUIREMENT],
      },
    });
  });

  it("carries a symbol hit's span and node id on the search result", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { query: "ReportParser" },
      name: "search_index",
    });
    const result = answer.structuredContent as {
      results: { nodeId: string; symbols?: unknown }[];
    };
    const hit = result.results.find(({ nodeId }) => nodeId === FILE);
    expect(hit?.symbols).toEqual([
      {
        kind: "class",
        name: "ReportParser",
        nodeId: PARSER,
        span: `${PATH}:42-60`,
      },
    ]);
    // A hit that matched nothing symbol-shaped carries no such field.
    const spec = result.results.find(
      ({ nodeId }) => nodeId === "01K287J3D18V7A1MZG9E8D1Y11",
    );
    expect(spec === undefined || spec.symbols === undefined).toBe(true);
  });

  /**
   * What a search hit needs from the layer is a name, a kind and a span —
   * never an edge (RE-04). Reading the hit files' whole neighbourhood put
   * every symbol of every hit file into one request's URL, twice; rebuilt
   * from this repository, a single export name made that request 8,568
   * characters, because a barrel file re-exporting 135 names was among the
   * hits.
   */
  it("reads a search hit's symbols by file, and never their edges", async () => {
    const neighbourhoods: (readonly string[])[] = [];
    const fileReads: (readonly string[])[] = [];
    class RecordingStore extends InMemoryMcpStore {
      override async loadSymbolNeighborhood(
        ...args: Parameters<InMemoryMcpStore["loadSymbolNeighborhood"]>
      ) {
        neighbourhoods.push(args[1].nodeIds);
        return super.loadSymbolNeighborhood(...args);
      }
      override async loadFileSymbols(
        ...args: Parameters<InMemoryMcpStore["loadFileSymbols"]>
      ) {
        fileReads.push(args[1].fileIds);
        return super.loadFileSymbols(...args);
      }
    }
    const store = new RecordingStore({ workspaces: [layered()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Symbols",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const { client, transport } = createSdkClient(
      createHostedMcpEndpoint({ store }).fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    const answer = await client.callTool({
      arguments: { query: "ReportParser" },
      name: "search_index",
    });
    const hit = (
      answer.structuredContent as {
        results: { nodeId: string; symbols?: unknown }[];
      }
    ).results.find(({ nodeId }) => nodeId === FILE);
    expect(hit?.symbols).toEqual([
      {
        kind: "class",
        name: "ReportParser",
        nodeId: PARSER,
        span: `${PATH}:42-60`,
      },
    ]);
    // One read, of the one hit file whose symbols matched — no neighbourhood.
    expect(fileReads).toEqual([[FILE]]);
    expect(neighbourhoods).toEqual([]);
  });

  /**
   * Search ranks by the index's neighbour cache (RE-04), so it asks for no
   * edge — on the pilot they were 3.6 of 4.7 MB and four sequential requests
   * of every search. The graph tools still read them: their answer is the
   * edges.
   */
  it("reads no edge for a search, and the graph tools still do", async () => {
    const reads: { edges: boolean | undefined; tool: string }[] = [];
    let tool = "";
    class RecordingStore extends InMemoryMcpStore {
      override async loadWorkspace(
        ...args: Parameters<InMemoryMcpStore["loadWorkspace"]>
      ) {
        reads.push({ edges: args[1]?.edges, tool });
        return super.loadWorkspace(...args);
      }
    }
    const store = new RecordingStore({ workspaces: [layered()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Edges",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const { client, transport } = createSdkClient(
      createHostedMcpEndpoint({ store }).fetch,
      issued.secret,
    );
    clients.push(client);
    await client.connect(transport);

    tool = "search_index";
    const found = await client.callTool({
      arguments: { query: "ReportParser" },
      name: "search_index",
    });
    expect(found.isError).not.toBe(true);
    tool = "get_neighbors";
    await client.callTool({
      arguments: { node_id: FILE },
      name: "get_neighbors",
    });
    expect(reads).toEqual([
      { edges: false, tool: "search_index" },
      { edges: undefined, tool: "get_neighbors" },
    ]);

    // The in-memory store says what it left out, as the hosted one does.
    const principal = {
      scopes: ["mcp:read" as const],
      tokenId: issued.record.id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    };
    const without = await new InMemoryMcpStore({
      workspaces: [layered()],
    }).loadWorkspace(principal, { edges: false });
    expect(without.repositories.every(({ edges }) => edges.length === 0)).toBe(
      true,
    );
    expect(without.coverage?.truncated).toContainEqual({
      limit: 0,
      table: "edges",
    });
  });

  it("does not find an id that names neither a file nor a symbol", async () => {
    const client = await connected();
    const answer = await client.callTool({
      arguments: { node_id: "01K287J3D18V7A1MZG9E8D1Y99" },
      name: "get_neighbors",
    });
    expect(answer.structuredContent).toMatchObject({ found: false });
  });

  it("changes nothing in the catalogue", async () => {
    const client = await connected();
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(21);
    // Not a search type, not a relation filter: the layer is reached by id.
    expect(NODE_TYPE_SCHEMA.options).not.toContain("symbol");
    expect(RELATION_SCHEMA.options).not.toContain("declares");
    expect(RELATION_SCHEMA.options).not.toContain("extends");
  });
});
