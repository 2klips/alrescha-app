import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanRepository, type RepositoryScanPlan } from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  buildWorkspaceCommitCards,
  type CommitCardRunRow,
} from "../apps/web/lib/commits/commit-cards-report";
import { GitHubRepositorySource } from "../apps/worker/src/github-repository-source";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");

const USER_A = "41111111-1111-4111-8111-111111111111";
const USER_B = "42222222-2222-4222-8222-222222222222";

const BODY_SENTINEL = "RAW_BODY_SENTINEL_DB_51ac";

/**
 * The GitHub transport, served from the same local files: the REAL
 * `GitHubRepositorySource` with a stubbed fetch that answers the tree and raw
 * content endpoints from disk. Everything after the transport — scanner,
 * apply — is shared code, so this is the honest two-path comparison.
 */
async function githubShapedPlan(
  rootDir: string,
  commitSha: string,
): Promise<RepositoryScanPlan> {
  const { source: localSource } = await createLocalRepositorySource(rootDir);
  const tree = await localSource.listTree(commitSha);
  const fetchImplementation = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/git/trees/")) {
      return Response.json({
        sha: tree.treeSha,
        tree: tree.entries.map((entry) => ({ ...entry })),
        truncated: false,
      });
    }
    const match = /\/contents\/([^?]+)\?/.exec(url);
    if (!match?.[1]) {
      return new Response("not found", { status: 404 });
    }
    const path = decodeURIComponent(match[1]);
    const bytes = await readFile(join(rootDir, ...path.split("/")));
    return new Response(new Uint8Array(bytes));
  }) as typeof fetch;
  const source = new GitHubRepositorySource(
    "2klips",
    "arr-app",
    "installation-token",
    fetchImplementation,
  );
  return scanRepository({ commitSha, source });
}

