import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_TODO_TITLE,
  parseTodoDocument,
  todoSourceKey,
} from "../packages/core/src/index";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Todo identity and the wedge it caused (Phase 4 Wave A todo 5, R5 §4.4).
 *
 * The audit reproduced four failures against a real database: an edit above a
 * checkbox renamed every todo below it, one long checkbox rolled back the
 * whole scan, an agent's progress event made every later scan fail outright,
 * and `[~]`/`[-]` were not todos at all. These are those four, stated as
 * cases.
 */

const USER = "7f000000-0000-4000-8000-00000000000f";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DOC = "TODO.md";

const BODY = [
  "# Todo",
  "",
  "- [ ] Wire the ingest path",
  "- [x] Parse the markdown",
  "- [~] Draw the graph",
  "- [-] Wait for the API key",
  "- [/] Measure the density",
  "",
].join("\n");

function todos(source: string) {
  return parseTodoDocument({ path: DOC, source });
}

describe("todo parsing", () => {
  it("reads the four states people actually write", () => {
    expect(
      todos(BODY).map(({ status, title }) => `${status}: ${title}`),
    ).toEqual([
      "open: Wire the ingest path",
      "done: Parse the markdown",
      "in-progress: Draw the graph",
      "blocked: Wait for the API key",
      "in-progress: Measure the density",
    ]);
  });

  it("keeps a checkbox's identity when the document moves around it", () => {
    const before = todos(BODY);
    // Three lines inserted at the top: the byte offset of every checkbox
    // below moves, which is what used to rename them (one id of ten
    // survived, and it was reattached to the wrong item).
    const after = todos(`# Todo\n\nA new paragraph.\n\n${BODY.slice(8)}`);

    expect(after.map(({ sourceKey }) => sourceKey)).toEqual(
      before.map(({ sourceKey }) => sourceKey),
    );
    // The spans still move, because the items really did move.
    expect(after[0]?.source.span.startLine).not.toBe(
      before[0]?.source.span.startLine,
    );
  });

  it("survives whitespace, case and marker churn in the title", () => {
    const [plain] = todos("- [ ] Wire the ingest path\n");
    const [noisy] = todos("- [x]   wire   the  Ingest   path  \n");

    // The same sentence is the same todo, checked or not.
    expect(noisy?.sourceKey).toBe(plain?.sourceKey);
    expect(noisy?.status).toBe("done");
  });

  it("numbers repeats instead of merging them", () => {
    const items = todos("- [ ] Ship it\n- [ ] Ship it\n- [x] Ship it\n");

    expect(new Set(items.map(({ sourceKey }) => sourceKey)).size).toBe(3);
    expect(items.map(({ sourceKey }) => sourceKey)).toEqual([
      todoSourceKey({ path: DOC, title: "Ship it" }),
      todoSourceKey({ occurrence: 2, path: DOC, title: "Ship it" }),
      todoSourceKey({ occurrence: 3, path: DOC, title: "Ship it" }),
    ]);
  });

  it("truncates a long title instead of letting it fail the scan", () => {
    const long = "x".repeat(600);
    const [item] = todos(`- [ ] ${long}\n`);

    expect(item?.title.length).toBe(MAX_TODO_TITLE);
    // Two long items sharing their first 240 characters stay distinct: the
    // key hashes the whole title, not the stored one.
    const [first] = todos(`- [ ] ${long}A\n`);
    const [second] = todos(`- [ ] ${long}B\n`);
    expect(first?.sourceKey).not.toBe(second?.sourceKey);
  });

  it("keeps the nesting the document wrote", () => {
    const items = todos(
      [
        "- [ ] Parent task",
        "  - [ ] Child one",
        "  - [x] Child two",
        "- [ ] Second parent",
        "",
      ].join("\n"),
    );

    expect(items.map(({ parentKey, title }) => [title, parentKey])).toEqual([
      ["Parent task", null],
      ["Child one", items[0]?.sourceKey],
      ["Child two", items[0]?.sourceKey],
      ["Second parent", null],
    ]);
  });
});

