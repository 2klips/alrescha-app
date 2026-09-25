import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryMcpStore,
  createHostedMcpEndpoint,
  searchWorkspaceIndexPage,
} from "../packages/mcp/src/index";
import type {
  McpRepositoryData,
  McpSectionData,
  McpWorkspaceData,
} from "../packages/mcp/src/index";

/**
 * RE-04 — the Korean a search can already see.
 *
 * The scan indexes a file by its path, its name, its classification and its
 * symbols. A document's headings are never indexed (`index_entries.headings`
 * is written empty), so on the pilot — whose documents are mostly Korean —
 * a Korean question found nothing: 0 of 40 document titles, 0 of 40
 * decision-record headings (docs/reports/re-04-search-cost.probe.mjs).
 *
 * One Korean text *is* in every workspace read: the ADR, OQ, G and MT
 * headings the scan keeps as section nodes, 88 of the pilot's 92 in
 * Korean. Search now matches them and answers with the document that
 * declares them, saying which section matched. It does not make document
 * titles searchable — that needs the scan to index headings.
 */

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1S01";
const USER_ID = "user-sections";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1S10";
const OTHER_REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1S20";
const DECISIONS = "spec/DECISIONS-ADR.md";

function repository(
  id: string,
  prefix: string,
  sections: readonly McpSectionData[],
): McpRepositoryData {
  const files = [DECISIONS, "spec/OPEN_QUESTIONS.md", "src/restore.ts"];
  return {
    artifacts: files.map((path, index) => ({
      content: `stored summary of ${path}`,
      headings: [],
      id: `${prefix}${index}`,
      kind: path.endsWith(".md") ? "spec" : "code_metadata",
      path,
      status: "active",
      summary: "",
      symbols: [],
      tags: [],
      title: path,
    })),
    contextPacks: [],
    defaultBranch: "main",
    edges: [],
    evidence: [],
    findings: [],
    fullName: `fixture/${id}`,
    id,
    indexEntries: files.map((path, index) => ({
      // As the scan writes them: no heading, a key built from the path.
      headings: [],
      id: `${prefix}e${index}`,
      neighborIds: [],
      nodeId: `${prefix}${index}`,
      path,
      searchKey: `${path} ${path.split("/").at(-1)}`.toLowerCase(),
      symbols: [],
      tags: [path.endsWith(".md") ? "spec" : "code_metadata"],
      title: path.split("/").at(-1) ?? path,
      type: "artifact",
    })),
    overview: "",
    receipts: [],
    requirements: [],
    sections: [...sections],
  };
}

function section(
  token: string,
  heading: string,
  sourcePath: string,
  nodeId: string,
): McpSectionData {
  return { heading, nodeId, sourcePath, token };
}

function workspace(): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [
      repository(REPOSITORY_ID, "a", [
        section("ADR-012", "ADR-012 복원 절차 이행", DECISIONS, "sec-adr-12"),
        section(
          "ADR-013",
          "ADR-013 구현 — 스코프 경계 교체",
          DECISIONS,
          "sec-adr-13",
        ),
        section(
          "OQ-006",
          "OQ-006 — 캔버스 히트 레이어 (해소)",
          "spec/OPEN_QUESTIONS.md",
          "sec-oq-6",
        ),
      ]),
      // The same path in another repository declares a different decision.
      repository(OTHER_REPOSITORY_ID, "b", [
        section("ADR-001", "ADR-001 배포 절차", DECISIONS, "sec-other-1"),
      ]),
    ],
  };
}

