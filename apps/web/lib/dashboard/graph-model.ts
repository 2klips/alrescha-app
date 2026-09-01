import {
  BRAIN_AREAS,
  deriveBrainArea,
  type BrainArea,
} from "@alrescha/core/artifact-facets";
import type { ArtifactClassification } from "@alrescha/core";

import { DASHBOARD } from "../strings";

export type DashboardState =
  | "loading"
  | "empty"
  | "scanning"
  | "scanned"
  | "failed"
  | "permission-error"
  | "revoked"
  | "no-ci"
  | "large";

export type EvidenceGrade = "verified" | "inferred" | "broken";
export type GraphNodeType =
  "requirement" | "document" | "code" | "test" | "concept";

/**
 * How a link was derived (Phase 3 Wave A todo 2) — separate from the evidence
 * grade, which says what the link *proves*. `resolved` = deterministic
 * extraction with a source span, `reference` = name matching, `inferred` = AI
 * synthesis, `agent_asserted` = written by an agent over MCP. Rendered as line
 * style: solid / thin solid / dashed / dashed in the accent colour.
 */
export type EdgeConfidenceTier =
  "agent_asserted" | "inferred" | "reference" | "resolved";

export interface GraphNode {
  clusterCount?: number;
  findingCount: number;
  grade: EvidenceGrade;
  id: string;
  label: string;
  path: string;
  type: GraphNodeType;
  x: number;
  y: number;
}

export interface GraphEdgeProvenance {
  confidence: number;
  endLine: number;
  grade: EvidenceGrade;
  /**
   * The demo vocabulary (`declares`) plus the persisted `edges.relation`
   * vocabulary — `/app/map` renders stored rows verbatim (Phase 3 Wave A).
   */
  relation:
    | "calls"
    | "co_changed"
    | "configures"
    | "contradicts"
    | "declares"
    | "depends_on"
    | "implements"
    | "imports"
    | "part_of"
    | "produces"
    | "references"
    | "requires"
    | "supersedes"
    | "supports"
    | "tests"
    | "uses"
    | "validates";
  sourcePath: string;
  startLine: number;
}

export interface GraphEdge {
  broken: boolean;
  grade: EvidenceGrade;
  id: string;
  provenance: GraphEdgeProvenance;
  source: string;
  target: string;
  /** Absent on demo fixtures — the renderer then keeps the legacy stroke. */
  tier?: EdgeConfidenceTier;
}

export interface GraphData {
  edges: GraphEdge[];
  nodes: GraphNode[];
}

export interface GraphFilters {
  /** Phase 2D todo 5 — Data Brain area, the same axis the overview groups by. */
  area: BrainArea | "all";
  grade: EvidenceGrade | "all";
  query: string;
  type: GraphNodeType | "all";
}

/**
 * The graph carries display types; the facet engine reads persisted
 * classifications. This is the one place the two vocabularies meet, so the
 * map and the overview cannot drift apart (Phase 2D todo 5).
 */
const NODE_TYPE_CLASSIFICATION: Readonly<
  Record<GraphNodeType, ArtifactClassification>
> = {
  code: "code_metadata",
  concept: "spec",
  document: "spec",
  requirement: "spec",
  test: "code_metadata",
};

export function graphNodeArea(node: GraphNode): BrainArea {
  return deriveBrainArea(node.path, NODE_TYPE_CLASSIFICATION[node.type]);
}

export const DASHBOARD_STATES: readonly DashboardState[] = [
  "loading",
  "empty",
  "scanning",
  "scanned",
  "failed",
  "permission-error",
  "revoked",
  "no-ci",
  "large",
] as const;

