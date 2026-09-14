import { moduleMemberDigest } from "@alrescha/core";
import { describe, expect, it } from "vitest";

import {
  buildDocSkeletonPages,
  createDocSkeletonJobHandler,
  reservedDocPageHandler,
  type DocSkeletonPage,
  type DocSkeletonRows,
} from "./doc-skeleton-job";
import type { ClaimedJob } from "./queue";

/**
 * The skeleton pass as pure computation (Phase 4 Wave D todo 20): which
 * pages a repository's rows produce, what each carries, and what the
 * handler does with them. Bodies never appear in the input, which is the
 * property the whole design protects.
 */

const rows = (): DocSkeletonRows => ({
  artifacts: [
    {
      blobSha: "a".repeat(40),
      exportedSymbols: ["createSession", "isSessionExpired"],
      nodeId: "n-session",
      path: "src/session.ts",
    },
    {
      blobSha: "b".repeat(40),
      exportedSymbols: [],
      nodeId: "n-session-test",
      path: "tests/session.test.ts",
    },
    {
      blobSha: "c".repeat(40),
      exportedSymbols: ["health"],
      nodeId: "n-health",
      path: "src/api/health.ts",
    },
    {
      blobSha: "d".repeat(40),
      exportedSymbols: [],
      nodeId: "n-spec",
      path: "spec.md",
    },
  ],
  directories: [
    { nodeId: "n-dir-src", path: "src" },
    { nodeId: "n-dir-src-api", path: "src/api" },
    { nodeId: "n-dir-empty", path: "assets" },
  ],
  edges: [
    // The test imports the file: one module of two.
    {
      relation: "imports",
      sourceNodeId: "n-session-test",
      targetNodeId: "n-session",
    },
    // A requirement the analysis linked to the file.
    {
      relation: "implements",
      sourceNodeId: "n-req",
      targetNodeId: "n-session",
    },
    // Hierarchy: excluded from every page.
    {
      relation: "contains",
      sourceNodeId: "n-dir-src",
      targetNodeId: "n-session",
    },
  ],
  nodes: [
    {
      kind: "artifact",
      nodeId: "n-session",
      path: "src/session.ts",
      title: "session.ts",
    },
    {
      kind: "artifact",
      nodeId: "n-session-test",
      path: "tests/session.test.ts",
      title: "session.test.ts",
    },
    {
      kind: "artifact",
      nodeId: "n-health",
      path: "src/api/health.ts",
      title: "health.ts",
    },
    { kind: "artifact", nodeId: "n-spec", path: "spec.md", title: "spec.md" },
    {
      kind: "requirement",
      nodeId: "n-req",
      path: "spec.md",
      title: "R-01 session timeout",
    },
    { kind: "directory", nodeId: "n-dir-src", path: "src", title: "src" },
    {
      kind: "directory",
      nodeId: "n-dir-src-api",
      path: "src/api",
      title: "src/api",
    },
    {
      kind: "directory",
      nodeId: "n-dir-empty",
      path: "assets",
      title: "assets",
    },
  ],
  repositoryFullName: "acme/app",
});

const SHA = "1".repeat(40);

