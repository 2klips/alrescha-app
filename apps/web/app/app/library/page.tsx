import { redirect } from "next/navigation";

import { LibraryBrowser } from "../../library/library-browser";
import { getCurrentUserId } from "../../../lib/auth/current-user";
import { listLibraryItems } from "../../../lib/library/library-store";
import { createClient } from "../../../lib/supabase/server";
import { deleteLibraryItem } from "./actions";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    query?: string | string[];
    tag?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = first(params.query).slice(0, 200);
  const selectedTag = first(params.tag).trim().toLowerCase() || null;
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const items = await listLibraryItems(client, String(workspace.data.id));
  return (
    <LibraryBrowser
      deleteAction={deleteLibraryItem}
      items={items}
      query={query}
      selectedTag={selectedTag}
    />
  );
}
