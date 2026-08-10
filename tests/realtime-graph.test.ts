import { describe, expect, test, vi } from "vitest";

import {
  DEMO_REVOKED_TOKEN_ID,
  DEMO_WORKSPACE_ID,
  createDemoAccessEvents,
  createRealtimeGraphState,
  logAccessEventFireAndForget,
  pulsePhaseAt,
  reduceAccessEventBatch,
  subscribeWorkspaceRealtime,
  type GraphAccessEvent,
} from "../apps/web/lib/realtime/access-events";

const policy = {
  revokedTokenIds: new Set([DEMO_REVOKED_TOKEN_ID]),
  workspaceId: DEMO_WORKSPACE_ID,
};

describe("realtime evidence graph state", () => {
  test("transitions pulse to decay to afterglow to idle", () => {
    const now = 10_000;
    const state = reduceAccessEventBatch(createRealtimeGraphState(DEMO_WORKSPACE_ID), createDemoAccessEvents(now), policy);
    const pulse = state.pulses["req-auth"];

    expect(pulsePhaseAt(pulse, now + 200)).toBe("pulse");
    expect(pulsePhaseAt(pulse, now + 1_200)).toBe("decay");
    expect(pulsePhaseAt(pulse, now + 4_000)).toBe("afterglow");
    expect(pulsePhaseAt(pulse, now + 13_000)).toBe("idle");
  });

  test("orders feed newest-first and excludes cross-tenant and revoked-token events", () => {
    const state = reduceAccessEventBatch(createRealtimeGraphState(DEMO_WORKSPACE_ID), createDemoAccessEvents(1_000), policy);

    expect(state.feed.map((event) => event.id)).toEqual([
      "access-note", "access-pack", "access-findings", "access-artifact", "access-search",
    ]);
    expect(state.feed.some((event) => event.targetPath.includes("private"))).toBe(false);
    expect(state.feed.some((event) => event.targetPath.includes("revoked"))).toBe(false);
  });

  test("batches a 50 events/s burst without triggering graph relayout", () => {
    const events: GraphAccessEvent[] = Array.from({ length: 50 }, (_, index) => ({
      id: `burst-${index}`,
      occurredAt: 1_000 + index * 20,
      targetNodeIds: [`node-${index % 5}`],
      targetPath: `artifact-${index}.ts`,
      tokenId: "token-codex",
      tool: "search_index",
      workspaceId: DEMO_WORKSPACE_ID,
    }));
    const state = reduceAccessEventBatch(createRealtimeGraphState(DEMO_WORKSPACE_ID), events, policy);

    expect(state.renderBatches).toBe(1);
    expect(state.layoutRevision).toBe(0);
    expect(Object.keys(state.pulses)).toHaveLength(5);
    expect(state.feed).toHaveLength(20);
  });

  test("subscribes to the tenant channel and flushes events as one wave", () => {
    let listener: ((event: GraphAccessEvent) => void) | undefined;
    let flush: (() => void) | undefined;
    const batches: readonly GraphAccessEvent[][] = [];
    const mutableBatches = batches as GraphAccessEvent[][];
    const unsubscribe = subscribeWorkspaceRealtime(
      { subscribe: (channel, next) => { expect(channel).toBe(`workspace:${DEMO_WORKSPACE_ID}:access-events`); listener = next; return vi.fn(); } },
      policy,
      (batch) => mutableBatches.push([...batch]),
      (nextFlush) => { flush = nextFlush; },
    );
    const events = createDemoAccessEvents(1_000);
    for (const event of events) listener?.(event);
    flush?.();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(5);
    unsubscribe();
  });

  test("logs fire-and-forget without surfacing publisher failure", async () => {
    const publish = vi.fn(async () => { throw new Error("realtime unavailable"); });
    const event = createDemoAccessEvents(1_000)[0]!;

    expect(logAccessEventFireAndForget(event, publish)).toBeUndefined();
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(publish).toHaveBeenCalledWith(event);
  });
});
