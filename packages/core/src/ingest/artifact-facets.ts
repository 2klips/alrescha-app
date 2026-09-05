import { isTestPath } from "./path-conventions";
import type { ArtifactClassification } from "./repository-scanner";

/**
 * Data Brain facets (Phase 2D todo 4, widened in Phase 4 Wave A todo 4) —
 * deterministic grouping derived from fields every artifact already
 * persists (path + classification + the symbols the scan stored). Derived at
 * read time on purpose: storing a copy could drift from the path, and the
 * same stored inputs trivially yield the same facets on both ingest paths
 * (ADR-013 equivalence). Nothing here is guessed — a path outside every
 * convention is `unclassified`, and it now *says so* on screen rather than
 * being absorbed into backend (R5 §2.2 D5).
 *
 * A repository whose layout is not this one states its own in
 * `.alrescha.json`; the conventions below are what a repository gets for
 * saying nothing.
 */

export type FacetDomain =
  "backend" | "database" | "frontend" | "shared" | "unclassified";
export type FacetUnit = "code" | "doc" | "file" | "test";

/**
 * The finer axis the graph tags nodes with (R5 §2.4): shape and filter, not
 * a node kind. Deliberately seven values — anything that is not one of the six
 * recognisable roles is a library file, and saying so is more useful than
 * inventing a role for it.
 */
export type ArtifactUnit =
  "action" | "component" | "doc" | "lib" | "route" | "schema" | "test";

export interface ArtifactFacets {
  readonly domain: FacetDomain;
  /** Next.js/Remix-style route when the file is a route entry. */
  readonly page: string | null;
  readonly unit: FacetUnit;
}

/**
 * Path prefixes a repository declares for itself, from `.alrescha.json`.
 * Checked before the built-in conventions, so a repository that calls its
 * server `svc/` is not permanently `기타`.
 */
export interface LayoutConventions {
  readonly backend?: readonly string[];
  readonly database?: readonly string[];
  readonly frontend?: readonly string[];
  readonly shared?: readonly string[];
}

const DOC_CLASSIFICATIONS: readonly ArtifactClassification[] = [
  "adr",
  "agents",
  "claude",
  "cursor_rule",
  // Phase 4 Wave A todo 2: a README is prose in the graph, so it groups with
  // the specs even though the rules do not reason about it.
  "doc",
  "skill",
  "spec",
  "todo_progress",
];

/**
 * Built-in layout conventions, most specific first. `apps/web/` has to beat
 * `apps/` or this repository's own front end would read as backend.
 */
const DOMAIN_CONVENTIONS: readonly {
  readonly domain: FacetDomain;
  readonly prefixes: readonly string[];
}[] = [
  {
    domain: "database",
    prefixes: [
      "db/",
      "database/",
      "drizzle/",
      "migrations/",
      "prisma/",
      "supabase/",
    ],
  },
  {
    domain: "frontend",
    prefixes: [
      "apps/web/",
      "client/",
      "frontend/",
      "src/app/",
      "src/pages/",
      "ui/",
      "web/",
      "www/",
    ],
  },
  {
    domain: "backend",
    prefixes: [
      "api/",
      "apps/",
      "backend/",
      "cmd/",
      "packages/",
      "server/",
      "services/",
      "srv/",
      "worker/",
    ],
  },
  {
    // `src/` is the repository's own code without saying which tier it
    // belongs to — a single-app project keeps everything there. Calling it
    // `shared` states the convention; calling it `unclassified` would put a
    // whole repository in `기타`, which is a worse answer than a plain one.
    domain: "shared",
    prefixes: [
      "docs/",
      "internal/",
      "lib/",
      "spec/",
      "specs/",
      "src/",
      "test/",
      "tests/",
    ],
  },
];

/**
 * A route entry, anywhere a project keeps one: `app/**` and `pages/**` are
 * the two conventions, and neither is tied to this repository's layout.
 */
const APP_ROUTE_FILE =
  /(?:^|\/)app\/(.*?)(?:^|\/)?(?:page|layout|route)\.(?:[cm]?[jt]sx?)$/;
/** The pages router: every file under `pages/` is a URL, `index` included. */
const PAGES_ROUTE_FILE = /(?:^|\/)pages\/(.+)\.(?:[cm]?[jt]sx?)$/;
/** Framework entry points that are not URLs of their own. */
const PAGES_NON_ROUTE = /(?:^|\/)_(?:app|document|middleware|error)$/;
/** Next.js route groups — `(shell)` is organisation, not a URL segment. */
const ROUTE_GROUP = /\([^/]*\)/g;
/** Server actions, by the two conventions that do not need a file body. */
const ACTION_FILE = /(?:^|\/)actions?\/|(?:^|\/)[\w.-]*actions?\.[cm]?[jt]sx?$/;
const COMPONENT_FILE = /\.[cm]?[jt]sx$/;
const PASCAL_CASE = /^[A-Z][A-Za-z\d]*$/;