describe("buildDocSkeletonPages", () => {
  it("produces the repository page, one module page per cluster, and a page per directory with members", () => {
    const pages = buildDocSkeletonPages(rows(), SHA);
    expect(
      pages.map(({ identityKey, scope }) => `${scope} ${identityKey}`),
    ).toEqual([
      "repo repo:acme/app",
      "module module:src/session.ts",
      "directory directory:src",
      "directory directory:src/api",
    ]);
    // The empty folder has no page: a face with nothing behind it.
    expect(
      pages.some(({ identityKey }) => identityKey === "directory:assets"),
    ).toBe(false);
  });

  it("gives node scopes no anchor and attached scopes their node", () => {
    const pages = buildDocSkeletonPages(rows(), SHA);
    const byKey = new Map(pages.map((page) => [page.identityKey, page]));
    expect(byKey.get("repo:acme/app")).not.toHaveProperty("anchorNodeId");
    expect(byKey.get("module:src/session.ts")).not.toHaveProperty(
      "anchorNodeId",
    );
    expect(byKey.get("directory:src")?.anchorNodeId).toBe("n-dir-src");
    expect(byKey.get("directory:src")?.memberPaths).toEqual([
      "src/api/health.ts",
      "src/session.ts",
    ]);
    expect(byKey.get("directory:src/api")?.memberPaths).toEqual([
      "src/api/health.ts",
    ]);
  });

  it("carries names and counts only — symbols, relation counts, citations outside the members — and never the hierarchy", () => {
    const pages = buildDocSkeletonPages(rows(), SHA);
    const module = pages.find(
      ({ identityKey }) => identityKey === "module:src/session.ts",
    )!;
    // No shared directory between src/ and tests/, so the seed file names it.
    expect(module.title).toBe("src/session.ts");
    expect(module.memberPaths).toEqual([
      "src/session.ts",
      "tests/session.test.ts",
    ]);
    expect(module.skeleton.symbols).toEqual([
      "createSession",
      "isSessionExpired",
    ]);
    // The import is between two members: counted, cites nobody. The
    // requirement is outside: counted, and the one citation candidate.
    expect(module.skeleton.relations).toEqual({ implements: 1, imports: 1 });
    expect(module.skeleton.citations).toEqual([
      {
        kind: "requirement",
        nodeId: "n-req",
        path: "spec.md",
        title: "R-01 session timeout",
      },
    ]);
    expect(JSON.stringify(module)).not.toContain("contains");
    expect(module.commitSha).toBe(SHA);
  });

  it("seals the member set with the same digest the module summary compares", () => {
    const pages = buildDocSkeletonPages(rows(), SHA);
    const module = pages.find(
      ({ identityKey }) => identityKey === "module:src/session.ts",
    )!;
    expect(module.memberDigest).toBe(
      moduleMemberDigest([
        { blobSha: "a".repeat(40), path: "src/session.ts" },
        { blobSha: "b".repeat(40), path: "tests/session.test.ts" },
      ]),
    );
    // A different blob is a different digest, so stored prose written for
    // the old members is `superseded` rather than served.
    const moved = buildDocSkeletonPages(
      {
        ...rows(),
        artifacts: rows().artifacts.map((artifact) =>
          artifact.path === "src/session.ts"
            ? { ...artifact, blobSha: "e".repeat(40) }
            : artifact,
        ),
      },
      SHA,
    ).find(({ identityKey }) => identityKey === "module:src/session.ts")!;
    expect(moved.memberDigest).not.toBe(module.memberDigest);
  });

  it("produces no pages for an empty repository", () => {
    expect(
      buildDocSkeletonPages(
        { ...rows(), artifacts: [], directories: [], edges: [], nodes: [] },
        null,
      ),
    ).toEqual([]);
  });
});

describe("createDocSkeletonJobHandler", () => {
  const job = (payload: Record<string, unknown>): ClaimedJob => ({
    attemptCount: 1,
    creditCost: 0,
    id: "job-1",
    kind: "docskeleton",
    maxAttempts: 3,
    payload,
    repositoryId: "repo-1",
    runId: "run-1",
    workspaceId: "ws-1",
  });

  it("reads the rows, builds the pages, and hands them to the applier with the job's commit", async () => {
    const applied: {
      pages: readonly DocSkeletonPage[];
      repositoryId: string;
      workspaceId: string;
    }[] = [];
    const handler = createDocSkeletonJobHandler({
      store: {
        applySkeletons: async (input) => {
          applied.push(input);
          return { renamed: 0, written: input.pages.length };
        },
        loadSkeletonRows: async () => rows(),
      },
    });
    await handler(job({ commitSha: SHA }), { heartbeat: async () => true });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      repositoryId: "repo-1",
      workspaceId: "ws-1",
    });
    expect(applied[0]!.pages).toHaveLength(4);
    expect(applied[0]!.pages.every((page) => page.commitSha === SHA)).toBe(
      true,
    );
  });

  it("refuses to run before the scan stored anything, and records no commit it cannot verify", async () => {
    const handler = createDocSkeletonJobHandler({
      store: {
        applySkeletons: async () => {
          throw new Error("must not be called");
        },
        loadSkeletonRows: async () => ({ ...rows(), artifacts: [] }),
      },
    });
    await expect(
      handler(job({ commitSha: SHA }), { heartbeat: async () => true }),
    ).rejects.toThrow(/before any artifact was stored/);

    const commits: (string | null)[] = [];
    const lenient = createDocSkeletonJobHandler({
      store: {
        applySkeletons: async (input) => {
          commits.push(...input.pages.map((page) => page.commitSha));
          return { renamed: 0, written: input.pages.length };
        },
        loadSkeletonRows: async () => rows(),
      },
    });
    await lenient(job({ commitSha: "not-a-sha" }), {
      heartbeat: async () => true,
    });
    expect(new Set(commits)).toEqual(new Set([null]));
  });

  it("the docpage kind fails loudly until it has a producer", async () => {
    await expect(
      reservedDocPageHandler()(job({}), { heartbeat: async () => true }),
    ).rejects.toThrow(/no producer yet/);
  });
});
