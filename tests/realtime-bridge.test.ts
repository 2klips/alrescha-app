import { describe, expect, test } from "vitest";

import {
  accessEventTargetPath,
  parseBroadcastAccessEvent,
  workspaceAccessChannel,
  type GraphAccessEvent,
} from "../apps/web/lib/realtime/access-events";
import {
  connectWorkspaceRealtimeBridge,
  retryDelayFor,
  type RealtimeChannelLike,
  type WorkspaceRealtimeBridgeStatus,
} from "../apps/web/lib/realtime/supabase-bridge";

/**
 * Phase 4 Wave B todo 15 — the browser end of the access-event channel.
 *
 * The server side has published one frame per tool call since Phase 2A;
 * these tests pin what the page does with a frame once it arrives, against
 * a scripted channel so the checks that matter — tenant, revoked token,
 * field whitelist, reconnect — run without a socket.
 */

const WORKSPACE = "01WORKSPACEAAAAAAAAAAAAAAA";
const OTHER = "01WORKSPACEBBBBBBBBBBBBBBB";

const paths = new Map([
  ["node-session", "src/session.ts"],
  ["node-audit", "src/audit.ts"],
]);
const pathOf = (nodeId: string) => paths.get(nodeId);

function frame(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "01EVENT000000000000000000A",
    occurredAt: "2026-09-13T12:00:00.000Z",
    targetNodeIds: ["node-session", "node-audit"],
    tokenId: "token-live",
    tool: "search_index",
    workspaceId: WORKSPACE,
    ...overrides,
  };
}

/** A channel the test drives by hand. */
interface ScriptedChannel extends RealtimeChannelLike {
  readonly topic: string;
  emit(payload: unknown): void;
  settle(status: string): void;
  readonly unsubscribed: () => number;
}

function scriptedChannel(topic: string): ScriptedChannel {
  let listener: ((message: { payload?: unknown }) => void) | null = null;
  let onStatus: ((status: string) => void) | null = null;
  let unsubscribed = 0;
  return {
    emit: (payload) => listener?.({ payload }),
    on: (_type, filter, callback) => {
      expect(filter.event).toBe("access_event");
      listener = callback;
    },
    settle: (status) => onStatus?.(status),
    subscribe: (callback) => {
      onStatus = callback;
    },
    topic,
    unsubscribe: () => {
      unsubscribed += 1;
    },
    unsubscribed: () => unsubscribed,
  };
}

describe("broadcast frame admission", () => {
  test("copies the six named fields and derives the feed path", () => {
    const event = parseBroadcastAccessEvent(frame(), pathOf);
    expect(event).toEqual<GraphAccessEvent>({
      id: "01EVENT000000000000000000A",
      occurredAt: Date.parse("2026-09-13T12:00:00.000Z"),
      targetNodeIds: ["node-session", "node-audit"],
      targetPath: "src/session.ts",
      tokenId: "token-live",
      tool: "search_index",
      workspaceId: WORKSPACE,
    });
  });

  test("drops every field it was not told about — a prompt body cannot ride along", () => {
    const event = parseBroadcastAccessEvent(
      frame({
        estimatedTokens: 12,
        prompt: "the raw prompt text",
        responseChars: 48,
        text: "also prose",
      }),
      pathOf,
    );
    expect(event).not.toBeNull();
    expect(Object.keys(event!).sort()).toEqual([
      "id",
      "occurredAt",
      "targetNodeIds",
      "targetPath",
      "tokenId",
      "tool",
      "workspaceId",
    ]);
    expect(JSON.stringify(event)).not.toContain("prompt");
  });

  test("rejects a frame that is missing or mistypes a required field", () => {
    expect(parseBroadcastAccessEvent(null, pathOf)).toBeNull();
    expect(parseBroadcastAccessEvent("access_event", pathOf)).toBeNull();
    expect(parseBroadcastAccessEvent(frame({ id: "" }), pathOf)).toBeNull();
    expect(
      parseBroadcastAccessEvent(frame({ occurredAt: "yesterday" }), pathOf),
    ).toBeNull();
    expect(
      parseBroadcastAccessEvent(
        frame({ targetNodeIds: "node-session" }),
        pathOf,
      ),
    ).toBeNull();
    expect(
      parseBroadcastAccessEvent(frame({ targetNodeIds: [1, 2] }), pathOf),
    ).toBeNull();
    expect(parseBroadcastAccessEvent(frame({ tool: 7 }), pathOf)).toBeNull();
    expect(
      parseBroadcastAccessEvent(frame({ workspaceId: undefined }), pathOf),
    ).toBeNull();
  });

  test("labels a row by the first known node, else by the tool", () => {
    expect(
      accessEventTargetPath(
        ["node-unknown", "node-audit"],
        pathOf,
        "get_artifact",
      ),
    ).toBe("src/audit.ts");
    expect(accessEventTargetPath(["node-unknown"], pathOf, "repo_map")).toBe(
      "repo_map",
    );
    expect(accessEventTargetPath([], pathOf, "get_graph_schema")).toBe(
      "get_graph_schema",
    );
  });

  test("names the channel the server publishes on", () => {
    expect(workspaceAccessChannel(WORKSPACE)).toBe(
      `workspace:${WORKSPACE}:access-events`,
    );
  });
});

