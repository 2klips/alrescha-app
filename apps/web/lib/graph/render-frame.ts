/**
 * The render plan: a pure description of one frame (Phase 2A todo 4).
 *
 * Keeping this separate from the Pixi adapter is what makes the renderer
 * testable — every visual decision (colour, radius, alpha, dash) is asserted
 * here on plain objects, and the GPU layer only copies numbers into buffers.
 * Colours are always resolved through the Ink & Seal palette accessor; this
 * module never names a colour.
 */

import type {
  EvidenceGrade,
  GraphData,
  GraphNode,
} from "../dashboard/graph-model";
import type { DesignToken } from "../theme/tokens";
import { collapseGraph, shouldCollapse } from "./clustering";
import {
  nodePixelSize,
  resolveLod,
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
  selected: boolean;
  x: number;
  y: number;
}

export interface RenderEdge {
  alpha: number;
  color: number;
  /** Broken evidence is drawn as a red dashed line. */
  dashed: boolean;
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
  document: "node-doc",
  requirement: "node-requirement",
  test: "node-test",
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

/** Degree-proportional dot size — the Obsidian "constellation" cue. */
export function nodeRadius(degree: number, clusterCount?: number): number {
  const base = 3.2 + Math.sqrt(Math.max(0, degree)) * 1.9;
  const size = clusterCount ? base + Math.min(14, Math.sqrt(clusterCount) * 2.4) : base;
  return Math.min(26, size);
}

export function degreeMap(data: GraphData): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of data.nodes) degrees.set(node.id, 0);
  for (const edge of data.edges) {
    if (degrees.has(edge.source))
      degrees.set(edge.source, (degrees.get(edge.source) as number) + 1);
    if (degrees.has(edge.target))
      degrees.set(edge.target, (degrees.get(edge.target) as number) + 1);
  }
  return degrees;
}

export interface FrameInput {
  /** Nodes carrying the residual afterglow tint. */
  afterglow?: ReadonlySet<string>;
  /** `nodeId → community key`; required for supernode collapse. */
  assignment?: ReadonlyMap<string, string>;
  camera?: Camera;
  data: GraphData;
  /** Communities the user clicked open. */
  expanded?: ReadonlySet<string>;
  /** Node id → 0..1 glow intensity. */
  glow?: ReadonlyMap<string, number>;
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
  const lod = resolveLod(
    input.data.nodes.map((node) =>
      nodeRadius(rawDegrees.get(node.id) ?? 0, node.clusterCount),
    ),
    camera.scale,
  );

  const collapsed =
    input.assignment && shouldCollapse(input.data.nodes.length, lod)
      ? collapseGraph({
          assignment: input.assignment,
          data: input.data,
          ...(input.expanded ? { expanded: input.expanded } : {}),
          positions: input.positions,
        })
      : { data: input.data, positions: input.positions };

  const data = collapsed.data;
  const degrees = data === input.data ? rawDegrees : degreeMap(data);
  const badges = showsStatusBadges(lod);
  const placed = new Map<string, Position>();
  const candidates: LabelCandidate[] = [];

  const nodes: RenderNode[] = data.nodes.map((node) => {
    const position = collapsed.positions.get(node.id) ?? { x: node.x, y: node.y };
    placed.set(node.id, position);
    const degree = degrees.get(node.id) ?? 0;
    const radius = nodeRadius(degree, node.clusterCount);
    candidates.push({
      degree,
      id: node.id,
      label: node.label,
      pixelSize: nodePixelSize(radius, camera.scale),
      screenX: viewport.width / 2 + camera.x + position.x * camera.scale,
      screenY: viewport.height / 2 + camera.y + position.y * camera.scale,
    });
    return {
      afterglow: input.afterglow?.has(node.id) ?? false,
      alpha: 1,
      badge: badges ? node.grade : null,
      clusterCount: node.clusterCount ?? null,
      color: resolveColor(input.palette, nodeColorToken(node.type)),
      glow: glow?.get(node.id) ?? 0,
      id: node.id,
      radius,
      ring: node.findingCount > 0,
      selected: node.id === input.selectedNodeId,
      x: position.x,
      y: position.y,
    };
  });

  const edges: RenderEdge[] = [];
  for (const edge of data.edges) {
    const source = placed.get(edge.source);
    const target = placed.get(edge.target);
    if (!source || !target) continue;
    const touch = Math.max(
      glow?.get(edge.source) ?? 0,
      glow?.get(edge.target) ?? 0,
    );
    edges.push({
      alpha: edge.broken ? 0.85 : 0.42,
      color: resolveColor(input.palette, edgeColorToken(edge.grade)),
      dashed: edge.broken,
      flow: touch,
      id: edge.id,
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
      width: edge.broken ? 1.6 : 1,
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
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const labelAlpha = 1 - (input.textFadeThreshold ?? 0) * 0.25;
  const labels: RenderLabel[] = [];
  for (const node of nodes) {
    if (!selected.has(node.id)) continue;
    const candidate = byId.get(node.id);
    if (!candidate) continue;
    labels.push({
      alpha: labelAlpha,
      id: node.id,
      text: candidate.label,
      x: node.x + node.radius + 5,
      y: node.y,
    });
  }

  return {
    camera,
    driftColor: resolveColor(input.palette, "danger"),
    edges,
    labelColor: resolveColor(input.palette, "text"),
    labels,
    lod,
    nodes,
  };
}
