import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

import { describe, expect, test } from "vitest";

import {
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  nextTheme,
  readDocumentTheme,
  resolveInitialTheme,
} from "../apps/web/lib/theme/theme-preference";
import { THEMES } from "../apps/web/lib/theme/tokens";

const repoRoot = new URL("..", import.meta.url);

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, repoRoot)), "utf8");
}

/** Minimal <html> stand-in: enough surface for the boot script and helpers. */
function fakeElement() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  };
}

/**
 * Runs the real boot script in an isolated VM with a scripted browser,
 * so the assertions cover the string that actually ships in <head>.
 */
function runInitScript(options: {
  stored?: string | null;
  prefersLight?: boolean;
  throwOnStorage?: boolean;
}): { theme: string | null; matchMediaQueries: string[] } {
  const html = fakeElement();
  const matchMediaQueries: string[] = [];
  const context = createContext({
    document: { documentElement: html },
    window: {
      localStorage: {
        getItem: () => {
          if (options.throwOnStorage) throw new Error("storage disabled");
          return options.stored ?? null;
        },
      },
      matchMedia: (query: string) => {
        matchMediaQueries.push(query);
        return { matches: Boolean(options.prefersLight) };
      },
    },
  });
  runInContext(THEME_INIT_SCRIPT, context);
  return { theme: html.getAttribute(THEME_ATTRIBUTE), matchMediaQueries };
}

describe("theme preference resolution", () => {
  test("dark is the default when nothing is known", () => {
    expect(resolveInitialTheme()).toBe("dark");
    expect(DEFAULT_THEME).toBe("dark");
  });

  test("first visit honours prefers-color-scheme", () => {
    expect(resolveInitialTheme({ stored: null, prefersLight: true })).toBe(
      "light",
    );
    expect(resolveInitialTheme({ stored: null, prefersLight: false })).toBe(
      "dark",
    );
  });

  test("a stored choice outranks the OS preference", () => {
    expect(resolveInitialTheme({ stored: "dark", prefersLight: true })).toBe(
      "dark",
    );
    expect(resolveInitialTheme({ stored: "light", prefersLight: false })).toBe(
      "light",
    );
  });

  test("junk in storage falls back instead of painting an undefined theme", () => {
    expect(
      resolveInitialTheme({ stored: "solarized", prefersLight: true }),
    ).toBe("light");
    expect(isTheme("solarized")).toBe(false);
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
  });

  test("the toggle alternates between exactly the two themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});

describe("theme persistence", () => {
  test("applyTheme paints the attribute and stores the choice", () => {
    const html = fakeElement();
    const written: Array<[string, string]> = [];
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => written.push([key, value]),
      },
    });

    try {
      applyTheme("light", html as unknown as Element);
      expect(html.getAttribute(THEME_ATTRIBUTE)).toBe("light");
      expect(written).toEqual([[THEME_STORAGE_KEY, "light"]]);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, "localStorage");
      } else {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: original,
        });
      }
    }
  });

  test("a storage failure still paints the theme for this session", () => {
    const html = fakeElement();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error("quota");
        },
      },
    });

    try {
      expect(() =>
        applyTheme("light", html as unknown as Element),
      ).not.toThrow();
      expect(html.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, "localStorage");
      } else {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: original,
        });
      }
    }
  });

  test("readDocumentTheme reports what the boot script painted", () => {
    const html = fakeElement();
    html.setAttribute(THEME_ATTRIBUTE, "light");
    expect(readDocumentTheme(html as unknown as Element)).toBe("light");
    expect(readDocumentTheme(fakeElement() as unknown as Element)).toBe("dark");
  });
});

describe("no flash of the wrong theme", () => {
  test("the boot script paints the stored theme before hydration", () => {
    expect(runInitScript({ stored: "light" }).theme).toBe("light");
    expect(runInitScript({ stored: "dark", prefersLight: true }).theme).toBe(
      "dark",
    );
  });

  test("the boot script consults prefers-color-scheme on a first visit", () => {
    const result = runInitScript({ stored: null, prefersLight: true });
    expect(result.theme).toBe("light");
    expect(result.matchMediaQueries).toEqual(["(prefers-color-scheme: light)"]);
    expect(runInitScript({ stored: null, prefersLight: false }).theme).toBe(
      "dark",
    );
  });

  test("the boot script survives blocked storage", () => {
    expect(runInitScript({ throwOnStorage: true }).theme).toBe("dark");
  });

  test("the script is inlined in <head>, ahead of <body>", () => {
    const layout = readSource("apps/web/app/layout.tsx");
    expect(layout).toContain("THEME_INIT_SCRIPT");
    expect(layout).toContain('id="arr-theme-init"');
    expect(layout.indexOf("<head>")).toBeLessThan(layout.indexOf("<body>"));
    expect(layout.indexOf("arr-theme-init")).toBeLessThan(
      layout.indexOf("<body>"),
    );
  });
});

describe("theme toggle control", () => {
  const toggle = readSource("apps/web/app/ui/theme-toggle.tsx");

  test("is a client component that syncs to the painted theme", () => {
    expect(toggle).toContain('"use client"');
    expect(toggle).toContain("readDocumentTheme()");
    expect(toggle).toContain("applyTheme(target)");
  });

  test("exposes stable hooks for e2e and assistive tech", () => {
    expect(toggle).toContain("data-theme-toggle");
    expect(toggle).toContain("aria-pressed");
    expect(toggle).toContain("aria-label");
  });

  test("is mounted on every themed app header", () => {
    for (const header of [
      "apps/web/app/ui/dashboard-screen.tsx",
      "apps/web/app/ui/assurance-workspace.tsx",
      "apps/web/app/progress/page.tsx",
    ]) {
      expect(readSource(header), header).toContain("<ThemeToggle />");
    }
  });

  test("its styling is tokenized, so it themes with everything else", () => {
    const css = readSource("apps/web/app/globals.css");
    const rule = css.slice(css.indexOf(".theme-toggle {"));
    expect(rule).toContain("var(--surface-2)");
    expect(rule).toContain("var(--line-strong)");
  });
});

describe("no unthemed states remain in the shared primitives", () => {
  const css = readSource("apps/web/app/globals.css");

  test("the app stylesheet resolves every colour through a token", () => {
    // A raw colour function is a state that cannot follow the theme — including
    // the panel shadows, which now mix `--shadow-color`.
    expect(css.match(/rgba?\(|hsla?\(|oklch\(|lab\(/g)).toBeNull();
  });

  test("it declares no palette of its own — tokens.css is the only source", () => {
    expect(css).toContain('@import "./styles/tokens.css";');
    expect(css.match(/^\s*--[a-z0-9-]+:/gm)).toBeNull();
  });

  test("typography goes through the font tokens only", () => {
    expect(css).not.toMatch(/Bahnschrift|Archivo|Manrope|Aptos/);
    for (const match of css.matchAll(/font-family:\s*([^;]+);/g)) {
      expect(match[1]?.trim()).toMatch(/^var\(--font-(sans|mono)\)$/);
    }
  });
});
