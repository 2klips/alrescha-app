import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BRAIN_AREAS,
  deriveArtifactFacets,
  deriveArtifactUnit,
  deriveBrainArea,
} from "../packages/core/src/ingest/artifact-facets";
import { scanRepository } from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";

describe("artifact facets (Phase 2D todo 4)", () => {
  it("classifies by the monorepo convention", () => {
    expect(
      deriveArtifactFacets(
        "apps/web/lib/auth/repository-access.ts",
        "code_metadata",
      ),
    ).toEqual({ domain: "frontend", page: null, unit: "code" });
    expect(
      deriveArtifactFacets(
        "packages/core/src/github/webhook.py",
        "code_metadata",
      ),
    ).toEqual({ domain: "backend", page: null, unit: "code" });
    expect(
      deriveArtifactFacets("apps/worker/src/queue.go", "code_metadata"),
    ).toEqual({ domain: "backend", page: null, unit: "code" });
  });

  it("derives the page facet from Next.js route files", () => {
    expect(
      deriveArtifactFacets("apps/web/app/commits/page.tsx", "code_metadata")
        .page,
    ).toBe("/commits");
    expect(
      deriveArtifactFacets("apps/web/app/page.tsx", "code_metadata").page,
    ).toBe("/");
    expect(
      deriveArtifactFacets(
        "apps/web/lib/overview/view-model.ts",
        "code_metadata",
      ).page,
    ).toBeNull();
  });

  it("keeps docs and tests as their own units", () => {
    expect(deriveArtifactFacets("spec/WORK_SPEC.md", "spec")).toEqual({
      domain: "shared",
      page: null,
      unit: "doc",
    });
    expect(deriveArtifactFacets("AGENTS.md", "agents").domain).toBe("shared");
    expect(
      deriveArtifactFacets("tests/auth-tenancy.test.ts", "code_metadata").unit,
    ).toBe("test");
  });

  it("never invents a domain outside the convention", () => {
    expect(
      deriveArtifactFacets("vendor/thing/lib.rb", "code_metadata").domain,
    ).toBe("unclassified");
  });

  it("is deterministic — the ADR-013 equivalence carrier", () => {
    const twice = [1, 2].map(() =>
      deriveArtifactFacets("apps/web/app/team/page.tsx", "code_metadata"),
    );
    expect(twice[0]).toEqual(twice[1]);
  });
});

/**
 * Phase 4 Wave A todo 4 — domains outside this monorepo's layout.
 *
 * The facet engine knew `apps/web/`, `apps/`, `packages/` and little else, so
 * a repository shaped like the one the target user actually has — a
 * `frontend/`, a `backend/` and a `db/` — collapsed into two bands with its
 * database silently filed under backend (R5 §1.3, §2.2 D5).
 */
