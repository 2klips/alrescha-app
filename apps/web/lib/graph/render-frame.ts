/**
 * The render plan: a pure description of one frame (Phase 2A todo 4).
 *
 * Keeping this separate from the Pixi adapter is what makes the renderer
 * testable — every visual decision (colour, radius, alpha, dash) is asserted
 * here on plain objects, and the GPU layer only copies numbers into buffers.
 * Colours are always resolved through the Ink & Seal palette accessor; this
 * module never names a colour.
 */

import { personalizedPageRank } from "@alrescha/core";

import {
  NODE_SHAPE,
  type EvidenceGrade,
  type GraphData,
  type GraphEdge,
  type GraphEdgeFamily,
  type GraphNode,
  type GraphNodeShape,
} from "../dashboard/graph-model";
import type { DesignToken } from "../theme/tokens";
import { collapseGraph, shouldCollapse } from "./clustering";
import { nodeRadius } from "./node-size";
import {
  labelFade,
  labelSizeFloor,
  lodForPixelSize,
  nodePixelSize,
  selectLabels,
  showsStatusBadges,
  type LabelCandidate,
  type LodLevel,
} from "./lod";
import type { Position } from "./simulation-protocol";

/** `readRendererPalette()` output: token → `0xRRGGBB`. */
export type GraphPalette = Partial<Record<DesignToken, number>>;

export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export const DEFAULT_CAMERA: Camera = { scale: 1, x: 0, y: 0 };

export interface Viewport {
  height: number;
  width: number;
}

export const DEFAULT_VIEWPORT: Viewport = { height: 800, width: 1200 };

/**
 * Risk bands that earn a ring (Phase 4 Wave B todo 12).
 *
 * Three, not four: `low` draws nothing. A ring on every node is not a
 * warning, it is a texture — and todo 21's own rule is that a file with no
 * risk factor is absent from the map rather than present with a zero.
 */
export const RISK_RING_BANDS = ["moderate", "elevated", "high"] as const;

export type RiskRingBand = (typeof RISK_RING_BANDS)[number];

export function riskRingBand(risk?: string | null): RiskRingBand | null {
  return RISK_RING_BANDS.includes(risk as RiskRingBand)
    ? (risk as RiskRingBand)
    : null;
}

export interface RenderNode {
  /** Residual tint on a recently-touched node. */
  afterglow: boolean;
  alpha: number;
  /** Evidence grade shown as a badge — Near zoom only. */
  badge: EvidenceGrade | null;
  /** Number of collapsed members, or null for a raw node. */
  clusterCount: number | null;
  color: number;
  /** 0..1 neuron-glow intensity (todo 6 drives it; 0 keeps the node calm). */
  glow: number;
  id: string;
  radius: number;
  /** Open-findings drift ring. */
  ring: boolean;
  /**
   * The risk band this file is in, or null for "no factors, or nobody
   * measured". Distinct from `ring`, which counts open findings: risk is the
   * ranked judgement todo 21 builds, and a file can carry one without the
   * other.
   */
  riskBand: RiskRingBand | null;
  selected: boolean;
  /** Which of the four sprites paints it (`NODE_SHAPE`). */
  shape: GraphNodeShape;
  x: number;
  y: number;
}

/**
 * Families the Far view stops drawing (Phase 4 Wave B todo 12).
 *
 * At Far the graph is a constellation, and the only wires worth pixels are
 * the ones that shape it. Containment, co-change and meaning-links are all
 * real edges; drawn together at that zoom they are a grey wash over the
 * structure they were supposed to sit behind.
 */
const FAR_HIDDEN_FAMILIES: ReadonlySet<string> = new Set([
  "hierarchy",
  "semantic",
  "statistical",
]);

/**
 * The same policy for the two relations whose family does not isolate them.
 * `co_changed` derives to `structure` in the database's own mapping, so
 * hiding it by family would take imports with it.
 */
const FAR_HIDDEN_RELATIONS: ReadonlySet<string> = new Set([
  "co_changed",
  "contains",
]);

