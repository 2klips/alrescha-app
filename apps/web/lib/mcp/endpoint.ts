import { createHostedMcpEndpoint, type HostedMcpEndpoint } from "@arr/mcp";

import { createAdminClient } from "../supabase/admin";
import { SupabaseMcpStore } from "./supabase-store";

let endpoint: HostedMcpEndpoint | undefined;

function hostedMcpEndpoint(): HostedMcpEndpoint {
  endpoint ??= createHostedMcpEndpoint({
    store: new SupabaseMcpStore(createAdminClient()),
  });
  return endpoint;
}

export async function handleHostedMcpRequest(
  request: Request,
): Promise<Response> {
  return hostedMcpEndpoint().fetch(request);
}
