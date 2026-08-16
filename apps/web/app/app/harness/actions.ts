"use server";

import {
  GITHUB_READ_ONLY_PERMISSIONS,
  createLibrarySnapshot,
  requestInstallationToken,
  type LibraryItemType,
} from "@arr/core";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import type { SaveLibraryActionState } from "../../harness/harness-asset-card";
import { getCurrentUserId } from "../../../lib/auth/current-user";
import { createGitHubAppJwt } from "../../../lib/github/api";
import { githubAppEnvironment } from "../../../lib/github/env";
import { readHarnessAssetSource } from "../../../lib/github/library-source";
import { saveLibrarySnapshot } from "../../../lib/library/library-store";
import { HARNESS } from "../../../lib/strings";
import { createClient } from "../../../lib/supabase/server";

const SUPPORTED_CLASSIFICATIONS = [
  "agents",
  "claude",
  "cursor_rule",
  "skill",
] as const;

function isSupportedClassification(
  value: unknown,
): value is (typeof SUPPORTED_CLASSIFICATIONS)[number] {
  return (
    typeof value === "string" &&
    SUPPORTED_CLASSIFICATIONS.some((classification) => classification === value)
  );
}

function libraryType(
  classification: (typeof SUPPORTED_CLASSIFICATIONS)[number],
): LibraryItemType {
  if (classification === "skill") return "skill";
  if (classification === "cursor_rule") return "rules";
  return "instruction";
}

function libraryName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const file = parts.at(-1) ?? path;
  const stem =
    file.toLowerCase() === "skill.md"
      ? (parts.at(-2) ?? "Skill")
      : file.replace(/\.[^.]+$/, "");
  return stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function parseTags(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function saveHarnessAsset(
  _state: SaveLibraryActionState,
  formData: FormData,
): Promise<SaveLibraryActionState> {
  const assetId = String(formData.get("assetId") ?? "");
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(assetId)) {
    return { notice: "Choose a valid harness asset.", status: "error" };
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { notice: "Sign in before saving a snapshot.", status: "error" };
    }
    const client = await createClient();
    const workspace = await client
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1)
      .single();
    if (workspace.error || !workspace.data) {
      return { notice: "Personal workspace is unavailable.", status: "error" };
    }
    const workspaceId = String(workspace.data.id);
    const artifact = await client
      .from("artifacts")
      .select("id,repository_id,classification,path,source_commit_sha")
      .eq("workspace_id", workspaceId)
      .eq("id", assetId)
      .eq("kind", "instruction")
      .maybeSingle();
    if (
      artifact.error ||
      !artifact.data ||
      !isSupportedClassification(artifact.data.classification)
    ) {
      return { notice: "Harness asset is unavailable.", status: "error" };
    }
    const repository = await client
      .from("repositories")
      .select("full_name,github_repository_id,installation_id")
      .eq("workspace_id", workspaceId)
      .eq("id", artifact.data.repository_id)
      .maybeSingle();
    if (repository.error || !repository.data) {
      return { notice: "Source repository is unavailable.", status: "error" };
    }
    const installation = await client
      .from("github_installations")
      .select("github_installation_id,revoked_at")
      .eq("workspace_id", workspaceId)
      .eq("id", repository.data.installation_id)
      .maybeSingle();
    if (
      installation.error ||
      !installation.data ||
      installation.data.revoked_at
    ) {
      return {
        notice: "Reconnect the GitHub App before saving this snapshot.",
        status: "error",
      };
    }

    const environment = githubAppEnvironment();
    const token = await requestInstallationToken({
      appJwt: createGitHubAppJwt(environment.appId, environment.privateKey),
      installationId: Number(installation.data.github_installation_id),
      permissions: GITHUB_READ_ONLY_PERMISSIONS,
      repositoryIds: [Number(repository.data.github_repository_id)],
    });
    const content = await readHarnessAssetSource({
      commitSha: String(artifact.data.source_commit_sha),
      path: String(artifact.data.path),
      repository: String(repository.data.full_name),
      token: token.token,
    });
    const snapshot = createLibrarySnapshot({
      content,
      name: libraryName(String(artifact.data.path)),
      source: {
        commitSha: String(artifact.data.source_commit_sha),
        path: String(artifact.data.path),
        repository: String(repository.data.full_name),
      },
      tags: parseTags(formData.get("tags")),
      type: libraryType(artifact.data.classification),
    });
    const saved = await saveLibrarySnapshot(client, workspaceId, snapshot);
    revalidatePath("/app/library");
    return saved.outcome === "saved"
      ? { notice: HARNESS.notices.saved, status: "saved" }
      : {
          notice: HARNESS.notices.duplicate,
          status: "duplicate",
        };
  } catch (error) {
    unstable_rethrow(error);
    return {
      notice: "Unable to save this snapshot. Try again.",
      status: "error",
    };
  }
}
