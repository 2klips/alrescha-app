"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { deleteLibraryItem as deleteStoredLibraryItem } from "../../../../lib/library/library-store";
import { createClient } from "../../../../lib/supabase/server";

export async function deleteLibraryItem(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(itemId)) return;

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
  await deleteStoredLibraryItem(client, String(workspace.data.id), itemId);
  revalidatePath("/app/library");
}
