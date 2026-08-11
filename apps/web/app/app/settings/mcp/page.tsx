import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { SupabaseMcpStore } from "../../../../lib/mcp/supabase-store";
import { createClient } from "../../../../lib/supabase/server";
import { McpTokenManager } from "./token-manager";

export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
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
  const tokens = await new SupabaseMcpStore(client).listAccessTokens({
    actorUserId: userId,
    workspaceId: workspace.data.id,
  });

  return (
    <main className="mcp-settings-shell">
      <header>
        <div className="eyebrow">Hosted MCP · 2026-07-28</div>
        <h1>MCP access</h1>
        <p>
          Connect a coding agent to <code>/api/mcp</code> with a scoped bearer
          token. Repository mutation, sessions, Sampling, Roots, and Logging are
          unavailable.
        </p>
      </header>
      <McpTokenManager tokens={tokens} />
    </main>
  );
}
