import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import * as ASSURANCE_MODULE from "../apps/web/lib/strings/assurance";
import * as COMMON_MODULE from "../apps/web/lib/strings/common";
import * as DASHBOARD_MODULE from "../apps/web/lib/strings/dashboard";
import * as PROGRESS_MODULE from "../apps/web/lib/strings/progress";
import { CONVENTIONAL_ENGLISH_TERMS } from "../apps/web/lib/strings/terms";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Screens whose copy already comes from `lib/strings` (Phase 2A todo 3).
 * These are checked for stray literals on every run.
 */
const CONVERTED_SCREENS = [
  "apps/web/app/ui/brain-map.tsx",
  "apps/web/app/ui/brain-map-stage.tsx",
  "apps/web/app/ui/dashboard-screen.tsx",
  "apps/web/app/ui/graph-force-panel.tsx",
  "apps/web/app/ui/assurance-workspace.tsx",
  "apps/web/app/ui/graph-canvas.tsx",
  "apps/web/app/ui/theme-toggle.tsx",
  "apps/web/app/progress/page.tsx",
  "apps/web/app/progress/progress-dashboard.tsx",
];

/**
 * Screens still holding inline copy. Phase 2A todo 8 restyles these and must
 * convert them at the same time. Listed here so the debt is visible and so a
 * newly added screen cannot slip past unclassified.
 */
const PENDING_SCREENS = [
  "apps/web/app/ui/onboarding-flow.tsx",
  "apps/web/app/ui/graph-detail.tsx",
  "apps/web/app/harness/harness-asset-card.tsx",
  "apps/web/app/harness/page.tsx",
  "apps/web/app/library/library-browser.tsx",
  "apps/web/app/not-found.tsx",
  "apps/web/app/app/connect/github/page.tsx",
  "apps/web/app/app/connect/github/repositories/page.tsx",
  "apps/web/app/app/harness/page.tsx",
  "apps/web/app/app/settings/ai/page.tsx",
  "apps/web/app/app/settings/ai/ai-usage-settings.tsx",
  "apps/web/app/app/settings/mcp/page.tsx",
  "apps/web/app/app/settings/mcp/context-tools.tsx",
  "apps/web/app/app/settings/mcp/token-manager.tsx",
  "apps/web/app/app/settings/privacy/page.tsx",
  "apps/web/app/app/settings/privacy/privacy-boundary.tsx",
  "apps/web/app/app/stats/page.tsx",
  "apps/web/app/app/stats/pilot-stats-dashboard.tsx",
  "apps/web/app/auth/auth-code-error/page.tsx",
  "apps/web/app/auth/login/page.tsx",
];

/** Punctuation, separators and symbols that carry no language. */
const NEUTRAL = /[\s\d·…—–→←⇒↔\-_/\\:;,.!?%()[\]{}<>+*&#@'"`|=~^$]/g;

/** Technical vocabulary that appears verbatim in product data, not as prose. */
const TECHNICAL_TOKENS = [
  "missing",
  "test",
  "stale",
  "doc",
  "orphan",
  "unproven",
  "claim",
  "contradicting",
  "instructions",
  "git",
  "cache",
  "hit",
  "worker",
  "main",
  "v1",
  "toto",
  "base",
  "compatible",
  "md",
  "ts",
  "bad0551",
  "specproof",
  "app",
  "klips",
  "progress",
  "read",
  "contents",
  "Actions",
  "Phase",
  "Statement",
  "Predicate",
];

function collectStrings(module: object, path = ""): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(module)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (typeof value === "string") found.push([keyPath, value]);
    else if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (typeof entry === "string") found.push([`${keyPath}[${index}]`, entry]);
        else if (entry && typeof entry === "object")
          found.push(...collectStrings(entry as object, `${keyPath}[${index}]`));
      });
    } else if (value && typeof value === "object") {
      found.push(...collectStrings(value as object, keyPath));
    }
  }
  return found;
}

/**
 * A string satisfies the Korean-first policy when, after removing the
 * conventional English terms and technical tokens, no Latin prose remains.
 * Adding a new English word therefore forces a deliberate choice: translate it,
 * or add it to `CONVENTIONAL_ENGLISH_TERMS`.
 */
function residualEnglish(value: string): string {
  let rest = value;
  const vocabulary = [...CONVENTIONAL_ENGLISH_TERMS, ...TECHNICAL_TOKENS].sort(
    (a, b) => b.length - a.length,
  );
  for (const term of vocabulary) {
    rest = rest.split(term).join(" ");
  }
  return rest.replace(NEUTRAL, "").replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
}

