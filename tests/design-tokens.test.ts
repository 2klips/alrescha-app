import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import { describe, expect, test } from "vitest";

import {
  DESIGN_TOKENS,
  FONT_TOKENS,
  NODE_TOKENS,
  THEMES,
  cssVariableName,
  toRendererColor,
  tokenVar,
} from "../apps/web/lib/theme/tokens";
import noHardcodedHex, {
  isHexColorLiteral,
} from "../tools/eslint-rules/no-hardcoded-hex.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const TOKENS_CSS = join(repoRoot, "apps/web/app/styles/tokens.css");

/** The only places a literal colour may appear (ADR-009-3 / Phase 2A todo 1). */
const COLOR_LITERAL_ALLOWLIST = [
  "apps/web/app/styles/tokens.css",
  // The gate's own spec: it must name colours to prove it detects them.
  "tests/design-tokens.test.ts",
  "fixtures/design/hardcoded-hex-sample.css",
];

const SCAN_ROOTS = ["apps", "packages", "tests", "tools", "scripts"];
const SCAN_EXTENSIONS = [".css", ".ts", ".tsx"];
const SKIP_DIRECTORIES = new Set([
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const HEX_COLOR_IN_CSS = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

interface ColorFinding {
  file: string;
  line: number;
  value: string;
}

function listFiles(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(name)) continue;
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) {
      entries.push(...listFiles(absolute));
      continue;
    }
    if (SCAN_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      entries.push(absolute);
    }
  }
  return entries;
}

/**
 * Reports every literal colour in a file. TS/TSX are matched on whole string
 * literals only so that copy such as "issue (#8721)" is not a false positive;
 * stylesheets are matched anywhere because every hex there is a colour.
 */