/**
 * The layers a viewer can switch off (Phase 4 Wave B todo 13).
 *
 * Not a filter. A filter answers "show me the nodes matching this", and what
 * it hides is a consequence; a layer answers "I am not looking at
 * containment right now", and it is about a whole *kind* of thing. They are
 * separate controls because they are separate questions, and a viewer who
 * turns off co-change should not have their search box cleared.
 *
 * These are the kinds that mostly add texture: containment and co-change are
 * edges, concepts, sections and prose are nodes.
 *
 * The plan names seven. Five are here, and the two that are not — `style`
 * and `config` — are absent for a stated reason: the scanner classifies them,
 * but a stylesheet and a `tsconfig.json` both arrive at the map as `code`
 * nodes, so there is nothing on a `GraphNode` to switch off. Offering the
 * toggle anyway would give a viewer a control that silently does nothing.
 */
export const GRAPH_LAYERS = [
  "co_changed",
  "concept",
  "contains",
  "doc",
  "section",
] as const;

export type GraphLayer = (typeof GRAPH_LAYERS)[number];

/**
 * Node types the given layers switch off. Exported because the DOM hit layer
 * has to hide the same nodes the canvas does — a keyboard user tabbing to a
 * node nobody can see is worse than one who cannot reach it at all.
 */
export function hiddenNodeTypesFor(
  layers: ReadonlySet<GraphLayer> | undefined,
): ReadonlySet<string> {
  return new Set(
    [...(layers ?? [])].flatMap((layer) =>
      LAYER_NODE_TYPES[layer] ? [LAYER_NODE_TYPES[layer] as string] : [],
    ),
  );
}

/** Edge relations a layer switches off. */
const LAYER_RELATIONS: Readonly<Partial<Record<GraphLayer, string>>> = {
  co_changed: "co_changed",
  contains: "contains",
};

/** Node types a layer switches off. */
const LAYER_NODE_TYPES: Readonly<Partial<Record<GraphLayer, string>>> = {
  concept: "concept",
  doc: "document",
  section: "section",
};

/** How faintly a layout-only edge is drawn where it is drawn at all. */
const LAYOUT_ONLY_ALPHA = 0.08;

/**
 * How much a merged edge thickens per decade of merged edges (todo 13). At
 * 1.0 a pair with a thousand real edges is four times the width of a pair
 * with one, which is legible without turning a hub into a slab.
 */
const MERGED_EDGE_WIDTH_SCALE = 1;

export interface RenderEdge {
  alpha: number;
  color: number;
  /** Broken evidence is drawn as a red dashed line. */
  dashed: boolean;
  /** Which family this edge belongs to — the renderer batches by it. */
  family: GraphEdgeFamily;
  /** 0..1 additive propagation along a freshly touched edge. */
  flow: number;
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  width: number;
}

