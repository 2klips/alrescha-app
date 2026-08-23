import { NextResponse } from "next/server";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { lookupPublicGitHubRepository } from "../../../../../lib/github/api";
import { connectSelectedRepository } from "../../../../../lib/github/connect-repository";
import { decideUrlConnect } from "../../../../../lib/github/url-connect";
import { consumeWorkspaceSecurityLimit } from "../../../../../lib/security/audit";
import {
  addressedOrigin,
  isSameOriginRequest,
} from "../../../../../lib/security/same-origin";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { createClient } from "../../../../../lib/supabase/server";

function backToConnect(
  origin: string,
  parameters: Record<string, string>,
): NextResponse {
  const url = new URL("/app/connect/github", origin);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const origin = addressedOrigin(request);
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const repositoryUrl = formData.get("repositoryUrl");
  if (typeof repositoryUrl !== "string") {
    return Response.json({ error: "invalid_selection" }, { status: 400 });
  }

  const supabase = await createClient();
  const workspace = await supabase
    .from("workspaces")
    .select("id")
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const workspaceId = workspace.data.id;

  const withinLimit = await consumeWorkspaceSecurityLimit({
    maximumRequests: 20,
    operation: "repository_url_connect",
    windowSeconds: 60,
    workspaceId,
  });
  if (!withinLimit) {
    return Response.json(
      { error: "rate_limited" },
      { headers: { "Retry-After": "60" }, status: 429 },
    );
  }

  const admin = createAdminClient();
  const outcome = await decideUrlConnect(
    { repositoryUrl, workspaceId },
    {
      connectRepository: async (candidate) => {
        const connection = await connectSelectedRepository({
          actorUserId: userId,
          githubRepositoryId: candidate.githubRepositoryId,
          installationId: candidate.installationId,
          workspaceId,
        });
        if (!connection.ok) throw new Error(connection.error);
        return connection.repositoryId;
      },
      findAvailableRepository: async (workspace, fullName) => {
        const result = await admin
          .from("github_available_repositories")
          .select("github_repository_id, installation_id")
          .eq("workspace_id", workspace)
          .eq("full_name", fullName)
          .maybeSingle();
        if (result.error || !result.data) return null;
        return {
          githubRepositoryId: result.data.github_repository_id,
          installationId: result.data.installation_id,
        };
      },
      findConnectedRepository: async (workspace, fullName) => {
        const result = await admin
          .from("repositories")
          .select("id")
          .eq("workspace_id", workspace)
          .eq("full_name", fullName)
          .not("selected_at", "is", null)
          .maybeSingle();
        return Boolean(result.data);
      },
      hasInstallation: async (workspace) => {
        const result = await admin
          .from("github_installations")
          .select("id")
          .eq("workspace_id", workspace)
          .is("revoked_at", null)
          .limit(1);
        return Boolean(result.data?.length);
      },
      lookupPublicRepository: (fullName) =>
        lookupPublicGitHubRepository(fullName),
    },
  );

  switch (outcome.kind) {
    case "connected":
      return NextResponse.redirect(new URL("/app?github=pending", origin), 303);
    case "invalid_url":
      return backToConnect(origin, {
        url_reason: outcome.reason,
        url_status: "invalid_url",
      });
    case "already_connected":
    case "no_access":
    case "private_or_missing":
      return backToConnect(origin, {
        repository: outcome.fullName,
        url_status: outcome.kind,
      });
    case "install":
      return backToConnect(origin, {
        repository: outcome.fullName,
        url_status: "install",
        ...(outcome.githubRepositoryId === null
          ? {}
          : { repository_id: String(outcome.githubRepositoryId) }),
      });
  }
}
