import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { SupabaseMcpStore } from "../../../../../lib/mcp/supabase-store";
import { SETTINGS } from "../../../../../lib/strings";
import { createClient } from "../../../../../lib/supabase/server";
import { headers } from "next/headers";

import { ContextTools } from "./context-tools";
import { InstructionBlocks } from "./instruction-blocks";
import {
  INITIAL_CONTEXT_PACK_STATE,
  INITIAL_INDEX_PROPOSAL_STATE,
} from "./state";
import { McpTokenManager } from "./token-manager";

export const dynamic = "force-dynamic";

/** The deployment's own origin, from the request the browser addressed. */
async function requestBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

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
    throw new Error(SETTINGS.errors.workspaceUnavailable);
  const tokens = await new SupabaseMcpStore(client).listAccessTokens({
    actorUserId: userId,
    workspaceId: workspace.data.id,
  });

  return (
    <main className="mcp-settings-shell">
      <header>
        <div className="eyebrow">{SETTINGS.mcp.eyebrow}</div>
        <h1>{SETTINGS.mcp.title}</h1>
        <p>
          {SETTINGS.mcp.introPrefix}
          <code>{SETTINGS.mcp.apiPath}</code>
          {SETTINGS.mcp.introSuffix}
        </p>
      </header>
      <McpTokenManager tokens={tokens} />
      <InstructionBlocks baseUrl={await requestBaseUrl()} />
      <ContextTools
        initialContextState={INITIAL_CONTEXT_PACK_STATE}
        initialProposalState={INITIAL_INDEX_PROPOSAL_STATE}
      />
    </main>
  );
}
