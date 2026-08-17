import { describe, expect, test } from "vitest";

import { createFixtureGraph } from "../apps/web/lib/dashboard/graph-model";
import {
  createGraphEngine,
  resetEngineCounters,
  type GraphBackend,
  type SimulationWorkerLike,
} from "../apps/web/lib/graph/engine";
import {
  GLOW_AFTERGLOW_FLOOR,
  GLOW_COALESCE_WINDOW_MS,
  GLOW_DECAY_TAU_MS,
  GLOW_RISE_MS,
  createGlowCoalescer,
  driftOverlay,
  glowAfterglowNodes,
  glowFromRealtime,
  glowIntensityAt,
  glowIntensities,
  glowPeak,
  glowPhaseAt,
} from "../apps/web/lib/graph/glow";
import {
  buildRenderFrame,
  type GraphPalette,
} from "../apps/web/lib/graph/render-frame";
import { runForceLayout } from "../apps/web/lib/graph/force-simulation";
import {
  DEMO_REVOKED_TOKEN_ID,
  DEMO_WORKSPACE_ID,
  createDemoAccessEvents,
  createRealtimeGraphState,
  reduceAccessEventBatch,
  type GraphAccessEvent,
  type NodePulse,
} from "../apps/web/lib/realtime/access-events";

const PALETTE: GraphPalette = {
  danger: 0x111111,
  inferred: 0x222222,
  "node-code": 0x333333,
  "node-doc": 0x444444,
  "node-requirement": 0x555555,
  "node-test": 0x666666,
  text: 0x777777,
  verified: 0x888888,
};

const POLICY = {
  revokedTokenIds: new Set([DEMO_REVOKED_TOKEN_ID]),
  workspaceId: DEMO_WORKSPACE_ID,
};

function pulse(lastTouchedAt: number, eventCount = 1): NodePulse {
  return { eventCount, lastTouchedAt, nodeId: "n" };
}

function burst(
  count: number,
  startedAt: number,
  spacingMs: number,
): GraphAccessEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `burst-${index}`,
    occurredAt: startedAt + index * spacingMs,
    targetNodeIds: [`node-${index % 5}`],
    targetPath: `artifact-${index}.ts`,
    tokenId: "token-codex",
    tool: "search_index",
    workspaceId: DEMO_WORKSPACE_ID,
  }));
}

describe("neuron glow intensity", () => {
  const touchedAt = 10_000;

  test("runs the pulse to decay to afterglow to idle machine", () => {
    const node = pulse(touchedAt);

    expect(glowPhaseAt(node, touchedAt + 200)).toBe("pulse");
    expect(glowPhaseAt(node, touchedAt + 1_200)).toBe("decay");
    expect(glowPhaseAt(node, touchedAt + 4_000)).toBe("afterglow");
    expect(glowPhaseAt(node, touchedAt + 13_000)).toBe("idle");
    expect(glowIntensityAt(node, touchedAt + 13_000)).toBe(0);
    expect(glowIntensityAt(undefined, touchedAt)).toBe(0);
  });

  test("rises to the peak and then decays exponentially with a ~1.5s constant", () => {
    const node = pulse(touchedAt);
    const peak = glowPeak(1);

    expect(glowIntensityAt(node, touchedAt)).toBe(0);
    expect(glowIntensityAt(node, touchedAt + GLOW_RISE_MS / 2)).toBeCloseTo(
      peak / 2,
      5,
    );
    expect(glowIntensityAt(node, touchedAt + GLOW_RISE_MS)).toBeCloseTo(
      peak,
      5,
    );
    expect(
      glowIntensityAt(node, touchedAt + GLOW_RISE_MS + GLOW_DECAY_TAU_MS),
    ).toBeCloseTo(peak * Math.exp(-1), 5);
  });

  test("intensity never increases while a node is left alone", () => {
    const node = pulse(touchedAt);
    const samples = Array.from({ length: 60 }, (_, index) =>
      glowIntensityAt(node, touchedAt + GLOW_RISE_MS + index * 150),
    );

    expect(
      samples.every(
        (value, index) =>
          index === 0 || value <= (samples[index - 1] as number),
      ),
    ).toBe(true);
  });

  test("afterglow holds a residual tint instead of dropping to nothing", () => {
    const node = pulse(touchedAt);
    const late = glowIntensityAt(node, touchedAt + 9_000);

    expect(glowPhaseAt(node, touchedAt + 9_000)).toBe("afterglow");
    expect(late).toBeCloseTo(GLOW_AFTERGLOW_FLOOR * glowPeak(1), 5);
    expect(glowAfterglowNodes({ n: node }, touchedAt + 9_000)).toEqual(
      new Set(["n"]),
    );
    expect(glowAfterglowNodes({ n: node }, touchedAt + 200).size).toBe(0);
  });

  test("repeated reads burn brighter but saturate at one", () => {
    expect(glowPeak(8)).toBeGreaterThan(glowPeak(1));
    expect(glowPeak(10_000)).toBeLessThanOrEqual(1);
    expect(
      glowIntensityAt(pulse(touchedAt, 8), touchedAt + GLOW_RISE_MS),
    ).toBeGreaterThan(
      glowIntensityAt(pulse(touchedAt, 1), touchedAt + GLOW_RISE_MS),
    );
  });

  test("only non-idle nodes are handed to the renderer", () => {
    const intensities = glowIntensities(
      {
        cold: {
          eventCount: 4,
          lastTouchedAt: touchedAt - 30_000,
          nodeId: "cold",
        },
        hot: { ...pulse(touchedAt), nodeId: "hot" },
      },
      touchedAt + 300,
    );

    expect([...intensities.keys()]).toEqual(["hot"]);
  });
});

