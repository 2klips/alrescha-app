import { describe, expect, test, vi } from "vitest";

import {
  buildDashboardViewModel,
  createFixtureGraph,
  type GraphData,
} from "../apps/web/lib/dashboard/graph-model";
import {
  collapseGraph,
  communityAssignment,
  isSupernodeId,
} from "../apps/web/lib/graph/clustering";
import {
  createGraphEngine,
  readEngineCounters,
  recordContextLoss,
  resetEngineCounters,
  type GraphBackend,
  type GraphEngine,
  type SimulationWorkerLike,
} from "../apps/web/lib/graph/engine";
import {
  buildGraphologyGraph,
  createForceLayout,
  runForceLayout,
  seededInitialPositions,
} from "../apps/web/lib/graph/force-simulation";
import { createPositionBuffer } from "../apps/web/lib/graph/position-buffer";
import {
  buildRenderFrame,
  degreeMap,
  edgeColorToken,
  nodeColorToken,
  nodeRadius,
  resolveColor,
  type GraphPalette,
} from "../apps/web/lib/graph/render-frame";
import {
  DEFAULT_FORCE_CONFIG,
  clampForceConfig,
  createStartMessage,
  decodePositions,
  encodePositions,
  parseHostMessage,
  parseWorkerMessage,
} from "../apps/web/lib/graph/simulation-protocol";
import {
  SIMULATION_ALPHA_MIN,
  createSimulationRuntime,
} from "../apps/web/lib/graph/worker-runtime";

/** A palette with a distinct colour per token so mix-ups are visible. */
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

function fixture(nodeCount: number): GraphData {
  return createFixtureGraph(nodeCount);
}

describe("simulation wire protocol", () => {
  test("clamps force parameters to the published slider range", () => {
    expect(
      clampForceConfig({ linkDistance: 10_000, repelStrength: -50 }),
    ).toEqual({
      ...DEFAULT_FORCE_CONFIG,
      linkDistance: 400,
      repelStrength: 0,
    });
  });

  test("ignores non-numeric force parameters instead of poisoning the layout", () => {
    const config = clampForceConfig({
      centerStrength: Number.NaN,
      linkStrength: "0.9" as unknown as number,
    });

    expect(config).toEqual(DEFAULT_FORCE_CONFIG);
  });

  test("round-trips positions through the transfer buffer", () => {
    const buffer = encodePositions([
      { x: 1.5, y: -2.5 },
      { x: 30, y: 40 },
    ]);

    expect(buffer).toHaveLength(4);
    expect([...decodePositions(["a", "b"], buffer).entries()]).toEqual([
      ["a", { x: 1.5, y: -2.5 }],
      ["b", { x: 30, y: 40 }],
    ]);
  });

  test("decodes only as many nodes as the buffer actually carries", () => {
    const stale = encodePositions([{ x: 1, y: 2 }]);

    expect([...decodePositions(["a", "b"], stale).keys()]).toEqual(["a"]);
  });

  test("rejects malformed host messages rather than crashing the worker", () => {
    expect(parseHostMessage(null)).toBeNull();
    expect(parseHostMessage({ type: "nope" })).toBeNull();
    expect(
      parseHostMessage({ links: [], nodeIds: [1], type: "start" }),
    ).toBeNull();
    expect(
      parseHostMessage({ links: [[0, 9]], nodeIds: ["a"], type: "start" }),
    ).toBeNull();
    expect(parseHostMessage({ type: "stop" })).toEqual({ type: "stop" });
  });

  test("rejects worker messages that are not a real position frame", () => {
    expect(
      parseWorkerMessage({ positions: [1, 2], revision: 0, type: "positions" }),
    ).toBeNull();
    expect(
      parseWorkerMessage({
        alpha: 0.5,
        positions: new Float32Array(2),
        revision: 3,
        type: "positions",
      })?.type,
    ).toBe("positions");
  });

  test("start message indexes links and drops dangling or self edges", () => {
    const data: GraphData = {
      edges: [
        {
          ...fixture(15).edges[0]!,
          id: "e-dangling",
          source: "req-auth",
          target: "ghost",
        },
        {
          ...fixture(15).edges[0]!,
          id: "e-self",
          source: "req-auth",
          target: "req-auth",
        },
        {
          ...fixture(15).edges[0]!,
          id: "e-real",
          source: "req-auth",
          target: "code-auth",
        },
      ],
      nodes: fixture(15).nodes,
    };
    const message = createStartMessage(data);

    expect(message.links).toEqual([
      [
        data.nodes.findIndex((node) => node.id === "req-auth"),
        data.nodes.findIndex((node) => node.id === "code-auth"),
      ],
    ]);
    expect(message.config).toEqual(DEFAULT_FORCE_CONFIG);
  });
});

