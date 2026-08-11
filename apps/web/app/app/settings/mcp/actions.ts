"use server";

import { MCP_SCOPES, type McpScope } from "@specproof/mcp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { SupabaseMcpStore } from "../../../../lib/mcp/supabase-store";
import { createClient } from "../../../../lib/supabase/server";

export interface IssueMcpTokenState {
  error: string | null;
  secret: string | null;
}

export const INITIAL_ISSUE_MCP_TOKEN_STATE: IssueMcpTokenState = {
  error: null,
  secret: null,
};

async function settingsContext() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data)
    throw new Error("Personal workspace is unavailable.");

  return {
    store: new SupabaseMcpStore(client),
    userId,
    workspaceId: workspace.data.id,
  };
}

export async function issueMcpToken(
  _state: IssueMcpTokenState,
  formData: FormData,
): Promise<IssueMcpTokenState> {
  const name = String(formData.get("name") ?? "").trim();
  const scopes = formData
    .getAll("scopes")
    .map(String)
    .filter((scope): scope is McpScope =>
      MCP_SCOPES.some((allowed) => allowed === scope),
    );
  if (!name || name.length > 80) {
    return { error: "Token name must contain 1–80 characters.", secret: null };
  }
  if (scopes.length === 0) {
    return { error: "Select at least one token scope.", secret: null };
  }

  try {
    const { store, userId, workspaceId } = await settingsContext();
    const issued = await store.issueAccessToken({
      actorUserId: userId,
      name,
      scopes,
      workspaceId,
    });
    revalidatePath("/app/settings/mcp");
    return { error: null, secret: issued.secret };
  } catch {
    return { error: "Token issuance failed. Try again.", secret: null };
  }
}

export async function revokeMcpToken(formData: FormData): Promise<void> {
  const tokenId = String(formData.get("tokenId") ?? "");
  if (!tokenId) return;
  const { store, userId, workspaceId } = await settingsContext();
  await store.revokeAccessToken({ actorUserId: userId, tokenId, workspaceId });
  revalidatePath("/app/settings/mcp");
}