const BASE_NODES: readonly Omit<GraphNode, "x" | "y">[] = [
  {
    id: "req-auth",
    label: "Tenant-safe auth",
    path: "spec/WORK_SPEC.md:118",
    type: "requirement",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "req-webhook",
    label: "Idempotent webhooks",
    path: "spec/WORK_SPEC.md:164",
    type: "requirement",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "req-ci",
    label: "CI-backed test proof",
    path: "spec/WORK_SPEC.md:207",
    type: "requirement",
    grade: "broken",
    findingCount: 1,
  },
  {
    id: "req-context",
    label: "Bounded context packs",
    path: "spec/WORK_SPEC.md:241",
    type: "requirement",
    grade: "inferred",
    findingCount: 1,
  },
  {
    id: "doc-guide",
    label: "Implementation guide",
    path: "spec/IMPLEMENTATION_GUIDE.md",
    type: "document",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "doc-plan",
    label: "Build plan",
    path: "spec/BUILD_PLAN.md",
    type: "document",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "doc-agents",
    label: "Agent instructions",
    path: "AGENTS.md",
    type: "document",
    grade: "inferred",
    findingCount: 1,
  },
  {
    id: "code-auth",
    label: "repository-access.ts",
    path: "apps/web/lib/auth/repository-access.ts",
    type: "code",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "code-webhook",
    label: "webhook.ts",
    path: "packages/core/src/github/webhook.ts",
    type: "code",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "code-evidence",
    label: "ci-reports.ts",
    path: "packages/core/src/evidence/ci-reports.ts",
    type: "code",
    grade: "inferred",
    findingCount: 0,
  },
  {
    id: "code-pack",
    label: "context-pack.ts",
    path: "packages/core/src/context/context-pack.ts",
    type: "code",
    grade: "broken",
    findingCount: 1,
  },
  {
    id: "test-auth",
    label: "auth-tenancy.test.ts",
    path: "tests/auth-tenancy.test.ts",
    type: "test",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "test-webhook",
    label: "github-app.test.ts",
    path: "tests/github-app.test.ts",
    type: "test",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "test-ci",
    label: "ci-evidence.test.ts",
    path: "tests/ci-evidence.test.ts",
    type: "test",
    grade: "verified",
    findingCount: 0,
  },
  {
    id: "test-pack",
    label: "context-pack.test.ts",
    path: "tests/context-pack.test.ts",
    type: "test",
    grade: "broken",
    findingCount: 1,
  },
] as const;

const BASE_EDGES: readonly Omit<GraphEdge, "id" | "provenance">[] = [
  { source: "doc-guide", target: "req-auth", grade: "verified", broken: false },
  {
    source: "doc-plan",
    target: "req-webhook",
    grade: "verified",
    broken: false,
  },
  { source: "doc-plan", target: "req-ci", grade: "verified", broken: false },
  {
    source: "doc-agents",
    target: "req-context",
    grade: "inferred",
    broken: false,
  },
  { source: "req-auth", target: "code-auth", grade: "verified", broken: false },
  {
    source: "code-auth",
    target: "test-auth",
    grade: "verified",
    broken: false,
  },
  {
    source: "req-webhook",
    target: "code-webhook",
    grade: "verified",
    broken: false,
  },
  {
    source: "code-webhook",
    target: "test-webhook",
    grade: "verified",
    broken: false,
  },
  {
    source: "req-ci",
    target: "code-evidence",
    grade: "inferred",
    broken: false,
  },
  { source: "code-evidence", target: "test-ci", grade: "broken", broken: true },
  { source: "req-context", target: "code-pack", grade: "broken", broken: true },
  { source: "code-pack", target: "test-pack", grade: "broken", broken: true },
] as const;

function edgeProvenance(
  source: GraphNode,
  target: GraphNode,
  grade: EvidenceGrade,
  index: number,
): GraphEdgeProvenance {
  const relation =
    source.type === "document"
      ? "declares"
      : target.type === "test"
        ? "tests"
        : target.type === "code"
          ? "implements"
          : "references";
  return {
    confidence: grade === "verified" ? 1 : grade === "inferred" ? 0.78 : 0.94,
    endLine: 38 + index,
    grade,
    relation,
    sourcePath: source.path.split(":")[0]!,
    startLine: 36 + index,
  };
}

function initialPosition(
  index: number,
  total: number,
): { x: number; y: number } {
  const spoke = (index * 2.399963229728653) % (Math.PI * 2);
  const radius = 95 + (index % 5) * 58 + (index / Math.max(total, 1)) * 120;
  return { x: Math.cos(spoke) * radius, y: Math.sin(spoke) * radius * 0.7 };
}