describe("worker runtime", () => {
  function runtimeHarness() {
    const posted: unknown[] = [];
    const transfers: (readonly Transferable[] | undefined)[] = [];
    const runtime = createSimulationRuntime({
      post: (message, transfer) => {
        posted.push(message);
        transfers.push(transfer);
      },
      ticksPerFrame: 4,
    });
    return { posted, runtime, transfers };
  }

  test("answers start with ready and then streams transferable frames", () => {
    const { posted, runtime, transfers } = runtimeHarness();
    runtime.handle(createStartMessage(fixture(15)));

    expect(posted[0]).toEqual({ nodeCount: 15, type: "ready" });
    expect(runtime.step()).toBe(true);
    const frame = posted[1] as { positions: Float32Array; type: string };
    expect(frame.type).toBe("positions");
    expect(frame.positions).toHaveLength(30);
    expect(transfers[1]).toEqual([frame.positions.buffer]);
  });

  test("stops streaming once alpha settles and announces it exactly once", () => {
    const { posted, runtime } = runtimeHarness();
    runtime.handle(createStartMessage(fixture(15)));

    for (let step = 0; step < 400 && runtime.running(); step += 1)
      runtime.step();

    const settled = posted.filter(
      (message) => (message as { type: string }).type === "settled",
    );
    expect(settled).toHaveLength(1);
    expect(runtime.running()).toBe(false);
    expect(runtime.step()).toBe(false);
  });

  test("a config message reheats the simulation and changes the geometry", () => {
    const { posted, runtime } = runtimeHarness();
    runtime.handle(createStartMessage(fixture(15)));
    for (let step = 0; step < 200 && runtime.running(); step += 1)
      runtime.step();
    const settledFrame = posted.at(-2) as { positions: Float32Array };
    const before = Float32Array.from(settledFrame.positions);

    runtime.handle({
      config: { linkDistance: 400, repelStrength: 1_500 },
      type: "config",
    });
    expect(runtime.running()).toBe(true);
    for (let step = 0; step < 50; step += 1) runtime.step();
    const after = (posted.at(-1) as { positions: Float32Array }).positions;

    expect([...after]).not.toEqual([...before]);
  });

  test("stop releases the layout and ignores later steps", () => {
    const { runtime } = runtimeHarness();
    runtime.handle(createStartMessage(fixture(15)));
    runtime.handle({ type: "stop" });

    expect(runtime.running()).toBe(false);
    expect(runtime.step()).toBe(false);
  });

  test("emitted alpha falls monotonically towards the stop threshold", () => {
    const { posted, runtime } = runtimeHarness();
    runtime.handle(createStartMessage(fixture(15)));
    for (let step = 0; step < 400 && runtime.running(); step += 1)
      runtime.step();
    const alphas = posted
      .filter((message) => (message as { type: string }).type === "positions")
      .map((message) => (message as { alpha: number }).alpha);

    expect(alphas.at(-1)).toBeLessThan(SIMULATION_ALPHA_MIN);
    expect(
      alphas.every(
        (alpha, index) => index === 0 || alpha < (alphas[index - 1] as number),
      ),
    ).toBe(true);
  });
});

