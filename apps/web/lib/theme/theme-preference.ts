/**
 * Theme preference resolution and persistence (Phase 2A todo 2).
 *
 * Contract:
 *  - Dark is the product default (ADR-009-3).
 *  - `prefers-color-scheme` is honoured on the FIRST visit only. Once the user
 *    has chosen, the stored choice wins — flipping the OS theme must not
 *    silently undo an explicit decision.
 *  - The choice is applied to `<html data-theme>` by an inline boot script that
 *    runs before hydration, so there is never a flash of the wrong theme.
 */

import { THEMES, type Theme } from "./tokens";

export const THEME_STORAGE_KEY = "arr-theme";
export const THEME_ATTRIBUTE = "data-theme";
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

export interface InitialThemeInput {
  /** Raw `localStorage` value; `null` on a first visit. */
  stored?: string | null;
  /** `matchMedia("(prefers-color-scheme: light)").matches`. */
  prefersLight?: boolean;
}

/** Stored choice wins; otherwise the OS hint; otherwise dark. */
export function resolveInitialTheme({
  stored = null,
  prefersLight = false,
}: InitialThemeInput = {}): Theme {
  if (isTheme(stored)) return stored;
  return prefersLight ? "light" : DEFAULT_THEME;
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/** Theme currently painted on the document (what the boot script decided). */
export function readDocumentTheme(root?: Element | null): Theme {
  const element =
    root ?? (typeof document === "undefined" ? null : document.documentElement);
  const value = element?.getAttribute(THEME_ATTRIBUTE);
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** Paint a theme and remember it. Storage failures must never break the UI. */
export function applyTheme(theme: Theme, root?: Element | null): void {
  const element =
    root ?? (typeof document === "undefined" ? null : document.documentElement);
  element?.setAttribute(THEME_ATTRIBUTE, theme);
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / disabled storage: the theme still applies for this session.
  }
}

/**
 * The inline boot script. Injected into <head> so `data-theme` is set before
 * the first paint — this is what prevents the flash of the wrong theme.
 * Kept dependency-free and wrapped in try/catch: a storage exception must never
 * stop the page from rendering.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=(s===${JSON.stringify("dark")}||s===${JSON.stringify(
  "light",
)})?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":${JSON.stringify(
  DEFAULT_THEME,
)});document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},t);}catch(e){document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},${JSON.stringify(DEFAULT_THEME)});}})();`;
