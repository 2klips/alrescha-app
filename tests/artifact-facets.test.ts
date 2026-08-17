import { describe, expect, it } from "vitest";

import { deriveArtifactFacets } from "../packages/core/src/ingest/artifact-facets";

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
