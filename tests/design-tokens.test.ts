import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import { describe, expect, test } from "vitest";

import {
  DESIGN_TOKENS,
  FONT_TOKENS,
  NODE_TOKENS,
  SCALE_TOKENS,
  THEMES,
  cssVariableName,
  toRendererColor,
  tokenVar,
} from "../apps/web/lib/theme/tokens";
import noHardcodedHex, {
  isHexColorLiteral,
} from "../tools/eslint-rules/no-hardcoded-hex.js";
import {
  noAdhocFontSize,
  noAdhocRadius,
} from "../tools/eslint-rules/no-adhoc-scale.js";

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

/**
 * WCAG 2.2 relative luminance / contrast, computed straight from tokens.css.
 *
 * The axe-core run in `tests/e2e/a11y-contrast.spec.ts` is the real audit — it
 * sees what is actually painted. This is its cheap, browserless companion: it
 * fails the moment a *token* stops being AA-legible on some surface, without
 * waiting for a screen to happen to use that pairing.
 */
function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : value;
  const channels = [0, 2, 4].map((offset) => {
    const part = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] as number) +
    0.7152 * (channels[1] as number) +
    0.0722 * (channels[2] as number)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

describe("token contrast (WCAG 2.2 AA — Phase 2A todo 9)", () => {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const rootBlock = extractBlock(css, ":root");
  const lightBlock = extractBlock(css, '[data-theme="light"]');

  /** Resolve `--x` to a literal hex, following `var()` aliases. */
  function resolve(name: string, theme: "dark" | "light"): string {
    const blocks = theme === "dark" ? [rootBlock] : [lightBlock, rootBlock];
    for (const block of blocks) {
      const match = block.match(
        new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8}|var\\(--[a-z0-9-]+\\));`),
      );
      if (!match) continue;
      const value = match[1] as string;
      return value.startsWith("var(")
        ? resolve(value.slice(4, -1), theme)
        : value;
    }
    throw new Error(`${name} is not declared for the ${theme} theme`);
  }

  /** Every surface a token-coloured string of text can land on. */
  const SURFACES = ["--bg", "--surface", "--surface-2", "--code-bg"] as const;

  /** Tokens that paint text. AA body text needs 4.5:1. */
  const TEXT_TOKENS = [
    "--text",
    "--muted",
    "--faint",
    "--brand-text",
    "--verified-text",
    "--inferred-text",
    "--info-text",
    // Design roadmap step 1: --danger split from --brand into its own
    // literal; its -text sibling aliases it, so it must clear AA itself.
    "--danger-text",
  ] as const;

  test.each(THEMES)("%s: every text token clears 4.5:1 everywhere", (theme) => {
    const failures: string[] = [];
    for (const token of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        const ratio = contrastRatio(
          resolve(token, theme),
          resolve(surface, theme),
        );
        if (ratio < 4.5)
          failures.push(`${token} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  test.each(THEMES)("%s: the text ramp stays ordered", (theme) => {
    const on = (token: string) =>
      contrastRatio(resolve(token, theme), resolve("--surface", theme));
    // Emphasis must still read as emphasis after the AA correction.
    expect(on("--text")).toBeGreaterThan(on("--muted"));
    expect(on("--muted")).toBeGreaterThan(on("--faint"));
  });

  test.each(THEMES)(
    "%s: filled controls stay legible on their fill",
    (theme) => {
      expect(
        contrastRatio(resolve("--on-brand", theme), resolve("--brand", theme)),
      ).toBeGreaterThan(3);
      expect(
        contrastRatio(
          resolve("--on-verified", theme),
          resolve("--verified", theme),
        ),
      ).toBeGreaterThan(3);
    },
  );

  test("the ratio calculation itself is calibrated", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("scale tokens (design direction roadmap step 1)", () => {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const rootBlock = extractBlock(css, ":root");
  const rootTokens = declaredTokens(rootBlock);

  test("every scale token is declared in :root", () => {
    const missing = SCALE_TOKENS.filter(
      (token) => !rootTokens.has(cssVariableName(token)),
    );
    expect(missing).toEqual([]);
  });

  test("mono metadata floors at 11px", () => {
    // 0.6875rem = 11px — below this the AA colour work stops mattering.
    expect(rootBlock).toMatch(/--text-2xs:\s*0\.6875rem/);
  });

  test("the z ladder stays ordered", () => {
    const ladder = [
      "z-canvas",
      "z-hud",
      "z-sidebar",
      "z-popover",
      "z-modal",
      "z-toast",
    ].map((token) => {
      const match = new RegExp(`--${token}:\\s*(\\d+)`).exec(rootBlock);
      expect(match, `--${token} must be a bare number`).not.toBeNull();
      return Number((match as RegExpExecArray)[1]);
    });
    expect([...ladder].sort((first, second) => first - second)).toEqual(ladder);
  });

  test("danger is its own literal, split from the brand seal", () => {
    expect(rootBlock).toMatch(/--danger:\s*#[0-9a-fA-F]{6}/);
    expect(rootBlock).toMatch(/--danger-text:\s*var\(--danger\)/);
    expect(rootBlock).not.toMatch(/--danger:\s*var\(--brand\)/);
  });
});

describe("scale adoption ratchet (design roadmap step 3)", () => {
  // Existing ad-hoc sizes migrate screen by screen in step 4 — this ratchet
  // only forbids NEW debt. When a migration lands, lower the ceiling to the
  // new count; never raise it.
  const FONT_SIZE_ADHOC_CEILING = 51;
  const RADIUS_ADHOC_CEILING = 4;

  const globalsCss = readFileSync(
    join(repoRoot, "apps/web/app/globals.css"),
    "utf8",
  );

  function adhocFontSizes(): string[] {
    return [...globalsCss.matchAll(/font-size:\s*([^;]+);/g)]
      .map((match) => (match[1] as string).trim())
      .filter((value) => !value.startsWith("var(--text-"));
  }

  function adhocRadii(): string[] {
    return [...globalsCss.matchAll(/border-radius:\s*([^;]+);/g)]
      .map((match) => (match[1] as string).trim())
      .filter(
        (value) =>
          !value.startsWith("var(--radius-") &&
          value !== "0" &&
          // 50% (circles) and 25% (the document node-type swatch) are shape
          // encodings, not chrome radii — outside the radius-token vocabulary.
          value !== "50%" &&
          value !== "25%",
      );
  }

  test("ad-hoc font-size declarations in globals.css only ever shrink", () => {
    expect(adhocFontSizes().length).toBeLessThanOrEqual(
      FONT_SIZE_ADHOC_CEILING,
    );
  });

  test("ad-hoc border-radius declarations in globals.css only ever shrink", () => {
    expect(adhocRadii().length).toBeLessThanOrEqual(RADIUS_ADHOC_CEILING);
  });

  test("the primitives themselves are fully on the scale", () => {
    const section = globalsCss.slice(
      globalsCss.indexOf("Design roadmap step 3 — primitives"),
    );
    expect(section).not.toBe("");
    for (const match of section.matchAll(/font-size:\s*([^;]+);/g)) {
      expect((match[1] as string).trim()).toMatch(/^var\(--text-/);
    }
    for (const match of section.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect((match[1] as string).trim()).toMatch(/^var\(--radius-/);
    }
  });
});

describe("arr/no-adhoc-font-size + arr/no-adhoc-radius eslint rules", () => {
  const ruleTester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });

  test("inline style scale rules pass tokens and report ad-hoc values", () => {
    ruleTester.run("no-adhoc-font-size", noAdhocFontSize, {
      valid: [
        { code: '<div style={{ fontSize: "var(--text-sm)" }} />' },
        // Non-JSX objects (e.g. Pixi canvas text styles) are out of scope.
        { code: "const style = { fontSize: 11 };" },
        { code: "<div style={{ fontSize: dynamic }} />" },
      ],
      invalid: [
        {
          code: '<div style={{ fontSize: "0.53rem" }} />',
          errors: [{ messageId: "adhocFontSize" }],
        },
        {
          code: "<div style={{ fontSize: 12 }} />",
          errors: [{ messageId: "adhocFontSize" }],
        },
      ],
    });

    ruleTester.run("no-adhoc-radius", noAdhocRadius, {
      valid: [
        { code: '<div style={{ borderRadius: "var(--radius-pill)" }} />' },
        { code: "<div style={{ borderRadius: 0 }} />" },
      ],
      invalid: [
        {
          code: '<div style={{ borderRadius: "999px" }} />',
          errors: [{ messageId: "adhocRadius" }],
        },
      ],
    });
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
