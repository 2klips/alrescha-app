/**
 * Deterministic d3-force layout over a graphology model (Phase 2A todo 4).
 *
 * This module is environment-free: it runs inside the Web Worker in the
 * browser and inside vitest on the main thread, which is what makes the
 * "500-node fixture renders with stable positions" acceptance test possible.
 * Determinism comes from two places — seeded initial coordinates and
 * `simulation.randomSource`, which replaces d3's `Math.random` jiggle.
 */

import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import Graph from "graphology";

import type { GraphData, GraphNode } from "../dashboard/graph-model";
import {
  clampForceConfig,
  encodePositions,
  type ForceConfig,
  type LinkPair,
  type Position,
} from "./simulation-protocol";

export interface LayoutNode extends SimulationNodeDatum {
  /** Position in the original node array — the transfer buffer's ordering. */
  slot: number;
}

type LayoutLink = SimulationLinkDatum<LayoutNode>;

/** Small, fast, seedable PRNG (mulberry32) — good enough for layout jitter. */
export function createRandomSource(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Golden-angle spiral seeding: nodes start spread out and never coincide, so
 * the many-body force has no degenerate zero-distance pairs on the first tick.
 */
export function seededInitialPositions(
  count: number,
  seed: number,
): Position[] {
  const random = createRandomSource(seed);
  const positions: Position[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 12 * Math.sqrt(index + 1) + random() * 4;
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return positions;
}

/**
 * The graphology model. It is the shared source of structure for the layout,
 * the LOD label ranking (degree) and community detection — d3-force only ever
 * sees indices.
 */
export function buildGraphologyGraph(data: GraphData): Graph<GraphNode> {
  const graph = new Graph<GraphNode>({ multi: false, type: "undirected" });
  for (const node of data.nodes) {
    if (!graph.hasNode(node.id)) graph.addNode(node.id, node);
  }
  for (const edge of data.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    if (edge.source === edge.target) continue;
    if (graph.hasEdge(edge.source, edge.target)) continue;
    graph.addEdge(edge.source, edge.target);
  }
  return graph;
}

export interface ForceLayoutOptions {
  config?: Partial<ForceConfig>;
  links: readonly LinkPair[];
  nodeCount: number;
  seed?: number;
}

export interface ForceLayout {
  alpha(): number;
  config(): ForceConfig;
  /** Encoded `[x0, y0, …]` snapshot, ready to transfer. */
  positions(): Float32Array<ArrayBuffer>;
  reheat(): void;
  setConfig(partial: Partial<ForceConfig>): void;
  stop(): void;
  tick(count?: number): void;
}

/**
 * A stopped `forceSimulation` driven by explicit `tick()` calls — the worker
 * owns the clock, so a slow frame never silently changes the physics.
 */
export function createForceLayout(options: ForceLayoutOptions): ForceLayout {
  const seed = options.seed ?? 1;
  let config = clampForceConfig(options.config);

  const start = seededInitialPositions(options.nodeCount, seed);
  const nodes: LayoutNode[] = start.map((position, slot) => ({
    slot,
    x: position.x,
    y: position.y,
  }));
  const links: LayoutLink[] = options.links.map(([source, target]) => ({
    source,
    target,
  }));

  const linkForce = forceLink<LayoutNode, LayoutLink>(links)
    .id((node) => node.slot)
    .distance(config.linkDistance)
    .strength(config.linkStrength);
  const chargeForce = forceManyBody<LayoutNode>().strength(
    -config.repelStrength,
  );
  const centerForce = forceCenter<LayoutNode>(0, 0).strength(
    config.centerStrength,
  );

  const simulation: Simulation<LayoutNode, LayoutLink> = forceSimulation(nodes)
    .randomSource(createRandomSource(seed ^ 0x9e3779b9))
    .force("link", linkForce)
    .force("charge", chargeForce)
    .force("center", centerForce)
    .stop();

  return {
    alpha: () => simulation.alpha(),
    config: () => ({ ...config }),
    positions() {
      return encodePositions(
        nodes.map((node) => ({ x: node.x ?? 0, y: node.y ?? 0 })),
      );
    },
    reheat() {
      simulation.alpha(Math.max(simulation.alpha(), 0.3));
    },
    setConfig(partial) {
      config = clampForceConfig({ ...config, ...partial });
      linkForce.distance(config.linkDistance).strength(config.linkStrength);
      chargeForce.strength(-config.repelStrength);
      centerForce.strength(config.centerStrength);
      simulation.alpha(Math.max(simulation.alpha(), 0.3));
    },
    stop() {
      simulation.stop();
    },
    tick(count = 1) {
      simulation.tick(count);
    },
  };
}

/** One-shot layout, used by tests and by any server-side snapshot. */
export function runForceLayout(
  data: GraphData,
  config?: Partial<ForceConfig>,
  ticks = 120,
  seed = 1,
): Map<string, Position> {
  const nodeIds = data.nodes.map((node) => node.id);
  const indexById = new Map(nodeIds.map((id, index) => [id, index]));
  const links: LinkPair[] = [];
  for (const edge of data.edges) {
    const source = indexById.get(edge.source);
    const target = indexById.get(edge.target);
    if (source === undefined || target === undefined || source === target)
      continue;
    links.push([source, target]);
  }
  const layout = createForceLayout({
    ...(config ? { config } : {}),
    links,
    nodeCount: nodeIds.length,
    seed,
  });
  layout.tick(ticks);
  layout.stop();
  const buffer = layout.positions();
  const positions = new Map<string, Position>();
  for (let index = 0; index < nodeIds.length; index += 1) {
    positions.set(nodeIds[index] as string, {
      x: buffer[index * 2] as number,
      y: buffer[index * 2 + 1] as number,
    });
  }
  return positions;
}
