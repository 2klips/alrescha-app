/**
 * Sidebar collapse persistence (design roadmap step 2).
 *
 * Mirrors the theme mechanism in `lib/theme/theme-preference.ts`: the choice
 * lives in localStorage and an inline boot script stamps
 * `<html data-sidebar>` before first paint, so there is no flicker AND the
 * public demo tree stays statically renderable — reading a cookie in the
 * shared layout would opt every route into dynamic rendering
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md).
 */

export const SIDEBAR_STORAGE_KEY = "alrescha-sidebar";
export const SIDEBAR_ATTRIBUTE = "data-sidebar";

export const SIDEBAR_STATES = ["expanded", "rail"] as const;

export type SidebarState = (typeof SIDEBAR_STATES)[number];

export const DEFAULT_SIDEBAR_STATE: SidebarState = "expanded";

export function isSidebarState(value: unknown): value is SidebarState {
  return (
    typeof value === "string" &&
    (SIDEBAR_STATES as readonly string[]).includes(value)
  );
}

/** Sidebar state currently painted on the document. */
export function readDocumentSidebarState(root?: Element | null): SidebarState {
  const element =
    root ?? (typeof document === "undefined" ? null : document.documentElement);
  const value = element?.getAttribute(SIDEBAR_ATTRIBUTE);
  return isSidebarState(value) ? value : DEFAULT_SIDEBAR_STATE;
}

export function nextSidebarState(state: SidebarState): SidebarState {
  return state === "expanded" ? "rail" : "expanded";
}

/** Paint a sidebar state and remember it. Storage failures never break the UI. */
export function applySidebarState(
  state: SidebarState,
  root?: Element | null,
): void {
  const element =
    root ?? (typeof document === "undefined" ? null : document.documentElement);
  element?.setAttribute(SIDEBAR_ATTRIBUTE, state);
  try {
    globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, state);
  } catch {
    // Private mode / disabled storage: the state still applies this session.
  }
}

/**
 * Inline boot script — injected next to the theme script in the root layout
 * so `data-sidebar` exists before the first paint. Only "rail" needs stamping;
 * the default expanded state is the unstamped document.
 */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{var s=window.localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)});if(s===${JSON.stringify("rail")}){document.documentElement.setAttribute(${JSON.stringify(
  SIDEBAR_ATTRIBUTE,
)},s);}}catch(e){}})();`;
