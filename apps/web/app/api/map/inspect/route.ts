import { getCurrentUserId } from "../../../../lib/auth/current-user";
import {
  artifactInspectorCard,
  conceptInspectorCard,
  moduleCardForPath,
  type ConceptRow,
  type InspectArtifactRow,
  type InspectorCardPayload,
} from "../../../../lib/map/inspect-card";
import { readModuleCardInputs } from "../../../../lib/map/module-rows";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

interface NodeRow {
  readonly id: string;
  readonly kind: string;
  readonly repository_id: string;
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

    const inputs = await readModuleCardInputs(client, row.repository_id);
    if (!inputs) return json({ error: "unavailable" }, 500);
    const payload: InspectorCardPayload = {
      card: artifactInspectorCard(artifactRow),
      kind: "artifact",
      module: moduleCardForPath(inputs, artifactRow.path),
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