describe("layout conventions beyond this repository", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));

  async function domainsOf(fixture: string) {
    const { commitSha, source } = await createLocalRepositorySource(
      resolve(repoRoot, fixture),
    );
    const plan = await scanRepository({ commitSha, source });
    const domains = new Map<string, string[]>();
    for (const artifact of plan.artifacts) {
      const { domain } = deriveArtifactFacets(
        artifact.path,
        artifact.classification,
      );
      domains.set(domain, [...(domains.get(domain) ?? []), artifact.path]);
    }
    return domains;
  }

  it("reads frontend, backend and database out of the three-tier fixture", async () => {
    const domains = await domainsOf("fixtures/layout-variants/next-fastapi");

    expect([...domains.keys()].sort()).toEqual([
      "backend",
      "database",
      "frontend",
      "shared",
    ]);
    // Nothing is left outside every convention…
    expect(domains.get("unclassified")).toBeUndefined();
    // …and each tier holds what its name says.
    expect(domains.get("database")).toEqual([
      "db/migrations/0001_init.sql",
      "db/schema.sql",
    ]);
    expect(
      domains.get("frontend")?.every((path) => path.startsWith("frontend/")),
    ).toBe(true);
    expect(
      domains.get("backend")?.every((path) => path.startsWith("backend/")),
    ).toBe(true);
    // `README.md` at the root is the repository's own, not a tier's.
    expect(domains.get("shared")).toEqual(["README.md"]);
  });

  it("keeps this monorepo's own conventions intact", async () => {
    const domains = await domainsOf(
      "fixtures/layout-variants/monorepo-aliases",
    );

    // The workspace fixture has no database tier, and every file lands in a
    // named domain rather than in `기타` — the root manifest is the
    // repository's own, which is what `shared` means.
    expect([...domains.keys()].sort()).toEqual([
      "backend",
      "frontend",
      "shared",
    ]);
    expect(domains.get("shared")).toEqual(["package.json"]);
    expect(
      domains.get("frontend")?.every((path) => path.startsWith("apps/web/")),
    ).toBe(true);
  });

  it("puts a schema file in the database domain wherever it sits", () => {
    expect(
      deriveArtifactFacets("supabase/migrations/x.sql", "schema").domain,
    ).toBe("database");
    expect(
      deriveArtifactFacets("apps/web/prisma/schema.prisma", "schema").domain,
    ).toBe("database");
    expect(deriveBrainArea("db/schema.sql", "schema")).toBe("database");
  });

  it("says `other` instead of quietly filing a stranger under backend", () => {
    // The silent absorption is the defect: a vendored Ruby library reading
    // as server code is worse than reading as unrecognised (R5 §2.2 D5).
    expect(
      deriveArtifactFacets("vendor/thing/lib.rb", "code_metadata").domain,
    ).toBe("unclassified");
    expect(deriveBrainArea("vendor/thing/lib.rb", "code_metadata")).toBe(
      "other",
    );
    expect(BRAIN_AREAS).toEqual([
      "frontend",
      "backend",
      "database",
      "docs",
      "tests",
      "other",
    ]);
  });

  it("lets a repository declare a layout the conventions do not know", () => {
    const layout = { backend: ["svc/"], frontend: ["ui-kit/"] };

    expect(
      deriveArtifactFacets("svc/orders/handler.ts", "code_metadata").domain,
    ).toBe("unclassified");
    expect(
      deriveArtifactFacets("svc/orders/handler.ts", "code_metadata", layout)
        .domain,
    ).toBe("backend");
    expect(
      deriveArtifactFacets("ui-kit/button.tsx", "code_metadata", layout).domain,
    ).toBe("frontend");
    // A declaration only adds: a path it does not mention keeps its
    // conventional domain.
    expect(
      deriveArtifactFacets("apps/web/lib/x.ts", "code_metadata", layout).domain,
    ).toBe("frontend");
  });
});

describe("artifact unit tags", () => {
  const unitOf = (
    path: string,
    classification: Parameters<typeof deriveArtifactUnit>[0]["classification"],
    symbols: string[] = [],
  ) =>
    deriveArtifactUnit({
      classification,
      exportedSymbols: symbols.map((name) => ({ name })),
      path,
    });

  it("names the role a file plays from its path and stored symbols", () => {
    expect(unitOf("apps/web/app/(shell)/map/page.tsx", "code_metadata")).toBe(
      "route",
    );
    expect(
      unitOf("apps/web/app/(shell)/harness/actions.ts", "code_metadata"),
    ).toBe("action");
    expect(
      unitOf("apps/web/app/ui/progress-dashboard.tsx", "code_metadata", [
        "ProgressDashboardView",
      ]),
    ).toBe("component");
    expect(unitOf("supabase/migrations/0001.sql", "schema")).toBe("schema");
    expect(unitOf("tests/workspace-map.test.ts", "code_metadata")).toBe("test");
    expect(unitOf("README.md", "doc")).toBe("doc");
    expect(
      unitOf("packages/core/src/ingest/doc-links.ts", "code_metadata"),
    ).toBe("lib");
  });

  it("needs a PascalCase export before it calls a file a component", () => {
    // The symbol names are metadata the scan stored; a `.tsx` file that
    // exports only helpers is a library file that happens to use JSX.
    expect(
      unitOf("apps/web/lib/format.tsx", "code_metadata", ["formatDate"]),
    ).toBe("lib");
    expect(unitOf("apps/web/lib/format.tsx", "code_metadata", ["Chip"])).toBe(
      "component",
    );
    expect(unitOf("apps/web/lib/format.ts", "code_metadata", ["Chip"])).toBe(
      "lib",
    );
  });

  it("is deterministic — the ADR-013 equivalence carrier", () => {
    const twice = [1, 2].map(() =>
      unitOf("apps/web/app/ui/card.tsx", "code_metadata", ["Card"]),
    );
    expect(twice[0]).toBe(twice[1]);
  });
});
