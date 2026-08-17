import { NextResponse } from "next/server";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { connectSelectedRepository } from "../../../../lib/github/connect-repository";
import { consumeWorkspaceSecurityLimit } from "../../../../lib/security/audit";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const installationId = formData.get("installationId");
  const githubRepositoryId = Number(formData.get("githubRepositoryId"));
  if (
    typeof installationId !== "string" ||
    !Number.isSafeInteger(githubRepositoryId) ||
    githubRepositoryId <= 0
  ) {
    return Response.json({ error: "invalid_selection" }, { status: 400 });
  }

  const supabase = await createClient();
  const workspace = await supabase.from("workspaces").select("id").limit(1).single();
  if (workspace.error || !workspace.data) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const withinLimit = await consumeWorkspaceSecurityLimit({
    maximumRequests: 20,
    operation: "repository_selection",
    windowSeconds: 60,
    workspaceId: workspace.data.id,
  });
  if (!withinLimit) {
    return Response.json(
      { error: "rate_limited" },
      { headers: { "Retry-After": "60" }, status: 429 },
    );
  }

  const connection = await connectSelectedRepository({
    actorUserId: userId,
    githubRepositoryId,
    installationId,
    workspaceId: workspace.data.id,
  });
  if (!connection.ok) {
    return Response.json(
      { error: connection.error },
      { status: connection.error === "github_installation_revoked" ? 409 : 403 },
    );
  }

  return NextResponse.redirect(new URL("/app?github=pending", requestUrl.origin), 303);
}
