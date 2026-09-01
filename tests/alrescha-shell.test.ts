import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { BRAND } from "../apps/web/lib/strings/common";
import { isShellNavActive, shellTabs } from "../apps/web/app/ui/shell-nav-data";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function source(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("Alrescha F2 repository shell", () => {
  test("renders the three horizontal chrome bands in order", () => {
    const appShell = source("apps/web/app/ui/app-shell.tsx");
    const global = appShell.indexOf("<ShellHeader");
    const repository = appShell.indexOf("<RepositoryHeader");
    const tabs = appShell.indexOf("<RepositoryTabs");

    expect(global).toBeGreaterThan(-1);
    expect(global).toBeLessThan(repository);
    expect(repository).toBeLessThan(tabs);
    expect(appShell).toContain('href="#main-content"');
    expect(appShell).not.toContain("SideNav");
  });

  test("keeps route state explicit and tree-local", () => {
    expect(shellTabs("demo").map(({ href }) => href)).toEqual([
      "/",
      "/map",
      "/commits",
      "/findings",
      "/progress",
      "/library",
    ]);
    expect(shellTabs("workspace").map(({ href }) => href)).toContain(
      "/app/settings",
    );
    expect(
      isShellNavActive("/app/settings/ai", "/app/settings", "workspace"),
    ).toBe(true);
    expect(isShellNavActive("/app/map", "/app", "workspace")).toBe(false);
  });

  test("uses canonical shell tokens and no permanent global sidebar", () => {
    const css = source("apps/web/app/styles/shell.css");
    expect(css).toContain("var(--shell-header-h)");
    expect(css).toContain("var(--shell-context-h)");
    expect(css).toContain("var(--shell-tabs-h)");
    expect(css).toContain("var(--layout-local-nav)");
    expect(css).not.toContain(".side-nav");
    expect(css).not.toContain("var(--sidebar-w)");
  });

  test("exposes route-local settings navigation", () => {
    const layout = source("apps/web/app/app/(shell)/settings/layout.tsx");
    expect(layout).toContain("<SettingsLocalNav />");
    expect(layout).toContain("settings-route-layout");
  });

  test("uses the canonical product and storage identity", () => {
    expect(BRAND.name).toBe("Alrescha");
    expect(source("apps/web/app/layout.tsx")).toContain(
      "Alrescha · 살아있는 증거 그래프",
    );
    expect(source("apps/web/lib/theme/theme-preference.ts")).toContain(
      'THEME_STORAGE_KEY = "alrescha-theme"',
    );
  });
});
