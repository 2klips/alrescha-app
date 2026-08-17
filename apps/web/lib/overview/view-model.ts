/**
 * Four-zone overview view model (Phase 2D Wave 1).
 *
 * Every value is derived from the demo view models the full screens already
 * use — the overview invents no data of its own, so the numbers here always
 * agree with the screens each zone links to.
 */

import type { ProgressTodo } from "@arr/core";

import {
  buildDashboardViewModel,
  type DashboardViewModel,
  type EvidenceGrade,
  type GraphNode,
  type GraphNodeType,
} from "../dashboard/graph-model";
import { buildDemoProgressReport } from "../progress/fixtures";
import { DASHBOARD } from "../strings/dashboard";

/** Data Brain area, derived from a node's path by monorepo convention. */
export type BrainArea = "backend" | "docs" | "frontend" | "tests";

export interface OverviewAgentRecord {
  readonly detail: string;
  readonly meta: string;
  readonly time: string;
  readonly tool: string;
}

export interface OverviewTodo {
  readonly id: string;
  readonly sourcePath: string | null;
  readonly status: ProgressTodo["status"];
  readonly title: string;
}

export interface OverviewViewModel {
  readonly agentRecords: readonly OverviewAgentRecord[];
  readonly brainAreas: ReadonlyArray<{ area: BrainArea; count: number }>;
  readonly brainGrades: ReadonlyArray<{ count: number; grade: EvidenceGrade }>;
  readonly graph: {
    readonly edgeCount: number;
    readonly nodeCount: number;
    readonly nodes: readonly GraphNode[];
    readonly typeCounts: ReadonlyArray<{ count: number; type: GraphNodeType }>;
  };
  readonly kpi: {
    readonly implementation: number;
    readonly lastAnalysis: { commitSha: string; status: string } | null;
    readonly tests: number;
    readonly unresolved: number;
  };
  readonly repo: string;
  readonly todos: readonly OverviewTodo[];
}

/**
 * Monorepo path convention (documented in BUILD_PLAN_PHASE2D_UI Wave 3): the
 * real facet engine lands in `packages/core`; until then the overview derives
 * the same split from the node paths the demo graph already carries.
 */
export function areaOfPath(path: string, type: GraphNodeType): BrainArea {
  if (type === "test" || /(?:^|\/)tests?\//.test(path)) return "tests";
  if (
    type === "document" ||
    type === "requirement" ||
    /\.mdc?(?::|$)/.test(path)
  ) {
    return "docs";
  }
  if (path.startsWith("apps/web/")) return "frontend";
  return "backend";
}

const AREA_ORDER: readonly BrainArea[] = [
  "frontend",
  "backend",
  "docs",
  "tests",
];
const GRADE_ORDER: readonly EvidenceGrade[] = [
  "verified",
  "inferred",
  "broken",
];
const TYPE_ORDER: readonly GraphNodeType[] = [
  "requirement",
  "document",
  "code",
  "test",
];

function countBy<Key extends string>(
  keys: readonly Key[],
  values: readonly Key[],
): Array<{ count: number; key: Key }> {
  return keys.map((key) => ({
    count: values.filter((value) => value === key).length,
    key,
  }));
}

export function buildOverviewViewModel(
  dashboard: DashboardViewModel = buildDashboardViewModel("scanned"),
): OverviewViewModel {
  // "partial" is the mid-work board — mixed statuses, which is what an
  // at-a-glance zone is for ("full" marks every todo done by design).
  const progress = buildDemoProgressReport("partial");
  const todos = progress.columns
    .flatMap(({ items }) => items)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6)
    .map((todo) => ({
      id: todo.id,
      sourcePath: todo.source.kind === "document" ? todo.source.path : null,
      status: todo.status,
      title: todo.title,
    }));
  const lastCommit = progress.timeline.find(({ kind }) => kind === "commit");

  return {
    agentRecords: DASHBOARD.activity.samples.slice(0, 5),
    brainAreas: countBy(
      AREA_ORDER,
      dashboard.graph.nodes.map((node) => areaOfPath(node.path, node.type)),
    ).map(({ count, key }) => ({ area: key, count })),
    brainGrades: countBy(
      GRADE_ORDER,
      dashboard.graph.nodes.map((node) => node.grade),
    ).map(({ count, key }) => ({ count, grade: key })),
    graph: {
      edgeCount: dashboard.graph.edges.length,
      nodeCount: dashboard.graph.nodes.length,
      nodes: dashboard.graph.nodes,
      typeCounts: countBy(
        TYPE_ORDER,
        dashboard.graph.nodes.map((node) => node.type),
      ).map(({ count, key }) => ({ count, type: key })),
    },
    kpi: {
      implementation: dashboard.metrics.implementation,
      lastAnalysis: lastCommit
        ? { commitSha: lastCommit.refs[0] ?? "", status: lastCommit.status }
        : null,
      tests: dashboard.metrics.tests,
      unresolved: dashboard.metrics.unresolved,
    },
    repo: dashboard.repo,
    todos,
  };
}
