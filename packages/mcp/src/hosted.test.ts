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
        fullName: "2klips/specproof-app",
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
    { name: "specproof-contract-test", version: "1.0.0" },
    {
      cachePartition: token.slice(0, 12),
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.specproof.test/mcp"),
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
      name: "specproof",
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
        resource.uri.startsWith(`specproof://workspace/${WORKSPACE_ID}/`),
      ),
    ).toBe(true);
    expect(
      listed.resources.some((resource) =>
        resource.uri.includes(otherWorkspaceId),
      ),
    ).toBe(false);
    await expect(
      client.readResource({
        uri: `specproof://workspace/${otherWorkspaceId}/overview`,
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
        uri: `specproof://workspace/${WORKSPACE_ID}/overview`,
      },
      {
        name: "artifacts",
        uri: `specproof://workspace/${WORKSPACE_ID}/artifacts`,
      },
      {
        name: "findings",
        uri: `specproof://workspace/${WORKSPACE_ID}/findings`,
      },
      {
        name: "receipts-summary",
        uri: `specproof://workspace/${WORKSPACE_ID}/receipts-summary`,
      },
      {
        name: "context-packs",
        uri: `specproof://workspace/${WORKSPACE_ID}/context-packs`,
      },
    ]);

    const result = await client.readResource({
      uri: `specproof://workspace/${WORKSPACE_ID}/findings`,
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
      "get_artifact",
      "get_findings",
      "log_progress",
      "query_brain",
      "record_note",
      "request_context_pack",
      "search_index",
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
          score: 400,
          type: "artifact",
        },
        {
          nodeId: "01K287J3D18V7A1MZG9E8D1Y21",
          rank: "graph-neighbor",
          score: 100,
          type: "requirement",
        },
      ],
      workspaceId: WORKSPACE_ID,
    });

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
        task_description: "Update CI evidence ingestion",
        token_budget: 128,
      },
      name: "request_context_pack",
    });
    expect(context.structuredContent).toMatchObject({
      estimatedTokens: expect.any(Number),
      excluded: [
        {
          path: "packages/core/src/evidence/ci-reports.ts",
          reason: "outside selected context pack",
        },
      ],
      nodeIds: ["01K287J3D18V7A1MZG9E8D1Y11", "01K287J3D18V7A1MZG9E8D1Y21"],
      paths: ["spec/WORK_SPEC.md"],
      title: "CI evidence context",
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

    const progress = await client.callTool({
      arguments: {
        refs: ["spec/WORK_SPEC.md", "0f00bfb"],
        status: "done",
        summary: "Implemented hosted MCP contract.",
        task: "Task 15",
      },
      name: "log_progress",
    });
    expect(progress.isError).not.toBe(true);
    expect(progress.structuredContent).toMatchObject({
      event: {
        id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
        status: "done",
        summary: "Implemented hosted MCP contract.",
        task: "Task 15",
      },
    });
    expect(store.progressEventsForWorkspace(WORKSPACE_ID)).toHaveLength(1);

    const invalid = await client.callTool({
      arguments: {
        status: "progress",
        summary: "x".repeat(201),
        task: "Task 15",
      },
      name: "log_progress",
    });
    expect(invalid.isError).toBe(true);
    expect(store.progressEventsForWorkspace(WORKSPACE_ID)).toHaveLength(1);

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
    expect(store.progressEventsForWorkspace(WORKSPACE_ID)).toHaveLength(1);

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
        task_description: "private prompt content must not be logged",
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
        new URL("https://mcp.specproof.test/mcp"),
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
});
