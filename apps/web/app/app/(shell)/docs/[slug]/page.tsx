import { notFound, permanentRedirect, redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { loadDocPage } from "../../../../../lib/docs/doc-pages-report";
import { createClient } from "../../../../../lib/supabase/server";
import { DocPageScreen } from "../../../../ui/doc-pages";

export const dynamic = "force-dynamic";

/**
 * One doc page by slug (Phase 4 Wave D todo 20).
 *
 * A slug the page used to answer to redirects to the one it answers to now:
 * a module that gained a directory has a new address and is the same page,
 * and a bookmark should follow it rather than 404.
 */
export default async function WorkspaceDocPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const { slug } = await params;
  if (!/^[0-9a-f]{32}$/.test(slug)) notFound();

  const client = await createClient();
  const lookup = await loadDocPage(client, userId, slug);
  if (lookup.kind === "moved") permanentRedirect(`/app/docs/${lookup.slug}`);
  if (lookup.kind === "not-found") notFound();
  return (
    <DocPageScreen
      backlinks={lookup.backlinks}
      basePath="/app/docs"
      page={lookup.page}
    />
  );
}