describe("event coalescing", () => {
  test("a 50 events/s burst produces one batch per 100ms window", () => {
    const coalescer = createGlowCoalescer();
    const events = burst(50, 0, 20);
    const batches: GraphAccessEvent[][] = [];
    let cursor = 0;

    // Drain first, then enqueue — the order a rAF loop uses.
    for (let now = 0; now <= 1_000; now += 10) {
      const batch = coalescer.drain(now);
      if (batch) batches.push(batch);
      while (
        cursor < events.length &&
        (events[cursor] as GraphAccessEvent).occurredAt <= now
      ) {
        coalescer.push(events[cursor] as GraphAccessEvent, now);
        cursor += 1;
      }
    }

    expect(GLOW_COALESCE_WINDOW_MS).toBe(100);
    expect(batches).toHaveLength(10);
    expect(batches.every((batch) => batch.length === 5)).toBe(true);
    expect(batches.flat()).toHaveLength(50);
    expect(coalescer.windows()).toBe(10);
  });

  test("an open window is not drained early and an empty one produces nothing", () => {
    const coalescer = createGlowCoalescer();

    expect(coalescer.drain(500)).toBeNull();
    coalescer.push(burst(1, 0, 0)[0] as GraphAccessEvent, 0);
    expect(coalescer.drain(99)).toBeNull();
    expect(coalescer.pending()).toBe(1);
    expect(coalescer.drain(100)).toHaveLength(1);
    expect(coalescer.pending()).toBe(0);
    expect(coalescer.drain(200)).toBeNull();
  });

  test("a coalesced batch is one reducer call, and the reducer never relayouts", () => {
    const state = reduceAccessEventBatch(
      createRealtimeGraphState(DEMO_WORKSPACE_ID),
      burst(50, 1_000, 20),
      POLICY,
    );

    expect(state.renderBatches).toBe(1);
    expect(state.layoutRevision).toBe(0);
  });
});

describe("glow honours tenancy through the realtime reducer", () => {
  test("cross-workspace and revoked-token reads never light a node", () => {
    const now = 5_000;
    const state = reduceAccessEventBatch(
      createRealtimeGraphState(DEMO_WORKSPACE_ID),
      createDemoAccessEvents(now),
      POLICY,
    );
    const lit = glowFromRealtime(state, now + 200);

    expect(lit.get("req-auth")).toBeGreaterThan(0);
    // "code-pack" is only touched by the other workspace, "test-pack" only by
    // the revoked token — both must stay dark.
    expect(lit.has("code-pack")).toBe(false);
    expect(lit.has("test-pack")).toBe(false);
  });
});

