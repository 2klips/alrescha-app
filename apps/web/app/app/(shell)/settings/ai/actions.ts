"use server";

import { encryptByokKey } from "@arr/core/byok";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { createClient } from "../../../../../lib/supabase/server";

function providerName(
  value: FormDataEntryValue | null,
): "anthropic" | "openai" {
  if (value === "anthropic" || value === "openai") return value;
  throw new Error("Choose a supported AI provider.");
}

function encryptionMasterKey(): string {
  const value = process.env.BYOK_ENCRYPTION_KEY;
  if (!value) throw new Error("BYOK encryption is unavailable.");
  return value;
}

export async function saveByokKey(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const provider = providerName(formData.get("provider"));
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey.length < 16 || apiKey.length > 512) {
    throw new Error("Provider API key must contain 16–512 characters.");
  }

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

  const envelope = encryptByokKey({
    masterKey: encryptionMasterKey(),
    providerKey: apiKey,
  });
  const admin = createAdminClient();
  const saved = await admin.from("workspace_ai_keys").upsert(
    {
      algorithm: envelope.algorithm,
      auth_tag: envelope.authTag,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      key_version: envelope.version,
      provider,
      updated_at: new Date().toISOString(),
      workspace_id: workspace.data.id,
    },
    { onConflict: "workspace_id,provider" },
  );
  if (saved.error) throw new Error("Unable to store the encrypted BYOK key.");

  revalidatePath("/app/settings/ai");
}

/**
 * Run the AI concept pass (Phase 3 Wave C): cache-aware enqueue of the
 * `enrich` job. BYOK on the chosen provider wins over credits; a fully
 * cached repository enqueues nothing and costs nothing. The redirect carries
 * the outcome so the page can say which of the two happened.
 */
export async function runEnrichPass(): Promise<void> {
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

  const repository = await client
    .from("repositories")
    .select("id")
    .eq("workspace_id", workspace.data.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (repository.error) {
    throw new Error("Connected repositories are unavailable.");
  }
  if (!repository.data) {
    redirect("/app/settings/ai?enrich=no-repository");
  }

  const admin = createAdminClient();
  const keyed = await admin
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", workspace.data.id)
    .eq("provider", "anthropic")
    .maybeSingle();

  const queued = await admin.rpc("enqueue_enrich_job", {
    requested_billing_mode: keyed.data ? "byok" : "credits",
    requested_provider: "anthropic",
    target_repository_id: repository.data.id,
    target_workspace_id: workspace.data.id,
  });
  if (queued.error) {
    throw new Error("Unable to enqueue the enrich job.");
  }

  revalidatePath("/app/settings/ai");
  redirect(`/app/settings/ai?enrich=${queued.data ? "queued" : "fresh"}`);
}
