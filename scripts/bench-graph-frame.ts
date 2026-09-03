/**
 * Brain-map frame-cost bench (perf research MT-4).
 *
 * `tests/graph-perf.test.ts` guards the 500-node frame budget as a pass/fail
 * gate. This script is the other half: it reports the *numbers* at the sizes
 * where the mid-term work actually bites, so a before/after can be pasted into
 * `.omo/evidence/perf/`.
 *
 * Four cases:
 *
 *   1. `frame-500`        — the size task-9 recorded, kept so the two evidence
 *                           files stay comparable.
 *   2. `frame-3500-near`  — above `RAW_RENDER_NODE_LIMIT` but zoomed in, so
 *                           collapse stays off. This is the per-frame degree
 *                           map / radii / median cost on its own.
 *   3. `frame-3500-far`   — the same graph at far zoom, where `collapseGraph`
 *                           runs. Rebuilding the collapsed graph every frame is
 *                           the most expensive frame shape in the app.
 *   4. `idle-settled`     — the render *loop*, not the frame plan: how many
 *                           frames get painted over 120 animation ticks once
 *                           the simulation has settled and no input arrives.
 *                           Reported for both loop strategies, so the honest
 *                           baseline is reproducible from any commit:
 *                             · `always` — build + paint every tick, which is
 *                               what `brain-map.tsx` did before MT-4;
 *                             · `dirty`  — `paintIfChanged()`, which skips a
 *                               tick when no state and no simulation frame
 *                               moved. Reports `always` twice when run against
 *                               a build that predates `paintIfChanged`.
 *
 * Cases 1–3 pan and zoom the camera and rewrite the glow map every frame, the
 * same way the perf test does, so nothing is memoised away that a real frame
 * would have to recompute.
 *
 * Usage:
 *   node --import tsx scripts/bench-graph-frame.ts [--frames 240] [--json out.json]
 *
 * Deterministic: fixed fixture, fixed layout seed, fixed camera path. Timing is
 * wall clock, so absolute numbers are host-specific — always quote the host.
 */

import { writeFileSync } from "node:fs";
import os from "node:os";

import {
  createFixtureGraph,
  type GraphData,
} from "../apps/web/lib/dashboard/graph-model";
import { communityAssignment } from "../apps/web/lib/graph/clustering";
import {
  createGraphEngine,
  type GraphBackend,
  type GraphEngine,
  type SimulationWorkerLike,
} from "../apps/web/lib/graph/engine";
import { runForceLayout } from "../apps/web/lib/graph/force-simulation";
import {
  buildRenderFrame,
  type GraphPalette,
  type RenderFrame,
} from "../apps/web/lib/graph/render-frame";
import {
  encodePositions,
  type Position,
} from "../apps/web/lib/graph/simulation-protocol";

/** Opaque colours; the frame plan never cares which token they came from. */
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

const VIEWPORT = { height: 900, width: 1600 } as const;
const WARMUP_FRAMES = 60;
const IDLE_TICKS = 120;
/** Above `RAW_RENDER_NODE_LIMIT` (3,000), so far zoom engages collapse. */
const LARGE_NODES = 3_500;

interface Percentiles {
  max: number;
  mean: number;
  p50: number;
  p95: number;
  samples: number;
  totalMs: number;
}

function percentiles(samples: readonly number[]): Percentiles {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number) =>
    sorted[
      Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))
    ] as number;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    max: sorted[sorted.length - 1] as number,
    mean: total / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    samples: sorted.length,
    totalMs: total,
  };
}

function measure(run: (index: number) => void, frames: number): Percentiles {
  for (let index = 0; index < WARMUP_FRAMES; index += 1) run(index);
  const samples: number[] = [];
  for (let index = 0; index < frames; index += 1) {
    const start = performance.now();
    run(WARMUP_FRAMES + index);
    samples.push(performance.now() - start);
  }
  return percentiles(samples);
}

function report(label: string, stats: Percentiles): void {
  const fixed = (value: number) => value.toFixed(3).padStart(9);
  console.log(
    `[frame] ${label.padEnd(22)} n=${String(stats.samples).padStart(4)}` +
      ` p50=${fixed(stats.p50)}ms p95=${fixed(stats.p95)}ms` +
      ` max=${fixed(stats.max)}ms mean=${fixed(stats.mean)}ms`,
  );
}

/**
 * One frame of the perf test's workload: a camera that pans and zooms across
 * all three LOD bands and a glow map that is rewritten every frame.
 */
function frameRunner(input: {
  assignment?: ReadonlyMap<string, string>;
  data: GraphData;
  positions: ReadonlyMap<string, Position>;
  scale: (index: number) => number;
}): (index: number) => RenderFrame {
  const glow = new Map<string, number>();
  const afterglow = new Set<string>();
  const ids = input.data.nodes.map((node) => node.id);
  const expanded = new Set<string>();

  return (index) => {
    glow.clear();
    afterglow.clear();
    for (let offset = 0; offset < 40; offset += 1) {
      const id = ids[(index * 7 + offset * 13) % ids.length] as string;
      glow.set(id, 0.2 + ((offset * 17) % 80) / 100);
      if (offset % 3 === 0) afterglow.add(id);
    }
    return buildRenderFrame({
      afterglow,
      ...(input.assignment ? { assignment: input.assignment, expanded } : {}),
      camera: {
        scale: input.scale(index),
        x: Math.sin(index / 9) * 220,
        y: Math.cos(index / 11) * 180,
      },
      data: input.data,
      glow,
      palette: PALETTE,
      positions: input.positions,
      selectedNodeId: ids[index % ids.length] as string,
      textFadeThreshold: 0.5,
      viewport: VIEWPORT,
    });
  };
}

