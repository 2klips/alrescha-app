/**
 * Force parameter panel state and persistence (Phase 2A todo 5; Phase 4 Wave
 * B todo 13 ⓒ widens it to Obsidian's display options and view presets).
 *
 * Obsidian's four force sliders plus the text fade threshold, the domain
 * anchor pull, the display options (orphans, arrows, node size, link
 * thickness, groups), the local-graph depth, and named presets of all of
 * that — persisted per user in `localStorage`. Storage is treated as
 * hostile: a corrupt, partial or out-of-range payload degrades to the
 * defaults rather than breaking the graph.
 */

import { DEFAULT_TEXT_FADE_THRESHOLD } from "./lod";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_LIMITS,
  GROUP_COLOR_TOKENS,
  type GraphDisplaySettings,
  type GraphGroup,
  type GroupColorToken,
} from "./render-frame";
import {
  clampForceConfig,
  DEFAULT_FORCE_CONFIG,
  type ForceConfig,
} from "./simulation-protocol";

export const GRAPH_PANEL_STORAGE_KEY = "alrescha-graph-panel";

/** How many groups and presets a person can keep. Judgements, exported. */
export const GROUP_LIMIT = 8;
export const PRESET_LIMIT = 8;
export const GROUP_QUERY_LIMIT = 64;
export const PRESET_NAME_LIMIT = 40;

export const LOCAL_GRAPH_DEPTH_LIMITS = { max: 3, min: 1 } as const;

/** Everything a preset captures — the view, not the chrome. */
export interface GraphViewSettings extends ForceConfig, GraphDisplaySettings {
  /** How many hops "로컬 포커스" shows around the selected node. */
  localGraphDepth: number;
  /** 0…1; higher fades more labels out. */
  textFadeThreshold: number;
}

export interface GraphViewPreset {
  readonly name: string;
  readonly settings: GraphViewSettings;
}

export interface GraphPanelSettings extends GraphViewSettings {
  /** HUD card collapsed state — also persisted, it is part of the workspace. */
  collapsed: boolean;
  presets: readonly GraphViewPreset[];
}

export const DEFAULT_VIEW_SETTINGS: GraphViewSettings = {
  ...DEFAULT_FORCE_CONFIG,
  ...DEFAULT_DISPLAY_SETTINGS,
  localGraphDepth: 1,
  textFadeThreshold: DEFAULT_TEXT_FADE_THRESHOLD,
};

export const DEFAULT_PANEL_SETTINGS: GraphPanelSettings = {
  ...DEFAULT_VIEW_SETTINGS,
  collapsed: false,
  presets: [],
};

/**
 * What "기본값 복원" restores: the view, never the presets a person saved.
 * Resetting a slider must not delete a preset made an hour ago.
 */
export const RESET_VIEW_PATCH: Partial<GraphPanelSettings> = {
  ...DEFAULT_VIEW_SETTINGS,
};

function clampNumber(
  value: unknown,
  limits: { readonly max: number; readonly min: number },
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(limits.max, Math.max(limits.min, value))
    : fallback;
}

function isGroupColor(value: unknown): value is GroupColorToken {
  return (GROUP_COLOR_TOKENS as readonly string[]).includes(value as string);
}

/** Groups: a query and a colour from the fixed token set, at most GROUP_LIMIT. */
export function clampGroups(value: unknown): readonly GraphGroup[] {
  if (!Array.isArray(value)) return DEFAULT_DISPLAY_SETTINGS.groups;
  const groups: GraphGroup[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { color, query } = entry as Record<string, unknown>;
    if (typeof query !== "string" || !isGroupColor(color)) continue;
    const trimmed = query.trim().slice(0, GROUP_QUERY_LIMIT);
    if (trimmed.length === 0) continue;
    groups.push({ color, query: trimmed });
    if (groups.length >= GROUP_LIMIT) break;
  }
  return groups;
}