describe("deterministic force layout", () => {
  test("seeded start positions never coincide", () => {
    const positions = seededInitialPositions(500, 7);
    const keys = new Set(
      positions.map((position) => `${position.x},${position.y}`),
    );

    expect(keys.size).toBe(500);
  });

  test("a 500-node fixture lays out identically on every run", () => {
    const data = fixture(500);
    const first = runForceLayout(data, undefined, 90, 42);
    const second = runForceLayout(data, undefined, 90, 42);

    expect(first.size).toBe(500);
    expect([...second.entries()]).toEqual([...first.entries()]);
    expect(
      [...first.values()].every(
        (position) =>
          Number.isFinite(position.x) && Number.isFinite(position.y),
      ),
    ).toBe(true);
  });

  test("the layout spreads nodes instead of piling them on the origin", () => {
    const positions = [
      ...runForceLayout(fixture(120), undefined, 120, 3).values(),
    ];
    const spread = Math.max(
      ...positions.map((position) => Math.hypot(position.x, position.y)),
    );

    expect(spread).toBeGreaterThan(100);
  });

  test("a longer link distance pushes connected nodes further apart", () => {
    const data = fixture(60);
    const near = runForceLayout(data, { linkDistance: 30 }, 200, 5);
    const far = runForceLayout(data, { linkDistance: 320 }, 200, 5);
    const meanEdgeLength = (
      positions: Map<string, { x: number; y: number }>,
    ) => {
      const lengths = data.edges.flatMap((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        return source && target
          ? [Math.hypot(source.x - target.x, source.y - target.y)]
          : [];
      });
      return lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
    };

    expect(meanEdgeLength(far)).toBeGreaterThan(meanEdgeLength(near) * 1.5);
  });

  test("setConfig on a live layout reheats it", () => {
    const layout = createForceLayout({
      links: [[0, 1]],
      nodeCount: 2,
      seed: 1,
    });
    layout.tick(400);
    expect(layout.alpha()).toBeLessThan(0.01);

    layout.setConfig({ linkDistance: 200 });
    expect(layout.alpha()).toBeGreaterThanOrEqual(0.3);
    expect(layout.config().linkDistance).toBe(200);
  });

  test("the graphology model mirrors the fixture structure", () => {
    const data = fixture(15);
    const graph = buildGraphologyGraph(data);

    expect(graph.order).toBe(15);
    expect(graph.size).toBeLessThanOrEqual(data.edges.length);
    expect(graph.degree("req-auth")).toBeGreaterThan(0);
  });
});

describe("position interpolation", () => {
  test("blends between the last two frames and clamps at the newest", () => {
    const buffer = createPositionBuffer(100);
    buffer.push(["a"], encodePositions([{ x: 0, y: 0 }]), 0);
    buffer.push(["a"], encodePositions([{ x: 100, y: 200 }]), 100);

    expect(buffer.at(150)?.get("a")).toEqual({ x: 50, y: 100 });
    expect(buffer.at(300)?.get("a")).toEqual({ x: 100, y: 200 });
    expect(buffer.frames()).toBe(2);
  });

  test("a first frame is shown as-is and reset clears the history", () => {
    const buffer = createPositionBuffer(100);
    buffer.push(["a"], encodePositions([{ x: 9, y: 9 }]), 0);

    expect(buffer.at(50).get("a")).toEqual({ x: 9, y: 9 });
    buffer.reset();
    expect(buffer.frames()).toBe(0);
    expect(buffer.at(50).size).toBe(0);
  });
});

