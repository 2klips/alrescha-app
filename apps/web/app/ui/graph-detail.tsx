"use client";

import {
  ArrowLeft,
  Braces,
  ExternalLink,
  FileSearch,
  GitBranch,
  Link2,
  Network,
  Orbit,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { buildDashboardViewModel, type GraphEdge, type GraphNode } from "../../lib/dashboard/graph-model";
import {
  buildLocalEvidenceGraph,
  graphEdgesWithDisplayableProvenance,
  inspectEdgeProvenance,
} from "../../lib/dashboard/local-graph";
import { GRAPH } from "../../lib/strings";
import { GraphCanvas } from "./graph-canvas";

interface GraphDetailProps {
  initialNodeId: string;
}

export function GraphDetail({ initialNodeId }: GraphDetailProps) {
  const completeGraph = useMemo(() => buildDashboardViewModel("scanned").graph, []);
  const rootNode = completeGraph.nodes.some((node) => node.id === initialNodeId)
    ? initialNodeId
    : "req-auth";
  const [includeOrphans, setIncludeOrphans] = useState(false);
  const localGraph = useMemo(
    () => buildLocalEvidenceGraph(completeGraph, rootNode, { depth: 2, includeOrphans }),
    [completeGraph, includeOrphans, rootNode],
  );
  const displayEdges = useMemo(() => graphEdgesWithDisplayableProvenance(localGraph), [localGraph]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(
    completeGraph.nodes.find((node) => node.id === rootNode) ?? null,
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(displayEdges[0]?.id ?? null);
  const selectedEdge = displayEdges.find((edge) => edge.id === selectedEdgeId) ?? displayEdges[0];
  const provenance = selectedEdge ? inspectEdgeProvenance(selectedEdge) : null;

  return (
    <main className="graph-detail-shell">
      <header className="graph-detail-header">
        <Link href="/"><ArrowLeft size={15} />{GRAPH.back}</Link>
        <span><Network size={16} /><h1>{GRAPH.heading}</h1><small>{GRAPH.depthLabel(localGraph.nodes.length)}</small></span>
        <span className="commit-chip"><GitBranch size={13} />{GRAPH.commitChip}</span>
      </header>
      <section className="local-graph-stage" aria-label={GRAPH.regionLabel}>
        <div className="local-graph-canvas">
          <GraphCanvas
            data={localGraph}
            focusNodeId={selectedNode?.id ?? rootNode}
            onEdgeSelect={(edge: GraphEdge) => setSelectedEdgeId(edge.id)}
            onNodeSelect={setSelectedNode}
            selectedEdgeId={selectedEdge?.id ?? null}
          />
          <div className="local-graph-label"><Orbit size={14} />{GRAPH.canvas.label}</div>
        </div>

        <aside className="provenance-inspector">
          <header><span className="panel-kicker">{GRAPH.inspector.kicker}</span><h2>{selectedNode?.label ?? GRAPH.inspector.fallbackTitle}</h2><code>{selectedNode?.path}</code></header>
          <div className="orphan-toggle">
            <label><input checked={includeOrphans} onChange={(event) => setIncludeOrphans(event.target.checked)} type="checkbox" /><span>{GRAPH.inspector.orphanToggleLabel}</span></label>
            <small>{GRAPH.inspector.orphanToggleNote}</small>
          </div>

          <section className="provenance-card" aria-labelledby="provenance-title">
            <span className="panel-kicker">{GRAPH.provenance.kicker}</span>
            <h2 id="provenance-title">{provenance?.relation ?? GRAPH.provenance.fallbackTitle}</h2>
            {provenance ? (
              <>
                <dl>
                  <div><dt>{GRAPH.provenance.span}</dt><dd>{provenance.sourcePath}:{provenance.startLine}-{provenance.endLine}</dd></div>
                  <div><dt>{GRAPH.provenance.confidence}</dt><dd>{Math.round(provenance.confidence * 100)}%</dd></div>
                  <div><dt>{GRAPH.provenance.grade}</dt><dd><span className={`grade-badge ${provenance.grade}`}>{provenance.grade}</span></dd></div>
                  <div><dt>{GRAPH.provenance.relation}</dt><dd>{provenance.relation}</dd></div>
                </dl>
                <p><ShieldCheck size={14} />{GRAPH.provenance.complete}</p>
              </>
            ) : <p>{GRAPH.provenance.empty}</p>}
          </section>

          <section className="edge-index">
            <span className="panel-kicker">{GRAPH.edgeIndex.kicker}</span>
            <div>
              {displayEdges.map((edge) => (
                <button aria-pressed={edge.id === selectedEdge?.id} key={edge.id} onClick={() => setSelectedEdgeId(edge.id)} type="button">
                  <Link2 size={13} /><span><strong>{edge.provenance.relation}</strong><small>{edge.provenance.sourcePath}:{edge.provenance.startLine}</small></span><span className={`evidence-dot ${edge.provenance.grade}`} />
                </button>
              ))}
            </div>
          </section>

          <footer>
            <Link href={`/findings?node=${encodeURIComponent(selectedNode?.id ?? rootNode)}`}><FileSearch size={14} />{GRAPH.footer.relatedFindings}</Link>
            <Link href={`/findings?source=${encodeURIComponent(selectedNode?.path ?? "")}`}><Braces size={14} />{GRAPH.footer.sourceRecord} <ExternalLink size={12} /></Link>
          </footer>
        </aside>
      </section>
    </main>
  );
}