/** Deterministic, bounded force layout. Large graphs are clustered before this runs. */
export function forceDirectedLayout(
  data: GraphData,
  iterations = 48,
): GraphData {
  const nodes = data.nodes.map((node, index) => ({
    ...node,
    ...initialPosition(index, data.nodes.length),
  }));
  const byId = new Map(nodes.map((node, index) => [node.id, index]));

  for (let step = 0; step < iterations; step += 1) {
    const movement = nodes.map(() => ({ x: 0, y: 0 }));
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const dx = nodes[left]!.x - nodes[right]!.x || 0.01;
        const dy = nodes[left]!.y - nodes[right]!.y || 0.01;
        const distanceSquared = Math.max(dx * dx + dy * dy, 900);
        const force = 1_600 / distanceSquared;
        movement[left]!.x += dx * force;
        movement[left]!.y += dy * force;
        movement[right]!.x -= dx * force;
        movement[right]!.y -= dy * force;
      }
    }
    for (const edge of data.edges) {
      const sourceIndex = byId.get(edge.source);
      const targetIndex = byId.get(edge.target);
      if (sourceIndex === undefined || targetIndex === undefined) continue;
      const source = nodes[sourceIndex]!;
      const target = nodes[targetIndex]!;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      movement[sourceIndex]!.x += dx * 0.012;
      movement[sourceIndex]!.y += dy * 0.012;
      movement[targetIndex]!.x -= dx * 0.012;
      movement[targetIndex]!.y -= dy * 0.012;
    }
    for (let index = 0; index < nodes.length; index += 1) {
      nodes[index]!.x += Math.max(-8, Math.min(8, movement[index]!.x)) * 0.72;
      nodes[index]!.y += Math.max(-8, Math.min(8, movement[index]!.y)) * 0.72;
    }
  }

  const maxX = Math.max(1, ...nodes.map((node) => Math.abs(node.x)));
  const maxY = Math.max(1, ...nodes.map((node) => Math.abs(node.y)));
  const scaleX = Math.min(1, 330 / maxX);
  const scaleY = Math.min(1, 220 / maxY);
  for (const node of nodes) {
    node.x *= scaleX;
    node.y *= scaleY;
  }

  return { edges: data.edges, nodes };
}

export function createFixtureGraph(nodeCount = BASE_NODES.length): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const base = BASE_NODES[index % BASE_NODES.length]!;
    const cycle = Math.floor(index / BASE_NODES.length);
    nodes.push({
      ...base,
      findingCount: cycle === 0 ? base.findingCount : index % 17 === 0 ? 1 : 0,
      id: cycle === 0 ? base.id : `${base.id}-${cycle}`,
      label: cycle === 0 ? base.label : `${base.label} · ${cycle + 1}`,
      path: cycle === 0 ? base.path : `modules/${cycle}/${base.path}`,
      x: 0,
      y: 0,
    });
  }
  const available = new Set(nodes.map((node) => node.id));
  for (let index = 0; index < BASE_EDGES.length; index += 1) {
    const edge = BASE_EDGES[index]!;
    if (available.has(edge.source) && available.has(edge.target)) {
      const source = nodes.find((node) => node.id === edge.source)!;
      const target = nodes.find((node) => node.id === edge.target)!;
      edges.push({
        ...edge,
        id: `edge-${index}`,
        provenance: edgeProvenance(source, target, edge.grade, index),
      });
    }
  }
  for (let index = BASE_NODES.length; index < nodes.length; index += 1) {
    const previous = nodes[Math.max(0, index - 7)]!;
    const current = nodes[index]!;
    edges.push({
      broken: current.grade === "broken",
      grade: current.grade,
      id: `edge-generated-${index}`,
      provenance: edgeProvenance(previous, current, current.grade, index),
      source: previous.id,
      target: current.id,
    });
  }
  return { edges, nodes };
}

export function clusterGraph(data: GraphData, threshold = 120): GraphData {
  if (data.nodes.length <= threshold) return forceDirectedLayout(data);

  const groups = new Map<string, GraphNode[]>();
  for (const node of data.nodes) {
    const key = `${node.type}:${node.grade}`;
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }
  const nodes = [...groups.entries()].map(([key, members], index) => {
    const sample = members[0]!;
    return {
      ...sample,
      clusterCount: members.length,
      findingCount: members.reduce((sum, node) => sum + node.findingCount, 0),
      id: `cluster:${key}`,
      label: `${sample.type} · ${sample.grade}`,
      path: `${members.length} indexed artifacts`,
      ...initialPosition(index, groups.size),
    };
  });
  const edges: GraphEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const source = nodes[index - 1]!;
    const target = nodes[index]!;
    edges.push({
      broken: target.grade === "broken",
      grade: target.grade,
      id: `cluster-edge-${index}`,
      provenance: edgeProvenance(source, target, target.grade, index),
      source: source.id,
      target: target.id,
    });
  }
  return forceDirectedLayout({ edges, nodes }, 32);
}

/**
 * Group mode (Phase 2D todo 5): lay the graph out in horizontal area bands
 * instead of one force field, so "what is frontend / backend / docs / tests"
 * is readable at a glance. Deterministic — no simulation, no randomness — and
 * empty areas collapse rather than leaving a gap.
 */
export function facetLayout(data: GraphData): GraphData {
  const present = BRAIN_AREAS.filter((area) =>
    data.nodes.some((node) => graphNodeArea(node) === area),
  );
  if (present.length === 0) return data;

  const bandHeight = 1 / present.length;
  const nodes = data.nodes.map((node) => {
    const area = graphNodeArea(node);
    const band = present.indexOf(area);
    const peers = data.nodes.filter((other) => graphNodeArea(other) === area);
    const column = peers.findIndex((peer) => peer.id === node.id);
    return {
      ...node,
      x: ((column + 1) / (peers.length + 1)) * 100,
      y: (band + 0.5) * bandHeight * 100,
    };
  });
  return { edges: data.edges, nodes };
}

