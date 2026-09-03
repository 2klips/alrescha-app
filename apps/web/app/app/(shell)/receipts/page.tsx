import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadWorkspaceReceipts } from "../../../../lib/receipts/receipts-report";
import { createClient } from "../../../../lib/supabase/server";
import { WorkspaceReceiptsBoard } from "../../../ui/receipts-board";

export const dynamic = "force-dynamic";

/**
 * The workspace's own receipts (follow-up to OQ-022 ⑴).
 *
 * `/receipts` is the demo chain and stays one. This route reads `receipts`
 * through RLS and re-verifies each stored statement on the server against the
 * digest the analyze stored, so a pre-rename receipt and a current one are
 * held to the same check. An empty workspace gets the empty state — never the
 * demo fixture.
 */
export default async function WorkspaceReceiptsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { receipts } = await loadWorkspaceReceipts(client, userId);

  const requested = (await searchParams).receipt;
  const requestedId = typeof requested === "string" ? requested : null;
  const selectedId =
    receipts.find((receipt) => receipt.id === requestedId)?.id ??
    receipts[0]?.id ??
    null;

  return (
    <WorkspaceReceiptsBoard
      basePath="/app/receipts"
      commitsPath="/app/commits"
      receipts={receipts}
      selectedId={selectedId}
    />
  );
}
