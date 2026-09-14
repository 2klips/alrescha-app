import { getCurrentUserId } from "../../../../lib/auth/current-user";
import {
  artifactInspectorCard,
  conceptInspectorCard,
  moduleCardForPath,
  type ConceptRow,
  type InspectArtifactRow,
  type InspectorCardPayload,
} from "../../../../lib/map/inspect-card";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/** Rows one module computation may read — the map's own per-table caps. */
const ARTIFACT_LIMIT = 2_000;
const EDGE_LIMIT = 6_000;

interface NodeRow {
  readonly id: string;
  readonly kind: string;
  readonly repository_id: string;
}

interface ModuleArtifactRow {
  readonly id: string;
  readonly path: string;
  readonly source_blob_sha: string | null;
}

interface ModuleEdgeRow {
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

interface ModuleSummaryRow {
  readonly member_digest: string;
  readonly member_paths: readonly string[] | null;
  readonly module_key: string;
  readonly name: string;
  readonly summary: string;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    headers: { "cache-control": "private, no-store" },
    status,
  });
}

/**
 * The card for one selected map node (Phase 4 Wave D todo 19 ⑴), fetched
 * when the node is selected rather than shipped with the map: a summary per
 * node would multiply the map payload by the prose, for a card the viewer
 * opens one at a time.
 *
 * Reads run as the signed-in member through the session client, so row
 * security decides what this person may see — the same boundary the map
 * loader stands on. A node the policy hides is `not_found` here, as it is
 * on the map.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const nodeId = new URL(request.url).searchParams.get("node")?.trim() ?? "";
  if (nodeId.length === 0) return json({ error: "node_required" }, 400);

  const client = await createClient();
  const node = await client
    .from("graph_nodes")
    .select("id,kind,repository_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (node.error) return json({ error: "unavailable" }, 500);
  if (!node.data) return json({ error: "not_found" }, 404);
  const row = node.data as NodeRow;

  if (row.kind === "artifact") {
    const artifact = await client
      .from("artifacts")
      .select(
        "path,kind,last_seen_commit_sha,source_blob_sha,exported_symbols," +
          "summary:metadata->summary,summary_blob_sha:metadata->summaryBlobSha",
      )
      .eq("id", nodeId)
      .maybeSingle();
    if (artifact.error) return json({ error: "unavailable" }, 500);
    if (!artifact.data) return json({ error: "not_found" }, 404);
    const artifactRow = artifact.data as unknown as InspectArtifactRow;

    const [artifacts, edges, summaries] = await Promise.all([
      client
        .from("artifacts")
        .select("id,path,source_blob_sha")
        .eq("repository_id", row.repository_id)
        .order("id", { ascending: true })
        .limit(ARTIFACT_LIMIT),
      client
        .from("edges")
        .select("relation,source_node_id,target_node_id")
        .eq("repository_id", row.repository_id)
        .in("relation", ["imports", "calls"])
        .order("id", { ascending: true })
        .limit(EDGE_LIMIT),
      client
        .from("module_summaries")
        .select("module_key,name,member_paths,member_digest,summary")
        .eq("repository_id", row.repository_id),
    ]);
    if (artifacts.error || edges.error || summaries.error) {
      return json({ error: "unavailable" }, 500);
    }
    const payload: InspectorCardPayload = {
      card: artifactInspectorCard(artifactRow),
      kind: "artifact",
      module: moduleCardForPath(
        {
          artifacts: ((artifacts.data ?? []) as ModuleArtifactRow[]).map(
            (entry) => ({
              blobSha: entry.source_blob_sha,
              id: entry.id,
              path: entry.path,
            }),
          ),
          edges: ((edges.data ?? []) as ModuleEdgeRow[]).map((entry) => ({
            relation: entry.relation,
            sourceNodeId: entry.source_node_id,
            targetNodeId: entry.target_node_id,
          })),
          summaries: ((summaries.data ?? []) as ModuleSummaryRow[]).map(
            (entry) => ({
              memberDigest: entry.member_digest,
              memberPaths: entry.member_paths ?? [],
              moduleKey: entry.module_key,
              name: entry.name,
              summary: entry.summary,
            }),
          ),
        },
        artifactRow.path,
      ),
      nodeId,
    };
    return json(payload);
  }

  if (row.kind === "concept") {
    const concept = await client
      .from("concepts")
      .select("id,kind,name,slug,summary,member_paths")
      .eq("id", nodeId)
      .maybeSingle();
    if (concept.error) return json({ error: "unavailable" }, 500);
    if (!concept.data) return json({ error: "not_found" }, 404);
    const payload: InspectorCardPayload = {
      concept: conceptInspectorCard(concept.data as ConceptRow),
      kind: "concept",
      nodeId,
    };
    return json(payload);
  }

  const payload: InspectorCardPayload = {
    kind: "other",
    nodeId,
    nodeKind: row.kind,
  };
  return json(payload);
}