export function filterGraph(data: GraphData, filters: GraphFilters): GraphData {
  const query = filters.query.trim().toLocaleLowerCase();
  const nodes = data.nodes.filter((node) => {
    const matchesQuery =
      !query ||
      `${node.label} ${node.path}`.toLocaleLowerCase().includes(query);
    return (
      matchesQuery &&
      (filters.type === "all" || node.type === filters.type) &&
      (filters.area === "all" || graphNodeArea(node) === filters.area) &&
      (filters.grade === "all" || node.grade === filters.grade)
    );
  });
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: data.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}

export function focusLocalGraph(
  data: GraphData,
  nodeId: string,
  depth = 1,
): GraphData {
  const visible = new Set([nodeId]);
  let frontier = new Set([nodeId]);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of data.edges) {
      if (frontier.has(edge.source)) next.add(edge.target);
      if (frontier.has(edge.target)) next.add(edge.source);
    }
    for (const id of next) visible.add(id);
    frontier = next;
  }
  return {
    nodes: data.nodes.filter((node) => visible.has(node.id)),
    edges: data.edges.filter(
      (edge) => visible.has(edge.source) && visible.has(edge.target),
    ),
  };
}

export interface HubNode {
  degree: number;
  node: GraphNode;
}

/**
 * The most-connected nodes — the HUD's "start here" list (Phase 2A todo 7,
 * REVIEW_EXTERNAL_PROJECTS G2). Ties break on id so the chip order is a
 * property of the graph rather than of array order.
 */
export function topHubNodes(data: GraphData, limit = 5): HubNode[] {
  const degrees = new Map<string, number>();
  for (const node of data.nodes) degrees.set(node.id, 0);
  for (const edge of data.edges) {
    if (degrees.has(edge.source))
      degrees.set(edge.source, (degrees.get(edge.source) as number) + 1);
    if (degrees.has(edge.target))
      degrees.set(edge.target, (degrees.get(edge.target) as number) + 1);
  }
  return data.nodes
    .map((node) => ({ degree: degrees.get(node.id) ?? 0, node }))
    .filter((entry) => entry.degree > 0)
    .sort((left, right) =>
      left.degree === right.degree
        ? left.node.id.localeCompare(right.node.id)
        : right.degree - left.degree,
    )
    .slice(0, limit);
}

export interface CanvasFramePlan {
  edgeSegments: readonly [
    number,
    number,
    number,
    number,
    EvidenceGrade,
    boolean,
  ][];
  nodePoints: readonly [number, number, EvidenceGrade, number][];
}

/** Linear render-plan preparation kept separate so 500-node frame cost stays measurable. */
export function planCanvasFrame(data: GraphData): CanvasFramePlan {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const edgeSegments: CanvasFramePlan["edgeSegments"] = data.edges.flatMap(
    (edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      return source && target
        ? [
            [
              source.x,
              source.y,
              target.x,
              target.y,
              edge.grade,
              edge.broken,
            ] as const,
          ]
        : [];
    },
  );
  return {
    edgeSegments,
    nodePoints: data.nodes.map(
      (node) => [node.x, node.y, node.grade, node.findingCount] as const,
    ),
  };
}

export interface DashboardViewModel {
  ciMessage: string;
  graph: GraphData;
  isClustered: boolean;
  metrics: {
    implementation: number;
    tests: number;
    tokenCost: number;
    unresolved: number;
  };
  repo: string;
  state: DashboardState;
}

export function buildDashboardViewModel(
  state: DashboardState,
  repo = "2klips/arr-app",
): DashboardViewModel {
  const source = createFixtureGraph(
    state === "large" ? 500 : BASE_NODES.length,
  );
  const graph =
    state === "large" ? clusterGraph(source) : forceDirectedLayout(source);
  return {
    ciMessage: state === "no-ci" ? DASHBOARD.ci.missing : DASHBOARD.ci.present,
    graph,
    isClustered: state === "large",
    metrics: {
      implementation: 84,
      tests: state === "no-ci" ? 0 : 71,
      tokenCost: 1840,
      unresolved: 4,
    },
    repo,
    state,
  };
}

export function parseDashboardState(
  value: string | string[] | undefined,
): DashboardState {
  const candidate = Array.isArray(value) ? value[0] : value;
  return DASHBOARD_STATES.includes(candidate as DashboardState)
    ? (candidate as DashboardState)
    : "scanned";
}