describe("render frame", () => {
  const data = fixture(15);

  test("nodes take their colour from the semantic node-type tokens", () => {
    const frame = buildRenderFrame({
      data,
      palette: PALETTE,
      positions: new Map(),
    });
    const requirement = frame.nodes.find((node) => node.id === "req-auth");
    const code = frame.nodes.find((node) => node.id === "code-auth");

    expect(nodeColorToken("requirement")).toBe("node-requirement");
    expect(requirement?.color).toBe(PALETTE["node-requirement"]);
    expect(code?.color).toBe(PALETTE["node-code"]);
  });

  test("broken evidence is dashed and tinted with the danger token", () => {
    const frame = buildRenderFrame({
      data,
      palette: PALETTE,
      positions: new Map(),
    });
    const broken = frame.edges.filter((edge) => edge.dashed);

    expect(edgeColorToken("broken")).toBe("danger");
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.every((edge) => edge.color === PALETTE.danger)).toBe(true);
    expect(
      frame.edges
        .filter((edge) => !edge.dashed)
        .every((edge) => edge.color !== PALETTE.danger),
    ).toBe(true);
  });

  test("nodes with open findings carry the drift ring", () => {
    const frame = buildRenderFrame({
      data,
      palette: PALETTE,
      positions: new Map(),
    });
    const ringed = frame.nodes
      .filter((node) => node.ring)
      .map((node) => node.id);

    expect(ringed).toContain("req-ci");
    expect(frame.driftColor).toBe(PALETTE.danger);
  });

  test("radius grows with degree and cluster size", () => {
    const degrees = degreeMap(data);

    expect(degrees.get("req-auth")).toBeGreaterThan(0);
    expect(nodeRadius(8)).toBeGreaterThan(nodeRadius(1));
    expect(nodeRadius(1, 200)).toBeGreaterThan(nodeRadius(1));
    expect(nodeRadius(10_000)).toBeLessThanOrEqual(26);
  });

  test("simulated positions win over the fixture's baked coordinates", () => {
    const frame = buildRenderFrame({
      data,
      palette: PALETTE,
      positions: new Map([["req-auth", { x: -400, y: 250 }]]),
    });

    expect(frame.nodes.find((node) => node.id === "req-auth")).toMatchObject({
      x: -400,
      y: 250,
    });
  });

  test("a missing token falls back instead of inventing a colour", () => {
    expect(resolveColor({}, "verified")).toBe(0);
    expect(resolveColor({ text: 0x424242 }, "verified")).toBe(0x424242);
  });
});

