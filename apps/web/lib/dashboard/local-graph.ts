import {
  focusLocalGraph,
  type GraphData,
  type GraphEdge,
  type GraphEdgeProvenance,
  type GraphNode,
} from "./graph-model";

const ORPHAN_NODE: GraphNode = {
  findingCount: 1,
  grade: "inferred",
  id: "doc-orphan",
  label: "ADR-002 local cache",
  path: "spec/decisions/ADR-002.md",
  type: "document",
  x: 310,
  y: 205,
};

export function buildLocalEvidenceGraph(
  graph: GraphData,
  nodeId: string,
  options: { depth?: number; includeOrphans?: boolean } = {},
): GraphData {
  const local = focusLocalGraph(graph, nodeId, options.depth ?? 2);
  return options.includeOrphans
    ? { edges: local.edges, nodes: [...local.nodes, ORPHAN_NODE] }
    : local;
}

export function inspectEdgeProvenance(edge: GraphEdge): GraphEdgeProvenance {
  return edge.provenance;
}

export function graphEdgesWithDisplayableProvenance(graph: GraphData): GraphEdge[] {
  return graph.edges.filter(
    (edge) =>
      edge.provenance.sourcePath.length > 0 &&
      edge.provenance.startLine > 0 &&
      edge.provenance.endLine >= edge.provenance.startLine,
  );
}
