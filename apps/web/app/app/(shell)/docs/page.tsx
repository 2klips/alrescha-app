import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadDocPageList } from "../../../../lib/docs/doc-pages-report";
import { createClient } from "../../../../lib/supabase/server";
import { DocPageList } from "../../../ui/doc-pages";

export const dynamic = "force-dynamic";

/**
 * The workspace's doc pages (Phase 4 Wave D todo 20). Read through row
 * security as the signed-in member; a workspace whose skeleton pass has not
 * run yet gets the empty state, never a fixture.
 */
export default async function WorkspaceDocsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { pages } = await loadDocPageList(client, userId);
  return <DocPageList basePath="/app/docs" pages={pages} />;
}
