"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

/**
 * Ask a coaching job to grade one of the caller's OWN prompt records
 * (ADR-011-4). The own-author and raw-sync-consent rules are enforced inside
 * `enqueue_coaching_job`, not just by which buttons this page renders.
 */
export async function requestPromptCoaching(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!recordId) throw new Error("A prompt record id is required.");

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

  const admin = createAdminClient();
  const keyed = await admin
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", workspace.data.id)
    .eq("provider", "anthropic")
    .maybeSingle();

  const queued = await admin.rpc("enqueue_coaching_job", {
    requested_billing_mode: keyed.data ? "byok" : "credits",
    requested_provider: "anthropic",
    requesting_user_id: userId,
    target_prompt_record_id: recordId,
    target_workspace_id: workspace.data.id,
  });
  if (queued.error) {
    throw new Error("Unable to enqueue the coaching job.");
  }

  revalidatePath("/app/team");
  redirect("/app/team?coaching=queued");
}
