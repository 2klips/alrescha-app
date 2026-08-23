import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import { loadWorkspaceMap } from "../../../lib/map/workspace-map";
import { createClient } from "../../../lib/supabase/server";
import { WorkspaceMapScreen } from "./map-screen";

export const dynamic = "force-dynamic";

/**
 * The workspace's own knowledge graph (Phase 3 Wave A todo 1).
 *
 * `/map` is the demo dashboard and stays one. This route reads `graph_nodes`,
 * `edges` and their satellite tables through RLS; a workspace with no scan
 * yet gets the connect empty state — never the demo fixture.
 */
export default async function WorkspaceMapPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const model = await loadWorkspaceMap(client, userId);

  return <WorkspaceMapScreen model={model} />;
}
