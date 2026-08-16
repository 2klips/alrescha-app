"use server";

import {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  buildMinimalIndexProposalFiles,
  proposeMinimalIndexPullRequest,
  requestInstallationToken,
  type ContextTargetAgent,
} from "@arr/core";
import {
  MCP_SCOPES,
  selectWorkspaceContextPack,
  type McpScope,
} from "@arr/mcp";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createGitHubAppJwt } from "../../../../lib/github/api";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { readMinimalIndexSource } from "../../../../lib/github/index-pr/source";
import { SupabaseMcpStore } from "../../../../lib/mcp/supabase-store";
import { recordSecurityAuditEvent } from "../../../../lib/security/audit";
import { createClient } from "../../../../lib/supabase/server";
import {
  INITIAL_INDEX_PROPOSAL_STATE,
  type ContextPackActionState,
  type IndexProposalActionState,
  type IssueMcpTokenState,
} from "./state";

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
    client,
    store: new SupabaseMcpStore(client),
    userId,
    workspaceId: workspace.data.id,
  };
}

export async function requestContextPackPreview(
  _state: ContextPackActionState,
  formData: FormData,
): Promise<ContextPackActionState> {
  const taskDescription = String(formData.get("taskDescription") ?? "").trim();
  const targetAgent = String(formData.get("targetAgent") ?? "generic");
  const tokenBudget = Number(formData.get("tokenBudget"));
  const allowedTargets: readonly ContextTargetAgent[] = [
    "claude-code",
    "codex",
    "cursor",
    "generic",
  ];

  if (!taskDescription || taskDescription.length > 1_000) {
    return {
      error: "Task description must contain 1–1,000 characters.",
      pack: null,
    };
  }
  if (!allowedTargets.includes(targetAgent as ContextTargetAgent)) {
    return { error: "Choose a supported target agent.", pack: null };
  }
  if (
    !Number.isSafeInteger(tokenBudget) ||
    tokenBudget < 128 ||
    tokenBudget > 32_000
  ) {
    return {
      error: "Token budget must be between 128 and 32,000.",
      pack: null,
    };
  }

  try {
    const { store, userId, workspaceId } = await settingsContext();
    const workspace = await store.loadWorkspace({
      scopes: ["mcp:read"],
      tokenId: "settings-context-preview",
      userId,
      workspaceId,
    });
    return {
      error: null,
      pack: selectWorkspaceContextPack(workspace, {
        targetAgent: targetAgent as ContextTargetAgent,
        taskDescription,
        tokenBudget,
      }),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: "Context pack composition failed. Try again.", pack: null };
  }
}

function hostedContextUrls(workspaceId: string) {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const configuredMcpEndpoint = process.env.ARR_MCP_URL;
  const appUrl = (
    configuredAppUrl?.startsWith("https://")
      ? configuredAppUrl
      : "https://app.arr.app"
  ).replace(/\/$/, "");
  const mcpEndpoint = (
    configuredMcpEndpoint?.startsWith("https://")
      ? configuredMcpEndpoint
      : "https://mcp.arr.app"
  ).replace(/\/$/, "");
  return {
    dashboardUrl: `${appUrl}/app?workspace=${workspaceId}`,
    mcpEndpoint,
  };
}

export async function createMinimalIndexProposal(
  _state: IndexProposalActionState,
  _formData: FormData,
): Promise<IndexProposalActionState> {
  void _state;
  void _formData;

  try {
    const { client, userId, workspaceId } = await settingsContext();
    const repository = await client
      .from("repositories")
      .select(
        "id, default_branch, full_name, github_repository_id, installation_id",
      )
      .eq("workspace_id", workspaceId)
      .order("selected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (repository.error || !repository.data) {
      return {
        ...INITIAL_INDEX_PROPOSAL_STATE,
        error: "Connect a GitHub repository first.",
      };
    }

    const installation = await client
      .from("github_installations")
      .select("github_installation_id, permission_mode, revoked_at")
      .eq("id", repository.data.installation_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (installation.error || !installation.data) {
      return {
        ...INITIAL_INDEX_PROPOSAL_STATE,
        error: "GitHub installation is unavailable.",
      };
    }
    if (installation.data.revoked_at) {
      return {
        ...INITIAL_INDEX_PROPOSAL_STATE,
        error: "GitHub App is disconnected. Reconnect before preparing a proposal.",
      };
    }

    const environment = githubAppEnvironment();
    const hasPullRequestPermission =
      installation.data.permission_mode === "read_with_pr_proposals";
    const permissions = hasPullRequestPermission
      ? { ...GITHUB_READ_ONLY_PERMISSIONS, ...GITHUB_PR_PROPOSAL_PERMISSION }
      : GITHUB_READ_ONLY_PERMISSIONS;
    const installationToken = await requestInstallationToken({
      appJwt: createGitHubAppJwt(environment.appId, environment.privateKey),
      installationId: installation.data.github_installation_id,
      permissions,
      repositoryIds: [repository.data.github_repository_id],
    });
    const source = await readMinimalIndexSource({
      branch: repository.data.default_branch,
      repository: repository.data.full_name,
      token: installationToken.token,
    });
    const proposal = buildMinimalIndexProposalFiles({
      agentsContent: source.agentsContent,
      claudeContent: source.claudeContent,
      ...hostedContextUrls(workspaceId),
    });
    const result = await proposeMinimalIndexPullRequest({
      authorization: hasPullRequestPermission
        ? "missing_contents"
        : "missing_pull_requests",
      baseBranch: repository.data.default_branch,
      baseSha: source.baseSha,
      files: proposal.files,
      github: {
        createProposalBranch: async () => {
          throw new Error("GitHub contents:write decision is unresolved.");
        },
        openProposalPullRequest: async () => {
          throw new Error("GitHub contents:write decision is unresolved.");
        },
        writeProposalFile: async () => {
          throw new Error("GitHub contents:write decision is unresolved.");
        },
      },
    });

    await recordSecurityAuditEvent({
      action: "index_pr_proposed",
      actorId: userId,
      actorKind: "user",
      metadata: { outcome: result.status },
      targetId: repository.data.id,
      targetType: "repository",
      workspaceId,
    });

    return {
      error: null,
      files: result.files,
      missingPermission:
        result.status === "permission_required"
          ? result.missingPermission
          : null,
      repository: repository.data.full_name,
      status: result.status,
      url: result.status === "proposed" ? result.url : null,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ...INITIAL_INDEX_PROPOSAL_STATE,
      error: "Unable to prepare the minimal-index proposal. Try again.",
    };
  }
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
