import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpAccessEvent } from "@arr/mcp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupabaseMcpStore } from "./supabase-store";

type TableResponse = { data: unknown; error: { message: string } | null };
type HttpSendResult =
  { success: true } | { success: false; status: number; error: string };

/**
 * Minimal fake of a Supabase PostgREST query builder: chainable `.eq()` /
 * `.select()` / `.update()` / `.order()`, and resolves the configured
 * `{ data, error }` from `.maybeSingle()`, `.single()`, `.insert()`, or when
 * awaited/`.then()`-ed directly — the shape `authenticateAccessToken`'s
 * fire-and-forget `last_used_at` touch relies on (no terminator call).
 */
class FakeQueryBuilder<T = unknown> {
  readonly calls: { args: unknown[]; method: string }[] = [];

  constructor(
    private readonly response: { data: T; error: { message: string } | null },
  ) {}

  #record(method: string, args: unknown[]): this {
    this.calls.push({ args, method });
    return this;
  }

  eq(...args: unknown[]) {
    return this.#record("eq", args);
  }

  select(...args: unknown[]) {
    return this.#record("select", args);
  }

  update(...args: unknown[]) {
    return this.#record("update", args);
  }

  order(...args: unknown[]) {
    return this.#record("order", args);
  }

  async insert(...args: unknown[]) {
    this.#record("insert", args);
    return this.response;
  }

  async maybeSingle() {
    return this.response;
  }

  async single() {
    return this.response;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: typeof this.response) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

class FakeChannel {
  readonly calls: { args: unknown[]; method: string }[] = [];

  constructor(
    readonly topic: string,
    private readonly result: HttpSendResult,
  ) {}

  async httpSend(event: string, payload: unknown) {
    this.calls.push({ args: [event, payload], method: "httpSend" });
    return this.result;
  }
}

/**
 * Fake `SupabaseClient`. Each table's response can be one value (returned to
 * every `.from(table)` call) or a queue (consumed in call order, holding on
 * the last entry once exhausted) — used to give a table's *second* call
 * (e.g. the `last_used_at` touch, which re-queries `mcp_tokens`) a different
 * outcome than its first.
 */
class FakeSupabaseClient {
  readonly fromCalls: string[] = [];
  readonly builders: FakeQueryBuilder[] = [];
  readonly channels: FakeChannel[] = [];
  readonly removedChannels: FakeChannel[] = [];
  readonly #queues = new Map<string, TableResponse[]>();

  constructor(
    responses: Record<string, TableResponse | TableResponse[]>,
    private readonly channelResult: HttpSendResult = { success: true },
    private readonly defaultResponse: TableResponse = { data: [], error: null },
  ) {
    for (const [table, value] of Object.entries(responses)) {
      this.#queues.set(table, Array.isArray(value) ? [...value] : [value]);
    }
  }

  from(table: string) {
    this.fromCalls.push(table);
    const queue = this.#queues.get(table);
    const response =
      queue === undefined
        ? this.defaultResponse
        : (queue.length > 1 ? queue.shift() : queue[0])!;
    const builder = new FakeQueryBuilder(response);
    this.builders.push(builder);
    return builder;
  }

  channel(topic: string) {
    const channel = new FakeChannel(topic, this.channelResult);
    this.channels.push(channel);
    return channel;
  }

  async removeChannel(channel: FakeChannel) {
    this.removedChannels.push(channel);
  }
}

