/**
 * Typed accessor for the Ink & Seal design tokens (ADR-009-3).
 *
 * The palette itself lives in exactly one place — `apps/web/app/styles/tokens.css`.
 * This module never repeats a colour value; it reads the resolved custom
 * properties from the document at runtime so the DOM chrome and the WebGL/Canvas
 * graph renderer are always driven by the same source, in whichever theme is
 * currently active.
 */

export const THEMES = ["dark", "light"] as const;

export type Theme = (typeof THEMES)[number];

/** Surface + text ramp. */
export const SURFACE_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "code-bg",
  "line",
  "line-strong",
  "text",
  "muted",
  "faint",
] as const;

/**
 * Identity and evidence-grade colours.
 *
 * The `-text` entries are the AA-safe siblings used when a status colour has to
 * carry small text; the plain ones stay at the ADR-009-3 values and are what the
 * graph renderer, dots, rings and tints read. See `tokens.css` and OQ-009.
 */
export const STATUS_TOKENS = [
  "brand",
  "verified",
  "inferred",
  "info",
  "brand-text",
  "verified-text",
  "inferred-text",
  "info-text",
  "accent",
  "danger",
  "danger-text",
  "on-brand",
  "on-accent",
  "on-verified",
] as const;

/** Graph node type colours (doc/requirement/code/test/concept). */
export const NODE_TOKENS = [
  "node-doc",
  "node-requirement",
  "node-code",
  "node-test",
  "node-concept",
] as const;

/** Typography. */
export const FONT_TOKENS = ["font-sans", "font-mono"] as const;

/**
 * Directional focus strokes (Phase 3 Wave A todo 2): a selected node's
 * outgoing edges paint `focus-out`, incoming ones `focus-in`. Stroke and
 * legend-dot colours only — never text.
 */
export const FOCUS_TOKENS = ["focus-out", "focus-in"] as const;

/**
 * Non-colour scale tokens (design roadmap step 1): type, spacing, radius,
 * elevation, icon, z-index, motion and shell dimensions. Declared once in
 * `:root` and theme-invariant, so they are kept out of DESIGN_TOKENS — the
 * renderer palette and the contrast machinery keep operating on colours only.
 * tests/design-tokens.test.ts asserts every entry is declared.
 */
export const SCALE_TOKENS = [
  "text-2xs",
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-display",
  "space-1",
  "space-2",
  "space-3",
  "space-4",
  "space-5",
  "space-6",
  "space-7",
  "space-8",
  "page-pad",
  "page-max",
  "radius-pill",
  "shadow-1",
  "shadow-2",
  "shadow-3",
  "icon-xs",
  "icon-sm",
  "icon-md",
  "z-canvas",
  "z-hud",
  "z-sidebar",
  "z-popover",
  "z-modal",
  "z-toast",
  "dur-fast",
  "dur-base",
  "ease-out",
  "hud-blur",
  "alpha-hover",
  "alpha-tint",
  "alpha-emphasis",
  "alpha-scrim",
  "sidebar-w",
  "sidebar-w-rail",
  "contextstrip-h",
] as const;

export type ScaleToken = (typeof SCALE_TOKENS)[number];

/** Every semantic token that both themes must resolve. */
export const DESIGN_TOKENS = [
  ...SURFACE_TOKENS,
  ...STATUS_TOKENS,
  ...NODE_TOKENS,
  ...FOCUS_TOKENS,
  ...FONT_TOKENS,
] as const;

export type DesignToken = (typeof DESIGN_TOKENS)[number];

export type TokenValues = Record<DesignToken, string>;

/** `--bg` for the token named `bg`. */
export function cssVariableName(token: DesignToken | ScaleToken): string {
  return `--${token}`;
}

/** `var(--bg)` — the only way components may reference a colour or scale. */
export function tokenVar(token: DesignToken | ScaleToken): string {
  return `var(${cssVariableName(token)})`;
}

interface TokenSource {
  getPropertyValue(property: string): string;
}

function resolveSource(element?: Element | null): TokenSource {
  if (element) return getComputedStyle(element);
  if (typeof document === "undefined") {
    throw new Error(
      "readDesignTokens requires a DOM; call it from a client component or pass an element.",
    );
  }
  return getComputedStyle(document.documentElement);
}

/** Resolved value of one token in the currently applied theme. */
export function readDesignToken(
  token: DesignToken,
  element?: Element | null,
): string {
  return resolveSource(element).getPropertyValue(cssVariableName(token)).trim();
}

/** Resolved values of every token in the currently applied theme. */
export function readDesignTokens(element?: Element | null): TokenValues {
  const source = resolveSource(element);
  const values = {} as TokenValues;
  for (const token of DESIGN_TOKENS) {
    values[token] = source.getPropertyValue(cssVariableName(token)).trim();
  }
  return values;
}

/**
 * Convert a resolved CSS colour to the 0xRRGGBB number Pixi.js expects.
 * Accepts the forms `getComputedStyle` produces (`rgb()`, `rgba()`, `#rgb`,
 * `#rrggbb`, `#rrggbbaa`). Returns `null` for anything else so callers can fall
 * back rather than render a silently wrong colour.
 */
export function toRendererColor(value: string): number | null {
  const input = value.trim().toLowerCase();
  if (!input) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(input);
  if (hex) {
    const digits = hex[1] as string;
    const expanded =
      digits.length === 3
        ? digits
            .split("")
            .map((digit) => `${digit}${digit}`)
            .join("")
        : digits.slice(0, 6);
    return Number.parseInt(expanded, 16);
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(input);
  if (rgb) {
    const parts = (rgb[1] as string)
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) =>
        part.endsWith("%")
          ? Math.round((Number.parseFloat(part) / 100) * 255)
          : Number.parseInt(part, 10),
      );
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part)))
      return null;
    const [r = 0, g = 0, b = 0] = parts;
    return (clampChannel(r) << 16) + (clampChannel(g) << 8) + clampChannel(b);
  }

  return null;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** Renderer-ready palette: `{ verified: 0x3ddc97, ... }` for the active theme. */
export function readRendererPalette(
  element?: Element | null,
): Partial<Record<DesignToken, number>> {
  const values = readDesignTokens(element);
  const palette: Partial<Record<DesignToken, number>> = {};
  for (const token of DESIGN_TOKENS) {
    const color = toRendererColor(values[token]);
    if (color !== null) palette[token] = color;
  }
  return palette;
}
