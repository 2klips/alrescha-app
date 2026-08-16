import {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  requestInstallationToken,
  selectGitHubRepository,
} from "@arr/core";
import { NextResponse } from "next/server";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createGitHubAppJwt } from "../../../../lib/github/api";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { saveSelectedRepository } from "../../../../lib/github/onboarding-store";
import { consumeWorkspaceSecurityLimit } from "../../../../lib/security/audit";
import { createAdminClient } from "../../../../lib/supabase/admin";
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

  const admin = createAdminClient();
  const [installation, repository] = await Promise.all([
    admin
      .from("github_installations")
      .select("github_installation_id, permission_mode, revoked_at")
      .eq("id", installationId)
      .eq("workspace_id", workspace.data.id)
      .maybeSingle(),
    admin
      .from("github_available_repositories")
      .select("default_branch, full_name, github_repository_id")
      .eq("installation_id", installationId)
      .eq("workspace_id", workspace.data.id)
      .eq("github_repository_id", githubRepositoryId)
      .maybeSingle(),
  ]);
  if (installation.error || repository.error || !installation.data || !repository.data) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const installationData = installation.data;
  if (installationData.revoked_at) {
    return Response.json({ error: "github_installation_revoked" }, { status: 409 });
  }
  const environment = githubAppEnvironment();
  const permissions = installationData.permission_mode === "read_with_pr_proposals"
    ? { ...GITHUB_READ_ONLY_PERMISSIONS, ...GITHUB_PR_PROPOSAL_PERMISSION }
    : GITHUB_READ_ONLY_PERMISSIONS;
  await selectGitHubRepository({
    installationId,
    repository: {
      defaultBranch: repository.data.default_branch,
      fullName: repository.data.full_name,
      githubRepositoryId: repository.data.github_repository_id,
    },
    saveSelection: (selection) =>
      saveSelectedRepository({ ...selection, actorUserId: userId }),
    verifyCurrentAccess: async (repositoryId) => {
      await requestInstallationToken({
        appJwt: createGitHubAppJwt(environment.appId, environment.privateKey),
        installationId: installationData.github_installation_id,
        permissions,
        repositoryIds: [repositoryId],
      });
    },
    workspaceId: workspace.data.id,
  });

  return NextResponse.redirect(new URL("/app?github=pending", requestUrl.origin), 303);
}