function asClient(fake: FakeSupabaseClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";
const USER_ID = "user-owner";
const TOKEN_ID = "01K287J3D18V7A1MZG9E8D1Y10";

function tokenRow(lastUsedAt: string | null) {
  return {
    created_by: USER_ID,
    expires_at: null,
    id: TOKEN_ID,
    last_used_at: lastUsedAt,
    revoked_at: null,
    scopes: ["mcp:read"],
    workspace_id: WORKSPACE_ID,
  };
}

const OWNER_OK: TableResponse = { data: { id: WORKSPACE_ID }, error: null };

function findUpdateBuilder(client: FakeSupabaseClient) {
  return client.builders.find((builder) =>
    builder.calls.some((call) => call.method === "update"),
  );
}

describe("SupabaseMcpStore.authenticateAccessToken — last_used_at throttle (QW-11)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips the touch when last_used_at is inside the throttle window", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    const client = new FakeSupabaseClient({
      mcp_tokens: { data: tokenRow(recent), error: null },
      workspaces: OWNER_OK,
    });
    const store = new SupabaseMcpStore(asClient(client));

    const principal = await store.authenticateAccessToken("sp_mcp_test");

    expect(principal).toEqual({
      scopes: ["mcp:read"],
      tokenId: TOKEN_ID,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(findUpdateBuilder(client)).toBeUndefined();
  });

  it("touches last_used_at immediately when it has never been set", async () => {
    const client = new FakeSupabaseClient({
      mcp_tokens: { data: tokenRow(null), error: null },
      workspaces: OWNER_OK,
    });
    const store = new SupabaseMcpStore(asClient(client));

    await store.authenticateAccessToken("sp_mcp_test");

    const updateBuilder = findUpdateBuilder(client);
    expect(updateBuilder).toBeDefined();
    expect(updateBuilder?.calls).toContainEqual({
      args: ["id", TOKEN_ID],
      method: "eq",
    });
  });

  it("touches last_used_at once the throttle window has elapsed", async () => {
    const stale = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min
    const client = new FakeSupabaseClient({
      mcp_tokens: { data: tokenRow(stale), error: null },
      workspaces: OWNER_OK,
    });
    const store = new SupabaseMcpStore(asClient(client));

    await store.authenticateAccessToken("sp_mcp_test");

    expect(findUpdateBuilder(client)).toBeDefined();
  });

  it("logs but never fails authentication when the fire-and-forget touch errors", async () => {
    const client = new FakeSupabaseClient({
      mcp_tokens: [
        { data: tokenRow(null), error: null }, // the initial lookup
        { data: null, error: { message: "boom" } }, // the touch update
      ],
      workspaces: OWNER_OK,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const store = new SupabaseMcpStore(asClient(client));

    const principal = await store.authenticateAccessToken("sp_mcp_test");

    expect(principal).not.toBeNull();
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "MCP token usage update failed",
        { message: "boom" },
      ),
    );
  });
});

describe("SupabaseMcpStore — trusts the already-authenticated principal (QW-11)", () => {
  const principal = {
    scopes: ["mcp:read", "mcp:write"] as const,
    tokenId: TOKEN_ID,
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  };

  it("appendNote never re-queries workspace ownership for an already-authenticated principal", async () => {
    const client = new FakeSupabaseClient({
      mcp_notes: { data: null, error: null },
    });
    const store = new SupabaseMcpStore(asClient(client));

    const note = await store.appendNote(principal, { text: "hello" });

    expect(note.workspaceId).toBe(WORKSPACE_ID);
    expect(client.fromCalls).not.toContain("workspaces");
    expect(client.fromCalls).toContain("mcp_notes");
  });
});

describe("SupabaseMcpStore.publishAccessEvent — REST broadcast (QW-17)", () => {
  const event: McpAccessEvent = {
    id: "01K287J3D18V7A1MZG9E8D1Y99",
    occurredAt: new Date().toISOString(),
    targetNodeIds: ["01K287J3D18V7A1MZG9E8D1Y11"],
    tokenId: TOKEN_ID,
    tool: "get_artifact",
    workspaceId: WORKSPACE_ID,
  };

  it("broadcasts via httpSend (no subscribe) and always tears the channel down", async () => {
    const client = new FakeSupabaseClient({}, { success: true });
    const store = new SupabaseMcpStore(asClient(client));

    await store.publishAccessEvent(
      `workspace:${WORKSPACE_ID}:access-events`,
      event,
    );

    expect(client.channels).toHaveLength(1);
    expect(client.channels[0]?.calls).toEqual([
      { args: ["access_event", event], method: "httpSend" },
    ]);
    expect(client.removedChannels).toEqual(client.channels);
  });

  it("propagates a failed broadcast but still tears the channel down", async () => {
    const client = new FakeSupabaseClient(
      {},
      { success: false, status: 500, error: "boom" },
    );
    const store = new SupabaseMcpStore(asClient(client));

    await expect(
      store.publishAccessEvent(
        `workspace:${WORKSPACE_ID}:access-events`,
        event,
      ),
    ).rejects.toThrow(/boom/);
    expect(client.removedChannels).toEqual(client.channels);
  });
});
