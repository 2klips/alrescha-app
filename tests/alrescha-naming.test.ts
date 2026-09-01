import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PRODUCT_SURFACES = [
  "README.md",
  "apps/web/app/layout.tsx",
  "apps/web/lib/mcp/instruction-blocks.ts",
  "apps/web/lib/strings/common.ts",
  "apps/web/lib/strings/terms.ts",
  "docs/DEPLOYMENT_RUNBOOK.md",
  "docs/PILOT_RECRUITMENT.md",
  "docs/PRIVACY.md",
  "docs/design-tokens.md",
  "packages/core/src/context/index-pr-proposal.ts",
  "packages/core/src/context/minimal-index.ts",
  "packages/core/src/enrich/prose-summary.ts",
  "packages/core/src/inspection/dependency-audit.ts",
] as const;

const LEGACY_PRODUCT_NAME =
  /(?<![A-Za-z])(?:Arr|Alresca|SpecProof)(?![A-Za-z])/;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Alrescha naming migration", () => {
  it.each(PRODUCT_SURFACES)(
    "%s has no legacy user-facing product name",
    (path) => {
      expect(source(path).match(LEGACY_PRODUCT_NAME)).toBeNull();
    },
  );

  it("retains compatibility-sensitive identifiers", () => {
    const instructions = source("apps/web/lib/mcp/instruction-blocks.ts");
    const index = source("packages/core/src/context/minimal-index.ts");
    const proposal = source("packages/core/src/context/index-pr-proposal.ts");

    expect(instructions).toContain("MCP server: arr");
    expect(instructions).toContain("<ARR_MCP_TOKEN>");
    expect(index).toContain("ARR_INDEX_BEGIN");
    expect(index).toContain("ARR_INDEX_END");
    expect(proposal).toContain("arr/minimal-index-");
  });
});
