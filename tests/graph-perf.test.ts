/**
 * 500-node frame budget (Phase 2A todo 9).
 *
 * ## Methodology (this is the "documented measurement method" the plan asks for)
 *
 * A rendered frame in this app is three pieces of work:
 *
 *   1. the d3-force tick, which runs in the simulation Web Worker at ~30Hz and
 *      never blocks the compositor (`lib/graph/simulation.worker.ts`);
 *   2. `buildRenderFrame()`, the pure CPU frame plan on the main thread — this
 *      is the part that runs once per animation frame and is the only piece
 *      whose cost scales with node count on the UI thread;
 *   3. the Pixi/WebGL draw, which is GPU work and cannot be measured headlessly
 *      in vitest.
 *
 * So this suite measures (1) and (2) — the CPU budget the renderer owns — with
 * `performance.now()` around each call, over a warmed loop on the 500-node
 * fixture, and reports p50/p95/max. The camera moves and the glow map is
 * repopulated every frame so no result is memoised away and the glow/label/edge
 * paths are all exercised. Piece (3) is covered by the browser-side
 * `tests/e2e/brain-map.spec.ts`, which asserts the canvas actually renders.
 *
 * Budget: p95 of the main-thread frame plan < 16.7ms (60fps). The worker tick
 * is reported against a 33.3ms budget because it runs at 30Hz off-thread.
 *
 * Numbers are printed to stdout so a run can be pasted into the evidence file:
 *   npx vitest run tests/graph-perf.test.ts --reporter=verbose
 */

import { describe, expect, test } from "vitest";

import {
  createFixtureGraph,
  type GraphData,
} from "../apps/web/lib/dashboard/graph-model";
import { communityAssignment } from "../apps/web/lib/graph/clustering";
import {
  createForceLayout,
  runForceLayout,
} from "../apps/web/lib/graph/force-simulation";
import {
  buildRenderFrame,
  type GraphPalette,
} from "../apps/web/lib/graph/render-frame";
import type { Position } from "../apps/web/lib/graph/simulation-protocol";

/** 60fps. */
const FRAME_BUDGET_MS = 16.7;
/** The worker streams positions at ~30Hz. */
const TICK_BUDGET_MS = 33.3;

const NODE_COUNT = 500;
const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 240;

/** Opaque colours; the perf path never cares which token they came from. */
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

interface Percentiles {
  max: number;
  mean: number;
  p50: number;
  p95: number;
  samples: number;
}

function percentiles(samples: readonly number[]): Percentiles {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number) =>
    sorted[
      Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))
    ] as number;
  return {
    max: sorted[sorted.length - 1] as number,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    samples: sorted.length,
  };
}

function report(label: string, budget: number, stats: Percentiles): void {
  const fixed = (value: number) => value.toFixed(3).padStart(8);
  console.log(
    `[perf] ${label.padEnd(28)} n=${String(stats.samples).padStart(4)}` +
      ` p50=${fixed(stats.p50)}ms p95=${fixed(stats.p95)}ms` +
      ` max=${fixed(stats.max)}ms mean=${fixed(stats.mean)}ms` +
      ` budget=${budget}ms`,
  );
}

function linkPairs(data: GraphData): [number, number][] {
  const indexById = new Map(data.nodes.map((node, index) => [node.id, index]));
  const links: [number, number][] = [];
  for (const edge of data.edges) {
    const source = indexById.get(edge.source);
    const target = indexById.get(edge.target);
    if (source === undefined || target === undefined || source === target)
      continue;
    links.push([source, target]);
  }
  return links;
}

