import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  classifyArtifactPath,
  scanRepository,
  type RepositorySource,
  type RepositoryTree,
} from "../packages/core/src/index";
import { GitHubRepositorySource } from "../apps/worker/src/github-repository-source";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  REPOSITORY_SCAN_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_ROOT = resolve(ROOT, "fixtures/drifted-demo");
const COMMIT_SHA = "1".repeat(40);

interface ArtifactManifest {
  artifacts: Array<{
    digest: string;
    exportedSymbols: string[];
    path: string;
    type: string;
  }>;
  commitSha: string;
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("GitHub repository scanner", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let tree: RepositoryTree;
  let fixtureSource: RepositorySource;

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
      WORKER_CREDIT_MIGRATION,
      REPOSITORY_SCAN_MIGRATION,
    ]);
    const recording = await json<{
      sha: string;
      tree: RepositoryTree["entries"];
      truncated: boolean;
    }>(resolve(FIXTURE_ROOT, "recordings/github/tree.json"));
    tree = {
      entries: recording.tree,
      treeSha: recording.sha,
      truncated: recording.truncated,
    };
    fixtureSource = {
      fetchContent: (path) => readFile(resolve(FIXTURE_ROOT, path)),
      listTree: async () => tree,
    };
  });

  afterAll(async () => {
    await database.close();
  });

  it("classifies every recorded fixture artifact with exact digest and exported symbols", async () => {
    const manifest = await json<ArtifactManifest>(
      resolve(FIXTURE_ROOT, "expected-artifacts.json"),
    );
    const result = await scanRepository({
      commitSha: manifest.commitSha,
      source: fixtureSource,
    });
    const actual = result.artifacts.map((artifact) => ({
      digest: artifact.digest,
      exportedSymbols: artifact.exportedSymbols.map(({ name }) => name),
      path: artifact.path,
      type: artifact.classification,
    }));

    expect(actual).toEqual(
      [...manifest.artifacts].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    );
    expect(result.skipped).toEqual([]);
    expect(result.touchedRows).toBe(manifest.artifacts.length);
    expect(result.artifacts.every((artifact) => !("content" in artifact))).toBe(
      true,
    );
    expect(
      result.artifacts.find(({ path }) => path === "TODO.md")?.todoItems,
    ).toEqual([
      expect.objectContaining({
        status: "done",
        title: "REQ-AUTH-002: enforce the 30-minute session timeout.",
      }),
      expect.objectContaining({
        status: "open",
        title: "REQ-AUTH-001: implement GitHub OAuth login.",
      }),
      expect.objectContaining({
        status: "open",
        title: "REQ-AUTH-003: add an audit-event CI test.",
      }),
      expect.objectContaining({
        status: "open",
        title: "Remove the stale legacy billing reference.",
      }),
    ]);
    expect(
      result.artifacts
        .filter(({ path }) => path !== "TODO.md")
        .every(({ todoItems }) => todoItems.length === 0),
    ).toBe(true);
  });

  it("recognizes every supported AI-facing path convention", () => {
    expect(classifyArtifactPath("nested/AGENTS.md")).toBe("agents");
    expect(classifyArtifactPath("CLAUDE.md")).toBe("claude");
    expect(classifyArtifactPath(".claude/rules/security.md")).toBe("claude");
    expect(classifyArtifactPath("skills/review/SKILL.md")).toBe("skill");
    expect(classifyArtifactPath(".cursor/rules/typescript.mdc")).toBe(
      "cursor_rule",
    );
    expect(classifyArtifactPath("spec/WORK_SPEC.md")).toBe("spec");
    expect(classifyArtifactPath("docs/adrs/0001-record.md")).toBe("adr");
    expect(classifyArtifactPath("docs/progress.md")).toBe("todo_progress");
  });

  it("short-circuits an unchanged commit and touches zero rows", async () => {
    const initial = await scanRepository({
      commitSha: COMMIT_SHA,
      source: fixtureSource,
    });
    const source: RepositorySource = {
      fetchContent: vi.fn(),
      listTree: vi.fn(),
    };
    const unchanged = await scanRepository({
      commitSha: COMMIT_SHA,
      previousArtifacts: initial.artifacts,
      previousCommitSha: COMMIT_SHA,
      source,
    });

    expect(unchanged.touchedRows).toBe(0);
    expect(unchanged.artifacts).toEqual([]);
    expect(source.listTree).not.toHaveBeenCalled();
    expect(source.fetchContent).not.toHaveBeenCalled();
  });

  it("skips oversized, binary, submodule, and symlink entries with reasons", async () => {
    const fetchContent = vi
      .fn<RepositorySource["fetchContent"]>()
      .mockResolvedValue(new Uint8Array([0, 1, 2, 3]));
    const result = await scanRepository({
      commitSha: COMMIT_SHA,
      maxFileBytes: 1024,
      source: {
        fetchContent,
        listTree: async () => ({
          entries: [
            {
              mode: "100644",
              path: "huge.ts",
              sha: "a".repeat(40),
              size: 2048,
              type: "blob",
            },
            {
              mode: "100644",
              path: "binary.ts",
              sha: "b".repeat(40),
              size: 4,
              type: "blob",
            },
            {
              mode: "160000",
              path: "external",
              sha: "c".repeat(40),
              type: "commit",
            },
            {
              mode: "120000",
              path: "link.ts",
              sha: "d".repeat(40),
              size: 8,
              type: "blob",
            },
          ],
          treeSha: "e".repeat(40),
          truncated: false,
        }),
      },
    });

    expect(result.skipped.map(({ reason }) => reason).sort()).toEqual([
      "binary",
      "oversized",
      "submodule",
      "symlink",
    ]);
    expect(fetchContent).toHaveBeenCalledOnce();
    expect(fetchContent).toHaveBeenCalledWith("binary.ts", COMMIT_SHA);
  });

  it("keeps persistent scan tables free of raw body/code columns", async () => {
    const columns = await database.query<{
      column_name: string;
      table_name: string;
    }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and table_name in ('artifacts', 'repository_scan_skips')
         and column_name in ('body', 'content', 'raw_body', 'raw_code', 'source_text')`,
    );

    expect(columns.rows).toEqual([]);
  });
});

describe("GitHub REST repository source", () => {
  it("uses recursive trees and raw Contents responses at the requested commit", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          sha: "2".repeat(40),
          tree: [
            {
              mode: "100644",
              path: "spec.md",
              sha: "3".repeat(40),
              size: 4,
              type: "blob",
            },
          ],
          truncated: false,
        }),
      )
      .mockResolvedValueOnce(new Response("spec", { status: 200 }));
    const source = new GitHubRepositorySource(
      "owner",
      "repo",
      "installation-token",
      fetchImplementation,
    );

    const result = await source.listTree(COMMIT_SHA);
    const content = await source.fetchContent("spec.md", COMMIT_SHA);
    const [treeUrl, treeOptions] = fetchImplementation.mock.calls[0] ?? [];
    const [contentUrl, contentOptions] =
      fetchImplementation.mock.calls[1] ?? [];

    expect(result.entries).toHaveLength(1);
    expect(treeUrl).toContain(`/git/trees/${COMMIT_SHA}?recursive=1`);
    expect(contentUrl).toContain(`/contents/spec.md?ref=${COMMIT_SHA}`);
    expect(new TextDecoder().decode(content)).toBe("spec");
    expect((treeOptions?.headers as Record<string, string>).authorization).toBe(
      "Bearer installation-token",
    );
    expect((contentOptions?.headers as Record<string, string>).accept).toBe(
      "application/vnd.github.raw+json",
    );
  });

  it("falls back to subtree traversal when GitHub truncates a recursive tree", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ sha: "2".repeat(40), tree: [], truncated: true }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sha: "2".repeat(40),
          tree: [
            { mode: "040000", path: "src", sha: "4".repeat(40), type: "tree" },
            {
              mode: "160000",
              path: "vendor",
              sha: "5".repeat(40),
              type: "commit",
            },
          ],
          truncated: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sha: "4".repeat(40),
          tree: [
            {
              mode: "100644",
              path: "index.ts",
              sha: "6".repeat(40),
              size: 1,
              type: "blob",
            },
          ],
          truncated: false,
        }),
      );
    const source = new GitHubRepositorySource(
      "owner",
      "repo",
      "token",
      fetchImplementation,
    );
    const result = await source.listTree(COMMIT_SHA);

    expect(result.truncated).toBe(false);
    expect(result.entries.map(({ path, type }) => ({ path, type }))).toEqual([
      { path: "vendor", type: "commit" },
      { path: "src/index.ts", type: "blob" },
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });
});
