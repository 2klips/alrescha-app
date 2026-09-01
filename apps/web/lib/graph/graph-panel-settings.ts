/**
 * Force parameter panel state and persistence (Phase 2A todo 5).
 *
 * Obsidian's four force sliders plus the text fade threshold, persisted per
 * user in `localStorage`. Storage is treated as hostile: a corrupt, partial or
 * out-of-range payload degrades to the defaults rather than breaking the graph.
 */

import { DEFAULT_TEXT_FADE_THRESHOLD } from "./lod";
import {
  clampForceConfig,
  DEFAULT_FORCE_CONFIG,
  type ForceConfig,
} from "./simulation-protocol";

export const GRAPH_PANEL_STORAGE_KEY = "alrescha-graph-panel";

export interface GraphPanelSettings extends ForceConfig {
  /** HUD card collapsed state — also persisted, it is part of the workspace. */
  collapsed: boolean;
  /** 0…1; higher fades more labels out. */
  textFadeThreshold: number;
}

export const DEFAULT_PANEL_SETTINGS: GraphPanelSettings = {
  ...DEFAULT_FORCE_CONFIG,
  collapsed: false,
  textFadeThreshold: DEFAULT_TEXT_FADE_THRESHOLD,
};

export function clampPanelSettings(
  partial?: Partial<GraphPanelSettings> | null,
): GraphPanelSettings {
  const fade = partial?.textFadeThreshold;
  return {
    ...clampForceConfig(partial),
    collapsed:
      typeof partial?.collapsed === "boolean"
        ? partial.collapsed
        : DEFAULT_PANEL_SETTINGS.collapsed,
    textFadeThreshold:
      typeof fade === "number" && Number.isFinite(fade)
        ? Math.min(1, Math.max(0, fade))
        : DEFAULT_TEXT_FADE_THRESHOLD,
  };
}

/** Parse a raw storage payload. Anything unparseable is a first visit. */
export function parsePanelSettings(raw: string | null): GraphPanelSettings {
  if (!raw) return { ...DEFAULT_PANEL_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null)
      return { ...DEFAULT_PANEL_SETTINGS };
    return clampPanelSettings(parsed as Partial<GraphPanelSettings>);
  } catch {
    return { ...DEFAULT_PANEL_SETTINGS };
  }
}

export function serializePanelSettings(settings: GraphPanelSettings): string {
  return JSON.stringify(settings);
}

/** The force half only — what the worker actually needs. */
export function forceConfigOf(settings: GraphPanelSettings): ForceConfig {
  return clampForceConfig(settings);
}

export function loadPanelSettings(): GraphPanelSettings {
  try {
    return parsePanelSettings(
      globalThis.localStorage?.getItem(GRAPH_PANEL_STORAGE_KEY) ?? null,
    );
  } catch {
    return { ...DEFAULT_PANEL_SETTINGS };
  }
}

export function savePanelSettings(settings: GraphPanelSettings): void {
  try {
    globalThis.localStorage?.setItem(
      GRAPH_PANEL_STORAGE_KEY,
      serializePanelSettings(settings),
    );
  } catch {
    // Private mode / disabled storage: the setting still applies this session.
  }
}
