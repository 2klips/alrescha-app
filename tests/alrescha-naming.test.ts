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

  it("uses canonical identifiers and keeps explicit legacy read aliases", () => {
    const instructions = source("apps/web/lib/mcp/instruction-blocks.ts");
    const index = source("packages/core/src/context/minimal-index.ts");
    const proposal = source("packages/core/src/context/index-pr-proposal.ts");
    const cliEnvironment = source("packages/cli/src/environment.ts");
    const theme = source("apps/web/lib/theme/theme-preference.ts");
    const cliPackage = JSON.parse(source("packages/cli/package.json")) as {
      bin: Record<string, string>;
    };

    expect(instructions).toContain("MCP server: alrescha");
    expect(instructions).toContain("<ALRESCHA_MCP_TOKEN>");
    expect(index).toContain("ALRESCHA_INDEX_BEGIN");
    expect(index).toContain("LEGACY_ARR_INDEX_BEGIN");
    expect(proposal).toContain("alrescha/minimal-index-");
    expect(cliEnvironment).toContain('environment["ARR_SERVER_URL"]');
    expect(cliEnvironment).toContain('environment["ARR_TOKEN"]');
    expect(theme).toContain('LEGACY_THEME_STORAGE_KEY = "arr-theme"');
    expect(cliPackage.bin).toEqual({
      alrescha: "./dist/alrescha.js",
      arr: "./dist/alrescha.js",
    });
  });
});
