import type { DocPageScope } from "@alrescha/core";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The doc pages as the screens read them (Phase 4 Wave D todo 20).
 *
 * Pure builders over stored rows, and a loader that runs as the signed-in
 * member so row security decides what is visible. The skeleton is trusted
 * field by field — a malformed citation drops itself, not the page — and
 * the prose is served only when its member digest is the page's current
 * one, the same conditional rule `apply_doc_page_prose` wrote it under
 * (보완 R-02).
 */

export interface DocPageRow {
  readonly anchor_node_id: string | null;
  readonly cited_node_ids: readonly string[] | null;
  readonly id: string;
  readonly member_digest: string;
  readonly member_paths: readonly string[] | null;
  readonly previous_slugs: readonly string[] | null;
  readonly repository_id: string;
  readonly scope: string;
  readonly skeleton: unknown;
  readonly slug: string;
  readonly source_commit_sha: string | null;
  readonly summary: string | null;
  readonly summary_member_digest: string | null;
  readonly title: string;
  readonly updated_at: string;
}

export interface DocPageCitationView {
  readonly kind: string;
  readonly nodeId: string;
  readonly path: string | null;
  readonly title: string;
}

export type DocPageProseState = "current" | "missing" | "stale";

export interface DocPageSummaryView {
  readonly id: string;
  readonly memberCount: number;
  readonly proseState: DocPageProseState;
  readonly scope: DocPageScope;
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface DocPageView extends DocPageSummaryView {
  readonly anchorNodeId: string | null;
  readonly citations: readonly DocPageCitationView[];
  readonly memberPaths: readonly string[];
  readonly previousSlugCount: number;
  readonly relations: readonly { readonly count: number; readonly relation: string }[];
  readonly sourceCommitSha: string | null;
  /** Present only when `proseState` is `current`; always `inferred`. */
  readonly summary: { readonly grade: "inferred"; readonly text: string } | null;
  readonly symbols: readonly string[];
}

const SCOPES: readonly DocPageScope[] = [
  "concept",
  "directory",
  "feature",
  "file",
  "module",
  "repo",
];

function scopeOf(value: string): DocPageScope | null {
  return (SCOPES as readonly string[]).includes(value)
    ? (value as DocPageScope)
    : null;
}

/**
 * Whether the stored prose describes the members as they are now. Missing
 * and stale are different sentences on the screen, so they are different
 * states here rather than one null.
 */
export function proseStateOf(row: {
  readonly member_digest: string;
  readonly summary: string | null;
  readonly summary_member_digest: string | null;
}): DocPageProseState {
  if (row.summary === null || row.summary.trim().length === 0) return "missing";
  return row.summary_member_digest === row.member_digest ? "current" : "stale";
}

export function docPageSummary(row: DocPageRow): DocPageSummaryView | null {
  const scope = scopeOf(row.scope);
  if (!scope) return null;
  return {
    id: row.id,
    memberCount: (row.member_paths ?? []).length,
    proseState: proseStateOf(row),
    scope,
    slug: row.slug,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function skeletonOf(value: unknown): {
  readonly citations: readonly DocPageCitationView[];
  readonly relations: readonly { readonly count: number; readonly relation: string }[];
  readonly symbols: readonly string[];
} {
  const skeleton =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const citations = Array.isArray(skeleton.citations)
    ? skeleton.citations.flatMap((entry) => {
        const citation = entry as Record<string, unknown>;
        return typeof citation?.nodeId === "string" &&
          typeof citation.title === "string" &&
          typeof citation.kind === "string"
          ? [
              {
                kind: citation.kind,
                nodeId: citation.nodeId,
                path: typeof citation.path === "string" ? citation.path : null,
                title: citation.title,
              },
            ]
          : [];
      })
    : [];
  const relations =
    typeof skeleton.relations === "object" &&
    skeleton.relations !== null &&
    !Array.isArray(skeleton.relations)
      ? Object.entries(skeleton.relations as Record<string, unknown>)
          .flatMap(([relation, count]) =>
            typeof count === "number" && Number.isFinite(count)
              ? [{ count, relation }]
              : [],
          )
          .sort(
            (left, right) =>
              right.count - left.count ||
              left.relation.localeCompare(right.relation),
          )
      : [];
  const symbols = Array.isArray(skeleton.symbols)
    ? skeleton.symbols.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  return { citations, relations, symbols };
}

export function docPageView(row: DocPageRow): DocPageView | null {
  const summary = docPageSummary(row);
  if (!summary) return null;
  const { citations, relations, symbols } = skeletonOf(row.skeleton);
  return {
    ...summary,
    anchorNodeId: row.anchor_node_id,
    citations,
    memberPaths: [...(row.member_paths ?? [])].sort(),
    previousSlugCount: (row.previous_slugs ?? []).length,
    relations,
    sourceCommitSha: row.source_commit_sha,
    summary:
      summary.proseState === "current" && row.summary
        ? { grade: "inferred", text: row.summary }
        : null,
    symbols,
  };
}

/** The list, newest first, scopes ordered so the repository leads. */
const SCOPE_ORDER: Readonly<Record<DocPageScope, number>> = {
  concept: 4,
  directory: 3,
  feature: 2,
  file: 5,
  module: 1,
  repo: 0,
};

export function docPageList(rows: readonly DocPageRow[]): DocPageSummaryView[] {
  return rows
    .flatMap((row) => {
      const view = docPageSummary(row);
      return view ? [view] : [];
    })
    .sort(
      (left, right) =>
        SCOPE_ORDER[left.scope] - SCOPE_ORDER[right.scope] ||
        left.title.localeCompare(right.title),
    );
}

const PAGE_COLUMNS =
  "id,repository_id,scope,slug,previous_slugs,anchor_node_id,title,member_paths,member_digest,skeleton,summary,summary_member_digest,cited_node_ids,source_commit_sha,updated_at";

async function workspaceIdFor(
  client: SupabaseClient,
  userId: string,
): Promise<string> {
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  return String(workspace.data.id);
}

export async function loadDocPageList(
  client: SupabaseClient,
  userId: string,
): Promise<{ pages: DocPageSummaryView[]; workspaceId: string }> {
  const workspaceId = await workspaceIdFor(client, userId);
  const rows = await client
    .from("doc_pages")
    .select(PAGE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (rows.error) throw new Error("Doc pages are unavailable.");
  return {
    pages: docPageList((rows.data ?? []) as unknown as DocPageRow[]),
    workspaceId,
  };
}

export type DocPageLookup =
  | { readonly kind: "found"; readonly page: DocPageView; readonly backlinks: readonly DocPageSummaryView[] }
  | { readonly kind: "moved"; readonly slug: string }
  | { readonly kind: "not-found" };

/**
 * One page by slug. An old slug — one the page answered to before its
 * shape changed — answers with the current one so the caller can redirect
 * rather than 404 a bookmark. Backlinks are the reverse lookup at read
 * time: pages whose `cited_node_ids` name this page's node.
 */
export async function loadDocPage(
  client: SupabaseClient,
  userId: string,
  slug: string,
): Promise<DocPageLookup> {
  const workspaceId = await workspaceIdFor(client, userId);
  const current = await client
    .from("doc_pages")
    .select(PAGE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();
  if (current.error) throw new Error("Doc pages are unavailable.");
  if (!current.data) {
    const moved = await client
      .from("doc_pages")
      .select("slug")
      .eq("workspace_id", workspaceId)
      .contains("previous_slugs", [slug])
      .limit(1)
      .maybeSingle();
    if (moved.error) throw new Error("Doc pages are unavailable.");
    return moved.data
      ? { kind: "moved", slug: String(moved.data.slug) }
      : { kind: "not-found" };
  }
  const page = docPageView(current.data as unknown as DocPageRow);
  if (!page) return { kind: "not-found" };
  const citing = await client
    .from("doc_pages")
    .select(PAGE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .contains("cited_node_ids", [page.anchorNodeId ?? page.id])
    .neq("id", page.id)
    .limit(100);
  if (citing.error) throw new Error("Doc pages are unavailable.");
  return {
    backlinks: docPageList((citing.data ?? []) as unknown as DocPageRow[]),
    kind: "found",
    page,
  };
}