describe("drift overlays", () => {
  const data = createFixtureGraph(15);
  const positions = runForceLayout(data, undefined, 40, 2);

  test("rings and dashes are derived from findings and broken evidence", () => {
    const overlay = driftOverlay(data);

    expect(overlay.ringedNodeIds).toContain("req-ci");
    expect(overlay.ringedNodeIds).not.toContain("req-auth");
    expect(overlay.brokenEdgeIds.length).toBeGreaterThan(0);
  });

  test("the frame draws rings, dashes and glow in one pass", () => {
    const now = 3_000;
    const state = reduceAccessEventBatch(
      createRealtimeGraphState(DEMO_WORKSPACE_ID),
      createDemoAccessEvents(now),
      POLICY,
    );
    const frame = buildRenderFrame({
      afterglow: glowAfterglowNodes(state.pulses, now + 300),
      data,
      glow: glowFromRealtime(state, now + 300),
      palette: PALETTE,
      positions,
    });
    const overlay = driftOverlay(data);

    expect(frame.driftColor).toBe(PALETTE.danger);
    expect(
      frame.nodes
        .filter((node) => node.ring)
        .map((node) => node.id)
        .sort(),
    ).toEqual([...overlay.ringedNodeIds].sort());
    expect(
      frame.edges
        .filter((edge) => edge.dashed)
        .every((edge) => edge.color === PALETTE.danger),
    ).toBe(true);
    expect(
      frame.nodes.find((node) => node.id === "req-auth")?.glow,
    ).toBeGreaterThan(0);
  });

  test("edges propagate the intensity of whichever endpoint is hotter", () => {
    const frame = buildRenderFrame({
      data,
      glow: new Map([["req-auth", 0.8]]),
      palette: PALETTE,
      positions,
    });
    const expected = new Set(
      data.edges
        .filter(
          (edge) => edge.source === "req-auth" || edge.target === "req-auth",
        )
        .map((edge) => edge.id),
    );
    const touched = frame.edges.filter((edge) => edge.flow > 0);

    expect(expected.size).toBeGreaterThan(0);
    expect(new Set(touched.map((edge) => edge.id))).toEqual(expected);
    expect(touched.every((edge) => edge.flow === 0.8)).toBe(true);
  });

  test("afterglow marks only the nodes past their decay", () => {
    const frame = buildRenderFrame({
      afterglow: new Set(["req-auth"]),
      data,
      palette: PALETTE,
      positions,
    });

    expect(frame.nodes.find((node) => node.id === "req-auth")?.afterglow).toBe(
      true,
    );
    expect(frame.nodes.find((node) => node.id === "code-auth")?.afterglow).toBe(
      false,
    );
  });
});

describe("glow reaches the engine without touching the layout", () => {
  function harness() {
    const backend: GraphBackend & { frames: number } = {
      frames: 0,
      destroy() {},
      render() {
        backend.frames += 1;
      },
      resize() {},
      setPalette() {},
    };
    const posted: unknown[] = [];
    const worker: SimulationWorkerLike = {
      postMessage: (message) => posted.push(message),
      setMessageHandler: () => undefined,
      terminate: () => undefined,
    };
    return { backend, posted, worker };
  }

  test("a scripted burst updates intensities in place and never restarts the layout", async () => {
    resetEngineCounters();
    const { backend, posted, worker } = harness();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data: createFixtureGraph(15),
      palette: PALETTE,
    });
    const startMessages = posted.length;

    let state = createRealtimeGraphState(DEMO_WORKSPACE_ID);
    const events = burst(50, 0, 20);
    const coalescer = createGlowCoalescer();
    let cursor = 0;
    let applied = 0;
    for (let now = 0; now <= 1_000; now += 10) {
      const batch = coalescer.drain(now);
      if (batch) {
        state = reduceAccessEventBatch(state, batch, POLICY);
        engine.setGlow(
          glowFromRealtime(state, now),
          glowAfterglowNodes(state.pulses, now),
        );
        engine.paint();
        applied += 1;
      }
      while (
        cursor < events.length &&
        (events[cursor] as GraphAccessEvent).occurredAt <= now
      ) {
        coalescer.push(events[cursor] as GraphAccessEvent, now);
        cursor += 1;
      }
    }

    expect(applied).toBe(10);
    expect(state.renderBatches).toBe(10);
    expect(state.layoutRevision).toBe(0);
    expect(engine.layoutRestarts()).toBe(1);
    expect(posted).toHaveLength(startMessages);
    expect(backend.frames).toBe(10);
    expect(engine.glow().size).toBeGreaterThan(0);
    engine.dispose();
  });

  test("replacing the graph does restart the layout, so the counter means something", async () => {
    resetEngineCounters();
    const { backend, worker } = harness();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data: createFixtureGraph(15),
      palette: PALETTE,
    });

    expect(engine.layoutRestarts()).toBe(1);
    engine.setData(createFixtureGraph(30));
    expect(engine.layoutRestarts()).toBe(2);
    engine.dispose();
  });
});
