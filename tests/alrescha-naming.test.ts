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

  it("uses canonical identifiers without Arr aliases", () => {
    const instructions = source("apps/web/lib/mcp/instruction-blocks.ts");
    const index = source("packages/core/src/context/minimal-index.ts");
    const proposal = source("packages/core/src/context/index-pr-proposal.ts");
    const cliEnvironment = source("packages/cli/src/environment.ts");
    const mcpEnvironment = source("apps/web/lib/mcp/environment.ts");
    const cliPackage = JSON.parse(source("packages/cli/package.json")) as {
      bin: Record<string, string>;
    };

    expect(instructions).toContain("MCP server: alrescha");
    expect(instructions).toContain("<ALRESCHA_MCP_TOKEN>");
    expect(index).toContain("ALRESCHA_INDEX_BEGIN");
    expect(index).not.toContain("ARR_INDEX");
    expect(proposal).toContain("alrescha/minimal-index-");
    expect(cliEnvironment).not.toContain("ARR_SERVER_URL");
    expect(cliEnvironment).not.toContain("ARR_TOKEN");
    expect(mcpEnvironment).not.toContain("ARR_MCP_URL");
    expect(cliPackage.bin).toEqual({
      alrescha: "./dist/alrescha.js",
    });
  });
});
