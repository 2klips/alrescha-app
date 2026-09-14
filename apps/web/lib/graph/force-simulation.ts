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
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import Graph from "graphology";

import type { GraphData, GraphNode } from "../dashboard/graph-model";
import { nodeRadius } from "./node-size";
import {
  BASELINE_LINK_FAMILY,
  LINK_FAMILY_FORCES,
  clampForceConfig,
  encodePositions,
  linkFamilyCode,
  linkFamilyOf,
  type AnchorPoint,
  type ForceConfig,
  type LinkFamily,
  type LinkPair,
  type Position,
  POSITION_STRIDE,
} from "./simulation-protocol";

/**
 * Breathing room between two touching discs, in layout units. Zero makes
 * neighbours sit rim to rim, which reads as one blob rather than two nodes.
 */
const COLLIDE_PADDING = 2;

/**
 * How hot a reheat gets. d3's own drag examples use 0.3: enough for the
 * layout to answer a change, low enough that it settles again quickly rather
 * than re-running the whole layout every time someone nudges a node.
 */
const REHEAT_ALPHA = 0.3;

/**
 * Where a warm start begins (todo 13 ⓐ). The saved positions are already
 * near equilibrium, so the layout only needs the reheat's worth of energy to
 * absorb whatever changed — starting at 1 would throw the saved layout away
 * in the first few ticks, which is the explosion the warm start exists to
 * avoid.
 */
export const WARM_START_ALPHA = REHEAT_ALPHA;

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
  /**
   * Per-slot domain anchor (todo 13 ⓓ), or absent for no anchor forces at
   * all. Pulls with `config.domainAnchorStrength`, which defaults to off.
   */
  anchors?: readonly AnchorPoint[] | undefined;
  config?: Partial<ForceConfig>;
  /**
   * A previous layout's `[x0, y0, …]` (todo 13 ⓐ). Slots holding `NaN` —
   * nodes the saved layout never saw — start on the spiral as before.
   */
  initialPositions?: Float32Array | null | undefined;
  links: readonly LinkPair[];
  nodeCount: number;
  seed?: number;
}