describe("engine lifecycle", () => {
  interface Harness {
    backend: GraphBackend & { destroyed: number; frames: number };
    posted: unknown[];
    terminated: () => number;
    worker: SimulationWorkerLike;
    emit: (message: unknown) => void;
  }

  function harness(): Harness {
    const posted: unknown[] = [];
    let terminated = 0;
    let handler: ((data: unknown) => void) | null = null;
    const backend = {
      destroyed: 0,
      frames: 0,
      destroy() {
        backend.destroyed += 1;
      },
      render() {
        backend.frames += 1;
      },
      resize() {},
      setPalette() {},
    };
    return {
      backend,
      emit: (message) => handler?.(message),
      posted,
      terminated: () => terminated,
      worker: {
        postMessage: (message) => posted.push(message),
        setMessageHandler: (next) => {
          handler = next;
        },
        terminate: () => {
          terminated += 1;
        },
      },
    };
  }

  test("mount and unmount ten times leaks no worker, backend or GPU context", async () => {
    resetEngineCounters();
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const { backend, worker } = harness();
      const engine = await createGraphEngine({
        createBackend: () => backend,
        createWorker: () => worker,
        data: fixture(60),
        palette: PALETTE,
      });
      engine.paint();
      engine.dispose();
      expect(backend.destroyed).toBe(1);
    }
    const counters = readEngineCounters();

    expect(counters).toEqual({
      backendsCreated: 10,
      backendsDestroyed: 10,
      contextLosses: 0,
      workersCreated: 10,
      workersTerminated: 10,
    });
  });

  test("disposal is idempotent and silences the worker channel", async () => {
    resetEngineCounters();
    const { backend, emit, posted, terminated, worker } = harness();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data: fixture(15),
      palette: PALETTE,
    });
    emit({ nodeCount: 15, type: "ready" });
    expect(engine.ready()).toBe(true);

    engine.dispose();
    engine.dispose();
    emit({
      alpha: 0.4,
      positions: encodePositions(new Array(15).fill({ x: 1, y: 1 })),
      revision: 1,
      type: "positions",
    });
    engine.paint();

    expect(terminated()).toBe(1);
    expect(backend.destroyed).toBe(1);
    expect(engine.framesReceived()).toBe(0);
    expect(backend.frames).toBe(0);
    expect((posted.at(-1) as { type: string }).type).toBe("stop");
    expect(readEngineCounters().workersTerminated).toBe(1);
  });

  test("streamed frames reach the render plan and force changes reach the worker", async () => {
    resetEngineCounters();
    const clock = { value: 0 };
    const { backend, emit, posted, worker } = harness();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data: fixture(15),
      now: () => clock.value,
      palette: PALETTE,
    });
    const nodeIds = fixture(15).nodes.map((node) => node.id);
    emit({
      alpha: 0.9,
      positions: encodePositions(
        nodeIds.map((_, index) => ({ x: index * 10, y: 0 })),
      ),
      revision: 1,
      type: "positions",
    });

    expect(engine.framesReceived()).toBe(1);
    expect(engine.frame().nodes[2]).toMatchObject({ x: 20, y: 0 });

    engine.setForceConfig({ repelStrength: 900 });
    expect(engine.forceConfig().repelStrength).toBe(900);
    expect(posted.at(-1)).toEqual({
      config: { ...DEFAULT_FORCE_CONFIG, repelStrength: 900 },
      type: "config",
    });

    engine.setPalette({ ...PALETTE, "node-code": 0x0a0a0a });
    expect(
      engine.frame().nodes.find((node) => node.id === "code-auth")?.color,
    ).toBe(0x0a0a0a);
    engine.dispose();
  });

  test("a lost GPU context is recorded so the leak assertion can see it", () => {
    resetEngineCounters();
    recordContextLoss();

    expect(readEngineCounters().contextLosses).toBe(1);
    resetEngineCounters();
    expect(readEngineCounters().contextLosses).toBe(0);
  });

  test("the dashboard fixture feeds the engine unchanged", async () => {
    resetEngineCounters();
    const model = buildDashboardViewModel("scanned");
    const { backend, worker } = harness();
    const start = vi.fn();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => ({ ...worker, postMessage: start }),
      data: model.graph,
      palette: PALETTE,
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(
      (start.mock.calls[0]?.[0] as { nodeIds: string[] }).nodeIds,
    ).toHaveLength(model.graph.nodes.length);
    engine.dispose();
  });
});

describe("camera focus (Phase 2A todo 7)", () => {
  function harness(): {
    backend: GraphBackend;
    emit: (message: unknown) => void;
    worker: SimulationWorkerLike;
  } {
    let handler: ((data: unknown) => void) | null = null;
    return {
      backend: {
        destroy() {},
        render() {},
        resize() {},
        setPalette() {},
      },
      emit: (message) => handler?.(message),
      worker: {
        postMessage: () => {},
        setMessageHandler: (next) => {
          handler = next;
        },
        terminate: () => {},
      },
    };
  }

  async function engineOn(data: GraphData) {
    resetEngineCounters();
    const { backend, emit, worker } = harness();
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data,
      palette: PALETTE,
    });
    return { emit, engine };
  }

  test("centres the camera on a node using its fixture position before any frame", async () => {
    const data = fixture(15);
    const target = data.nodes[3] as GraphData["nodes"][number];
    const { engine } = await engineOn(data);

    expect(engine.focusNode(target.id)).toBe(true);
    expect(engine.camera()).toEqual({
      scale: 1,
      x: -target.x,
      y: -target.y,
    });
    engine.dispose();
  });

  test("follows the simulated position once the worker has sent one", async () => {
    const data = fixture(3);
    const { emit, engine } = await engineOn(data);
    emit({
      alpha: 0.1,
      positions: encodePositions([
        { x: 10, y: 20 },
        { x: -40, y: 55 },
        { x: 0, y: 0 },
      ]),
      revision: 1,
      type: "positions",
    });
    engine.setCamera({ scale: 2, x: 0, y: 0 });

    expect(engine.focusNode((data.nodes[1] as { id: string }).id)).toBe(true);
    // Scale is preserved and the offset is in screen pixels, not world units.
    expect(engine.camera()).toEqual({ scale: 2, x: 80, y: -110 });
    engine.dispose();
  });

  test("reports an unknown node instead of moving the camera somewhere invented", async () => {
    const { engine } = await engineOn(fixture(5));
    const before = engine.camera();

    expect(engine.focusNode("not-a-node")).toBe(false);
    expect(engine.camera()).toEqual(before);
    engine.dispose();
  });

  test("focusing never restarts the layout", async () => {
    const data = fixture(8);
    const { engine } = await engineOn(data);
    const restarts = engine.layoutRestarts();

    engine.focusNode((data.nodes[0] as { id: string }).id);

    expect(engine.layoutRestarts()).toBe(restarts);
    engine.dispose();
  });
});

