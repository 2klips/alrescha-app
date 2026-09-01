import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

function cssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const absolute = join(directory, name);
    return statSync(absolute).isDirectory()
      ? cssFiles(absolute)
      : name.endsWith(".css") && name !== "tokens.css"
        ? [absolute]
        : [];
  });
}

describe("Alrescha F4 core screen system", () => {
  test("core route components consume the shared page contract", () => {
    const files = [
      "apps/web/app/ui/overview-screen.tsx",
      "apps/web/app/ui/commit-cards.tsx",
      "apps/web/app/ui/assurance-workspace.tsx",
      "apps/web/app/ui/progress-dashboard.tsx",
      "apps/web/app/ui/library-browser.tsx",
      "apps/web/app/ui/inspection-view.tsx",
      "apps/web/app/ui/team-view.tsx",
      "apps/web/app/app/(shell)/home-screen.tsx",
      "apps/web/app/app/(shell)/harness/page.tsx",
      "apps/web/app/(shell)/harness/page.tsx",
      "apps/web/app/app/(shell)/stats/page.tsx",
      "apps/web/app/app/(shell)/settings/page.tsx",
      "apps/web/app/app/(shell)/settings/mcp/page.tsx",
      "apps/web/app/app/(shell)/settings/ai/page.tsx",
      "apps/web/app/app/(shell)/settings/privacy/page.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source, file).toMatch(/Product(?:Page|Section)Header/);
      expect(source, file).toContain("product-page");
    }
  });

  test("screen styles have zero active legacy palette consumers", () => {
    const legacy =
      /var\(--(?:bg|surface(?:-2)?|code-bg|line(?:-strong)?|text|muted|faint|accent(?:-text)?|verified(?:-text)?|inferred(?:-text)?|danger(?:-text)?|info(?:-text)?|panel(?:-soft)?|brand(?:-text)?|on-(?:brand|accent|verified))\)/g;
    const findings = cssFiles(join(ROOT, "apps/web/app/styles")).flatMap(
      (file) => {
        const source = readFileSync(file, "utf8");
        return [...source.matchAll(legacy)].map(
          (match) => `${file.replace(ROOT, "")}: ${match[0]}`,
        );
      },
    );

    expect(findings).toEqual([]);
  });

  test("the stored workspace graph has a non-overlay F4 compatibility grid", () => {
    const css = readFileSync(
      join(ROOT, "apps/web/app/styles/screens/map-hud.css"),
      "utf8",
    );
    expect(css).toContain('"rail plot inspector"');
    expect(css).toContain('"rail activity inspector"');
    expect(css).not.toContain(".arr-hud-channel");
    expect(css).not.toContain("backdrop-filter");
  });
});
