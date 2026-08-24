import { describe, expect, it } from "vitest";

import {
  buildRepoOverview,
  findModuleForNode,
  repositoryModules,
} from "./module-tools";
import type { McpRepositoryData, McpWorkspaceData } from "./store";

/**
 * Phase 3 Wave C todo 8 — lazy module summaries, the three states:
 * pending (nothing cached), ready (digest matches), stale (members moved).
 */

function artifact(id: string, path: string, blobSha: string) {
  return {
    blobSha,
    content: "",
    headings: [],
    id,
    kind: "code_metadata",
    path,
    status: "active",
    summary: path,
    symbols: [],
    tags: [],
    title: path,
  };
}

function repository(
  overrides: Partial<McpRepositoryData> = {},
): McpRepositoryData {
  return {
    artifacts: [
      artifact("n1", "src/auth/login.ts", "b1"),
      artifact("n2", "src/auth/session.ts", "b2"),
      artifact("n3", "docs/readme.md", "b3"),
    ],
    contextPacks: [],
    defaultBranch: "main",
    edges: [
      { id: "e1", relation: "imports", sourceNodeId: "n1", targetNodeId: "n2" },
    ],
    evidence: [],
    findings: [],
    fullName: "acme/app",
    id: "repo-1",
    indexEntries: [],
    overview: "acme/app on main",
    receipts: [],
    requirements: [],
    ...overrides,
  };
}

function workspace(repo: McpRepositoryData): McpWorkspaceData {
  return {
    id: "ws-1",
    memoryBlocks: [],
    ownerUserId: "user-1",
    repositories: [repo],
  } as unknown as McpWorkspaceData;
}

describe("repositoryModules", () => {
  it("clusters only structure-linked files", () => {
    const clusters = repositoryModules(repository());
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      key: "module:src/auth/login.ts",
      members: ["src/auth/login.ts", "src/auth/session.ts"],
      name: "src/auth",
    });
  });
});

describe("findModuleForNode — the three cache states", () => {
  it("pending when nothing is cached", () => {
    const explanation = findModuleForNode(workspace(repository()), "n1");
    expect(explanation).toMatchObject({ state: "pending", summary: null });
    expect(explanation?.memberDigest).toMatch(/^[0-9a-f]{32}$/);
  });

  it("ready when the cached digest matches the members", () => {
    const base = repository();
    const digest = findModuleForNode(workspace(base), "n1")?.memberDigest ?? "";
    const cached = repository({
      moduleSummaries: [
        {
          memberDigest: digest,
          memberPaths: ["src/auth/login.ts", "src/auth/session.ts"],
          moduleKey: "module:src/auth/login.ts",
          name: "src/auth",
          summary: "The auth module in prose.",
        },
      ],
    });
    const explanation = findModuleForNode(workspace(cached), "n2");
    expect(explanation?.state).toBe("ready");
    expect(explanation?.summary?.summary).toContain("auth module");
  });

  it("stale when a member blob moved — cached prose still surfaced", () => {
    const moved = repository({
      artifacts: [
        artifact("n1", "src/auth/login.ts", "b1-changed"),
        artifact("n2", "src/auth/session.ts", "b2"),
        artifact("n3", "docs/readme.md", "b3"),
      ],
      moduleSummaries: [
        {
          memberDigest: "old-digest",
          memberPaths: ["src/auth/login.ts", "src/auth/session.ts"],
          moduleKey: "module:src/auth/login.ts",
          name: "src/auth",
          summary: "Yesterday's prose.",
        },
      ],
    });
    const explanation = findModuleForNode(workspace(moved), "n1");
    expect(explanation?.state).toBe("stale");
    expect(explanation?.summary?.summary).toBe("Yesterday's prose.");
  });

  it("null for files outside any structure cluster", () => {
    expect(findModuleForNode(workspace(repository()), "n3")).toBeNull();
  });
});

describe("buildRepoOverview", () => {
  it("lists modules deterministically and serves only fresh prose", () => {
    const base = repository();
    const digest = findModuleForNode(workspace(base), "n1")?.memberDigest ?? "";
    const cached = repository({
      moduleSummaries: [
        {
          memberDigest: digest,
          memberPaths: ["src/auth/login.ts", "src/auth/session.ts"],
          moduleKey: "module:src/auth/login.ts",
          name: "src/auth",
          summary: "Fresh prose.",
        },
      ],
    });
    const fresh = buildRepoOverview(workspace(cached));
    expect(fresh.text).toContain("acme/app — 3 files");
    expect(fresh.text).toContain("src/auth (2 files): Fresh prose.");

    const stale = buildRepoOverview(
      workspace(
        repository({
          moduleSummaries: [
            {
              memberDigest: "old",
              memberPaths: ["src/auth/login.ts", "src/auth/session.ts"],
              moduleKey: "module:src/auth/login.ts",
              name: "src/auth",
              summary: "Old prose.",
            },
          ],
        }),
      ),
    );
    expect(stale.text).toContain("src/auth (2 files)");
    expect(stale.text).not.toContain("Old prose.");
  });
});
