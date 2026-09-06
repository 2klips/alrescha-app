import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { estimateTokens } from "../packages/mcp/src/repo-map";
import { MODEL_IDENTIFIER_PATTERN } from "../packages/mcp/src/store";
import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

const OWNER = "51111111-1111-4111-8111-111111111111";
const OUTSIDER = "52222222-2222-4222-8222-222222222222";
const TOKEN_ID = "01J0000000000000000000000T";
const OUTSIDER_TOKEN_ID = "01J0000000000000000000000W";
const REPOSITORY_ID = "01J000000000000000000000R1";
const NODE_ID = "01J000000000000000000000N1";

/**
 * Phase 4 Wave E todo 23. Two meters, one retention promise, and the rule
 * that keeps both honest: an unmeasured call is not a zero-byte call.
 */
describe("session telemetry", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;
  let outsiderWorkspace: string;

  const query = async <T>(sql: string, parameters: unknown[] = []) =>
    (await database.query<T>(sql, parameters)).rows;

  async function insertEvent(input: {
    occurredAt?: string;
    id: string;
    nodeIds?: string[];
    responseChars: number | null;
    tool?: string;
    workspaceId?: string;
    tokenId?: string;
  }): Promise<void> {
    await database.query(
      `insert into public.access_events
         (id, workspace_id, token_id, tool, target_node_ids, response_chars, occurred_at)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))`,
      [
        input.id,
        input.workspaceId ?? workspace,
        input.tokenId ?? TOKEN_ID,
        input.tool ?? "search_index",
        input.nodeIds ?? [],
        input.responseChars,
        input.occurredAt ?? null,
      ],
    );
  }

  beforeAll(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      `insert into auth.users (id, email) values
         ($1, 'telemetry-owner@example.test'),
         ($2, 'telemetry-outsider@example.test')`,
      [OWNER, OUTSIDER],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspace =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === OWNER)
        ?.id ?? "";
    outsiderWorkspace =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === OUTSIDER)
        ?.id ?? "";
    await database.query(
      `insert into public.mcp_tokens (id, workspace_id, token_hash, token_prefix, created_by)
       values ($1, $2, 'telemetry-token', 'sp_tel', $3), ($4, $5, 'outsider-token', 'sp_out', $6)`,
      [
        TOKEN_ID,
        workspace,
        OWNER,
        OUTSIDER_TOKEN_ID,
        outsiderWorkspace,
        OUTSIDER,
      ],
    );
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, '2klips/telemetry')",
      [REPOSITORY_ID, workspace],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'src/app.ts')`,
      [NODE_ID, workspace, REPOSITORY_ID],
    );
  });

  afterAll(async () => database.close());

  beforeEach(async () => {
    await database.query("delete from public.session_usage_reports");
    await database.query("delete from public.access_events");
    await database.query(
      "update public.workspaces set pilot_instrumentation_enabled = false, pilot_instrumentation_consented_at = null",
    );
  });

  it("generates the token estimate from the length, at the same ratio the server uses", async () => {
    const lengths = [0, 1, 3, 4, 5, 999, 4_001, 123_456];
    for (const [index, length] of lengths.entries()) {
      await insertEvent({
        id: `01J000000000000000000000E${index}`,
        responseChars: length,
      });
    }

    const rows = await query<{
      estimated_tokens: number;
      response_chars: number;
    }>(
      "select response_chars, estimated_tokens from public.access_events order by response_chars",
    );

    expect(rows).toHaveLength(lengths.length);
    for (const row of rows) {
      // The column and `estimateTokens` are the same arithmetic; a drift in
      // either is a drift between what the meter says and what the map says.
      expect(row.estimated_tokens).toBe(
        estimateTokens("x".repeat(row.response_chars)),
      );
    }
    expect(rows.map(({ estimated_tokens }) => estimated_tokens)).toEqual([
      0, 1, 1, 1, 2, 250, 1_001, 30_864,
    ]);
  });

  it("refuses a writer-supplied token count and keeps an unmeasured call unmeasured", async () => {
    await expect(
      database.query(
        `insert into public.access_events
           (id, workspace_id, token_id, tool, estimated_tokens)
         values ('01J000000000000000000000EX', $1, $2, 'repo_map', 7)`,
        [workspace, TOKEN_ID],
      ),
    ).rejects.toThrow(/non-DEFAULT value into column "estimated_tokens"/);

    await insertEvent({
      id: "01J000000000000000000000EY",
      responseChars: null,
    });
    const [row] = await query<{
      estimated_tokens: number | null;
      response_chars: number | null;
    }>(
      "select response_chars, estimated_tokens from public.access_events where id = '01J000000000000000000000EY'",
    );
    // Not zero: nobody measured this call, and that is a different fact.
    expect(row).toEqual({ estimated_tokens: null, response_chars: null });
  });

  it("rejects a negative length", async () => {
    await expect(
      insertEvent({ id: "01J000000000000000000000EZ", responseChars: -1 }),
    ).rejects.toThrow(/response_chars/);
  });

  describe("opt-in usage reports", () => {
    const report = async (
      overrides: {
        model?: string | null;
        repositoryId?: string | null;
        workspaceId?: string;
      } = {},
    ): Promise<string> => {
      const rows = await query<{ report_session_usage: string }>(
        "select public.report_session_usage($1, $2, 1200, 340, 8000, 500, $3, $4) as report_session_usage",
        [
          overrides.workspaceId ?? workspace,
          TOKEN_ID,
          overrides.model ?? null,
          overrides.repositoryId ?? null,
        ],
      );
      return rows[0]?.report_session_usage ?? "";
    };

    const enable = async (): Promise<void> => {
      await database.query(
        `update public.workspaces
         set pilot_instrumentation_enabled = true,
             pilot_instrumentation_consented_at = now()
         where id = $1`,
        [workspace],
      );
    };

    it("says why it declined instead of failing the session", async () => {
      expect(await report()).toBe("not_enabled");
      expect(
        await query("select id from public.session_usage_reports"),
      ).toEqual([]);
    });

    it("gates the table itself, service role included", async () => {
      await expect(
        asServiceRole(database, (transaction) =>
          transaction.query(
            `insert into public.session_usage_reports (workspace_id, token_id, input_tokens)
             values ($1, $2, 10)`,
            [workspace, TOKEN_ID],
          ),
        ),
      ).rejects.toThrow(/not enabled/i);
    });

    it("records numbers once the workspace has opted in", async () => {
      await enable();
      expect(
        await report({
          model: "claude-opus-5",
          repositoryId: REPOSITORY_ID,
        }),
      ).toBe("recorded");

      const rows = await query<Record<string, unknown>>(
        `select cache_creation_tokens, cache_read_tokens, input_tokens, model,
                output_tokens, repository_id, token_id
         from public.session_usage_reports`,
      );
      expect(rows).toEqual([
        {
          cache_creation_tokens: 500,
          cache_read_tokens: 8_000,
          input_tokens: 1_200,
          model: "claude-opus-5",
          output_tokens: 340,
          repository_id: REPOSITORY_ID,
          token_id: TOKEN_ID,
        },
      ]);
    });

    it("treats a client-supplied repository id as a request, not a claim", async () => {
      await enable();
      expect(await report({ repositoryId: "01J000000000000000000000RX" })).toBe(
        "unknown_repository",
      );
      expect(
        await query("select id from public.session_usage_reports"),
      ).toEqual([]);
    });

    it("ADR-011: the model column cannot carry a sentence", async () => {
      await enable();
      // One rule, two implementations — the Zod schema on the tool and the
      // CHECK on the column. This pins them to each other rather than to a
      // memory of what the other one said.
      const samples = [
        "claude-opus-5",
        "gpt-4.1-mini",
        "anthropic/claude-sonnet-5:beta",
        "fix the auth bug",
        "model with spaces",
        "",
        "x".repeat(121),
      ];
      const [constraint] = await query<{ definition: string }>(
        `select pg_get_constraintdef(oid) as definition from pg_constraint
         where conname = 'session_usage_reports_model_identifier'`,
      );
      const pattern = constraint?.definition.match(/~ '([^']+)'/)?.[1] ?? "";
      expect(pattern).toBe(MODEL_IDENTIFIER_PATTERN.source);
      for (const sample of samples) {
        const [row] = await query<{ accepted: boolean }>(
          "select ($1 ~ $2) as accepted",
          [sample, pattern],
        );
        expect(row?.accepted).toBe(MODEL_IDENTIFIER_PATTERN.test(sample));
      }

      await expect(
        report({ model: "fix the auth bug in src/app.ts" }),
      ).rejects.toThrow(/model_identifier/);

      const columns = await query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'session_usage_reports'`,
      );
      const names = columns.map(({ column_name }) => column_name);
      for (const forbidden of [
        "prompt",
        "prompt_text",
        "query",
        "raw_text",
        "task",
        "text",
        "response",
        "summary",
      ]) {
        expect(names).not.toContain(forbidden);
      }
      // The only non-numeric, non-identifier column is the constrained model.
      const free = await query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'session_usage_reports'
           and data_type in ('text', 'character varying')`,
      );
      expect(free.map(({ column_name }) => column_name).sort()).toEqual([
        "id",
        "model",
        "repository_id",
        "token_id",
        "workspace_id",
      ]);
    });
  });

  describe("usage_daily", () => {
    beforeEach(async () => {
      await database.query(
        `update public.workspaces
         set pilot_instrumentation_enabled = true, pilot_instrumentation_consented_at = now()`,
      );
    });

    it("sums both meters per repository and UTC day, and counts unmeasured calls apart", async () => {
      await insertEvent({
        id: "01J000000000000000000000D1",
        nodeIds: [NODE_ID],
        occurredAt: "2026-09-01T23:30:00Z",
        responseChars: 400,
      });
      await insertEvent({
        id: "01J000000000000000000000D2",
        nodeIds: [NODE_ID],
        occurredAt: "2026-09-01T01:00:00Z",
        responseChars: 800,
      });
      await insertEvent({
        // No node ids: attributed to the workspace, not to a repository.
        id: "01J000000000000000000000D3",
        occurredAt: "2026-09-01T02:00:00Z",
        responseChars: null,
        tool: "get_graph_schema",
      });
      await insertEvent({
        id: "01J000000000000000000000D4",
        nodeIds: [NODE_ID],
        occurredAt: "2026-09-02T00:10:00Z",
        responseChars: 100,
      });
      await database.query(
        `insert into public.session_usage_reports
           (id, workspace_id, token_id, repository_id, occurred_at, model,
            input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
         values ('01J000000000000000000000D5', $1, $2, $3, '2026-09-02T09:00:00Z',
                 'claude-opus-5', 900, 120, 7000, 60)`,
        [workspace, TOKEN_ID, REPOSITORY_ID],
      );

      const rows = await query<Record<string, unknown>>(
        `select day::text as day, repository_id, served_calls, served_measured_calls,
                served_response_chars, served_estimated_tokens, reported_reports,
                reported_input_tokens, reported_cache_read_tokens
         from public.usage_daily
         where workspace_id = $1
         order by day, repository_id nulls first`,
        [workspace],
      );

      expect(rows).toEqual([
        {
          day: "2026-09-01",
          repository_id: null,
          reported_cache_read_tokens: 0,
          reported_input_tokens: 0,
          reported_reports: 0,
          served_calls: 1,
          served_estimated_tokens: 0,
          served_measured_calls: 0,
          served_response_chars: 0,
        },
        {
          day: "2026-09-01",
          repository_id: REPOSITORY_ID,
          reported_cache_read_tokens: 0,
          reported_input_tokens: 0,
          reported_reports: 0,
          served_calls: 2,
          served_estimated_tokens: 300,
          served_measured_calls: 2,
          served_response_chars: 1_200,
        },
        {
          day: "2026-09-02",
          repository_id: REPOSITORY_ID,
          reported_cache_read_tokens: 7_000,
          reported_input_tokens: 900,
          reported_reports: 1,
          served_calls: 1,
          served_estimated_tokens: 25,
          served_measured_calls: 1,
          served_response_chars: 100,
        },
      ]);
    });

    it("shows a member only their own workspace, and hands a service-role reader both", async () => {
      await insertEvent({
        id: "01J000000000000000000000M1",
        responseChars: 200,
      });
      await insertEvent({
        id: "01J000000000000000000000M2",
        responseChars: 640,
        tokenId: OUTSIDER_TOKEN_ID,
        workspaceId: outsiderWorkspace,
      });

      const asOwner = await asAuthenticatedUser(
        database,
        OWNER,
        (transaction) =>
          transaction.query<{ workspace_id: string }>(
            "select workspace_id from public.usage_daily",
          ),
      );
      expect(asOwner.rows.map(({ workspace_id }) => workspace_id)).toEqual([
        workspace,
      ]);

      const asOutsider = await asAuthenticatedUser(
        database,
        OUTSIDER,
        (transaction) =>
          transaction.query<{ workspace_id: string }>(
            "select workspace_id from public.usage_daily where workspace_id = $1",
            [workspace],
          ),
      );
      expect(asOutsider.rows).toEqual([]);

      // security_invoker does not protect the service-role path: that caller
      // still has to scope by workspace itself, and this asserts it must.
      const asService = await asServiceRole(database, (transaction) =>
        transaction.query<{ workspace_id: string }>(
          "select workspace_id from public.usage_daily",
        ),
      );
      expect(
        new Set(asService.rows.map(({ workspace_id }) => workspace_id)),
      ).toEqual(new Set([workspace, outsiderWorkspace]));
    });

    it("loses the day when retention prunes the rows it was computed from", async () => {
      await insertEvent({
        id: "01J000000000000000000000P1",
        occurredAt: "2026-01-01T00:00:00Z",
        responseChars: 500,
      });
      await database.query(
        `insert into public.session_usage_reports
           (id, workspace_id, token_id, occurred_at, input_tokens)
         values ('01J000000000000000000000P2', $1, $2, '2026-01-01T00:00:00Z', 42)`,
        [workspace, TOKEN_ID],
      );

      const before = await query("select day from public.usage_daily");
      expect(before).toHaveLength(1);

      const [pruned] = await query<{ prune_expired_access_events: number }>(
        "select public.prune_expired_access_events()",
      );
      expect(pruned?.prune_expired_access_events).toBe(2);
      expect(await query("select day from public.usage_daily")).toEqual([]);
    });
  });

  it("R-01: recording what a read cost never moves a revision", async () => {
    await database.query(
      "update public.workspaces set pilot_instrumentation_enabled = true, pilot_instrumentation_consented_at = now() where id = $1",
      [workspace],
    );
    const revisions = async () => ({
      data: (
        await query<{ data_revision: string }>(
          "select data_revision from public.repositories where id = $1",
          [REPOSITORY_ID],
        )
      )[0]?.data_revision,
      memory: (
        await query<{ memory_revision: string }>(
          "select memory_revision from public.workspaces where id = $1",
          [workspace],
        )
      )[0]?.memory_revision,
    });

    const before = await revisions();
    await insertEvent({
      id: "01J000000000000000000000V1",
      nodeIds: [NODE_ID],
      responseChars: 4_096,
    });
    await database.query(
      "select public.report_session_usage($1, $2, 10, 10, 10, 10, null, $3)",
      [workspace, TOKEN_ID, REPOSITORY_ID],
    );

    expect(await revisions()).toEqual(before);
  });
});
