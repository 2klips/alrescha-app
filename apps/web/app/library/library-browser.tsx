import { filterLibraryItems, type LibraryItem } from "@specproof/core";
import {
  Archive,
  ExternalLink,
  Fingerprint,
  Search,
  Tag,
  Trash2,
} from "lucide-react";

type DeleteAction = string | ((formData: FormData) => void | Promise<void>);

function filterHref(
  basePath: string,
  query: string,
  tag: string | null,
  persistentParams: Readonly<Record<string, string>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(persistentParams)) {
    params.set(key, value);
  }
  if (query) params.set("query", query);
  if (tag) params.set("tag", tag);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function sourceHref(item: LibraryItem): string {
  const path = item.source.path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${item.source.repository}/blob/${item.source.commitSha}/${path}`;
}

export function LibraryBrowser({
  basePath = "/app/library",
  deleteAction,
  items,
  persistentParams = {},
  query,
  selectedTag,
}: {
  readonly basePath?: "/app/library" | "/library";
  readonly deleteAction: DeleteAction;
  readonly items: readonly LibraryItem[];
  readonly persistentParams?: Readonly<Record<string, string>>;
  readonly query: string;
  readonly selectedTag: string | null;
}) {
  const filtered = filterLibraryItems(items, { query, tag: selectedTag });
  const allTags = [...new Set(items.flatMap((item) => item.tags))].sort();

  return (
    <main className="library-shell">
      <header className="library-hero">
        <div className="library-mark">
          <Archive aria-hidden="true" size={22} />
        </div>
        <div>
          <p>Workspace-wide · immutable snapshots</p>
          <h1>Personal library</h1>
          <span>
            Saved instructions stay pinned to exact source commits, even when
            the repository changes later.
          </span>
        </div>
        <strong>{items.length.toString().padStart(2, "0")} saved</strong>
      </header>

      <div className="library-layout">
        <aside className="library-filters" aria-label="Library filters">
          <form action={basePath} method="get">
            <label htmlFor="library-query">
              <Search aria-hidden="true" size={14} />
              Search snapshots
            </label>
            <div>
              <input
                defaultValue={query}
                id="library-query"
                name="query"
                placeholder="name, source, content"
                type="search"
              />
              {selectedTag ? (
                <input name="tag" type="hidden" value={selectedTag} />
              ) : null}
              {Object.entries(persistentParams).map(([key, value]) => (
                <input key={key} name={key} type="hidden" value={value} />
              ))}
              <button type="submit">Search</button>
            </div>
          </form>

          <nav aria-label="Filter by tag">
            <span>
              <Tag aria-hidden="true" size={13} />
              Tags
            </span>
            <a
              aria-current={selectedTag === null ? "page" : undefined}
              href={filterHref(basePath, query, null, persistentParams)}
            >
              All <small>{items.length}</small>
            </a>
            {allTags.map((tag) => (
              <a
                aria-current={selectedTag === tag ? "page" : undefined}
                href={filterHref(basePath, query, tag, persistentParams)}
                key={tag}
              >
                {tag}
                <small>
                  {items.filter((item) => item.tags.includes(tag)).length}
                </small>
              </a>
            ))}
          </nav>
        </aside>

        <section
          className="library-results"
          aria-labelledby="library-results-title"
        >
          <header>
            <div>
              <span>Snapshot ledger</span>
              <h2 id="library-results-title">
                {selectedTag ? `#${selectedTag}` : "All saved assets"}
              </h2>
            </div>
            <small>
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </small>
          </header>

          {filtered.length === 0 ? (
            <div className="library-empty">
              <Archive aria-hidden="true" size={20} />
              <h3>No matching snapshots</h3>
              <p>Clear the filters or save an instruction from the harness.</p>
              <a href="/harness">Open harness</a>
            </div>
          ) : (
            <div className="library-stack">
              {filtered.map((item) => (
                <article className="library-card" key={item.id}>
                  <div
                    className="library-digest-rail"
                    aria-label={`sha256: ${item.digest}`}
                  >
                    <Fingerprint aria-hidden="true" size={13} />
                    <code>sha256:{item.digest}</code>
                  </div>
                  <div className="library-card-body">
                    <header>
                      <div>
                        <span className={`library-type ${item.type}`}>
                          {item.type}
                        </span>
                        <h3>{item.name}</h3>
                      </div>
                      <time dateTime={item.createdAt}>
                        {item.createdAt.slice(0, 10)}
                      </time>
                    </header>
                    <a
                      className="library-provenance"
                      href={sourceHref(item)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <strong>{item.source.repository}</strong>
                      <code>{item.source.path}</code>
                      <code>{item.source.commitSha}</code>
                      <ExternalLink aria-hidden="true" size={13} />
                    </a>
                    <div className="library-tags">
                      {item.tags.map((tag) => (
                        <a
                          href={filterHref(basePath, query, tag, persistentParams)}
                          key={tag}
                        >
                          #{tag}
                        </a>
                      ))}
                    </div>
                    <details className="library-snapshot">
                      <summary>View immutable snapshot</summary>
                      <pre>{item.content}</pre>
                    </details>
                    <form action={deleteAction} className="library-delete-form">
                      <input name="itemId" type="hidden" value={item.id} />
                      <button type="submit">
                        <Trash2 aria-hidden="true" size={13} />
                        Delete snapshot
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