describe("local ingest (Phase 2B todo 3, ADR-013)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'ingest-a@example.test'), ($2, 'ingest-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    workspaceB =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)
        ?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function ensureRepository(
    workspaceId: string,
    fullName: string,
  ): Promise<string> {
    const result = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, $2) as id",
      [workspaceId, fullName],
    );
    return result.rows[0]?.id ?? "";
  }

  async function applyPlan(
    workspaceId: string,
    repositoryId: string,
    plan: RepositoryScanPlan,
  ): Promise<number> {
    const result = await database.query<{ touched: number }>(
      "select public.apply_repository_scan($1, $2, $3::jsonb) as touched",
      [workspaceId, repositoryId, JSON.stringify(plan)],
    );
    return result.rows[0]?.touched ?? 0;
  }

  async function graphSnapshot(workspaceId: string, repositoryId: string) {
    const [artifacts, nodes, todos] = await Promise.all([
      database.query<{ path: string }>(
        `select path, kind, classification, digest, source_blob_sha, size_bytes,
                exported_symbols, last_seen_commit_sha
         from public.artifacts
         where workspace_id = $1 and repository_id = $2
         order by path`,
        [workspaceId, repositoryId],
      ),
      database.query<{ kind: string; label: string }>(
        `select kind, label from public.graph_nodes
         where workspace_id = $1 and repository_id = $2
         order by label`,
        [workspaceId, repositoryId],
      ),
      database.query<{ status: string; title: string }>(
        `select title, status, source_key, source_path from public.todos
         where workspace_id = $1 and repository_id = $2
         order by source_key`,
        [workspaceId, repositoryId],
      ),
    ]);
    return { artifacts: artifacts.rows, nodes: nodes.rows, todos: todos.rows };
  }

  it("the CLI path and the GitHub path yield the same plan and the same graph", async () => {
    const { commitSha, source } = await createLocalRepositorySource(DRIFTED_DEMO);
    const localPlan = await scanRepository({ commitSha, source });
    const githubPlan = await githubShapedPlan(DRIFTED_DEMO, commitSha);

    // Same deterministic pipeline over both transports → identical plans.
    expect(localPlan).toEqual(githubPlan);
    expect(localPlan.artifacts.length).toBeGreaterThan(5);

    // Same apply function on both sides → identical graphs.
    const repositoryA = await ensureRepository(workspaceA, "local/drifted-demo");
    const repositoryB = await ensureRepository(workspaceB, "arr/drifted-demo");
    await applyPlan(workspaceA, repositoryA, localPlan);
    await applyPlan(workspaceB, repositoryB, githubPlan);

    const graphA = await graphSnapshot(workspaceA, repositoryA);
    const graphB = await graphSnapshot(workspaceB, repositoryB);
    expect(graphA.artifacts.length).toBeGreaterThan(5);
    expect(graphA).toEqual(graphB);
  });

  it("stores metadata only — a source-body sentinel never reaches any row", async () => {
    const root = await mkdtemp(join(tmpdir(), "arr-ingest-sentinel-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, "src", "secret-logic.ts"),
        `export function decide(): string {\n  return "${BODY_SENTINEL}";\n}\n`,
        "utf8",
      );
      await writeFile(join(root, "TODO.md"), "- [ ] 정리\n", "utf8");
      const { commitSha, source } = await createLocalRepositorySource(root);
      const plan = await scanRepository({ commitSha, source });
      const repositoryId = await ensureRepository(workspaceA, "local/sentinel");
      await applyPlan(workspaceA, repositoryId, plan);

      const dump = await database.query(
        `select coalesce(jsonb_agg(to_jsonb(artifact)), '[]'::jsonb) as rows
         from public.artifacts artifact where workspace_id = $1`,
        [workspaceA],
      );
      const todoDump = await database.query(
        `select coalesce(jsonb_agg(to_jsonb(todo)), '[]'::jsonb) as rows
         from public.todos todo where workspace_id = $1`,
        [workspaceA],
      );
      const serialized =
        JSON.stringify(dump.rows) + JSON.stringify(todoDump.rows);
      expect(serialized).not.toContain(BODY_SENTINEL);
      expect(serialized).toContain("src/secret-logic.ts");
      expect(serialized).toContain("decide");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("applies incrementally: update, removal, and the unchanged no-op", async () => {
    const root = await mkdtemp(join(tmpdir(), "arr-ingest-incremental-"));
    try {
      await writeFile(join(root, "TODO.md"), "- [ ] 첫 작업\n", "utf8");
      await writeFile(join(root, "spec.md"), "# 스펙\n", "utf8");

      const first = await createLocalRepositorySource(root);
      const firstPlan = await scanRepository({
        commitSha: first.commitSha,
        source: first.source,
      });
      const repositoryId = await ensureRepository(workspaceA, "local/incr");
      expect(await applyPlan(workspaceA, repositoryId, firstPlan)).toBe(
        firstPlan.touchedRows + 1,
      );

      // Unchanged rescan → empty plan → apply is a 0-touch no-op.
      const unchangedPlan = await scanRepository({
        commitSha: first.commitSha,
        previousArtifacts: firstPlan.artifacts,
        previousCommitSha: first.commitSha,
        source: first.source,
      });
      expect(unchangedPlan.treeSha).toBeNull();
      expect(await applyPlan(workspaceA, repositoryId, unchangedPlan)).toBe(0);

      // Edit the todo, delete the spec → update + removal in one plan.
      await writeFile(join(root, "TODO.md"), "- [x] 첫 작업\n", "utf8");
      await rm(join(root, "spec.md"));
      const second = await createLocalRepositorySource(root);
      const secondPlan = await scanRepository({
        commitSha: second.commitSha,
        previousArtifacts: firstPlan.artifacts,
        previousCommitSha: first.commitSha,
        source: second.source,
      });
      expect(secondPlan.removedPaths).toEqual(["spec.md"]);
      await applyPlan(workspaceA, repositoryId, secondPlan);

      const graph = await graphSnapshot(workspaceA, repositoryId);
      expect(graph.artifacts.map(({ path }) => path)).toEqual(["TODO.md"]);
      expect(graph.nodes.map(({ label }) => label)).toEqual(["TODO.md"]);
      expect(graph.todos).toEqual([
        expect.objectContaining({ status: "done", title: "첫 작업" }),
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("records the ingest as a terminal run so the commit reaches the cards", async () => {
    const repositoryId = await ensureRepository(workspaceA, "local/runs");
    const commitSha = "f".repeat(40);
    const startedAt = new Date(Date.now() - 2_000).toISOString();

    const first = await database.query<{ id: string }>(
      "select public.record_local_ingest_run($1, $2, $3, $4::timestamptz) as id",
      [workspaceA, repositoryId, commitSha, startedAt],
    );
    const runId = first.rows[0]!.id;

    const runRow = await database.query<{
      completed_at: string | null;
      started_at: string | null;
      status: string;
      trigger_kind: string;
    }>(
      "select status, trigger_kind, started_at, completed_at from public.runs where id = $1",
      [runId],
    );
    expect(runRow.rows[0]).toMatchObject({
      status: "succeeded",
      trigger_kind: "manual",
    });
    expect(runRow.rows[0]!.started_at).not.toBeNull();
    expect(runRow.rows[0]!.completed_at).not.toBeNull();

    // Re-pushing the same commit updates the run instead of duplicating it.
    const second = await database.query<{ id: string }>(
      "select public.record_local_ingest_run($1, $2, $3, $4::timestamptz) as id",
      [workspaceA, repositoryId, commitSha, startedAt],
    );
    expect(second.rows[0]!.id).toBe(runId);
    expect(
      (
        await database.query(
          "select id from public.runs where workspace_id = $1 and repository_id = $2",
          [workspaceA, repositoryId],
        )
      ).rows,
    ).toHaveLength(1);

    // No receipt is claimed for a scan-only ingest (ADR-015).
    expect(
      (
        await database.query(
          "select id from public.receipts where workspace_id = $1",
          [workspaceA],
        )
      ).rows,
    ).toEqual([]);

    // ADR-015 §4, proven from the stored rows themselves: the exact row the
    // SQL function wrote — fed through the production card loader's builder —
    // becomes a graph-only card that carries no receipt and no delta.
    const storedRun = await database.query<CommitCardRunRow>(
      `select id, commit_sha, created_at, repository_id, trigger_kind,
              status, started_at, completed_at
       from public.runs where id = $1`,
      [runId],
    );
    const cards = buildWorkspaceCommitCards({
      jobs: [],
      receipts: [],
      repositories: [{ full_name: "local/runs", id: repositoryId }],
      runs: storedRun.rows,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      assurance: "graph-only",
      findingsDelta: null,
      receiptId: null,
      status: "completed",
      triggerKind: "manual",
    });
  });

  it("ensure_local_repository is idempotent per workspace", async () => {
    const firstId = await ensureRepository(workspaceA, "local/demo");
    const secondId = await ensureRepository(workspaceA, "local/demo");
    const otherWorkspace = await ensureRepository(workspaceB, "local/demo");
    expect(secondId).toBe(firstId);
    expect(otherWorkspace).not.toBe(firstId);
  });
});
