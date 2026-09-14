import type { PGlite } from "@electric-sql/pglite";
import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDocSkeletonJobHandler } from "../apps/worker/src/doc-skeleton-job";
import { PostgresDocSkeletonStore } from "../apps/worker/src/postgres-doc-store";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { pgliteSql } from "./helpers/pglite-sql";

/**
 * The skeleton pass end to end on real PostgreSQL (Phase 4 Wave D todo 20):
 * the store reads the rows the scan and the analysis wrote, the handler
 * builds the pages, `apply_doc_page_skeletons` stores them — and a second
 * pass over the same rows writes the same pages without renaming or
 * duplicating one. The analysis's follow-up enqueue is here too: free, and
 * one job per commit.
 */

const OWNER = "7D000000-0000-4000-8000-000000000001".toLowerCase();
const fixedUlid = (suffix: string) => `01JD000000000000000000000${suffix}`;
const REPOSITORY = fixedUlid("B");
const SESSION = fixedUlid("1");
const SESSION_TEST = fixedUlid("2");
const HEALTH = fixedUlid("3");
const REQUIREMENT = fixedUlid("R");
const DIR_SRC = fixedUlid("D");
const RUN = fixedUlid("9");
const SHA = "1".repeat(40);

describe("docskeleton on real PostgreSQL", () => {
  let database: PGlite;
  let workspace: string;
  let store: PostgresDocSkeletonStore;

  async function node(id: string, kind: string, label: string) {
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, $4, $5)`,
      [id, workspace, REPOSITORY, kind, label],
    );
  }

  async function artifact(
    id: string,
    path: string,
    symbols: string[],
    blob: string,
  ) {
    await node(id, "artifact", path.split("/").at(-1) ?? path);
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha,
         source_blob_sha, exported_symbols)
       values ($1, $2, $3, 'code_metadata', 'code_metadata', $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        workspace,
        REPOSITORY,
        path,
        "f".repeat(64),
        SHA,
        blob,
        JSON.stringify(symbols.map((name) => ({ name }))),
      ],
    );
  }

  async function edge(source: string, target: string, relation: string) {
    await database.query(
      `insert into public.edges
        (workspace_id, repository_id, source_node_id, target_node_id, relation, provenance, confidence)
       values ($1, $2, $3, $4, $5, '{"reason":"fixture"}'::jsonb, 1)`,
      [workspace, REPOSITORY, source, target, relation],
    );
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'docskeleton@example.test')",
      [OWNER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'acme/app')",
      [REPOSITORY, workspace],
    );
    await database.query(
      `insert into public.runs (id, workspace_id, repository_id, trigger_kind, trigger_key, status)
       values ($1, $2, $3, 'manual', 'fixture:run', 'running')`,
      [RUN, workspace, REPOSITORY],
    );
    await artifact(
      SESSION,
      "src/session.ts",
      ["createSession"],
      "a".repeat(40),
    );
    await artifact(SESSION_TEST, "tests/session.test.ts", [], "b".repeat(40));
    await artifact(HEALTH, "src/api/health.ts", ["health"], "c".repeat(40));
    await node(REQUIREMENT, "requirement", "R-01 session timeout");
    await node(DIR_SRC, "directory", "src");
    await database.query(
      `insert into public.directories (id, workspace_id, repository_id, path) values ($1, $2, $3, 'src')`,
      [DIR_SRC, workspace, REPOSITORY],
    );
    await edge(SESSION_TEST, SESSION, "imports");
    await edge(REQUIREMENT, SESSION, "implements");
    await edge(DIR_SRC, SESSION, "contains");
    store = new PostgresDocSkeletonStore(
      pgliteSql(database) as unknown as postgres.Sql,
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function pages() {
    const rows = await database.query<{
      anchor_node_id: string | null;
      identity_key: string;
      member_paths: string[];
      scope: string;
      skeleton: {
        citations: unknown[];
        relations: Record<string, number>;
        symbols: string[];
      };
      slug: string;
      source_commit_sha: string | null;
      title: string;
    }>(
      `select scope, identity_key, slug, anchor_node_id, title, member_paths, skeleton, source_commit_sha
       from public.doc_pages where workspace_id = $1 order by scope, identity_key`,
      [workspace],
    );
    return rows.rows;
  }

  it("writes the repository, module and directory pages from stored rows, with no body anywhere", async () => {
    const handler = createDocSkeletonJobHandler({ store });
    await handler(
      {
        attemptCount: 1,
        creditCost: 0,
        id: "job-1",
        kind: "docskeleton",
        maxAttempts: 3,
        payload: { commitSha: SHA },
        repositoryId: REPOSITORY,
        runId: RUN,
        workspaceId: workspace,
      },
      { heartbeat: async () => true },
    );
    const stored = await pages();
    expect(
      stored.map(({ identity_key, scope }) => `${scope} ${identity_key}`),
    ).toEqual([
      "directory directory:src",
      "module module:src/session.ts",
      "repo repo:acme/app",
    ]);
    const module = stored.find(({ scope }) => scope === "module")!;
    expect(module.anchor_node_id).toBeNull();
    expect(module.member_paths).toEqual([
      "src/session.ts",
      "tests/session.test.ts",
    ]);
    expect(module.skeleton.symbols).toEqual(["createSession"]);
    expect(module.skeleton.relations).toEqual({ implements: 1, imports: 1 });
    expect(module.skeleton.citations).toEqual([
      {
        kind: "requirement",
        nodeId: REQUIREMENT,
        path: null,
        title: "R-01 session timeout",
      },
    ]);
    expect(module.source_commit_sha).toBe(SHA);
    // A module page is a node of its own; a directory page attaches.
    const moduleNode = await database.query<{ kind: string }>(
      "select kind from public.graph_nodes where id = (select id from public.doc_pages where scope = 'module' and workspace_id = $1)",
      [workspace],
    );
    expect(moduleNode.rows[0]?.kind).toBe("doc_page");
    expect(
      stored.find(({ scope }) => scope === "directory")?.anchor_node_id,
    ).toBe(DIR_SRC);
    expect(JSON.stringify(stored)).not.toContain("createSession(");
  });

  it("a second pass over the same rows is idempotent — same pages, nothing renamed", async () => {
    const handler = createDocSkeletonJobHandler({ store });
    const job = {
      attemptCount: 1,
      creditCost: 0,
      id: "job-1",
      kind: "docskeleton" as const,
      maxAttempts: 3,
      payload: { commitSha: SHA },
      repositoryId: REPOSITORY,
      runId: RUN,
      workspaceId: workspace,
    };
    await handler(job, { heartbeat: async () => true });
    const before = await pages();
    const second = await store.applySkeletons({
      pages: [],
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });
    expect(second).toEqual({ renamed: 0, written: 0 });
    await handler(job, { heartbeat: async () => true });
    const after = await pages();
    expect(
      after.map(({ identity_key, slug }) => `${identity_key}@${slug}`),
    ).toEqual(
      before.map(({ identity_key, slug }) => `${identity_key}@${slug}`),
    );
    expect(after).toHaveLength(3);
  });

  it("the analysis's follow-up enqueues one free docskeleton job per commit", async () => {
    await store.enqueueDocSkeleton({
      commitSha: SHA,
      repositoryId: REPOSITORY,
      runId: RUN,
      workspaceId: workspace,
    });
    await store.enqueueDocSkeleton({
      commitSha: SHA,
      repositoryId: REPOSITORY,
      runId: RUN,
      workspaceId: workspace,
    });
    const jobs = await database.query<{
      credit_cost: number;
      idempotency_key: string;
      kind: string;
      payload: { commitSha?: string; reason?: string };
    }>(
      "select kind, idempotency_key, credit_cost, payload from public.jobs where workspace_id = $1 and kind = 'docskeleton'",
      [workspace],
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]).toMatchObject({
      credit_cost: 0,
      idempotency_key: `docskeleton:${REPOSITORY}:${SHA}`,
      kind: "docskeleton",
      payload: { commitSha: SHA, reason: "analyze" },
    });
  });
});
