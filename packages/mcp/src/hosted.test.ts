import {
  Client,
  InMemoryResponseCacheStore,
  ProtocolError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHostedMcpEndpoint, InMemoryMcpStore } from "./index";
import type { McpWorkspaceData } from "./index";

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
          {
            id: "01K287J3D18V7A1MZG9E8D1Y51",
            relation: "implements",
            sourceNodeId: "01K287J3D18V7A1MZG9E8D1Y21",
            targetNodeId: "01K287J3D18V7A1MZG9E8D1Y12",
          },
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
      "get_node_content",
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
      "request_context_pack",
      "route_query",
      "search_index",
      "search_nodes",
      "trace_path",
    ]);
    expect(
      listed.tools.every(
        (tool) =>
          tool.inputSchema.type === "object" &&
          tool.outputSchema?.type === "object",
      ),
    ).toBe(true);
    expect(
      listed.tools.every((tool) => tool.annotations?.destructiveHint === false),
    ).toBe(true);
    expect(listed.tools.map(({ name }) => name)).not.toContain(
      "create_pull_request",
    );
    expect(listed.tools.map(({ name }) => name)).not.toContain("write_file");
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
          outputSchema: tool.outputSchema,
        })),
      );
    }

    expect(catalogs[1]).toEqual(catalogs[0]);
    expect(catalogs[2]).toEqual(catalogs[0]);
    expect((catalogs[0] as unknown[]).length).toBe(22);
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
            "id",
            "occurredAt",
            "targetNodeIds",
            "tokenId",
            "tool",
            "workspaceId",
          ]),
      ),
    ).toBe(true);
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
      arguments: { query: "CI evidence policy" },
      name: "search_nodes",
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
      arguments: { domain_filter: "frontend", query: "CI evidence policy" },
      name: "search_nodes",
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
      impact: { dependents: { nodeIds: [requirement] } },
    });

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
      arguments: { node_id: requirement },
      name: "get_node_content",
    });
    expect(content.structuredContent).toMatchObject({
      node: {
        content: "Every active requirement needs same-commit test evidence.",
        id: requirement,
        type: "requirement",
      },
    });

    // The batch form fetches up to four nodes in one round-trip; unknown ids
    // are dropped rather than erroring the whole batch.
    const batch = await client.callTool({
      arguments: { node_ids: [requirement, "01K287J3D18V7A1MZG9E8D1Y11"] },
      name: "get_node_content",
    });
    const batchContent = batch.structuredContent as {
      node: unknown;
      nodes: { id: string }[];
    };
    expect(batchContent.node).toBeNull();
    expect(batchContent.nodes.map(({ id }) => id)).toEqual([
      requirement,
      "01K287J3D18V7A1MZG9E8D1Y11",
    ]);
    const missing = await client.callTool({
      arguments: { node_ids: [requirement, "unknown-node-id"] },
      name: "get_node_content",
    });
    expect(
      (missing.structuredContent as { nodes: unknown[] }).nodes,
    ).toHaveLength(1);
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
      arguments: { question: "private routing question about spec/auth.md" },
      name: "route_query",
    });
    await client.callTool({
      arguments: { query: "CI evidence" },
      name: "search_nodes",
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
      arguments: { node_id: doc },
      name: "get_node_content",
    });

    await vi.waitFor(() =>
      expect(store.accessEventsForWorkspace(WORKSPACE_ID)).toHaveLength(6),
    );
    const events = store.accessEventsForWorkspace(WORKSPACE_ID);
    expect(events.map(({ tool }) => tool)).toEqual([
      "route_query",
      "search_nodes",
      "get_neighbors",
      "trace_path",
      "impact_of",
      "get_node_content",
    ]);
    expect(events[0]?.targetNodeIds).toEqual([]);
    for (const event of events.slice(1)) {
      expect(event.targetNodeIds.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(events)).not.toContain("private routing question");
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
      arguments: { node_id: foreignNode },
      name: "get_node_content",
    });
    expect(content.structuredContent).toMatchObject({ node: null });
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

  it("routes by question shape and always carries a fallback", async () => {
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

    const simple = await client.callTool({
      arguments: { question: "크레딧 단가 문서 찾아줘" },
      name: "route_query",
    });
    expect(simple.structuredContent).toMatchObject({
      fallback: { route: "graph" },
      route: "search",
    });

    const relational = await client.callTool({
      arguments: { question: "spec/auth.md와 연결된 코드 영역은?" },
      name: "route_query",
    });
    const decision = relational.structuredContent as {
      fallback: { route: string; tools: string[] };
      matchedSignals: string[];
      recommendedTools: string[];
      route: string;
    };
    expect(decision.route).toBe("graph");
    expect(decision.matchedSignals).toContain("connection");
    expect(decision.recommendedTools).toContain("trace_path");
    // The misroute escape hatch: an empty graph result falls back to search.
    expect(decision.fallback.route).toBe("search");
    expect(decision.fallback.tools).toContain("search_index");
  });
});