describe(`${NODE_COUNT}-node frame budget`, () => {
  const data = createFixtureGraph(NODE_COUNT);
  const positions = runForceLayout(data, undefined, 120, 7);

  test("the fixture is the size the budget claims", () => {
    expect(data.nodes).toHaveLength(NODE_COUNT);
    expect(data.edges.length).toBeGreaterThan(400);
    expect(positions.size).toBe(NODE_COUNT);
  });

  test("main-thread frame plan stays inside the 60fps budget at p95", () => {
    const glow = new Map<string, number>();
    const afterglow = new Set<string>();
    const ids = data.nodes.map((node) => node.id);

    const frame = (index: number) => {
      // Repopulate the glow map every frame: a realtime burst lights a moving
      // slice of the graph, and the glow lookup is per node and per edge.
      glow.clear();
      afterglow.clear();
      for (let offset = 0; offset < 40; offset += 1) {
        const id = ids[(index * 7 + offset * 13) % ids.length] as string;
        glow.set(id, 0.2 + ((offset * 17) % 80) / 100);
        if (offset % 3 === 0) afterglow.add(id);
      }
      return buildRenderFrame({
        afterglow,
        // A camera that pans and zooms across the three LOD bands, so the label
        // grid, badge pass and edge pass are all exercised over the run.
        camera: {
          scale: 0.35 + ((index % 60) / 60) * 1.9,
          x: Math.sin(index / 9) * 220,
          y: Math.cos(index / 11) * 180,
        },
        data,
        glow,
        palette: PALETTE,
        positions,
        selectedNodeId: ids[index % ids.length] as string,
        textFadeThreshold: 0.5,
        viewport: { height: 900, width: 1600 },
      });
    };

    for (let index = 0; index < WARMUP_FRAMES; index += 1) frame(index);

    const samples: number[] = [];
    for (let index = 0; index < MEASURED_FRAMES; index += 1) {
      const start = performance.now();
      const built = frame(WARMUP_FRAMES + index);
      samples.push(performance.now() - start);
      expect(built.nodes).toHaveLength(NODE_COUNT);
    }

    const stats = percentiles(samples);
    report("buildRenderFrame(500)", FRAME_BUDGET_MS, stats);
    expect(stats.p95).toBeLessThan(FRAME_BUDGET_MS);
  });

  test("frame plan with community collapse also stays inside the budget", () => {
    // Far-zoom supernode collapse is the most expensive frame shape: it rebuilds
    // the collapsed graph and its degree map before the node pass.
    const assignment = communityAssignment(data);
    const expanded = new Set<string>();

    const frame = (index: number) =>
      buildRenderFrame({
        assignment,
        camera: { scale: 0.2, x: index % 40, y: index % 25 },
        data,
        expanded,
        palette: PALETTE,
        positions,
        viewport: { height: 900, width: 1600 },
      });

    for (let index = 0; index < WARMUP_FRAMES; index += 1) frame(index);

    const samples: number[] = [];
    for (let index = 0; index < MEASURED_FRAMES; index += 1) {
      const start = performance.now();
      frame(WARMUP_FRAMES + index);
      samples.push(performance.now() - start);
    }

    const stats = percentiles(samples);
    report("buildRenderFrame+collapse", FRAME_BUDGET_MS, stats);
    expect(stats.p95).toBeLessThan(FRAME_BUDGET_MS);
  });

  test("worker force tick stays inside the 30Hz streaming budget at p95", () => {
    const layout = createForceLayout({
      links: linkPairs(data),
      nodeCount: data.nodes.length,
      seed: 7,
    });

    for (let index = 0; index < 30; index += 1) layout.tick(1);

    const samples: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      const start = performance.now();
      layout.tick(1);
      // The worker encodes into a transferable buffer on every streamed frame,
      // so the encode cost belongs to the tick budget.
      layout.positions();
      samples.push(performance.now() - start);
    }
    layout.stop();

    const stats = percentiles(samples);
    report("worker tick + encode(500)", TICK_BUDGET_MS, stats);
    expect(stats.p95).toBeLessThan(TICK_BUDGET_MS);
  });

  test("frame cost scales sub-quadratically from 125 to 500 nodes", () => {
    // Guards the real regression risk: an accidental O(n²) lookup inside the
    // node or edge pass would not breach the budget today but would at 3,000.
    const measure = (count: number): number => {
      const scaled = createFixtureGraph(count);
      const layout = new Map<string, Position>(
        scaled.nodes.map((node, index) => [
          node.id,
          { x: (index % 40) * 31, y: Math.floor(index / 40) * 29 },
        ]),
      );
      const run = () =>
        buildRenderFrame({
          data: scaled,
          palette: PALETTE,
          positions: layout,
          viewport: { height: 900, width: 1600 },
        });
      for (let index = 0; index < 40; index += 1) run();
      const samples: number[] = [];
      for (let index = 0; index < 120; index += 1) {
        const start = performance.now();
        run();
        samples.push(performance.now() - start);
      }
      return percentiles(samples).p50;
    };

    const small = measure(125);
    const large = measure(NODE_COUNT);
    const ratio = large / Math.max(small, 0.0005);
    console.log(
      `[perf] scaling 125→500 nodes         p50 ${small.toFixed(3)}ms → ` +
        `${large.toFixed(3)}ms (×${ratio.toFixed(2)}, quadratic would be ×16)`,
    );
    expect(ratio).toBeLessThan(12);
  });
});