export interface RenderLabel {
  alpha: number;
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface RenderFrame {
  camera: Camera;
  /**
   * Changes whenever the graph itself does, and *not* when only the camera
   * moves (Phase 4 Wave B todo 12). The renderer keeps its world geometry
   * across frames and rebuilds it only when this differs, so panning a
   * settled graph costs a container transform and nothing else.
   */
  geometryRevision: number;
  /** Ring/dash colour for drift overlays — resolved once per frame. */
  driftColor: number;
  edges: RenderEdge[];
  labelColor: number;
  labels: RenderLabel[];
  lod: LodLevel;
  nodes: RenderNode[];
}

/**
 * Resolve a token to a renderer colour. A palette read before the stylesheet
 * applied can be missing entries; falling back through `text` keeps a node
 * visible instead of painting an invented colour.
 */
export function resolveColor(
  palette: GraphPalette,
  token: DesignToken,
  fallback: DesignToken = "text",
): number {
  return palette[token] ?? palette[fallback] ?? 0;
}

const NODE_TOKEN_BY_TYPE = {
  code: "node-code",
  concept: "node-concept",
  document: "node-doc",
  // Both new types borrow an existing token until Wave B assigns sprites
  // (BUILD_PLAN_PHASE4 todo 12): a rationale paints as the code it annotates,
  // and an unresolved node paints as a line rather than claiming a kind.
  database: "node-database",
  directory: "node-directory",
  // A named decision paints as the prose it lives in until Wave B todo 12
  // gives the four shapes their own sprites.
  section: "node-doc",
  rationale: "node-code",
  route: "node-route",
  requirement: "node-requirement",
  test: "node-test",
  unknown: "border-muted",
} as const satisfies Record<GraphNode["type"], DesignToken>;

const EDGE_TOKEN_BY_GRADE = {
  broken: "danger",
  inferred: "inferred",
  verified: "verified",
} as const satisfies Record<EvidenceGrade, DesignToken>;

export function nodeColorToken(type: GraphNode["type"]): DesignToken {
  return NODE_TOKEN_BY_TYPE[type];
}

export function edgeColorToken(grade: EvidenceGrade): DesignToken {
  return EDGE_TOKEN_BY_GRADE[grade];
}

export interface EdgeStroke {
  alpha: number;
  /** `null` = paint the evidence-grade colour, as before. */
  colorToken: DesignToken | null;
  dashed: boolean;
  width: number;
}

/**
 * Confidence-tier stroke grammar (Phase 3 Wave A todo 2): how a link was
 * derived is line *style*; what it proves stays line *colour* (grade). Broken
 * evidence keeps its red dash whatever the tier — drift outranks derivation.
 * Edges without a tier (the demo fixtures) keep the legacy stroke.
 */
export function edgeStroke(
  edge: Pick<GraphEdge, "broken" | "tier">,
): EdgeStroke {
  if (edge.broken) {
    return { alpha: 0.85, colorToken: null, dashed: true, width: 1.6 };
  }
  switch (edge.tier) {
    // Structural facts paint the neutral line colour, not an evidence colour:
    // an import proves wiring, not a claim (Wave B keeps the vocabularies apart).
    case "resolved":
      return {
        alpha: 0.55,
        colorToken: "line-strong",
        dashed: false,
        width: 1.25,
      };
    case "reference":
      return {
        alpha: 0.35,
        colorToken: "line-strong",
        dashed: false,
        width: 0.7,
      };
    case "inferred":
      return { alpha: 0.42, colorToken: null, dashed: true, width: 1 };
    case "agent_asserted":
      return { alpha: 0.6, colorToken: "accent", dashed: true, width: 1.2 };
    default:
      return { alpha: 0.42, colorToken: null, dashed: false, width: 1 };
  }
}

/**
 * Node importance (Wave C todo 7): PageRank over the whole graph replaces raw
 * degree as the size signal — a hub that many paths flow *through* now reads
 * bigger than a leaf with many shallow links. Scores are scaled onto the old
 * degree scale so `nodeRadius` keeps its calibrated shape, and cached per
 * GraphData because frames redraw far more often than graphs change.
 */
const importanceCache = new WeakMap<GraphData, Map<string, number>>();

/**
 * The last collapse, and the four things it was computed from (Phase 4 Wave B
 * todo 12).
 *
 * Collapsing is the most expensive thing a frame does, and the browser
 * benchmark caught it: at 5,000 nodes a zoom dropped 33 frames of 187 while a
 * pan across the same graph dropped none. The difference is the scale — a
 * zoom crosses the Far threshold and rebuilt the supernode graph on every
 * frame of the glide.
 *
 * None of its four inputs depends on the camera, so the answer is the same on
 * every one of those frames. One entry is enough: a frame loop asks about the
 * same graph over and over, and a second slot would only serve a caller
 * alternating between two graphs.
 */
let collapseMemo: {
  assignment: ReadonlyMap<string, string>;
  data: GraphData;
  expanded: ReadonlySet<string> | undefined;
  positions: ReadonlyMap<string, Position>;
  result: { data: GraphData; positions: ReadonlyMap<string, Position> };
  templates: ReadonlyMap<string, GraphNode> | undefined;
} | null = null;

function collapseFor(
  assignment: ReadonlyMap<string, string>,
  data: GraphData,
  expanded: ReadonlySet<string> | undefined,
  positions: ReadonlyMap<string, Position>,
  templates: ReadonlyMap<string, GraphNode> | undefined,
): { data: GraphData; positions: ReadonlyMap<string, Position> } {
  if (
    collapseMemo &&
    collapseMemo.assignment === assignment &&
    collapseMemo.data === data &&
    collapseMemo.expanded === expanded &&
    collapseMemo.positions === positions &&
    collapseMemo.templates === templates
  ) {
    return collapseMemo.result;
  }
  const result = collapseGraph({
    assignment,
    data,
    ...(expanded ? { expanded } : {}),
    positions,
    ...(templates ? { templates } : {}),
  });
  collapseMemo = { assignment, data, expanded, positions, result, templates };
  return result;
}

export function importanceMap(data: GraphData): Map<string, number> {
  const cached = importanceCache.get(data);
  if (cached) return cached;
  const scores = personalizedPageRank({
    edges: data.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
    nodes: data.nodes.map((node) => node.id),
  });
  const scaled = new Map<string, number>();
  const count = data.nodes.length;
  for (const [id, score] of scores) {
    // Uniform PageRank averages 1/n; ×n×3 lands the mean near the old mean
    // degree of a sparse repo graph, keeping radii in the calibrated band.
    scaled.set(id, score * count * 3);
  }
  importanceCache.set(data, scaled);
  return scaled;
}

/**
 * Node id → edge count, cached per `GraphData` (perf research MT-4).
 *
 * Degree is a property of the graph, not of the instant: it cannot change
 * without the data object changing. Recomputing it every animation frame cost
 * O(nodes + edges) for an answer that was already known — the same reasoning
 * that already applied to `importanceMap` above, applied to its other half.
 *
 * The returned map is shared with every other caller holding the same
 * `GraphData`, hence `ReadonlyMap`: treat it as the graph's own data.
 */
const degreeCache = new WeakMap<GraphData, ReadonlyMap<string, number>>();

export function degreeMap(data: GraphData): ReadonlyMap<string, number> {
  const cached = degreeCache.get(data);
  if (cached) return cached;
  const degrees = new Map<string, number>();
  for (const node of data.nodes) degrees.set(node.id, 0);
  for (const edge of data.edges) {
    if (degrees.has(edge.source))
      degrees.set(edge.source, (degrees.get(edge.source) as number) + 1);
    if (degrees.has(edge.target))
      degrees.set(edge.target, (degrees.get(edge.target) as number) + 1);
  }
  degreeCache.set(data, degrees);
  return degrees;
}

/**
 * The median node radius, which is what `resolveLod` actually needs — also a
 * property of the graph alone (degree and `clusterCount`), so the O(n) radius
 * pass and its O(n log n) sort run once per graph instead of once per frame.
 */
const medianRadiusCache = new WeakMap<GraphData, number>();

function medianNodeRadius(
  data: GraphData,
  degrees: ReadonlyMap<string, number>,
): number {
  const cached = medianRadiusCache.get(data);
  if (cached !== undefined) return cached;
  const radii = data.nodes
    .map((node) => nodeRadius(degrees.get(node.id) ?? 0, node.clusterCount))
    .sort((left, right) => left - right);
  const middle = Math.floor(radii.length / 2);
  const value =
    radii.length === 0
      ? 0
      : radii.length % 2 === 1
        ? (radii[middle] as number)
        : ((radii[middle - 1] as number) + (radii[middle] as number)) / 2;
  medianRadiusCache.set(data, value);
  return value;
}

const EMPTY_NEIGHBORHOOD: ReadonlySet<string> = new Set();

/**
 * A node and everything one edge away. Empty for no node, so a caller can
 * ask unconditionally; a lone node yields just itself, which is how the two
 * callers below tell "nothing to relate this to" from a real neighbourhood.
 */
export function neighborhoodOf(
  data: { readonly edges: readonly { source: string; target: string }[] },
  nodeId: string | null,
): ReadonlySet<string> {
  if (!nodeId) return EMPTY_NEIGHBORHOOD;
  const near = new Set<string>([nodeId]);
  for (const edge of data.edges) {
    if (edge.source === nodeId) near.add(edge.target);
    if (edge.target === nodeId) near.add(edge.source);
  }
  return near;
}

export interface FrameInput {
  /** Nodes carrying the residual afterglow tint. */
  afterglow?: ReadonlySet<string>;
  /** `nodeId → community key`; required for supernode collapse. */
  assignment?: ReadonlyMap<string, string>;
  camera?: Camera;
  data: GraphData;
  /**
   * Graft-style focus mode (Phase 3 Wave A todo 2): with a node selected, its
   * outgoing edges paint `focus-out`, incoming ones `focus-in`, and everything
   * unconnected fades. Off by default — the demo dashboard keeps its look.
   */
  directionalFocus?: boolean;
  /** Communities the user clicked open. */
  expanded?: ReadonlySet<string>;
  /** Bumped by the engine on every change a camera move is not. */
  geometryRevision?: number;
  /**
   * Which nodes to draw, or absent for all of them (Phase 4 Wave B todo 13).
   *
   * Filtering used to build a *new* `GraphData` and hand it to the engine,
   * which restarted the simulation: every keystroke in the search box threw
   * the layout away and re-ran it from the seeded spiral, so the graph
   * exploded and re-formed while someone was typing a filename.
   *
   * A visibility set is the same answer without that. The layout is a
   * property of the repository, not of what a viewer is currently looking
   * at, so nodes stay exactly where they are and filtering reads as things
   * fading out.
   */
  visible?: ReadonlySet<string> | undefined;
  /**
   * Layers the viewer has switched off (todo 13). Separate from `visible`
   * because they are separate questions: a filter says what to look for, a
   * layer says what kind of thing not to look at.
   */
  hiddenLayers?: ReadonlySet<GraphLayer> | undefined;
  /** Node id → 0..1 glow intensity. */
  glow?: ReadonlyMap<string, number>;
  /** Community key → the node that is that community (todo 13). */
  templates?: ReadonlyMap<string, GraphNode> | undefined;
  /**
   * The node under the pointer, from the canvas hit test (todo 10). Its
   * neighbourhood stays lit and the rest of the graph fades.
   */
  hoveredNodeId?: string | null;
  palette: GraphPalette;
  positions: ReadonlyMap<string, Position>;
  selectedNodeId?: string | null;
  /** 0…1 label fade slider. */
  textFadeThreshold?: number;
  viewport?: Viewport;
}

/**
 * Build one frame:
 *   positions → LOD level → (optional) community collapse → nodes/edges →
 *   grid label selection.
 *
 * Nodes without a simulated position fall back to the layout baked into the
 * fixture, so the first frame is never a pile at the origin. Collapse happens
 * here, at frame time, from centroids — the simulation keeps running on the
 * raw graph, which is what "visual aggregation, no re-layout" means.
 */
export function buildRenderFrame(input: FrameInput): RenderFrame {
  const camera = input.camera ?? DEFAULT_CAMERA;
  const viewport = input.viewport ?? DEFAULT_VIEWPORT;
  const glow = input.glow;

  const rawDegrees = degreeMap(input.data);
  // Same answer as `resolveLod(radii, scale)`, without rebuilding and sorting
  // the radius array every frame — see `medianNodeRadius` (MT-4).
  const lod = lodForPixelSize(
    nodePixelSize(medianNodeRadius(input.data, rawDegrees), camera.scale),
  );

  const collapsed =
    input.assignment && shouldCollapse(input.data.nodes.length, lod)
      ? collapseFor(
          input.assignment,
          input.data,
          input.expanded,
          input.positions,
          input.templates,
        )
      : { data: input.data, positions: input.positions };

  const data = collapsed.data;
  const degrees = data === input.data ? rawDegrees : degreeMap(data);
  // Sized by PageRank over the *uncollapsed* graph (stable identity → the
  // WeakMap cache holds across frames); collapsed supernodes fall back to
  // degree, where clusterCount already dominates the radius.
  const importance = importanceMap(input.data);
  const badges = showsStatusBadges(lod);
  const placed = new Map<string, Position>();
  const candidates: LabelCandidate[] = [];

  let focusedNodeId =
    input.directionalFocus && input.selectedNodeId
      ? input.selectedNodeId
      : null;
  let focusNeighborhood = neighborhoodOf(data, focusedNodeId);
  if (focusedNodeId && focusNeighborhood.size <= 1) {
    // An isolated node has no direction to show — fading the whole map to
    // highlight nothing would just make the graph vanish (common while scan
    // data has few edges), so focus only engages with at least one neighbor.
    focusedNodeId = null;
    focusNeighborhood = EMPTY_NEIGHBORHOOD;
  }

  /**
   * Hover, from the canvas hit test (todo 10). It answers a different
   * question from directional focus — "what is this joined to" rather than
   * "which way does it flow" — and it wins while the pointer is on a node,
   * because it is the more immediate signal and it leaves the moment the
   * pointer does. Applying both at once would dim the map to the
   * intersection of two answers, which is almost nothing.
   */
  let hoveredNodeId = input.hoveredNodeId ?? null;
  let hoverNeighborhood = neighborhoodOf(data, hoveredNodeId);
  if (hoveredNodeId && hoverNeighborhood.size <= 1) {
    // Nothing to relate it to: highlighting one dot by dimming the entire
    // graph says "nothing here is connected" far louder than it says "this
    // is the node".
    hoveredNodeId = null;
    hoverNeighborhood = EMPTY_NEIGHBORHOOD;
  }
  const dimmedNodeId = hoveredNodeId ?? focusedNodeId;
  const keptNear = hoveredNodeId ? hoverNeighborhood : focusNeighborhood;

  /**
   * A hidden node still has a position — it is in the layout, it is simply
   * not drawn — so `placed` is filled for every node and the visibility test
   * happens when the render list is built. An edge between two hidden nodes
   * then falls out for free, and one that reaches a hidden node is dropped
   * explicitly below: a line to nowhere is worse than no line.
   */
  const visible = input.visible;
  /** Node types the switched-off layers cover. */
  const hiddenTypes = new Set(
    [...(input.hiddenLayers ?? [])].flatMap((layer) =>
      LAYER_NODE_TYPES[layer] ? [LAYER_NODE_TYPES[layer] as string] : [],
    ),
  );
  /** Edge relations they cover. */
  const hiddenRelations = new Set(
    [...(input.hiddenLayers ?? [])].flatMap((layer) =>
      LAYER_RELATIONS[layer] ? [LAYER_RELATIONS[layer] as string] : [],
    ),
  );
  const typeById = new Map(data.nodes.map((node) => [node.id, node.type]));
  const isVisible = (nodeId: string): boolean =>
    (!visible || visible.has(nodeId)) &&
    !hiddenTypes.has(typeById.get(nodeId) ?? "");

  const nodes: RenderNode[] = data.nodes.flatMap((node) => {
    const position = collapsed.positions.get(node.id) ?? {
      x: node.x,
      y: node.y,
    };
    placed.set(node.id, position);
    // Hidden: it keeps its place in the layout and gets no label candidate
    // and no render node. A label for something nobody can see is a label
    // pointing at nothing.
    if (!isVisible(node.id)) return [];
    const degree = degrees.get(node.id) ?? 0;
    const radius = nodeRadius(
      importance.get(node.id) ?? degree,
      node.clusterCount,
    );
    candidates.push({
      degree,
      id: node.id,
      // A package is a directory node the loader marked as one; the Far
      // ranking reads it, and nothing else does.
      kind: node.role === "package" ? "package" : node.type,
      label: node.label,
      pixelSize: nodePixelSize(radius, camera.scale),
      screenX: viewport.width / 2 + camera.x + position.x * camera.scale,
      screenY: viewport.height / 2 + camera.y + position.y * camera.scale,
    });
    return [
      {
        afterglow: input.afterglow?.has(node.id) ?? false,
        alpha: dimmedNodeId && !keptNear.has(node.id) ? 0.22 : 1,
        badge: badges ? node.grade : null,
        clusterCount: node.clusterCount ?? null,
        color: resolveColor(input.palette, nodeColorToken(node.type)),
        glow: glow?.get(node.id) ?? 0,
        id: node.id,
        radius,
        ring: node.findingCount > 0,
        // Only code carries a risk ring. Todo 21 ranks files; a requirement or
        // a route has no untested-ness or fan-in of its own, and ringing one
        // would put a judgement on a node the judgement was never about.
        riskBand: node.type === "code" ? riskRingBand(node.risk) : null,
        selected: node.id === input.selectedNodeId,
        shape: NODE_SHAPE[node.type],
        x: position.x,
        y: position.y,
      },
    ];
  });

  /**
   * Section nodes, for the Far draw policy. A section is a heading other
   * documents cite; at Far its edges are a haze around a hub nobody can read
   * the name of yet.
   */
  const sectionIds = new Set(
    data.nodes.filter((node) => node.type === "section").map((node) => node.id),
  );

  const edges: RenderEdge[] = [];
  for (const edge of data.edges) {
    const source = placed.get(edge.source);
    const target = placed.get(edge.target);
    if (!source || !target) continue;
    if (!isVisible(edge.source) || !isVisible(edge.target)) continue;
    if (hiddenRelations.has(edge.provenance.relation)) continue;
    // Per-family draw policy (Phase 4 Wave B todo 12). At Far the graph is a
    // constellation and only the wires that shape it are worth pixels:
    // containment, co-change, meaning-links and section haze are all real
    // edges that, drawn together at that zoom, are a grey wash over the
    // structure they were supposed to sit behind.
    if (
      lod === "far" &&
      (FAR_HIDDEN_FAMILIES.has(edge.family ?? "structure") ||
        FAR_HIDDEN_RELATIONS.has(edge.provenance.relation) ||
        sectionIds.has(edge.source) ||
        sectionIds.has(edge.target))
    ) {
      continue;
    }
    const touch = Math.max(
      glow?.get(edge.source) ?? 0,
      glow?.get(edge.target) ?? 0,
    );
    const stroke = edgeStroke(edge);
    let alpha = stroke.alpha;
    let color = resolveColor(
      input.palette,
      stroke.colorToken ?? edgeColorToken(edge.grade),
    );
    if (focusedNodeId) {
      if (edge.source === focusedNodeId) {
        color = resolveColor(input.palette, "focus-out");
        alpha = 0.9;
      } else if (edge.target === focusedNodeId) {
        color = resolveColor(input.palette, "focus-in");
        alpha = 0.9;
      } else {
        alpha = stroke.alpha * 0.15;
      }
    }
    // Hover reads over the top: an edge that touches the hovered node is
    // lit whatever the focus mode had decided, and one that does not fades.
    // Direction is not recoloured here — hover asks what this is joined to,
    // not which way it flows.
    if (hoveredNodeId) {
      alpha =
        edge.source === hoveredNodeId || edge.target === hoveredNodeId
          ? Math.max(alpha, 0.9)
          : stroke.alpha * 0.12;
    }
    // A merged supernode edge stands for many real ones, and one line drawn
    // identically whether it is one import or four hundred says the same
    // thing about both. Logarithmic, so a folder pair with ten times the
    // traffic reads as thicker without a hub pair becoming a slab.
    const merged = edge.mergedCount ?? 1;
    const width =
      merged > 1
        ? stroke.width * (1 + Math.log10(merged) * MERGED_EDGE_WIDTH_SCALE)
        : stroke.width;
    // Containment is drawn, faintly, at the zooms where it means something.
    // It is what makes a directory read as a cluster; at full strength 885 of
    // them bury the imports they exist to make legible (OQ-037), which is why
    // the loader marks them `layoutOnly` and why that used to mean "drawn
    // exactly like everything else".
    if (edge.layoutOnly) alpha = Math.min(alpha, LAYOUT_ONLY_ALPHA);
    edges.push({
      alpha,
      color,
      dashed: stroke.dashed,
      family: edge.family ?? "structure",
      flow: touch,
      id: edge.id,
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
      width,
    });
  }

  const selected = new Set(
    selectLabels(candidates, {
      lod,
      ...(input.textFadeThreshold === undefined
        ? {}
        : { textFadeThreshold: input.textFadeThreshold }),
      viewport,
    }),
  );
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const floor = labelSizeFloor(lod, input.textFadeThreshold);
  const labels: RenderLabel[] = [];
  for (const node of nodes) {
    if (!selected.has(node.id)) continue;
    // Focus mode labels only the neighborhood — the fade already de-emphasises
    // the rest, and a bright label over a dim node would contradict it.
    if (focusedNodeId && !focusNeighborhood.has(node.id)) continue;
    const candidate = byId.get(node.id);
    if (!candidate) continue;
    labels.push({
      alpha: labelFade(candidate.pixelSize, floor),
      id: node.id,
      // Screen space, not world (Phase 4 Wave B todo 12). Labels used to live
      // inside the camera's container, so text grew with the zoom: at Near a
      // filename was the width of the screen and at Far it was a smear. A
      // label is chrome over the graph, and chrome does not scale.
      text: candidate.label,
      x: candidate.screenX + (node.radius * camera.scale + 5),
      y: candidate.screenY,
    });
  }

  return {
    camera,
    driftColor: resolveColor(input.palette, "danger"),
    geometryRevision: input.geometryRevision ?? 0,
    edges,
    labelColor: resolveColor(input.palette, "text"),
    labels,
    lod,
    nodes,
  };
}
