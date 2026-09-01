"use client";

import { List } from "lucide-react";
import { type KeyboardEvent, useMemo, useRef } from "react";

import type { GraphData, GraphNode } from "../../lib/dashboard/graph-model";
import { DASHBOARD } from "../../lib/strings";
import { StatusBadge } from "./status-badge";

interface GraphTableViewProps {
  data: GraphData;
  onNodeActivate: (node: GraphNode) => void;
  onNodeSelect: (node: GraphNode) => void;
  selectedNodeId: string | null;
}

export function GraphTableView({
  data,
  onNodeActivate,
  onNodeSelect,
  selectedNodeId,
}: GraphTableViewProps) {
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const relationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of data.edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [data.edges]);

  function moveRowFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const delta =
      event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : event.key === "Home"
            ? Number.NEGATIVE_INFINITY
            : event.key === "End"
              ? Number.POSITIVE_INFINITY
              : null;
    if (delta === null || data.nodes.length === 0) return;
    event.preventDefault();
    const next =
      delta === Number.NEGATIVE_INFINITY
        ? 0
        : delta === Number.POSITIVE_INFINITY
          ? data.nodes.length - 1
          : (index + delta + data.nodes.length) % data.nodes.length;
    rowRefs.current[next]?.focus();
  }

  if (data.nodes.length === 0) {
    return (
      <div className="graph-table-empty" role="status">
        <List aria-hidden size={24} />
        <strong>{DASHBOARD.table.emptyTitle}</strong>
        <span>{DASHBOARD.table.emptyBody}</span>
      </div>
    );
  }

  return (
    <div className="graph-table-scroll" data-testid="graph-table-view">
      <table className="graph-table">
        <caption className="sr-only">{DASHBOARD.table.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{DASHBOARD.table.node}</th>
            <th scope="col">{DASHBOARD.table.type}</th>
            <th scope="col">{DASHBOARD.table.grade}</th>
            <th scope="col">{DASHBOARD.table.relations}</th>
            <th scope="col">{DASHBOARD.table.source}</th>
          </tr>
        </thead>
        <tbody>
          {data.nodes.map((node, index) => (
            <tr data-selected={node.id === selectedNodeId} key={node.id}>
              <th scope="row">
                <button
                  aria-pressed={node.id === selectedNodeId}
                  onClick={() => onNodeSelect(node)}
                  onDoubleClick={() => onNodeActivate(node)}
                  onKeyDown={(event) => moveRowFocus(event, index)}
                  ref={(element) => {
                    rowRefs.current[index] = element;
                  }}
                  type="button"
                >
                  {node.label}
                </button>
              </th>
              <td>{DASHBOARD.filters.types[node.type]}</td>
              <td>
                <StatusBadge grade={node.grade}>{node.grade}</StatusBadge>
              </td>
              <td>{relationCounts.get(node.id) ?? 0}</td>
              <td>
                <code>{node.path}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
