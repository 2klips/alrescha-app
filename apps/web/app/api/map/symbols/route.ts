import { getCurrentUserId } from "../../../../lib/auth/current-user";
import {
  parseSymbolLayerRequest,
  readSymbolLayer,
} from "../../../../lib/map/symbol-layer";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    headers: { "cache-control": "private, no-store" },
    status,
  });
}

/**
 * The symbol layer for a set of files (Phase 4 Wave F todo 26):
 * `GET /api/map/symbols?files=<id>,<id>`. Read as the signed-in member
 * through the session client, so row security decides what this person may
 * see — the same boundary the map itself stands on. Never the workspace's
 * symbols: a caller names files, and gets those files' symbols.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);

  const { fileIds, truncated } = parseSymbolLayerRequest(
    new URL(request.url).searchParams.get("files"),
  );
  if (fileIds.length === 0) return json({ error: "files_required" }, 400);

  const client = await createClient();
  try {
    return json(await readSymbolLayer(client, fileIds, truncated));
  } catch {
    return json({ error: "unavailable" }, 500);
  }
}