/** A backend that counts paints and does nothing else. */
function countingBackend(): GraphBackend & { frames: number } {
  const backend = {
    frames: 0,
    destroy() {},
    render() {
      backend.frames += 1;
    },
    resize() {},
    setPalette() {},
  };
  return backend;
}

/** A worker stub the bench drives by hand — no thread, no timers. */
function scriptedWorker(): {
  emit: (message: unknown) => void;
  worker: SimulationWorkerLike;
} {
  let handler: ((data: unknown) => void) | null = null;
  return {
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

/**
 * `paintIfChanged` only exists from MT-4 onwards. Reading it off the engine
 * lets one script measure both the old always-paint loop and the new one, so
 * the baseline stays reproducible from any commit.
 */
type MaybeDirtyEngine = GraphEngine & {
  paintIfChanged?: () => RenderFrame | null;
};

/**
 * The settled-idle case: simulation done, no input, 120 animation ticks.
 * Returns painted frames and total main-thread time for each loop strategy.
 */
async function idleSettled(
  data: GraphData,
  positions: ReadonlyMap<string, Position>,
  strategy: "always" | "dirty",
): Promise<{ ms: number; painted: number; supported: boolean }> {
  const backend = countingBackend();
  const { emit, worker } = scriptedWorker();
  // The engine reads `now()` for position interpolation; a clock parked past
  // the 33ms frame window means the buffer is done blending and hands back a
  // stable map — which is exactly the settled state being measured.
  let clock = 0;
  const engine = (await createGraphEngine({
    createBackend: () => backend,
    createWorker: () => worker,
    data,
    now: () => clock,
    palette: PALETTE,
    viewport: VIEWPORT,
  })) as MaybeDirtyEngine;

  emit({ nodeCount: data.nodes.length, type: "ready" });
  const ordered = data.nodes.map(
    (node) => positions.get(node.id) ?? { x: node.x, y: node.y },
  );
  emit({
    alpha: 0.0009,
    positions: encodePositions(ordered),
    revision: 1,
    type: "positions",
  });
  emit({ revision: 1, type: "settled" });
  clock = 1_000; // past the interpolation window: the buffer has settled

  const dirty = strategy === "dirty" ? engine.paintIfChanged : undefined;
  const tick =
    dirty === undefined
      ? () => {
          engine.paint(engine.frame());
        }
      : () => {
          dirty.call(engine);
        };

  for (let index = 0; index < 10; index += 1) tick();
  const before = backend.frames;
  const start = performance.now();
  for (let index = 0; index < IDLE_TICKS; index += 1) tick();
  const ms = performance.now() - start;
  engine.dispose();
  return {
    ms,
    painted: backend.frames - before,
    supported: strategy === "always" || dirty !== undefined,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const frames = Number(flag("frames") ?? 240);
  if (!Number.isSafeInteger(frames) || frames < 1) {
    throw new Error("--frames must be a positive integer");
  }

  const cpu = os.cpus()[0]?.model ?? "unknown";
  console.log(
    `[host] ${cpu.trim()} · ${os.cpus().length} threads · node ${process.version}` +
      ` · ${os.platform()} ${os.release()}`,
  );
  console.log(`[bench] frames=${frames} warmup=${WARMUP_FRAMES}`);

  const small = createFixtureGraph(500);
  const smallPositions = runForceLayout(small, undefined, 120, 7);
  const large = createFixtureGraph(LARGE_NODES);
  const largePositions = runForceLayout(large, undefined, 60, 7);
  const largeAssignment = communityAssignment(large, { seed: 1 });

  const results: Record<string, unknown> = {};

  const case1 = measure(
    frameRunner({
      data: small,
      positions: smallPositions,
      scale: (index) => 0.35 + ((index % 60) / 60) * 1.9,
    }),
    frames,
  );
  report("frame-500", case1);
  results["frame-500"] = case1;

  const case2 = measure(
    frameRunner({
      data: large,
      positions: largePositions,
      // Held in the Near band: above the raw limit, but collapse needs Far.
      scale: () => 2.4,
    }),
    frames,
  );
  report("frame-3500-near", case2);
  results["frame-3500-near"] = case2;

  const case3 = measure(
    frameRunner({
      assignment: largeAssignment,
      data: large,
      positions: largePositions,
      scale: () => 0.2,
    }),
    frames,
  );
  report("frame-3500-far", case3);
  results["frame-3500-far"] = case3;

  for (const strategy of ["always", "dirty"] as const) {
    const idle = await idleSettled(large, largePositions, strategy);
    const label = idle.supported ? strategy : `${strategy} (unsupported)`;
    console.log(
      `[idle]  ${label.padEnd(22)} ticks=${IDLE_TICKS}` +
        ` painted=${String(idle.painted).padStart(4)}` +
        ` total=${idle.ms.toFixed(3).padStart(9)}ms`,
    );
    results[`idle-${strategy}`] = idle;
  }

  const out = flag("json");
  if (out) {
    writeFileSync(
      out,
      `${JSON.stringify(
        {
          frames,
          host: {
            cpu: cpu.trim(),
            node: process.version,
            platform: `${os.platform()} ${os.release()}`,
            threads: os.cpus().length,
          },
          largeNodes: LARGE_NODES,
          results,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`[bench] wrote ${out}`);
  }
}

await main();
