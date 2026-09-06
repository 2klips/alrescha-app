import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { normalizeTodoTitle } from "../packages/core/src/index";
import { InMemoryMcpStore } from "../packages/mcp/src/store";
import type { McpPrincipal, McpWorkspaceData } from "../packages/mcp/src/store";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

const OWNER = "81111111-1111-4111-8111-111111111111";
const TOKEN_ID = "01J000000000000000000000T2";
const REPOSITORY_ID = "01J000000000000000000000R2";
const ARTIFACT_ID = "01J000000000000000000000A2";

/**
 * Phase 4 Wave D todo 21 — a progress entry lands on the todo it is about.
 *
 * The matcher could only find a todo it had minted itself, so an agent
 * reporting work on a checkbox the scan had read out of a document created a
 * **second** todo with the same title. Normalising the title closes that, and
 * the rule has to be the same in two languages — so both are run over the
 * same strings, in a real database, rather than trusted to agree.
 */
describe("progress attribution", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  const query = async <T>(sql: string, parameters: unknown[] = []) =>
    (await database.query<T>(sql, parameters)).rows;

  beforeAll(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'progress@example.test')",
      [OWNER],
    );
    workspace =
      (
        await database.query<{ id: string }>(
          "select id from public.workspaces where owner_user_id = $1",
          [OWNER],
        )
      ).rows[0]?.id ?? "";
    await database.query(
      `insert into public.mcp_tokens (id, workspace_id, token_hash, token_prefix, created_by)
       values ($1, $2, 'progress-token', 'sp_prg', $3)`,
      [TOKEN_ID, workspace, OWNER],
    );
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, '2klips/progress')",
      [REPOSITORY_ID, workspace],
    );
  });

  afterAll(async () => database.close());

  beforeEach(async () => {
    await database.query("delete from public.progress_events");
    await database.query("delete from public.todos");
  });

  /**
   * The two normalisers, over the same strings. Every case here is a shape a
   * real todo document produces: a bullet, a checkbox, an ordinal, a trailing
   * period, Korean, and — the ones that must NOT collapse — two titles that
   * differ by a word.
   */
  it("normalises identically in SQL and in TypeScript", async () => {
    const titles = [
      "Wire the CI evidence source",
      "- [ ] Wire the CI evidence source",
      "- [x] 3. Wire the CI evidence source.",
      "  *  wire   the CI evidence   source  ",
      "1) Wire the CI evidence source!",
      "요구사항 커버리지 배선",
      "- [ ] 요구사항 커버리지 배선.",
      "Wire the CI evidence sources",
      "Wire the CD evidence source",
      "",
      "[]",
      "- ",
    ];

    for (const title of titles) {
      const [row] = await query<{ normalized: string }>(
        "select public.normalize_todo_title($1) as normalized",
        [title],
      );
      expect(row?.normalized, `SQL vs TS for ${JSON.stringify(title)}`).toBe(
        normalizeTodoTitle(title),
      );
    }

    // The decorated forms all collapse onto one title…
    const decorated = titles.slice(0, 5).map(normalizeTodoTitle);
    expect(new Set(decorated).size).toBe(1);
    // …and the two that differ by a word stay two titles. A normaliser that
    // removed words would merge separate work into one checkbox.
    expect(normalizeTodoTitle("Wire the CI evidence sources")).not.toBe(
      decorated[0],
    );
    expect(normalizeTodoTitle("Wire the CD evidence source")).not.toBe(
      decorated[0],
    );
  });

  /**
   * A todo the scan read out of a document. `todos_source_shape` demands the
   * whole provenance for this kind — repository, artifact, path and span —
   * and that shape is exactly what made the old matcher blind to it.
   */
  const scannedTodo = async (id: string, title: string): Promise<void> => {
    // An artifact is a graph node first; the tenant FK says so.
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'spec/plan.md')
       on conflict (id) do nothing`,
      [ARTIFACT_ID, workspace, REPOSITORY_ID],
    );
    await database.query(
      `insert into public.artifacts
         (id, workspace_id, repository_id, kind, classification, path, digest,
          source_commit_sha)
       values ($1, $2, $3, 'todo', 'todo_progress', 'spec/plan.md',
               repeat('d', 64), $4)
       on conflict (id) do nothing`,
      [ARTIFACT_ID, workspace, REPOSITORY_ID, "a".repeat(40)],
    );
    await database.query(
      `insert into public.todos
         (id, workspace_id, repository_id, title, status, source_kind,
          source_key, source_artifact_id, source_path, source_span)
       values ($1, $2, $3, $4, 'open', 'document', $5, $6, 'spec/plan.md',
               '{"path":"spec/plan.md","startLine":3,"endLine":3}'::jsonb)`,
      [id, workspace, REPOSITORY_ID, title, `spec/plan.md#${id}`, ARTIFACT_ID],
    );
  };

  const log = async (input: {
    commitSha?: string | null;
    repositoryId?: string | null;
    status?: string;
    task: string;
    todoId?: string | null;
  }) =>
    (
      await query<{
        todo_id: string;
        todo_matched: string;
      }>(
        `select * from public.log_progress_atomic($1, $2, $3, $4, $5, 'did it', '{}'::text[], $6, $7, $8)`,
        [
          workspace,
          OWNER,
          TOKEN_ID,
          input.task,
          input.status ?? "done",
          input.todoId ?? null,
          input.repositoryId ?? null,
          input.commitSha ?? null,
        ],
      )
    )[0];

  it("lands on a scanned checkbox instead of minting a twin", async () => {
    // A different `source_kind` and a different key, which is exactly what
    // the old matcher could not see.
    await scannedTodo(
      "01J000000000000000000000D9",
      "- [ ] 3. Wire the CI evidence source.",
    );

    const result = await log({ task: "wire the ci evidence source" });

    expect(result?.todo_matched).toBe("normalized_title");
    expect(result?.todo_id).toBe("01J000000000000000000000D9");
    // One todo, not two — the whole point.
    expect(await query("select id from public.todos")).toHaveLength(1);
    expect(
      (
        await query<{ status: string }>(
          "select status from public.todos limit 1",
        )
      )[0]?.status,
    ).toBe("done");
  });

  it("prefers an exact answer over a matched one", async () => {
    await scannedTodo("01J000000000000000000000DA", "Ship it");
    await database.query(
      `insert into public.todos (id, workspace_id, title, status, source_kind, source_key, source_event_id)
       values ('01J000000000000000000000DB', $1, 'ship it.', 'open',
               'progress_event', 'progress:ship it', '01J000000000000000000000E1')`,
      [workspace],
    );

    // The key this function mints beats the normalised title, because it is
    // the narrower statement about the same work.
    expect((await log({ task: "Ship it" }))?.todo_matched).toBe("source_key");
  });

  it("refuses a todo id from another workspace rather than creating one", async () => {
    await expect(
      log({ task: "Anything", todoId: "01J000000000000000000000DZ" }),
    ).rejects.toThrow(/todo_id is not in this workspace/);
    // Refused, not silently created: minting a todo because the named one was
    // missing answers a different question.
    expect(await query("select id from public.todos")).toEqual([]);
  });

  it("records the repository and commit, and refuses a foreign repository", async () => {
    const sha = "a".repeat(40);
    await log({ commitSha: sha, repositoryId: REPOSITORY_ID, task: "Ship it" });

    expect(
      await query<{ commit_sha: string; repository_id: string }>(
        "select commit_sha, repository_id from public.progress_events",
      ),
    ).toEqual([{ commit_sha: sha, repository_id: REPOSITORY_ID }]);
    await expect(
      log({ repositoryId: "01J000000000000000000000RZ", task: "Other" }),
    ).rejects.toThrow(/repository_id is not in this workspace/);
    await expect(log({ commitSha: "nope", task: "Other" })).rejects.toThrow(
      /commit_sha must be a 40-character commit sha/,
    );
  });

  it("fills a missing repository without moving one that is already set", async () => {
    // A todo with no repository of its own: attribution fills the gap.
    await database.query(
      `insert into public.todos (id, workspace_id, title, status, source_kind, source_key, source_event_id)
       values ('01J000000000000000000000DC', $1, 'Ship it', 'open',
               'progress_event', 'progress:other', '01J000000000000000000000E1')`,
      [workspace],
    );
    await log({ repositoryId: REPOSITORY_ID, task: "Ship it" });
    expect(
      (
        await query<{ repository_id: string | null }>(
          "select repository_id from public.todos",
        )
      )[0]?.repository_id,
    ).toBe(REPOSITORY_ID);
  });

  /**
   * The equivalence the plan asks for: the same six calls against the SQL
   * writer and the in-memory one, and the same `matched` word out of both.
   * Two implementations of one rule that nobody compares are two rules.
   */
  it("matches the same way in the in-memory store", async () => {
    const principal: McpPrincipal = {
      scopes: ["mcp:read", "mcp:write"],
      tokenId: TOKEN_ID,
      userId: OWNER,
      workspaceId: workspace,
    };
    const fixture: McpWorkspaceData = {
      id: workspace,
      ownerUserId: OWNER,
      repositories: [
        {
          artifacts: [],
          contextPacks: [],
          defaultBranch: "main",
          edges: [],
          evidence: [],
          findings: [],
          fullName: "2klips/progress",
          id: REPOSITORY_ID,
          indexEntries: [],
          overview: "2klips/progress on main",
          receipts: [],
          requirements: [],
        },
      ],
      todos: [],
    };

    for (const scanned of [true, false]) {
      await database.query("delete from public.progress_events");
      await database.query("delete from public.todos");
      const store = new InMemoryMcpStore({
        workspaces: [
          {
            ...fixture,
            todos: scanned
              ? [
                  {
                    createdAt: "2026-09-01T00:00:00Z",
                    id: "01J000000000000000000000DD",
                    repositoryId: REPOSITORY_ID,
                    sourceEventId: "",
                    sourceKey: "spec/plan.md#3",
                    sourcePath: "spec/plan.md",
                    status: "open",
                    title: "- [ ] 3. Wire the CI evidence source.",
                    updatedAt: "2026-09-01T00:00:00Z",
                    workspaceId: workspace,
                  },
                ]
              : [],
          },
        ],
      });
      if (scanned) {
        await scannedTodo(
          "01J000000000000000000000DD",
          "- [ ] 3. Wire the CI evidence source.",
        );
      }

      const sql = await log({ task: "wire the ci evidence source" });
      const memory = await store.appendProgress(principal, {
        status: "done",
        summary: "did it",
        task: "wire the ci evidence source",
      });

      expect(memory.matched, `matched (scanned=${scanned})`).toBe(
        sql?.todo_matched,
      );
      expect(memory.matched).toBe(scanned ? "normalized_title" : "created");
    }
  });
});