describe("todo persistence", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;
  let artifactId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'todos@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/todos') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function scan(source: string, commitSha = SHA_A): Promise<void> {
    const items = parseTodoDocument({ path: DOC, source });
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [
            {
              classification: "todo_progress",
              digest: commitSha.slice(0, 1).repeat(64),
              exportedSymbols: [],
              kind: "todo",
              path: DOC,
              rationales: [],
              sizeBytes: source.length,
              sourceBlobSha: commitSha,
              sourceCommitSha: commitSha,
              symbolEngine: null,
              todoItems: items,
            },
          ],
          codeLinks: [],
          commitSha,
          docLinks: [],
          removedPaths: [],
          skipped: [],
          touchedRows: 1,
          treeSha: SHA_B,
          unchangedPaths: [],
        }),
      ],
    );
    const artifacts = await database.query<{ id: string }>(
      "select id from public.artifacts where path = $1",
      [DOC],
    );
    artifactId = artifacts.rows[0]?.id ?? "";
  }

  async function stored(): Promise<
    {
      created_at: string;
      id: string;
      parent_key: string | null;
      status: string;
      title: string;
    }[]
  > {
    const rows = await database.query<{
      created_at: string;
      id: string;
      parent_key: string | null;
      status: string;
      title: string;
    }>(
      `select id, title, status, parent_key, created_at from public.todos
       where workspace_id = $1 order by title`,
      [workspaceId],
    );
    return rows.rows;
  }

  it("an unchanged document rescans to no change at all", async () => {
    await scan(BODY);
    const first = await stored();
    await scan(BODY, SHA_B);

    expect(await stored()).toEqual(first);
  });

  it("keeps every id and creation time when the document is edited above", async () => {
    await scan(BODY);
    const before = await stored();
    await scan(`# Todo\n\nA new paragraph.\n\n${BODY.slice(8)}`, SHA_B);
    const after = await stored();

    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(after.map(({ created_at }) => created_at)).toEqual(
      before.map(({ created_at }) => created_at),
    );
  });

  it("stores a 300-character checkbox instead of failing the scan", async () => {
    // The title CHECK used to roll the whole scan back — this repository's
    // own plan has eighteen items over 1,000 characters.
    await scan(`- [ ] ${"y".repeat(300)}\n`);

    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title.length).toBe(MAX_TODO_TITLE);
  });

  it("does not wedge when a logged todo is edited away", async () => {
    await scan(BODY);
    const [first] = await stored();
    // An agent records progress against the todo it is working on…
    await database.query(
      `insert into public.progress_events
        (workspace_id, user_id, token_id, task, status, summary, todo_id)
       select $1, $2, t.id, 'Draw the graph', 'progress', 'Halfway', $3
       from public.mcp_tokens t where t.workspace_id = $1
       limit 1`,
      [workspaceId, USER, first?.id],
    );
    const token = await database.query<{ count: string }>(
      "select count(*) as count from public.progress_events",
    );
    if (Number(token.rows[0]?.count) === 0) {
      // No MCP token exists in this fixture; insert one and retry, because
      // the point of the case is the foreign key, not the token.
      await database.query(
        `insert into public.mcp_tokens (workspace_id, token_hash, token_prefix, scopes, created_by)
         values ($1, 'hash-todo-identity', 'hash-todo-id', array['mcp:write'], $2)`,
        [workspaceId, USER],
      );
      await database.query(
        `insert into public.progress_events
          (workspace_id, user_id, token_id, task, status, summary, todo_id)
         select $1, $2, t.id, 'Draw the graph', 'progress', 'Halfway', $3
         from public.mcp_tokens t where t.workspace_id = $1 limit 1`,
        [workspaceId, USER, first?.id],
      );
    }

    // …and then the document drops that checkbox. Before this migration the
    // foreign key had no ON DELETE, so this scan — and every scan after it —
    // failed outright.
    await expect(
      scan("- [ ] Wire the ingest path\n", SHA_B),
    ).resolves.toBeUndefined();

    const events = await database.query<{
      repository_id: string | null;
      summary: string;
      todo_id: string | null;
    }>("select todo_id, summary, repository_id from public.progress_events");
    expect(events.rows).toHaveLength(1);
    // The event keeps its own words and loses only the link.
    expect(events.rows[0]?.summary).toBe("Halfway");
    expect(events.rows[0]?.todo_id).toBeNull();
    // It was written with a repository, derived from the todo it named.
    expect(events.rows[0]?.repository_id).toBe(repositoryId);
  });

  it("stores the four states and the nesting", async () => {
    await scan(
      ["- [~] Parent task", "  - [-] Child one", "- [x] Done thing", ""].join(
        "\n",
      ),
    );

    const rows = await stored();
    expect(
      rows.map(({ parent_key, status, title }) => ({
        parent: parent_key === null ? null : "parent",
        status,
        title,
      })),
    ).toEqual([
      { parent: "parent", status: "blocked", title: "Child one" },
      { parent: null, status: "done", title: "Done thing" },
      { parent: null, status: "in-progress", title: "Parent task" },
    ]);
    expect(artifactId).not.toBe("");
  });
});

describe("access events carry their repository", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'events@example.test')",
      [USER],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("derives it from the nodes the call touched, and leaves it null otherwise", async () => {
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    const workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/events') as id",
      [workspaceId],
    );
    const repositoryId = repository.rows[0]?.id ?? "";
    const node = await database.query<{ id: string }>(
      `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
       values ($1, $2, 'artifact', 'src/x.ts') returning id`,
      [workspaceId, repositoryId],
    );
    const token = await database.query<{ id: string }>(
      `insert into public.mcp_tokens (workspace_id, token_hash, token_prefix, scopes, created_by)
       values ($1, 'hash-events', 'hash-events1', array['mcp:read'], $2) returning id`,
      [workspaceId, USER],
    );

    await database.query(
      `insert into public.access_events (workspace_id, token_id, tool, target_node_ids)
       values ($1, $2, 'get_neighbors', array[$3])`,
      [workspaceId, token.rows[0]?.id, node.rows[0]?.id],
    );
    await database.query(
      `insert into public.access_events (workspace_id, token_id, tool, target_node_ids)
       values ($1, $2, 'get_graph_schema', array[]::text[])`,
      [workspaceId, token.rows[0]?.id],
    );

    const rows = await database.query<{
      repository_id: string | null;
      tool: string;
    }>("select tool, repository_id from public.access_events order by tool");
    // A call that named a node belongs to that node's repository; one that
    // named none belongs to no repository, and says so (OQ-042).
    expect(rows.rows).toEqual([
      { repository_id: null, tool: "get_graph_schema" },
      { repository_id: repositoryId, tool: "get_neighbors" },
    ]);
  });
});