function listScreenFiles(): string[] {
  const found: string[] = [];
  function walk(directory: string) {
    for (const name of readdirSync(directory)) {
      if (name === "node_modules" || name === ".next") continue;
      const absolute = join(directory, name);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) continue;
      found.push(relative(repoRoot, absolute).split(sep).join("/"));
    }
  }
  walk(join(repoRoot, "apps/web/app"));
  return found;
}

interface StrayLiteral {
  file: string;
  value: string;
}

const TEXT_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt", "aria-description"];

/**
 * Stray user-facing literals: JSX text nodes and human-readable attributes that
 * are written inline instead of coming from a string module.
 */
function findStrayLiterals(file: string): StrayLiteral[] {
  const source = readFileSync(join(repoRoot, file), "utf8");
  const stray: StrayLiteral[] = [];

  // JSX text nodes: content between a closing `>` and the next tag `<`, on one
  // line, with no operators — that shape excludes TS generics (`useState<T>(…)`)
  // and ternaries, which are not copy.
  for (const match of source.matchAll(/>[ \t]*([^<>{}\n;=()?:]*[A-Za-z가-힣][^<>{}\n;=()?:]*)[ \t]*<[/A-Za-z]/g)) {
    const text = (match[1] ?? "").trim();
    if (text) stray.push({ file, value: text });
  }
  for (const attribute of TEXT_ATTRIBUTES) {
    for (const match of source.matchAll(
      new RegExp(`${attribute}="([^"]*[A-Za-z가-힣][^"]*)"`, "g"),
    )) {
      stray.push({ file, value: match[1] ?? "" });
    }
  }
  return stray;
}

describe("korean-first copy policy", () => {
  const modules = {
    ASSURANCE: ASSURANCE_MODULE.ASSURANCE,
    BRAND: COMMON_MODULE.BRAND,
    NAV: COMMON_MODULE.NAV,
    THEME: COMMON_MODULE.THEME,
    GRADE: COMMON_MODULE.GRADE,
    ACTION: COMMON_MODULE.ACTION,
    DASHBOARD: DASHBOARD_MODULE.DASHBOARD,
    PROGRESS: PROGRESS_MODULE.PROGRESS,
  };
  const entries = Object.entries(modules).flatMap(([name, value]) =>
    collectStrings(value, name),
  );

  test("the modules actually carry the product copy", () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  test("no string smuggles in untranslated English prose", () => {
    const offenders = entries
      .filter(([, value]) => residualEnglish(value).length > 0)
      .map(([key, value]) => `${key}: ${value} → ${residualEnglish(value)}`);
    expect(offenders).toEqual([]);
  });

  test("the conventional terms stay English, verbatim", () => {
    expect(COMMON_MODULE.NAV.graph).toBe("Graph");
    expect(COMMON_MODULE.NAV.findings).toBe("Findings");
    expect(COMMON_MODULE.NAV.receipts).toBe("Receipts");
    expect(COMMON_MODULE.GRADE.verified).toBe("verified");
    expect(COMMON_MODULE.GRADE.inferred).toBe("inferred");
    expect(DASHBOARD_MODULE.DASHBOARD.ariaMain).toContain("Dashboard");
  });

  test("the headline surfaces are Korean, not English left in place", () => {
    for (const value of [
      DASHBOARD_MODULE.DASHBOARD.title,
      DASHBOARD_MODULE.DASHBOARD.inspector.lead,
      ASSURANCE_MODULE.ASSURANCE.findings.emptyList,
      PROGRESS_MODULE.PROGRESS.states.partial.description,
    ]) {
      expect(value, value).toMatch(/[가-힣]/);
    }
  });
});

describe("string centralization", () => {
  test.each(CONVERTED_SCREENS)("%s holds no stray user-facing literal", (file) => {
    expect(findStrayLiterals(file).map((entry) => entry.value)).toEqual([]);
  });

  test("the detector actually fires on an inline literal", () => {
    // A pending screen is the honest positive control: it still has inline copy.
    const stray = PENDING_SCREENS.flatMap((file) => findStrayLiterals(file));
    expect(stray.length).toBeGreaterThan(0);
  });

  test("every screen is classified as converted or pending", () => {
    const classified = new Set([...CONVERTED_SCREENS, ...PENDING_SCREENS]);
    const unclassified = listScreenFiles().filter((file) => {
      if (classified.has(file)) return false;
      return findStrayLiterals(file).length > 0;
    });
    expect(unclassified).toEqual([]);
  });
});
