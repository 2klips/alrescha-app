import { handleHostedMcpRequest } from "../../../lib/mcp/endpoint";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleHostedMcpRequest(request);
}
