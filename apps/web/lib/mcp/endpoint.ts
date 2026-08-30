import { createHostedMcpEndpoint, type HostedMcpEndpoint } from "@arr/mcp";
import { after } from "next/server";

import { createAdminClient } from "../supabase/admin";
import { SupabaseMcpStore } from "./supabase-store";

let endpoint: HostedMcpEndpoint | undefined;

function hostedMcpEndpoint(): HostedMcpEndpoint {
  // `after()` must only ever be *called* from inside a request's execution
  // (it reads Next's request-scoped AsyncLocalStorage) — the reference is
  // safe to hand over here even though the endpoint itself is a
  // module-level singleton built outside any request, because it isn't
  // invoked until a tool call runs during `fetch()` below (QW-17).
  endpoint ??= createHostedMcpEndpoint({
    scheduleAfterResponse: after,
    store: new SupabaseMcpStore(createAdminClient()),
  });
  return endpoint;
}

export async function handleHostedMcpRequest(
  request: Request,
): Promise<Response> {
  return hostedMcpEndpoint().fetch(request);
}