function findColorLiterals(absolutePath: string): ColorFinding[] {
  const relativePath = relative(repoRoot, absolutePath).split(sep).join("/");
  const source = readFileSync(absolutePath, "utf8");
  const findings: ColorFinding[] = [];
  const isStylesheet = relativePath.endsWith(".css");

  source.split(/\r?\n/).forEach((text, index) => {
    if (isStylesheet) {
      for (const match of text.matchAll(HEX_COLOR_IN_CSS)) {
        findings.push({ file: relativePath, line: index + 1, value: match[0] });
      }
      return;
    }
    for (const match of text.matchAll(/["'`]([^"'`]*)["'`]/g)) {
      const value = match[1] ?? "";
      if (isHexColorLiteral(value)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          value: value.trim(),
        });
      }
    }
  });

  return findings;
}

function scanRepository(): ColorFinding[] {
  const findings: ColorFinding[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of listFiles(join(repoRoot, root))) {
      const relativePath = relative(repoRoot, file).split(sep).join("/");
      if (COLOR_LITERAL_ALLOWLIST.includes(relativePath)) continue;
      findings.push(...findColorLiterals(file));
    }
  }
  return findings;
}

function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block missing from tokens.css`).toBeGreaterThan(
    -1,
  );
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

function declaredTokens(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(
      (match) => match[1] as string,
    ),
  );
}

describe("ink & seal tokens (ADR-009-3)", () => {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const rootBlock = extractBlock(css, ":root");
  const lightBlock = extractBlock(css, '[data-theme="light"]');
  const rootTokens = declaredTokens(rootBlock);
  const lightTokens = declaredTokens(lightBlock);

  test("dark is the default theme and light is opt-in", () => {
    expect(css.indexOf(":root {")).toBeLessThan(
      css.indexOf('[data-theme="light"] {'),
    );
    expect(rootBlock).toContain("color-scheme: dark");
    expect(lightBlock).toContain("color-scheme: light");
  });

  test.each(THEMES)(
    "every semantic token resolves in the %s theme",
    (theme) => {
      const missing = DESIGN_TOKENS.filter((token) => {
        const name = cssVariableName(token);
        // Light inherits from :root unless it overrides — both count as defined.
        return theme === "dark"
          ? !rootTokens.has(name)
          : !rootTokens.has(name) && !lightTokens.has(name);
      });
      expect(missing).toEqual([]);
    },
  );

  test("the light theme overrides every colour that must change on paper", () => {
    const mustDiffer = [
      "--bg",
      "--surface",
      "--line",
      "--text",
      "--muted",
      "--brand",
      "--verified",
      "--inferred",
      "--info",
    ];
    expect(mustDiffer.filter((name) => !lightTokens.has(name))).toEqual([]);
  });

  test("node type colours are aliases of the shared palette, not new colours", () => {
    for (const token of NODE_TOKENS) {
      const declaration = new RegExp(
        `${cssVariableName(token)}:\\s*var\\(--[a-z-]+\\);`,
      );
      expect(rootBlock).toMatch(declaration);
    }
  });

  test("typography tokens name only Pretendard and IBM Plex Mono", () => {
    expect(rootBlock).toContain("Pretendard Variable");
    expect(rootBlock).toContain("IBM Plex Mono");
    for (const token of FONT_TOKENS) {
      expect(rootTokens.has(cssVariableName(token))).toBe(true);
    }
  });

  test("fallback faces carry measured metric overrides and swap", () => {
    // Measured from the shipped woff2 (see .omo/evidence/phase2a/task-1.md):
    // Pretendard 1950/2048 = 95.215%, 494/2048 = 24.121%; Plex Mono 1025/1000.
    expect(css).toContain("ascent-override: 95.215%");
    expect(css).toContain("descent-override: 24.121%");
    expect(css).toContain("ascent-override: 102.5%");
    expect(css).toContain("descent-override: 27.5%");
    expect(css.match(/line-gap-override: 0%/g)).toHaveLength(2);
    expect(css.match(/font-display: swap/g)).toHaveLength(2);
  });

  test("tokenVar produces the var() form components must use", () => {
    expect(tokenVar("verified")).toBe("var(--verified)");
  });
});

describe("hardcoded colour gate", () => {
  test("the codebase contains no colour literals outside the tokens file", () => {
    const findings = scanRepository().map(
      (finding) => `${finding.file}:${finding.line} ${finding.value}`,
    );
    expect(findings).toEqual([]);
  });

  test("the scanner fails on the seeded violation fixture", () => {
    const findings = findColorLiterals(
      join(repoRoot, "fixtures/design/hardcoded-hex-sample.css"),
    );
    expect(findings.map((finding) => finding.value)).toEqual([
      "#123456",
      "#fff",
    ]);
  });

  test("issue references and shas in copy are not treated as colours", () => {
    expect(isHexColorLiteral("#8721")).toBe(false);
    expect(isHexColorLiteral("Fetched test results (#8721)")).toBe(false);
    expect(isHexColorLiteral("#3ddc97")).toBe(true);
  });
});

describe("arr/no-hardcoded-hex eslint rule", () => {
  const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  });

  test("passes tokenized code and reports seeded violations", () => {
    ruleTester.run("no-hardcoded-hex", noHardcodedHex, {
      valid: [
        { code: 'const stroke = "var(--verified)";' },
        { code: 'const label = "resolved in #4821";' },
        { code: "const sha = `#${commit}`;" },
      ],
      invalid: [
        {
          code: 'const stroke = "#3ddc97";',
          errors: [{ messageId: "hardcodedHex" }],
        },
        {
          code: "const fill = `#0b0e14`;",
          errors: [{ messageId: "hardcodedHex" }],
        },
      ],
    });
  });
});

describe("renderer palette accessor", () => {
  test("converts the computed forms Pixi needs", () => {
    expect(toRendererColor("#3ddc97")).toBe(0x3ddc97);
    expect(toRendererColor("#fff")).toBe(0xffffff);
    expect(toRendererColor("rgb(61, 220, 151)")).toBe(0x3ddc97);
    expect(toRendererColor("rgba(11 14 20 / 0.9)")).toBe(0x0b0e14);
  });

  test("returns null instead of guessing an unknown colour form", () => {
    expect(
      toRendererColor("color-mix(in srgb, var(--accent) 40%, transparent)"),
    ).toBeNull();
    expect(toRendererColor("")).toBeNull();
  });
});
