import { cache } from "react";

import { getCurrentUserId } from "../auth/current-user";
import { createClient } from "../supabase/server";

/**
 * Data the AppShell's ContextStrip shows on every screen (WORK_SPEC §5:
 * 현재 레포 · 브랜치 · 마지막 분석 커밋 SHA(7) · 영수증 링크).
 */
export interface ShellContext {
  readonly repoName: string | null;
  readonly branch: string | null;
  /** First 7 chars of `repositories.last_scanned_commit_sha`; null = 분석 전. */
  readonly sha7: string | null;
  readonly receiptsHref: string;
}

/**
 * Live provider for the `/app` workspace tree.
 *
 * Wrapped in React `cache()` so the shell layout and any page loader that
 * needs the same lookup share one query pair per request. Returns null when
 * signed out or when no workspace exists yet — the strip renders a 레포 연결
 * CTA instead of failing the whole shell, unlike the page loaders that throw.
 */
export const getWorkspaceShellContext = cache(
  async (): Promise<ShellContext | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const supabase = await createClient();
    const workspace = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle();
    if (workspace.error || !workspace.data) return null;

    const repository = await supabase
      .from("repositories")
      .select("full_name,default_branch,last_scanned_commit_sha")
      .eq("workspace_id", workspace.data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const repo = repository.error ? null : repository.data;

    return {
      repoName: repo?.full_name ?? null,
      branch: repo?.default_branch ?? null,
      sha7: repo?.last_scanned_commit_sha
        ? repo.last_scanned_commit_sha.slice(0, 7)
        : null,
      // No live receipts surface exists yet; receipts appear as deltas on
      // /app/commits. Point there until /app/receipts ships.
      receiptsHref: "/app/commits",
    };
  },
);
