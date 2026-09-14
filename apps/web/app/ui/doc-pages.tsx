import { BookOpen, Link2 } from "lucide-react";
import Link from "next/link";

import type {
  DocPageSummaryView,
  DocPageView,
} from "../../lib/docs/doc-pages-report";
import { DOCS } from "../../lib/strings";
import { ProductPageHeader, ProductSectionHeader } from "./page-layout";
import { StatusBadge } from "./status-badge";
import { Icon } from "./ui-icon";

/**
 * The doc pages (Phase 4 Wave D todo 20): a list, and one page.
 *
 * Everything on a page but the prose is derived from stored rows and shown
 * as names and counts. The prose is a model's and sits under the inferred
 * badge; a page without current prose says which of the two absences it is.
 */

function PageRow({
  basePath,
  page,
}: {
  readonly basePath: string;
  readonly page: DocPageSummaryView;
}) {
  return (
    <li className="docs-row" data-scope={page.scope} data-prose={page.proseState}>
      <Link href={`${basePath}/${page.slug}`}>
        <span className="docs-scope">{DOCS.scopes[page.scope]}</span>
        <strong>{page.title}</strong>
      </Link>
      <small>
        {DOCS.members(page.memberCount)}
        {page.proseState === "current" ? (
          <StatusBadge grade="inferred" />
        ) : (
          <span className="docs-prose-absent">
            {DOCS.proseState[page.proseState]}
          </span>
        )}
      </small>
    </li>
  );
}

export function DocPageList({
  basePath,
  pages,
}: {
  readonly basePath: string;
  readonly pages: readonly DocPageSummaryView[];
}) {
  return (
    <main className="docs-main product-page" aria-label={DOCS.ariaMain}>
      <ProductPageHeader
        description={DOCS.lead}
        kicker={DOCS.kicker}
        title={DOCS.title}
      />
      {pages.length === 0 ? (
        <section className="docs-empty" data-testid="docs-empty">
          <Icon icon={BookOpen} size="md" />
          <h2>{DOCS.empty.title}</h2>
          <p>{DOCS.empty.body}</p>
        </section>
      ) : (
        <section className="docs-section" aria-labelledby="docs-list-title">
          <ProductSectionHeader
            count={DOCS.count(pages.length)}
            title={DOCS.title}
            titleId="docs-list-title"
          />
          <ul className="docs-list" data-testid="docs-list">
            {pages.map((page) => (
              <PageRow basePath={basePath} key={page.id} page={page} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export function DocPageScreen({
  backlinks,
  basePath,
  page,
}: {
  readonly backlinks: readonly DocPageSummaryView[];
  readonly basePath: string;
  readonly page: DocPageView;
}) {
  const copy = DOCS.page;
  return (
    <main
      className="docs-main product-page"
      aria-label={copy.kicker}
      data-prose={page.proseState}
      data-scope={page.scope}
      data-testid="doc-page"
    >
      <nav className="docs-back">
        <Link href={basePath}>{copy.back}</Link>
      </nav>
      <ProductPageHeader
        description={
          <span className="docs-meta">
            <span className="docs-scope">{DOCS.scopes[page.scope]}</span>
            <span>{DOCS.members(page.memberCount)}</span>
            {page.sourceCommitSha ? (
              <code>
                {copy.sourceCommit} {page.sourceCommitSha.slice(0, 7)}
              </code>
            ) : null}
            {page.previousSlugCount > 0 ? (
              <span>{copy.previousSlugs(page.previousSlugCount)}</span>
            ) : null}
          </span>
        }
        kicker={copy.kicker}
        title={page.title}
      />

      <section className="docs-section" aria-labelledby="doc-summary-title">
        <ProductSectionHeader
          title={copy.sections.summary}
          titleId="doc-summary-title"
        />
        {page.summary ? (
          <div className="docs-summary" data-testid="doc-page-summary">
            <StatusBadge grade={page.summary.grade} />
            <p>{page.summary.text}</p>
          </div>
        ) : (
          <p className="docs-prose-absent" data-testid="doc-page-summary">
            {DOCS.proseState[page.proseState === "stale" ? "stale" : "missing"]}
          </p>
        )}
      </section>

      <section className="docs-section" aria-labelledby="doc-members-title">
        <ProductSectionHeader
          count={DOCS.members(page.memberCount)}
          title={copy.sections.members}
          titleId="doc-members-title"
        />
        <ul className="docs-paths" data-testid="doc-page-members">
          {page.memberPaths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="docs-section" aria-labelledby="doc-symbols-title">
        <ProductSectionHeader
          title={copy.sections.symbols}
          titleId="doc-symbols-title"
        />
        {page.symbols.length === 0 ? (
          <p className="docs-empty-line">{copy.symbolsEmpty}</p>
        ) : (
          <ul className="docs-chips" data-testid="doc-page-symbols">
            {page.symbols.map((symbol) => (
              <li key={symbol}>
                <code>{symbol}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="docs-section" aria-labelledby="doc-relations-title">
        <ProductSectionHeader
          title={copy.sections.relations}
          titleId="doc-relations-title"
        />
        {page.relations.length === 0 ? (
          <p className="docs-empty-line">{copy.relationsEmpty}</p>
        ) : (
          <ul className="docs-chips" data-testid="doc-page-relations">
            {page.relations.map((entry) => (
              <li key={entry.relation}>
                {copy.relationCount(entry.relation, entry.count)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="docs-section" aria-labelledby="doc-citations-title">
        <ProductSectionHeader
          title={copy.sections.citations}
          titleId="doc-citations-title"
        />
        {page.citations.length === 0 ? (
          <p className="docs-empty-line">{copy.citationsEmpty}</p>
        ) : (
          <ul className="docs-citations" data-testid="doc-page-citations">
            {page.citations.map((citation) => (
              <li key={citation.nodeId}>
                <span className="docs-scope">{citation.kind}</span>
                <strong>{citation.title}</strong>
                {citation.path ? <code>{citation.path}</code> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="docs-section" aria-labelledby="doc-backlinks-title">
        <ProductSectionHeader
          title={copy.sections.backlinks}
          titleId="doc-backlinks-title"
        />
        {backlinks.length === 0 ? (
          <p className="docs-empty-line">
            <Icon icon={Link2} size="xs" />
            {copy.backlinksEmpty}
          </p>
        ) : (
          <ul className="docs-list" data-testid="doc-page-backlinks">
            {backlinks.map((entry) => (
              <PageRow basePath={basePath} key={entry.id} page={entry} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
