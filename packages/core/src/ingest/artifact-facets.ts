import type { ArtifactClassification } from "./repository-scanner";

/**
 * Data Brain facets (Phase 2D todo 4) — deterministic grouping derived from
 * fields every artifact already persists (path + classification). Derived at
 * read time on purpose: storing a copy could drift from the path, and the
 * same stored inputs trivially yield the same facets on both ingest paths
 * (ADR-013 equivalence). Nothing here is guessed — a path outside the
 * monorepo convention is `unclassified`, never invented.
 */

export type FacetDomain = "backend" | "frontend" | "shared" | "unclassified";
export type FacetUnit = "code" | "doc" | "file" | "test";

export interface ArtifactFacets {
  readonly domain: FacetDomain;
  /** Next.js route when the file is a route entry (`apps/web/app/**`). */
  readonly page: string | null;
  readonly unit: FacetUnit;
}

const DOC_CLASSIFICATIONS: readonly ArtifactClassification[] = [
  "adr",
  "agents",
  "claude",
  "cursor_rule",
  "skill",
  "spec",
  "todo_progress",
];

const ROUTE_FILE =
  /^apps\/web\/app\/(.*?)(?:^|\/)?(?:page|layout|route)\.(?:tsx?|jsx?)$/;

export function deriveArtifactFacets(
  path: string,
  classification: ArtifactClassification,
): ArtifactFacets {
  const isTest =
    /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/.test(
      path,
    );

  const domain: FacetDomain = path.startsWith("apps/web/")
    ? "frontend"
    : path.startsWith("apps/") || path.startsWith("packages/")
      ? "backend"
      : path.startsWith("spec/") ||
          path.startsWith("docs/") ||
          path.startsWith("tests/") ||
          !path.includes("/")
        ? "shared"
        : "unclassified";

  const routeMatch = ROUTE_FILE.exec(path);
  const page = routeMatch
    ? `/${(routeMatch[1] ?? "").replace(/\/$/, "")}`.replace(/\/{2,}/g, "/")
    : null;

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
 * The four areas the product groups knowledge by. Collapsing the two facets
 * into one axis here — rather than at each call site — is what makes the
 * overview's Data Brain zone and the graph's facet mode provably agree.
 */
export type BrainArea = "backend" | "docs" | "frontend" | "tests";

export const BRAIN_AREAS: readonly BrainArea[] = [
  "frontend",
  "backend",
  "docs",
  "tests",
];

export function deriveBrainArea(
  path: string,
  classification: ArtifactClassification,
): BrainArea {
  const { domain, unit } = deriveArtifactFacets(path, classification);
  if (unit === "test") return "tests";
  if (unit === "doc") return "docs";
  return domain === "frontend" ? "frontend" : "backend";
}
