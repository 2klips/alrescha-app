import { DEMO_LIBRARY_ITEM } from "../../lib/library/demo";
import { LibraryBrowser } from "./library-browser";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function DemoLibraryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    query?: string | string[];
    saved?: string | string[];
    tag?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const saved = first(params.saved) === "1";
  return (
    <LibraryBrowser
      basePath="/library"
      deleteAction="/library"
      items={saved ? [DEMO_LIBRARY_ITEM] : []}
      persistentParams={saved ? { saved: "1" } : {}}
      query={first(params.query).slice(0, 200)}
      selectedTag={first(params.tag).trim().toLowerCase() || null}
    />
  );
}
