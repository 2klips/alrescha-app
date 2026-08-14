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
        <Link href="/"><ArrowLeft size={15} />Back to project graph</Link>
        <span><Network size={16} /><h1>Evidence neighborhood</h1><small>depth 2 · {localGraph.nodes.length} nodes</small></span>
        <span className="commit-chip"><GitBranch size={13} />bad0551</span>
      </header>
      <section className="local-graph-stage" aria-label="Depth-two evidence detail graph">
        <div className="local-graph-canvas">
          <GraphCanvas
            data={localGraph}
            focusNodeId={selectedNode?.id ?? rootNode}
            onEdgeSelect={(edge: GraphEdge) => setSelectedEdgeId(edge.id)}
            onNodeSelect={setSelectedNode}
            selectedEdgeId={selectedEdge?.id ?? null}
          />
          <div className="local-graph-label"><Orbit size={14} />Local graph · depth 2 · layout frozen</div>
        </div>

        <aside className="provenance-inspector">
          <header><span className="panel-kicker">Selected node</span><h2>{selectedNode?.label ?? "Evidence edge"}</h2><code>{selectedNode?.path}</code></header>
          <div className="orphan-toggle">
            <label><input checked={includeOrphans} onChange={(event) => setIncludeOrphans(event.target.checked)} type="checkbox" /><span>Show orphan artifacts</span></label>
            <small>Orphans have no provenance edge and never appear in edge detail.</small>
          </div>

          <section className="provenance-card" aria-labelledby="provenance-title">
            <span className="panel-kicker">Edge provenance</span>
            <h2 id="provenance-title">{provenance?.relation ?? "Select an evidence edge"}</h2>
            {provenance ? (
              <>
                <dl>
                  <div><dt>Span</dt><dd>{provenance.sourcePath}:{provenance.startLine}-{provenance.endLine}</dd></div>
                  <div><dt>Confidence</dt><dd>{Math.round(provenance.confidence * 100)}%</dd></div>
                  <div><dt>Evidence grade</dt><dd><span className={`grade-badge ${provenance.grade}`}>{provenance.grade}</span></dd></div>
                  <div><dt>Relation</dt><dd>{provenance.relation}</dd></div>
                </dl>
                <p><ShieldCheck size={14} />Provenance complete. Hover detail never falls back to an ungrounded edge.</p>
              </>
            ) : <p>No displayable provenance in this neighborhood.</p>}
          </section>

          <section className="edge-index">
            <span className="panel-kicker">Visible evidence edges</span>
            <div>
              {displayEdges.map((edge) => (
                <button aria-pressed={edge.id === selectedEdge?.id} key={edge.id} onClick={() => setSelectedEdgeId(edge.id)} type="button">
                  <Link2 size={13} /><span><strong>{edge.provenance.relation}</strong><small>{edge.provenance.sourcePath}:{edge.provenance.startLine}</small></span><span className={`evidence-dot ${edge.provenance.grade}`} />
                </button>
              ))}
            </div>
          </section>

          <footer>
            <Link href={`/findings?node=${encodeURIComponent(selectedNode?.id ?? rootNode)}`}><FileSearch size={14} />Related findings</Link>
            <Link href={`/findings?source=${encodeURIComponent(selectedNode?.path ?? "")}`}><Braces size={14} />Source record <ExternalLink size={12} /></Link>
          </footer>
        </aside>
      </section>
    </main>
  );
}
