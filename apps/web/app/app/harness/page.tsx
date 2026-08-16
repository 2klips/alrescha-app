import type { LibraryItemType } from "@arr/core";
import { redirect } from "next/navigation";

import { HarnessAssetCard } from "../../harness/harness-asset-card";
import { getCurrentUserId } from "../../../lib/auth/current-user";
import { HARNESS } from "../../../lib/strings";
import { createClient } from "../../../lib/supabase/server";
import { saveHarnessAsset } from "./actions";

interface ArtifactRow {
  classification: string;
  digest: string;
  id: string;
  path: string;
  repository_id: string;
  source_commit_sha: string;
}

function itemType(classification: string): LibraryItemType | null {
  if (classification === "skill") return "skill";
  if (classification === "cursor_rule") return "rules";
  if (classification === "agents" || classification === "claude") {
    return "instruction";
  }
  return null;
}

function itemName(path: string): string {
  const parts = path.split("/");
  const file = parts.at(-1) ?? path;
  const name =
    file.toLowerCase() === "skill.md" ? (parts.at(-2) ?? file) : file;
  return name.replace(/\.[^.]+$/, "").replaceAll(/[-_]/g, " ");
}

export const dynamic = "force-dynamic";

export default async function HarnessPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspace.data.id);
  const [artifacts, repositories] = await Promise.all([
    client
      .from("artifacts")
      .select("id,repository_id,classification,path,digest,source_commit_sha")
      .eq("workspace_id", workspaceId)
      .eq("kind", "instruction")
      .order("path"),
    client
      .from("repositories")
      .select("id,full_name")
      .eq("workspace_id", workspaceId),
  ]);
  if (artifacts.error || repositories.error) {
    throw new Error("Harness assets are unavailable.");
  }
  const repositoryNames = new Map(
    (repositories.data ?? []).map((repository) => [
      String(repository.id),
      String(repository.full_name),
    ]),
  );
  const assets = ((artifacts.data ?? []) as ArtifactRow[]).flatMap(
    (artifact) => {
      const type = itemType(artifact.classification);
      const repository = repositoryNames.get(artifact.repository_id);
      if (!type || !repository) return [];
      return [
        {
          digest: artifact.digest,
          id: artifact.id,
          name: itemName(artifact.path),
          source: {
            commitSha: artifact.source_commit_sha,
            path: artifact.path,
            repository,
          },
          tags: [artifact.classification.replace("_", "-")],
          type,
        },
      ];
    },
  );

  return (
    <main className="harness-shell">
      <header className="harness-hero">
        <p>{HARNESS.live.kicker}</p>
        <h1>{HARNESS.title}</h1>
        <span>{HARNESS.live.lead}</span>
      </header>
      <section className="harness-assets" aria-label={HARNESS.ariaAssets}>
        {assets.length === 0 ? (
          <div className="library-empty">
            <h2>{HARNESS.empty.title}</h2>
            <p>{HARNESS.empty.body}</p>
          </div>
        ) : (
          assets.map((asset) => (
            <HarnessAssetCard
              asset={asset}
              key={asset.id}
              saveAction={saveHarnessAsset}
            />
          ))
        )}
      </section>
    </main>
  );
}