describe("idle frame skipping (perf research MT-4)", () => {
  interface DirtyHarness {
    emit: (message: unknown) => void;
    engine: GraphEngine;
    painted: () => number;
    tick: () => number;
  }

  /**
   * An engine whose clock is parked past the interpolation window, so the
   * position buffer is done blending and hands back a stable map — the settled
   * state a user leaves the map in.
   */
  async function settled(data: GraphData): Promise<DirtyHarness> {
    resetEngineCounters();
    let handler: ((message: unknown) => void) | null = null;
    let frames = 0;
    const backend: GraphBackend = {
      destroy() {},
      render() {
        frames += 1;
      },
      resize() {},
      setPalette() {},
    };
    const worker: SimulationWorkerLike = {
      postMessage: () => {},
      setMessageHandler: (next) => {
        handler = next;
      },
      terminate: () => {},
    };
    let clock = 0;
    const engine = await createGraphEngine({
      createBackend: () => backend,
      createWorker: () => worker,
      data,
      now: () => clock,
      palette: PALETTE,
    });
    const emit = (message: unknown) => handler?.(message);
    emit({ nodeCount: data.nodes.length, type: "ready" });
    emit({
      alpha: 0.0009,
      positions: encodePositions(
        data.nodes.map((node) => ({ x: node.x, y: node.y })),
      ),
      revision: 1,
      type: "positions",
    });
    emit({ revision: 1, type: "settled" });
    clock = 10_000;
    return {
      emit,
      engine,
      painted: () => frames,
      tick: () => {
        engine.paintIfChanged();
        return frames;
      },
    };
  }

  test("a settled graph nobody is touching paints once and then stops", async () => {
    const { engine, painted, tick } = await settled(fixture(40));

    expect(tick()).toBe(1);
    for (let index = 0; index < 30; index += 1) tick();

    expect(painted()).toBe(1);
    engine.dispose();
  });

  test("every visible mutation makes the next tick paint again", async () => {
    const data = fixture(40);
    const { engine, painted, tick } = await settled(data);
    tick();
    const baseline = painted();

    const mutations: [string, () => void][] = [
      ["setCamera", () => engine.setCamera({ scale: 2, x: 10, y: 10 })],
      ["setSelectedNode", () => engine.setSelectedNode("req-auth")],
      ["setGlow", () => engine.setGlow(new Map([["req-auth", 1]]))],
      ["setDirectionalFocus", () => engine.setDirectionalFocus(true)],
      ["setTextFadeThreshold", () => engine.setTextFadeThreshold(0.9)],
      ["setViewport", () => engine.setViewport({ height: 600, width: 800 })],
      ["resize", () => engine.resize(1024, 768)],
      ["setPalette", () => engine.setPalette({ ...PALETTE, text: 0x010203 })],
      ["toggleCommunity", () => engine.toggleCommunity("modules/1")],
      [
        "focusNode",
        () => engine.focusNode((data.nodes[2] as { id: string }).id),
      ],
    ];

    for (const [name, mutate] of mutations) {
      const before = painted();
      mutate();
      expect(`${name}:${tick()}`).toBe(`${name}:${before + 1}`);
      // …and only once: a second tick with nothing new is still skipped.
      expect(`${name}:${tick()}`).toBe(`${name}:${before + 1}`);
    }

    expect(painted()).toBe(baseline + mutations.length);
    engine.dispose();
  });

  test("a fresh simulation frame repaints, and a disposed engine paints nothing", async () => {
    const data = fixture(20);
    const { emit, engine, painted, tick } = await settled(data);
    tick();
    const before = painted();

    emit({
      alpha: 0.0008,
      positions: encodePositions(
        data.nodes.map((node) => ({ x: node.x + 5, y: node.y - 5 })),
      ),
      revision: 1,
      type: "positions",
    });

    expect(tick()).toBe(before + 1);

    engine.dispose();
    expect(engine.paintIfChanged()).toBeNull();
    expect(painted()).toBe(before + 1);
  });

  test("explicit paint() still paints, dirty or not", async () => {
    const { engine, painted } = await settled(fixture(20));
    engine.paintIfChanged();
    const before = painted();

    engine.paint();
    engine.paint();

    expect(painted()).toBe(before + 2);
    engine.dispose();
  });
});