export interface ForceLayout {
  alpha(): number;
  config(): ForceConfig;
  /**
   * Hold a node at a point while a pointer drags it (todo 11). The rest of
   * the graph keeps simulating around it, which is the whole point: dragging
   * a hub should pull its neighbourhood after it.
   */
  pin(slot: number, x: number, y: number): void;
  /** Let go. The node rejoins the physics from wherever it was left. */
  unpin(slot: number): void;
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
  const saved = options.initialPositions ?? null;
  let warmed = 0;
  const nodes: LayoutNode[] = start.map((position, slot) => {
    const x = saved?.[slot * POSITION_STRIDE];
    const y = saved?.[slot * POSITION_STRIDE + 1];
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      warmed += 1;
      return { slot, x, y };
    }
    return { slot, x: position.x, y: position.y };
  });
  const links: LayoutLink[] = options.links.map(([source, target]) => ({
    source,
    target,
  }));

  /**
   * Family by node pair. d3 rewrites a link's endpoints into node objects
   * when it initialises the force, and it hands the *link object* to the
   * strength and distance accessors — not its index — so the family has to
   * be recoverable from the endpoints rather than from position in an array.
   */
  const pairKey = (link: LayoutLink): number => {
    const source = slotOf(link.source);
    const target = slotOf(link.target);
    const low = source < target ? source : target;
    const high = source < target ? target : source;
    return low * (options.nodeCount + 1) + high;
  };
  const familyByPair = new Map<number, number>();
  for (const [source, target, family] of options.links) {
    const low = source < target ? source : target;
    const high = source < target ? target : source;
    familyByPair.set(low * (options.nodeCount + 1) + high, family);
  }

  const slotOf = (endpoint: LayoutLink["source"]): number => {
    // d3 replaces the numeric endpoints with node objects on initialisation,
    // so this reads slots both before and after that swap.
    if (typeof endpoint === "number") return endpoint;
    if (typeof endpoint === "string") return Number.parseInt(endpoint, 10);
    return endpoint.slot;
  };
  const degree = new Map<number, number>();
  for (const link of links) {
    const source = slotOf(link.source);
    const target = slotOf(link.target);
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  }
  /**
   * A family's share of the baseline (Phase 4 Wave B todo 11). The table is
   * absolute at the default slider positions and `structure` is what those
   * defaults are, so expressing every family as a ratio keeps the sliders
   * meaning what they say: moving one scales the whole spread rather than
   * flattening it.
   */
  const baseline = LINK_FAMILY_FORCES[BASELINE_LINK_FAMILY];
  const familyOfLink = (link: LayoutLink): LinkFamily =>
    linkFamilyOf(familyByPair.get(pairKey(link)) ?? 0);

  /**
   * Degree-normalised link strength — d3's own default shape, restored.
   *
   * A flat strength pulls every spring equally hard, so a node with 40 links
   * is dragged 40 times harder than a leaf and the neighbourhood collapses
   * into the hairball the galaxy work is trying to undo (R5 §2.2 D3).
   * Dividing by the sparser endpoint's degree makes a hub's individual pull
   * proportionally gentle while a leaf's stays exactly as strong as before:
   * at degree 1 this is `config.linkStrength` times the family share, which
   * for `structure` is what the existing default was tuned against.
   */
  const linkStrengthOf = (link: LayoutLink): number => {
    const sparsest = Math.min(
      degree.get(slotOf(link.source)) ?? 1,
      degree.get(slotOf(link.target)) ?? 1,
    );
    const share =
      LINK_FAMILY_FORCES[familyOfLink(link)].strength / baseline.strength;
    return (config.linkStrength * share) / Math.max(1, sparsest);
  };
  const linkDistanceOf = (link: LayoutLink): number =>
    config.linkDistance *
    (LINK_FAMILY_FORCES[familyOfLink(link)].distance / baseline.distance);

  const linkForce = forceLink<LayoutNode, LayoutLink>(links)
    .id((node) => node.slot)
    .distance(linkDistanceOf)
    .strength(linkStrengthOf);
  const chargeForce = forceManyBody<LayoutNode>().strength(
    -config.repelStrength,
  );
  const centerForce = forceCenter<LayoutNode>(0, 0).strength(
    config.centerStrength,
  );
  /**
   * Nodes stop overlapping (todo 11). The radius is the renderer's own, from
   * the shared `node-size` curve, plus a hair of breathing room — a collision
   * force whose idea of a node's size differs from the paint's separates
   * nodes to a distance the paint then covers up.
   *
   * Two iterations, as the plan asks: one pass resolves a pair, and a hub
   * with forty neighbours is not a pair.
   */
  const collideForce = forceCollide<LayoutNode>(
    (node) => nodeRadius(degree.get(node.slot) ?? 0) + COLLIDE_PADDING,
  ).iterations(2);

  const simulation: Simulation<LayoutNode, LayoutLink> = forceSimulation(nodes)
    .randomSource(createRandomSource(seed ^ 0x9e3779b9))
    .force("link", linkForce)
    .force("charge", chargeForce)
    .force("center", centerForce)
    .force("collide", collideForce)
    .stop();

  /**
   * Domain anchors (todo 13 ⓓ): a weak `forceX`/`forceY` toward each
   * node's band. Registered only while the strength is above zero — at zero
   * the force would be arithmetic no-ops, and keeping the force list
   * identical when the slider is off is what keeps every existing layout
   * byte-identical.
   */
  const anchors = options.anchors ?? null;
  const anchorX = forceX<LayoutNode>((node) => anchors?.[node.slot]?.[0] ?? 0);
  const anchorY = forceY<LayoutNode>((node) => anchors?.[node.slot]?.[1] ?? 0);
  const applyAnchors = () => {
    const strength = anchors ? config.domainAnchorStrength : 0;
    if (strength > 0) {
      const perNode = (node: LayoutNode) =>
        anchors?.[node.slot] ? strength : 0;
      anchorX.strength(perNode);
      anchorY.strength(perNode);
      simulation.force("anchorX", anchorX).force("anchorY", anchorY);
    } else {
      simulation.force("anchorX", null).force("anchorY", null);
    }
  };
  applyAnchors();

  // A warm start (todo 13 ⓐ) begins at the reheat temperature: the saved
  // positions only need to absorb what changed since they were saved.
  if (warmed > 0) simulation.alpha(WARM_START_ALPHA);

  return {
    alpha: () => simulation.alpha(),
    config: () => ({ ...config }),
    positions() {
      return encodePositions(
        nodes.map((node) => ({ x: node.x ?? 0, y: node.y ?? 0 })),
      );
    },
    pin(slot, x, y) {
      const node = nodes[slot];
      if (!node) return;
      node.fx = x;
      node.fy = y;
      // A pinned node that nothing is simulating around is a node stuck to
      // the cursor in a frozen picture, so a pin is also a reheat.
      simulation.alpha(Math.max(simulation.alpha(), REHEAT_ALPHA));
    },
    reheat() {
      simulation.alpha(Math.max(simulation.alpha(), REHEAT_ALPHA));
    },
    setConfig(partial) {
      config = clampForceConfig({ ...config, ...partial });
      linkForce.distance(linkDistanceOf).strength(linkStrengthOf);
      chargeForce.strength(-config.repelStrength);
      centerForce.strength(config.centerStrength);
      applyAnchors();
      simulation.alpha(Math.max(simulation.alpha(), REHEAT_ALPHA));
    },
    stop() {
      simulation.stop();
    },
    unpin(slot) {
      const node = nodes[slot];
      if (!node) return;
      delete node.fx;
      delete node.fy;
      simulation.alpha(Math.max(simulation.alpha(), REHEAT_ALPHA));
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
    links.push([source, target, linkFamilyCode(edge.family)]);
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
