"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createClient } from "../../../../lib/supabase/server";

export async function setPilotInstrumentation(
  formData: FormData,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const enabled = formData.get("enabled") === "true";
  const client = await createClient();
  const updated = await client
    .from("workspaces")
    .update({
      pilot_instrumentation_consented_at: enabled
        ? new Date().toISOString()
        : null,
      pilot_instrumentation_enabled: enabled,
    })
    .eq("owner_user_id", userId)
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) {
    throw new Error("Unable to update pilot measurement consent.");
  }

  revalidatePath("/app/stats");
}
