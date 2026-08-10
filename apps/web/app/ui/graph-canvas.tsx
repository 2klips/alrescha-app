"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphData, GraphNode } from "../../lib/dashboard/graph-model";

interface GraphCanvasProps {
  data: GraphData;
  focusNodeId?: string | null;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onNodeSelect?: (node: GraphNode) => void;
}

interface Camera {
  scale: number;
  x: number;
  y: number;
}

const NODE_COLORS = {
  broken: "#ff5d55",
  inferred: "#a88bff",
  verified: "#65b8ff",
} as const;

const TYPE_GLYPHS = {
  code: "C",
  document: "D",
  requirement: "R",
  test: "T",
} as const;

export function GraphCanvas({ data, focusNodeId, onNodeDoubleClick, onNodeSelect }: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<{
    mode: "drag-node" | "pan";
    nodeId?: string;
    pointerX: number;
    pointerY: number;
  } | null>(null);
  const mutableData = useMemo(
    () => ({ edges: data.edges, nodes: data.nodes.map((node) => ({ ...node })) }),
    [data],
  );
  const [camera, setCamera] = useState<Camera>({ scale: 1, x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const nodesById = useMemo(
    () => new Map(mutableData.nodes.map((node) => [node.id, node])),
    [mutableData.nodes],
  );

  useEffect(() => {
    if (!focusNodeId) return;
    const node = nodesById.get(focusNodeId);
    if (!node) return;
    setCamera((current) => ({ ...current, x: -node.x * current.scale, y: -node.y * current.scale }));
  }, [focusNodeId, nodesById]);

  function nodeFromTarget(target: EventTarget | null): GraphNode | undefined {
    const element = target instanceof Element ? target.closest<SVGElement>("[data-node-id]") : null;
    return element ? nodesById.get(element.dataset.nodeId ?? "") : undefined;
  }

  return (
    <div className="graph-canvas-wrap" data-canvas-nodes={data.nodes.length}>
      <svg
        aria-label={`Evidence graph with ${data.nodes.length} visible nodes`}
        className="graph-canvas"
        data-testid="evidence-graph-canvas"
        onDoubleClick={(event) => {
          const node = nodeFromTarget(event.target);
          if (node) onNodeDoubleClick?.(node);
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const node = nodeFromTarget(event.target);
          gestureRef.current = {
            mode: node ? "drag-node" : "pan",
            ...(node ? { nodeId: node.id } : {}),
            pointerX: event.clientX,
            pointerY: event.clientY,
          };
          if (node) {
            setSelectedId(node.id);
            onNodeSelect?.(node);
          }
        }}
        onPointerMove={(event) => {
          const gesture = gestureRef.current;
          const rect = svgRef.current?.getBoundingClientRect();
          if (!gesture || !rect) return;
          const dx = (event.clientX - gesture.pointerX) * (1000 / rect.width);
          const dy = (event.clientY - gesture.pointerY) * (700 / rect.height);
          gesture.pointerX = event.clientX;
          gesture.pointerY = event.clientY;
          if (gesture.mode === "pan") {
            setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
          } else {
            const node = nodesById.get(gesture.nodeId ?? "");
            if (node) {
              node.x += dx / camera.scale;
              node.y += dy / camera.scale;
              redraw((version) => version + 1);
            }
          }
        }}
        onPointerUp={() => {
          gestureRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          setCamera((current) => ({
            ...current,
            scale: Math.max(0.48, Math.min(2.2, current.scale * (event.deltaY > 0 ? 0.9 : 1.1))),
          }));
        }}
        preserveAspectRatio="xMidYMid slice"
        ref={svgRef}
        role="img"
        viewBox="0 0 1000 700"
      >
        <title>Evidence graph connecting requirements, documents, code, and verified tests</title>
        <g transform={`translate(${500 + camera.x} ${350 + camera.y}) scale(${camera.scale})`}>
          {mutableData.edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) return null;
            return (
              <line
                className={`graph-edge ${edge.grade}${edge.broken ? " broken" : ""}`}
                data-edge-id={edge.id}
                key={edge.id}
                x1={source.x}
                x2={target.x}
                y1={source.y}
                y2={target.y}
              />
            );
          })}
          {mutableData.nodes.map((node) => {
            const radius = node.clusterCount ? 27 + Math.min(12, node.clusterCount / 6) : 18;
            const selected = node.id === (focusNodeId ?? selectedId);
            const color = NODE_COLORS[node.grade];
            return (
              <g
                className={`graph-node ${node.grade}${selected ? " selected" : ""}`}
                data-node-id={node.id}
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
              >
                {selected ? <circle className="node-halo" cx="0" cy="0" r={radius + 12} /> : null}
                {node.findingCount > 0 ? <circle className="finding-ring" cx="0" cy="0" r={radius + 5} /> : null}
                <circle className="node-core" cx="0" cy="0" r={radius} style={{ stroke: color }} />
                <text className="node-glyph" fill={color} textAnchor="middle" x="0" y="3">
                  {node.clusterCount ?? TYPE_GLYPHS[node.type]}
                </text>
                <text className="node-label" x={radius + 9} y="-3">{node.label.length > 25 ? `${node.label.slice(0, 24)}…` : node.label}</text>
                <text className="node-type" x={radius + 9} y="11">{node.type.toUpperCase()}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="sr-only" aria-live="polite">
        {data.nodes.map((node) => (
          <button key={node.id} onClick={() => onNodeSelect?.(node)} type="button">
            {node.label}, {node.type}, {node.grade}
          </button>
        ))}
      </div>
    </div>
  );
}