describe("searching the section headings a read carries", () => {
  it("answers a Korean question with the document that declares the heading", () => {
    const page = searchWorkspaceIndexPage(workspace(), { query: "복원 절차" });
    expect(page.results.map(({ nodeId }) => nodeId)).toEqual(["a0"]);
    expect(page.results[0]).toMatchObject({
      path: DECISIONS,
      rank: "title-heading",
      repositoryId: REPOSITORY_ID,
      sections: [
        {
          heading: "ADR-012 복원 절차 이행",
          nodeId: "sec-adr-12",
          token: "ADR-012",
        },
      ],
    });
  });

  it("keeps a repository's sections to its own documents", () => {
    // "배포 절차" is only the other repository's decision, and it answers
    // there — not on this repository's file at the same path.
    const page = searchWorkspaceIndexPage(workspace(), { query: "배포 절차" });
    expect(
      page.results.map(({ nodeId, repositoryId }) => [nodeId, repositoryId]),
    ).toEqual([["b0", OTHER_REPOSITORY_ID]]);
  });

  it("names every section that matched, and only those", () => {
    const page = searchWorkspaceIndexPage(workspace(), { query: "ADR" });
    const decisions = page.results.find(({ nodeId }) => nodeId === "a0") as
      { sections?: unknown } | undefined;
    expect(decisions?.sections).toEqual([
      {
        heading: "ADR-012 복원 절차 이행",
        nodeId: "sec-adr-12",
        token: "ADR-012",
      },
      {
        heading: "ADR-013 구현 — 스코프 경계 교체",
        nodeId: "sec-adr-13",
        token: "ADR-013",
      },
    ]);
    // A hit that matched no section carries no such field.
    const code = searchWorkspaceIndexPage(workspace(), { query: "restore" });
    expect(code.results[0]?.path).toBe("src/restore.ts");
    expect("sections" in (code.results[0] ?? {})).toBe(false);
  });

  /**
   * The store keeps only its budget of section rows and says so in
   * `coverage.truncated`. A heading past that budget is not in the read, so
   * a question only it answers finds nothing — and that page must say the
   * read was partial, not that the repository holds no such decision.
   */
  it("calls a page partial when the section read ran out", () => {
    const whole = workspace();
    expect(
      searchWorkspaceIndexPage(whole, { query: "복원 절차" }).results,
    ).toHaveLength(1);

    const [first, ...rest] = whole.repositories;
    const capped: McpWorkspaceData = {
      ...whole,
      coverage: {
        readConsistency: "unproven",
        result: "partial",
        truncated: [{ limit: 2_000, table: "sections" }],
      },
      repositories: [
        {
          ...first!,
          sections: (first!.sections ?? []).filter(
            ({ token }) => token !== "ADR-012",
          ),
        },
        ...rest,
      ],
    };
    const page = searchWorkspaceIndexPage(capped, { query: "복원 절차" });
    expect(page.results).toEqual([]);
    expect(page.coverage).toEqual({
      reason: "sections stopped at 2000 rows",
      result: "partial",
    });
  });

  it("stays complete when the only table left out is the edges search never reads", () => {
    // What `loadWorkspace(principal, { edges: false })` reports for a search.
    const page = searchWorkspaceIndexPage(
      {
        ...workspace(),
        coverage: {
          readConsistency: "unproven",
          result: "partial",
          truncated: [{ limit: 0, table: "edges" }],
        },
      },
      { query: "복원 절차" },
    );
    expect(page.results.map(({ nodeId }) => nodeId)).toEqual(["a0"]);
    expect(page.coverage).toEqual({ reason: null, result: "complete" });
  });

  it("finds nothing for a word no heading, path or symbol holds", () => {
    expect(
      searchWorkspaceIndexPage(workspace(), { query: "존재하지 않는 결정" })
        .results,
    ).toEqual([]);
  });
});

describe("the hosted tool", () => {
  const clients: Client[] = [];
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
  });

  it("returns the matched sections on the wire", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspace()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "Sections",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const client = new Client(
      { name: "re-04-sections", version: "1.0.0" },
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
    const answer = await client.callTool({
      arguments: { include_excerpt: false, query: "캔버스 히트" },
      name: "search_index",
    });
    const result = answer.structuredContent as {
      results: { path: string; sections?: unknown }[];
    };
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      path: "spec/OPEN_QUESTIONS.md",
      sections: [
        {
          heading: "OQ-006 — 캔버스 히트 레이어 (해소)",
          nodeId: "sec-oq-6",
          token: "OQ-006",
        },
      ],
    });
  });
});
