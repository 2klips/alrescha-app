import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseLocalPromptLog,
  serializeLocalPromptLog,
  toServerPromptSync,
  LOCAL_PROMPT_LOG_GITIGNORE_ENTRY,
  LOCAL_PROMPT_LOG_PATH,
  type LocalPromptRecord,
} from "../packages/core/src/index";
import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const OWNER = "71111111-1111-4111-8111-111111111111";
const ALICE = "72222222-2222-4222-8222-222222222222";
const BOB = "73333333-3333-4333-8333-333333333333";

const SENSITIVE_PROMPT = "PRIVATE_PROMPT_TEXT_c41f 인증 버그를 고쳐줘";

/**
 * Phase 2B todo 10 — the ADR-011 negative suite. These tests are the
 * machine-checked precondition for any team surface: the scope guardrail
 * (`unguarded-team-surface`) requires the three ADR-011 invariant markers
 * below to exist here before team-path code may land.
 */
describe("prompt capture privacy (ADR-011)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  async function call(
    userId: string,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<unknown[]> {
    return asAuthenticatedUser(database, userId, async (transaction) => {
      const result = await transaction.query(sql, parameters);
      return result.rows;
    });
  }

  async function record(
    userId: string,
    rawText: string | null = null,
    shared = false,
  ): Promise<unknown[]> {
    return call(
      userId,
      "select public.record_prompt($1, 'log_progress', array['01J0000000000000000000000N'], 120, '{\"specificity\":2}'::jsonb, $2, $3) as id",
      [workspace, rawText, shared],
    );
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      `insert into auth.users (id, email) values
       ($1, 'p-owner@example.test'), ($2, 'p-alice@example.test'), ($3, 'p-bob@example.test')`,
      [OWNER, ALICE, BOB],
    );
    workspace = (
      await database.query<{ id: string }>(
        "select id from public.workspaces where owner_user_id = $1",
        [OWNER],
      )
    ).rows[0]!.id;
    for (const invitee of [ALICE, BOB]) {
      await call(
        OWNER,
        "select public.invite_workspace_member($1, $2, 'member')",
        [workspace, invitee],
      );
      await call(invitee, "select public.accept_workspace_invite($1)", [
        workspace,
      ]);
    }
  });

  afterEach(async () => {
    await database.close();
  });

  it("ADR-011:no-capture-without-consent — no enablement or no consent means no row, on any path", async () => {
    // Workspace not enabled: even a consenting member is refused.
    await call(ALICE, "select public.set_prompt_consent($1, true, false)", [
      workspace,
    ]);
    await expect(record(ALICE)).rejects.toThrow(
      /not enabled for this workspace/,
    );

    // Enabled, but Bob never consented: refused — including a service-role
    // direct insert, which the BEFORE trigger blocks below RLS.
    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await expect(record(BOB)).rejects.toThrow(/has not consented/);
    await expect(
      database.query(
        "insert into public.prompt_records (workspace_id, user_id, tool_name) values ($1, $2, 'direct')",
        [workspace, BOB],
      ),
    ).rejects.toThrow(/has not consented/);

    // Revoked consent closes the gate again, immediately.
    await record(ALICE);
    await call(ALICE, "select public.set_prompt_consent($1, false, false)", [
      workspace,
    ]);
    await expect(record(ALICE)).rejects.toThrow(/has not consented/);

    expect(
      (
        await database.query(
          "select user_id from public.prompt_records where workspace_id = $1",
          [workspace],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("ADR-011:no-raw-prompt-in-access-events — the two stores never mix", async () => {
    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await call(ALICE, "select public.set_prompt_consent($1, true, true)", [
      workspace,
    ]);
    await record(ALICE, SENSITIVE_PROMPT);

    // Recording a prompt writes zero access events…
    const accessEvents = await database.query(
      "select * from public.access_events where workspace_id = $1",
      [workspace],
    );
    expect(accessEvents.rows).toEqual([]);

    // …and access_events structurally cannot hold prompt text.
    const columns = await database.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'access_events'`,
    );
    const names = columns.rows.map(({ column_name }) => column_name);
    for (const forbidden of [
      "prompt",
      "prompt_text",
      "query",
      "task",
      "text",
      "raw_text",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("ADR-011:no-consent-status-exposure — consent rows are visible to their subject only", async () => {
    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await call(ALICE, "select public.set_prompt_consent($1, true, false)", [
      workspace,
    ]);

    // Alice sees her own consent; the owner/admin and teammates see nothing
    // about her — not even that a row exists.
    expect(
      await call(
        ALICE,
        "select user_id from public.prompt_capture_consents where workspace_id = $1",
        [workspace],
      ),
    ).toHaveLength(1);
    for (const userId of [OWNER, BOB]) {
      expect(
        await call(
          userId,
          "select user_id from public.prompt_capture_consents where workspace_id = $1 and user_id = $2",
          [workspace, ALICE],
        ),
      ).toEqual([]);
    }
    // The workspace-level switch itself IS visible — members must be able to
    // decide — which is exactly the boundary ADR-011 draws.
    expect(
      await call(
        BOB,
        "select enabled from public.prompt_capture_settings where workspace_id = $1",
        [workspace],
      ),
    ).toEqual([{ enabled: true }]);
  });

  it("stores no raw text unless the member's separate raw-sync switch is on", async () => {
    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await call(ALICE, "select public.set_prompt_consent($1, true, false)", [
      workspace,
    ]);
    await expect(record(ALICE, SENSITIVE_PROMPT)).rejects.toThrow(
      /Raw prompt sync is not enabled/,
    );
    await record(ALICE, null);
    const dump = JSON.stringify(
      (
        await database.query(
          "select * from public.prompt_records where workspace_id = $1",
          [workspace],
        )
      ).rows,
    );
    expect(dump).not.toContain("PRIVATE_PROMPT_TEXT_c41f");
  });

  it("keeps unshared prompts readable by their author alone; sharing is explicit", async () => {
    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await call(ALICE, "select public.set_prompt_consent($1, true, true)", [
      workspace,
    ]);
    await record(ALICE, SENSITIVE_PROMPT, false);

    expect(
      await call(
        ALICE,
        "select raw_text from public.prompt_records where workspace_id = $1",
        [workspace],
      ),
    ).toHaveLength(1);
    for (const userId of [OWNER, BOB]) {
      expect(
        await call(
          userId,
          "select id from public.prompt_records where workspace_id = $1",
          [workspace],
        ),
      ).toEqual([]);
    }

    // Explicit share by the author — and only then — opens the row to the team.
    await call(
      ALICE,
      "update public.prompt_records set shared = true where workspace_id = $1",
      [workspace],
    );
    expect(
      await call(
        BOB,
        "select id from public.prompt_records where workspace_id = $1",
        [workspace],
      ),
    ).toHaveLength(1);
  });

  it("deletion is immediate and reaches derived aggregates", async () => {
    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await call(ALICE, "select public.set_prompt_consent($1, true, false)", [
      workspace,
    ]);
    await record(ALICE);
    await record(ALICE);

    const before = await call(
      ALICE,
      `select count(*)::integer as records, coalesce(avg((rubric->>'specificity')::numeric), 0)::numeric as average
       from public.prompt_records where workspace_id = $1 and user_id = $2`,
      [workspace, ALICE],
    );
    expect(before).toEqual([{ average: "2.0000000000000000", records: 2 }]);

    await call(
      ALICE,
      "delete from public.prompt_records where workspace_id = $1",
      [workspace],
    );
    const after = await call(
      ALICE,
      `select count(*)::integer as records from public.prompt_records where workspace_id = $1 and user_id = $2`,
      [workspace, ALICE],
    );
    expect(after).toEqual([{ records: 0 }]);
  });

  it("the MCP service-role path obeys the same consent gate", async () => {
    // `record_prompt_as` is how the hosted MCP writes (no auth.uid() there).
    // It must not become a way around the double opt-in.
    await expect(
      database.query(
        "select public.record_prompt_as($1::text, $2::uuid, 'log_progress', '{}'::text[], 10, '{}'::jsonb, null::text, false)",
        [workspace, ALICE],
      ),
    ).rejects.toThrow(/not enabled for this workspace/);

    await call(OWNER, "select public.set_prompt_capture($1, true)", [
      workspace,
    ]);
    await expect(
      database.query(
        "select public.record_prompt_as($1::text, $2::uuid, 'log_progress', '{}'::text[], 10, '{}'::jsonb, null::text, false)",
        [workspace, BOB],
      ),
    ).rejects.toThrow(/has not consented/);

    // A non-member cannot be recorded at all, consent or not.
    const stranger = "79999999-9999-4999-8999-999999999999";
    await database.query(
      "insert into auth.users (id, email) values ($1, 'p-stranger@example.test')",
      [stranger],
    );
    await expect(
      database.query(
        "select public.record_prompt_as($1::text, $2::uuid, 'log_progress', '{}'::text[], 10, '{}'::jsonb, null::text, false)",
        [workspace, stranger],
      ),
    ).rejects.toThrow(/not an active member/);

    // With consent, the same call succeeds — and raw text still needs the
    // separate switch.
    await call(ALICE, "select public.set_prompt_consent($1, true, false)", [
      workspace,
    ]);
    await database.query(
      "select public.record_prompt_as($1::text, $2::uuid, 'log_progress', '{}'::text[], 10, '{}'::jsonb, null::text, false)",
      [workspace, ALICE],
    );
    await expect(
      database.query(
        "select public.record_prompt_as($1::text, $2::uuid, 'log_progress', '{}'::text[], 10, '{}'::jsonb, $3::text, false)",
        [workspace, ALICE, SENSITIVE_PROMPT],
      ),
    ).rejects.toThrow(/Raw prompt sync is not enabled/);
    expect(
      (
        await database.query(
          "select id from public.prompt_records where workspace_id = $1",
          [workspace],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("the local-first log keeps raw text on disk unless raw sync is explicitly on", () => {
    const recordEntry: LocalPromptRecord = {
      occurredAt: "2026-08-17T10:00:00.000Z",
      promptText: SENSITIVE_PROMPT,
      rubric: { specificity: 2 },
      targetNodeIds: ["01J0000000000000000000000N"],
      tokenCount: 120,
      toolName: "log_progress",
    };
    const serialized = serializeLocalPromptLog([recordEntry]);
    expect(parseLocalPromptLog(serialized)).toEqual([recordEntry]);
    expect(LOCAL_PROMPT_LOG_PATH.startsWith(".arr/")).toBe(true);
    expect(LOCAL_PROMPT_LOG_GITIGNORE_ENTRY).toBe(".arr/");

    // Metadata-first sync boundary: without the switch, the text stays local.
    const withoutRaw = toServerPromptSync(recordEntry, {
      rawSyncEnabled: false,
    });
    expect(JSON.stringify(withoutRaw)).not.toContain(
      "PRIVATE_PROMPT_TEXT_c41f",
    );
    expect(withoutRaw.tokenCount).toBe(120);
    const withRaw = toServerPromptSync(recordEntry, { rawSyncEnabled: true });
    expect(withRaw.rawText).toBe(SENSITIVE_PROMPT);
  });
});