export function clampViewSettings(
  partial?: Partial<GraphViewSettings> | null,
): GraphViewSettings {
  return {
    ...clampForceConfig(partial),
    groups: clampGroups(partial?.groups),
    linkThickness: clampNumber(
      partial?.linkThickness,
      DISPLAY_LIMITS.linkThickness,
      DEFAULT_DISPLAY_SETTINGS.linkThickness,
    ),
    localGraphDepth: Math.round(
      clampNumber(
        partial?.localGraphDepth,
        LOCAL_GRAPH_DEPTH_LIMITS,
        DEFAULT_VIEW_SETTINGS.localGraphDepth,
      ),
    ),
    nodeSize: clampNumber(
      partial?.nodeSize,
      DISPLAY_LIMITS.nodeSize,
      DEFAULT_DISPLAY_SETTINGS.nodeSize,
    ),
    showArrows:
      typeof partial?.showArrows === "boolean"
        ? partial.showArrows
        : DEFAULT_DISPLAY_SETTINGS.showArrows,
    showOrphans:
      typeof partial?.showOrphans === "boolean"
        ? partial.showOrphans
        : DEFAULT_DISPLAY_SETTINGS.showOrphans,
    textFadeThreshold: clampNumber(
      partial?.textFadeThreshold,
      { max: 1, min: 0 },
      DEFAULT_TEXT_FADE_THRESHOLD,
    ),
  };
}

function clampPresets(value: unknown): readonly GraphViewPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: GraphViewPreset[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, settings } = entry as Record<string, unknown>;
    if (typeof name !== "string") continue;
    const trimmed = name.trim().slice(0, PRESET_NAME_LIMIT);
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    presets.push({
      name: trimmed,
      settings: clampViewSettings(
        (typeof settings === "object" && settings !== null
          ? settings
          : null) as Partial<GraphViewSettings> | null,
      ),
    });
    if (presets.length >= PRESET_LIMIT) break;
  }
  return presets;
}

export function clampPanelSettings(
  partial?: Partial<GraphPanelSettings> | null,
): GraphPanelSettings {
  return {
    ...clampViewSettings(partial),
    collapsed:
      typeof partial?.collapsed === "boolean"
        ? partial.collapsed
        : DEFAULT_PANEL_SETTINGS.collapsed,
    presets: clampPresets(partial?.presets),
  };
}

/** The view half of the settings — what a preset stores. */
export function viewSettingsOf(
  settings: GraphPanelSettings,
): GraphViewSettings {
  return clampViewSettings(settings);
}

/**
 * Save the current view under a name. Saving under an existing name
 * replaces it; past the limit the oldest preset makes room — a person who
 * saves a ninth preset wants the ninth, not an error.
 */
export function savePreset(
  settings: GraphPanelSettings,
  name: string,
): GraphPanelSettings {
  const trimmed = name.trim().slice(0, PRESET_NAME_LIMIT);
  if (trimmed.length === 0) return settings;
  const preset: GraphViewPreset = {
    name: trimmed,
    settings: viewSettingsOf(settings),
  };
  const kept = settings.presets.filter((entry) => entry.name !== trimmed);
  const presets = [...kept, preset].slice(-PRESET_LIMIT);
  return { ...settings, presets };
}

export function removePreset(
  settings: GraphPanelSettings,
  name: string,
): GraphPanelSettings {
  return {
    ...settings,
    presets: settings.presets.filter((entry) => entry.name !== name),
  };
}

/** Apply a saved preset: the view changes, the presets and the card do not. */
export function applyPreset(
  settings: GraphPanelSettings,
  name: string,
): GraphPanelSettings {
  const preset = settings.presets.find((entry) => entry.name === name);
  if (!preset) return settings;
  return clampPanelSettings({
    ...settings,
    ...preset.settings,
    collapsed: settings.collapsed,
    presets: settings.presets,
  });
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

/** The display half only — what the frame builder needs. */
export function displaySettingsOf(
  settings: GraphPanelSettings,
): GraphDisplaySettings {
  return {
    groups: settings.groups,
    linkThickness: settings.linkThickness,
    nodeSize: settings.nodeSize,
    showArrows: settings.showArrows,
    showOrphans: settings.showOrphans,
  };
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