describe("workspace realtime bridge", () => {
  function harness(revoked: string[] = []) {
    const channels: ScriptedChannel[] = [];
    const dispatched: GraphAccessEvent[] = [];
    const statuses: Array<[WorkspaceRealtimeBridgeStatus, number]> = [];
    const timers: Array<{ callback: () => void; delayMs: number }> = [];
    const stop = connectWorkspaceRealtimeBridge({
      clearTimer: (handle) => {
        const index = timers.indexOf(handle as (typeof timers)[number]);
        if (index >= 0) timers.splice(index, 1);
      },
      dispatch: (event) => dispatched.push(event),
      onStatus: (status, attempt) => statuses.push([status, attempt]),
      openChannel: (topic) => {
        const channel = scriptedChannel(topic);
        channels.push(channel);
        return channel;
      },
      pathOf,
      policy: { revokedTokenIds: new Set(revoked), workspaceId: WORKSPACE },
      setTimer: (callback, delayMs) => {
        const handle = { callback, delayMs };
        timers.push(handle);
        return handle;
      },
    });
    return { channels, dispatched, statuses, stop, timers };
  }

  test("joins the workspace's own private topic and forwards admitted frames", () => {
    const { channels, dispatched, statuses, stop } = harness();
    expect(channels).toHaveLength(1);
    expect(channels[0]!.topic).toBe(`workspace:${WORKSPACE}:access-events`);
    expect(statuses).toEqual([["connecting", 0]]);

    channels[0]!.settle("SUBSCRIBED");
    expect(statuses.at(-1)).toEqual(["live", 0]);

    channels[0]!.emit(frame());
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.targetPath).toBe("src/session.ts");
    stop();
  });

  test("drops a cross-tenant frame and a revoked token before the page sees them", () => {
    const { channels, dispatched, stop } = harness(["token-revoked"]);
    channels[0]!.settle("SUBSCRIBED");

    // The topic is this workspace's; a frame claiming another workspace is
    // still refused, as is one from a token this page was told is revoked.
    channels[0]!.emit(frame({ workspaceId: OTHER }));
    channels[0]!.emit(frame({ tokenId: "token-revoked" }));
    channels[0]!.emit({ not: "a frame" });
    expect(dispatched).toEqual([]);

    channels[0]!.emit(frame({ id: "01EVENT000000000000000000B" }));
    expect(dispatched.map((event) => event.id)).toEqual([
      "01EVENT000000000000000000B",
    ]);
    stop();
  });

  test("reopens a fresh channel after an error, with exponential backoff, and resets on join", () => {
    const { channels, statuses, stop, timers } = harness();
    channels[0]!.settle("CHANNEL_ERROR");
    expect(channels[0]!.unsubscribed()).toBe(1);
    expect(statuses.at(-1)).toEqual(["retrying", 1]);
    expect(timers.map(({ delayMs }) => delayMs)).toEqual([1_000]);

    timers.shift()!.callback();
    expect(channels).toHaveLength(2);
    channels[1]!.settle("TIMED_OUT");
    expect(statuses.at(-1)).toEqual(["retrying", 2]);
    expect(timers.map(({ delayMs }) => delayMs)).toEqual([2_000]);

    timers.shift()!.callback();
    channels[2]!.settle("SUBSCRIBED");
    expect(statuses.at(-1)).toEqual(["live", 0]);

    // A later drop starts the ladder from the bottom again.
    channels[2]!.settle("CLOSED");
    expect(statuses.at(-1)).toEqual(["retrying", 1]);
    expect(timers.map(({ delayMs }) => delayMs)).toEqual([1_000]);
    stop();
  });

  test("a stale channel's status is ignored once it has been replaced", () => {
    const { channels, statuses, stop, timers } = harness();
    channels[0]!.settle("CHANNEL_ERROR");
    timers.shift()!.callback();
    // The old channel reporting late must not touch the new attempt.
    channels[0]!.settle("SUBSCRIBED");
    expect(statuses.at(-1)).toEqual(["retrying", 1]);
    channels[1]!.settle("SUBSCRIBED");
    expect(statuses.at(-1)).toEqual(["live", 0]);
    stop();
  });

  test("stop() unsubscribes, cancels a pending retry, and retries nothing after", () => {
    const { channels, dispatched, statuses, stop, timers } = harness();
    channels[0]!.settle("CHANNEL_ERROR");
    expect(timers).toHaveLength(1);
    stop();
    expect(timers).toHaveLength(0);
    expect(statuses.at(-1)).toEqual(["closed", 1]);

    // Our own CLOSED, arriving after the stop, opens nothing.
    channels[0]!.settle("CLOSED");
    channels[0]!.emit(frame());
    expect(channels).toHaveLength(1);
    expect(dispatched).toEqual([]);
    stop();
    expect(statuses.filter(([status]) => status === "closed")).toHaveLength(1);
  });

  test("the backoff ladder is 1s doubling to a 30s ceiling", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelayFor)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
    expect(retryDelayFor(60)).toBe(30_000);
  });
});