describe("frame invariant caches (perf research MT-4)", () => {
  test("degree is computed once per graph and shared", () => {
    const data = fixture(60);

    expect(degreeMap(data)).toBe(degreeMap(data));
    expect(degreeMap(fixture(60))).not.toBe(degreeMap(data));
  });

  test("a cached collapse still moves its supernodes when the members move", () => {
    const data = fixture(80);
    const assignment = communityAssignment(data, { seed: 3 });
    const near = new Map(
      data.nodes.map((node, index) => [node.id, { x: index, y: index }]),
    );
    const far = new Map(
      data.nodes.map((node, index) => [
        node.id,
        { x: index * 10, y: index * 10 },
      ]),
    );

    const first = collapseGraph({ assignment, data, positions: near });
    const second = collapseGraph({ assignment, data, positions: far });
    const again = collapseGraph({ assignment, data, positions: near });

    // Structure is identical across all three; only the centroids move.
    expect(second.data.nodes.map((node) => node.id)).toEqual(
      first.data.nodes.map((node) => node.id),
    );
    expect(second.data.edges).toEqual(first.data.edges);
    expect([...again.positions.entries()]).toEqual([
      ...first.positions.entries(),
    ]);
    // Holding two results at once must not let the later call rewrite the
    // earlier one — the centroids are per-call, only the cache is shared.
    const supernode = first.data.nodes.find((node) =>
      isSupernodeId(node.id),
    ) as GraphData["nodes"][number];
    const moved = second.data.nodes.find(
      (node) => node.id === supernode.id,
    ) as GraphData["nodes"][number];
    expect(moved.x).toBeCloseTo(supernode.x * 10, 6);
    expect(first.positions.get(supernode.id)).toEqual({
      x: supernode.x,
      y: supernode.y,
    });
  });

  test("expanding a community is a different cache key, not a stale hit", () => {
    const data = fixture(80);
    const assignment = communityAssignment(data, { seed: 3 });
    const positions = new Map(
      data.nodes.map((node, index) => [node.id, { x: index, y: index }]),
    );
    const community = [...new Set(assignment.values())][0] as string;
    const expanded = new Set<string>();

    const collapsed = collapseGraph({ assignment, data, expanded, positions });
    expanded.add(community);
    const opened = collapseGraph({ assignment, data, expanded, positions });
    expanded.delete(community);
    const closed = collapseGraph({ assignment, data, expanded, positions });

    expect(opened.data.nodes.length).toBeGreaterThan(
      collapsed.data.nodes.length,
    );
    expect(closed.data.nodes.map((node) => node.id)).toEqual(
      collapsed.data.nodes.map((node) => node.id),
    );
  });
});