function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix),
  );
}

function declaredDomain(
  path: string,
  layout: LayoutConventions | undefined,
): FacetDomain | null {
  if (!layout) return null;
  for (const domain of ["database", "frontend", "backend", "shared"] as const) {
    const prefixes = layout[domain];
    if (prefixes && prefixes.length > 0 && matchesPrefix(path, prefixes)) {
      return domain;
    }
  }
  return null;
}

function routePath(path: string): string | null {
  const appMatch = APP_ROUTE_FILE.exec(path);
  const pagesMatch = appMatch ? null : PAGES_ROUTE_FILE.exec(path);
  if (!appMatch && !pagesMatch) return null;
  const raw = (appMatch?.[1] ?? pagesMatch?.[1] ?? "").replace(/\/?index$/, "");
  if (pagesMatch && PAGES_NON_ROUTE.test(`/${raw}`)) return null;
  const segments = raw
    .replace(ROUTE_GROUP, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}

export function deriveArtifactFacets(
  path: string,
  classification: ArtifactClassification,
  layout?: LayoutConventions,
): ArtifactFacets {
  const isTest = isTestPath(path);

  const declared = declaredDomain(path, layout);
  const domain: FacetDomain =
    declared ??
    // A schema file is database wherever it lives: `schema.prisma` in the
    // app directory is still the database.
    (classification === "schema"
      ? "database"
      : (DOMAIN_CONVENTIONS.find(({ prefixes }) =>
          matchesPrefix(path, prefixes),
        )?.domain ?? (path.includes("/") ? "unclassified" : "shared")));

  const page = routePath(path);

  const unit: FacetUnit = isTest
    ? "test"
    : DOC_CLASSIFICATIONS.includes(classification)
      ? "doc"
      : classification === "code_metadata"
        ? "code"
        : "file";

  return { domain, page, unit };
}

/**
 * The node's `unit` tag (R5 §2.4): what shape it takes and which filter chip
 * it answers to. Read from the path and from the symbol names the scan
 * already stored — never from a file body, and never from a symbol's
 * signature (WORK_SPEC §3-3).
 */
export function deriveArtifactUnit(input: {
  readonly classification: ArtifactClassification;
  readonly exportedSymbols?: readonly { readonly name: string }[];
  readonly path: string;
}): ArtifactUnit {
  const { classification, path } = input;
  if (isTestPath(path)) return "test";
  if (DOC_CLASSIFICATIONS.includes(classification)) return "doc";
  if (classification === "schema") return "schema";
  if (routePath(path) !== null) return "route";
  if (ACTION_FILE.test(path)) return "action";
  // A component is a JSX file exporting something PascalCase. The symbol
  // names are metadata the scan stored; nothing here reads the file.
  if (
    COMPONENT_FILE.test(path) &&
    (input.exportedSymbols ?? []).some(({ name }) => PASCAL_CASE.test(name))
  ) {
    return "component";
  }
  return "lib";
}

/**
 * The areas the product groups knowledge by — the colour axis of the graph
 * (R5 §2.6). Collapsing the two facets into one axis here, rather than at
 * each call site, is what makes the overview's Data Brain zone and the
 * graph's facet mode provably agree.
 *
 * `other` is the honest name for "outside every convention this repository
 * declared". It used to be silently folded into backend, which is how a
 * vendored directory came to look like server code (R5 §2.2 D5).
 */
export type BrainArea =
  "backend" | "database" | "docs" | "frontend" | "other" | "tests";

export const BRAIN_AREAS: readonly BrainArea[] = [
  "frontend",
  "backend",
  "database",
  "docs",
  "tests",
  "other",
];

export function deriveBrainArea(
  path: string,
  classification: ArtifactClassification,
  layout?: LayoutConventions,
): BrainArea {
  const { domain, unit } = deriveArtifactFacets(path, classification, layout);
  if (unit === "test") return "tests";
  if (unit === "doc") return "docs";
  if (domain === "database") return "database";
  if (domain === "frontend") return "frontend";
  // `shared` is the repository's own root and its cross-cutting directories:
  // server-side by default, and never `other`, which means "unrecognised".
  return domain === "unclassified" ? "other" : "backend";
}
