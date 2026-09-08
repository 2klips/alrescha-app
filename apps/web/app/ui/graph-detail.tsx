"use client";

import {
  ArrowLeft,
  Braces,
  ExternalLink,
  FileSearch,
  List,
  Link2,
  Network,
  Orbit,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { useMemo, useState } from "react";

import {
  buildDashboardViewModel,
  topHubNodes,
  type DashboardState,
  type GraphData,
} from "../../lib/dashboard/graph-model";
import {
  buildLocalEvidenceGraph,
  graphEdgesWithDisplayableProvenance,
  inspectEdgeProvenance,
} from "../../lib/dashboard/local-graph";
import { GRAPH } from "../../lib/strings";
import { BrainMapStage } from "./brain-map-stage";
import { GraphTableView } from "./graph-table-view";

const EMPTY_GRAPH: GraphData = { edges: [], nodes: [] };

interface GraphDetailProps {
  /** The route's `?node=`, or absent — this screen picks its own root then. */
  initialNodeId: string | null;
  state: DashboardState;
}

export function GraphDetail({ initialNodeId, state }: GraphDetailProps) {
  const completeGraph = useMemo(
    () => buildDashboardViewModel(state).graph,
    [state],
  );
  // No hardcoded starting node. A request for one that this graph does not
  // hold — and a request for none at all — lands on the most-connected node,
  // which is the same "start here" rule the dashboard's hub chips use.
  const rootNode =
    (initialNodeId &&
    completeGraph.nodes.some((node) => node.id === initialNodeId)
      ? initialNodeId
      : (topHubNodes(completeGraph, 1)[0]?.node.id ??
        completeGraph.nodes[0]?.id)) ?? null;
  const [includeOrphans, setIncludeOrphans] = useState(false);
  const [view, setView] = useState<"canvas" | "table">("canvas");
  const localGraph = useMemo(
    () =>
      rootNode
        ? buildLocalEvidenceGraph(completeGraph, rootNode, {
            depth: 2,
            includeOrphans,
          })
        : EMPTY_GRAPH,
    [completeGraph, includeOrphans, rootNode],
  );
  const displayEdges = useMemo(
    () => graphEdgesWithDisplayableProvenance(localGraph),
    [localGraph],
  );
  // The selection is derived, not stored: `?node=` can change under this
  // component, and a node id held in state would keep pointing at the
  // neighbourhood the viewer just left.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode =
    completeGraph.nodes.find((node) => node.id === (selectedId ?? rootNode)) ??
    null;
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(
    displayEdges[0]?.id ?? null,
  );
  const selectedEdge =
    displayEdges.find((edge) => edge.id === selectedEdgeId) ?? displayEdges[0];
  const provenance = selectedEdge ? inspectEdgeProvenance(selectedEdge) : null;

  return (
    <main className="graph-detail-shell">
      <header className="graph-detail-header">
        <div>
          <Link href="/">
            <ArrowLeft aria-hidden size={15} />
            {GRAPH.back}
          </Link>
          <span className="panel-kicker">{GRAPH.commitChip}</span>
          <h1>{GRAPH.heading}</h1>
          <small>{GRAPH.depthLabel(localGraph.nodes.length)}</small>
        </div>
        <div aria-label={GRAPH.canvas.label} className="graph-detail-actions">
          <button
            aria-pressed={view === "canvas"}
            onClick={() => setView("canvas")}
            type="button"
          >
            <Network aria-hidden size={14} />
            Graph
          </button>
          <button
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
            type="button"
          >
            <List aria-hidden size={14} />
            List
          </button>
        </div>
      </header>
      <section className="local-graph-stage" aria-label={GRAPH.regionLabel}>
        <div className="local-graph-canvas">
          {view === "canvas" ? (
            <>
              {/* One renderer for the whole product (Phase 4 Wave B todo 14).
                  The camera frames this neighbourhood itself once the layout
                  settles, which is what the SVG renderer's fixed centre-on-
                  the-root could not do without clipping the rest. */}
              <BrainMapStage
                data={localGraph}
                onEdgeSelect={(edge) => setSelectedEdgeId(edge.id)}
                onNodeActivate={(node) => setSelectedId(node.id)}
                onNodeSelect={(node) => setSelectedId(node.id)}
                selectedNodeId={selectedNode?.id ?? null}
                showForcePanel={false}
              />
              <div className="local-graph-label">
                <Orbit aria-hidden size={14} />
                {GRAPH.canvas.label}
              </div>
            </>
          ) : (
            <GraphTableView
              data={localGraph}
              onNodeActivate={(node) => setSelectedId(node.id)}
              onNodeSelect={(node) => setSelectedId(node.id)}
              selectedNodeId={selectedNode?.id ?? null}
            />
          )}
        </div>

        <aside className="provenance-inspector">
          <header>
            <span className="panel-kicker">{GRAPH.inspector.kicker}</span>
            <h2>{selectedNode?.label ?? GRAPH.inspector.fallbackTitle}</h2>
            <code>{selectedNode?.path}</code>
          </header>
          <div className="orphan-toggle">
            <label>
              <input
                checked={includeOrphans}
                onChange={(event) => setIncludeOrphans(event.target.checked)}
                type="checkbox"
              />
              <span>{GRAPH.inspector.orphanToggleLabel}</span>
            </label>
            <small>{GRAPH.inspector.orphanToggleNote}</small>
          </div>

          <section
            className="provenance-card"
            aria-labelledby="provenance-title"
          >
            <span className="panel-kicker">{GRAPH.provenance.kicker}</span>
            <h2 id="provenance-title">
              {provenance?.relation ?? GRAPH.provenance.fallbackTitle}
            </h2>
            {provenance ? (
              <>
                <dl>
                  <div>
                    <dt>{GRAPH.provenance.span}</dt>
                    <dd>
                      {provenance.sourcePath}:{provenance.startLine}-
                      {provenance.endLine}
                    </dd>
                  </div>
                  <div>
                    <dt>{GRAPH.provenance.confidence}</dt>
                    <dd>{Math.round(provenance.confidence * 100)}%</dd>
                  </div>
                  <div>
                    <dt>{GRAPH.provenance.grade}</dt>
                    <dd>
                      <StatusBadge grade={provenance.grade} />
                    </dd>
                  </div>
                  <div>
                    <dt>{GRAPH.provenance.relation}</dt>
                    <dd>{provenance.relation}</dd>
                  </div>
                </dl>
                <p>
                  <ShieldCheck size={14} />
                  {GRAPH.provenance.complete}
                </p>
              </>
            ) : (
              <p>{GRAPH.provenance.empty}</p>
            )}
          </section>

          <section className="edge-index">
            <span className="panel-kicker">{GRAPH.edgeIndex.kicker}</span>
            <div>
              {displayEdges.map((edge) => (
                <button
                  aria-pressed={edge.id === selectedEdge?.id}
                  key={edge.id}
                  onClick={() => setSelectedEdgeId(edge.id)}
                  type="button"
                >
                  <Link2 size={13} />
                  <span>
                    <strong>{edge.provenance.relation}</strong>
                    <small>
                      {edge.provenance.sourcePath}:{edge.provenance.startLine}
                    </small>
                  </span>
                  <span className={`evidence-dot ${edge.provenance.grade}`} />
                </button>
              ))}
            </div>
          </section>

          <footer>
            <Link
              href={`/findings?node=${encodeURIComponent(selectedNode?.id ?? rootNode ?? "")}`}
            >
              <FileSearch size={14} />
              {GRAPH.footer.relatedFindings}
            </Link>
            <Link
              href={`/findings?source=${encodeURIComponent(selectedNode?.path ?? "")}`}
            >
              <Braces size={14} />
              {GRAPH.footer.sourceRecord} <ExternalLink size={12} />
            </Link>
          </footer>
        </aside>
      </section>
    </main>
  );
}
