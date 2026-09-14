"use client";

/**
 * Graph layout settings shared by the workspace popover and legacy fixtures.
 *
 * Four force sliders plus the text fade threshold, collapsible, persisted per
 * user (Phase 2A todo 5). Phase 4 Wave B todo 13 adds the rest of Obsidian's
 * panel: the domain anchor pull, the display options (orphans, arrows, node
 * size, link thickness, local-graph depth), groups (search term → colour)
 * and named view presets. The card is deliberately presentational: all
 * clamping and persistence lives in `lib/graph/graph-panel-settings.ts`,
 * which is where the rules are tested. When `onClose` is present, the panel
 * is always expanded and returns focus through the popover owner after its
 * close button is used.
 */

import { Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_PANEL_SETTINGS,
  GROUP_LIMIT,
  LOCAL_GRAPH_DEPTH_LIMITS,
  PRESET_LIMIT,
  RESET_VIEW_PATCH,
  applyPreset,
  clampPanelSettings,
  loadPanelSettings,
  removePreset,
  savePanelSettings,
  savePreset,
  type GraphPanelSettings,
} from "../../lib/graph/graph-panel-settings";
import type { LodLevel } from "../../lib/graph/lod";
import {
  DISPLAY_LIMITS,
  GROUP_COLOR_TOKENS,
  type GraphGroup,
  type GroupColorToken,
} from "../../lib/graph/render-frame";
import { FORCE_LIMITS } from "../../lib/graph/simulation-protocol";
import { DASHBOARD } from "../../lib/strings";

/**
 * Load-on-mount rather than on first render: the server has no `localStorage`,
 * and reading it during render would produce a hydration mismatch.
 */
export function useGraphPanelSettings(): [
  GraphPanelSettings,
  (patch: Partial<GraphPanelSettings>) => void,
] {
  const [settings, setSettings] = useState<GraphPanelSettings>(
    DEFAULT_PANEL_SETTINGS,
  );

  useEffect(() => {
    setSettings(loadPanelSettings());
  }, []);

  const update = useCallback((patch: Partial<GraphPanelSettings>) => {
    setSettings((current) => {
      const next = clampPanelSettings({ ...current, ...patch });
      savePanelSettings(next);
      return next;
    });
  }, []);

  return [settings, update];
}

const SLIDERS = [
  {
    key: "centerStrength",
    label: DASHBOARD.forcePanel.centerStrength,
    step: 0.01,
  },
  { key: "repelStrength", label: DASHBOARD.forcePanel.repelStrength, step: 10 },
  { key: "linkStrength", label: DASHBOARD.forcePanel.linkStrength, step: 0.01 },
  { key: "linkDistance", label: DASHBOARD.forcePanel.linkDistance, step: 5 },
] as const satisfies readonly {
  key: keyof typeof FORCE_LIMITS;
  label: string;
  step: number;
}[];

export interface GraphForcePanelProps {
  labelCount?: number;
  lod?: LodLevel;
  onChange: (patch: Partial<GraphPanelSettings>) => void;
  onClose?: () => void;
  settings: GraphPanelSettings;
}

function GroupsEditor({
  groups,
  onChange,
}: {
  groups: readonly GraphGroup[];
  onChange: (groups: readonly GraphGroup[]) => void;
}) {
  const copy = DASHBOARD.forcePanel.groups;
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<GroupColorToken>(GROUP_COLOR_TOKENS[0]);
  const full = groups.length >= GROUP_LIMIT;
  return (
    <div className="graph-panel-groups" data-testid="graph-groups">
      <small>{copy.note}</small>
      <ul>
        {groups.map((group, index) => (
          <li key={`${group.query}:${index}`}>
            <i className={`graph-group-swatch ${group.color}`} />
            <code>{group.query}</code>
            <span>{copy.colors[group.color]}</span>
            <button
              aria-label={`${copy.remove}: ${group.query}`}
              onClick={() =>
                onChange(groups.filter((_entry, at) => at !== index))
              }
              type="button"
            >
              <Trash2 aria-hidden size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="graph-panel-group-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = query.trim();
          if (!trimmed || full) return;
          onChange([...groups, { color, query: trimmed }]);
          setQuery("");
        }}
      >
        <label>
          <span className="sr-only">{copy.queryLabel}</span>
          <input
            data-group-query
            disabled={full}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.queryPlaceholder}
            type="text"
            value={query}
          />
        </label>
        <label>
          <span className="sr-only">{copy.colorLabel}</span>
          <select
            data-group-color
            disabled={full}
            onChange={(event) =>
              setColor(event.target.value as GroupColorToken)
            }
            value={color}
          >
            {GROUP_COLOR_TOKENS.map((token) => (
              <option key={token} value={token}>
                {copy.colors[token]}
              </option>
            ))}
          </select>
        </label>
        <button disabled={full || query.trim().length === 0} type="submit">
          <Plus aria-hidden size={13} />
          {copy.add}
        </button>
      </form>
      <small>{copy.count(groups.length, GROUP_LIMIT)}</small>
    </div>
  );
}

function PresetsEditor({
  onChange,
  settings,
}: {
  onChange: (patch: Partial<GraphPanelSettings>) => void;
  settings: GraphPanelSettings;
}) {
  const copy = DASHBOARD.forcePanel.presets;
  const [name, setName] = useState("");
  return (
    <div className="graph-panel-presets" data-testid="graph-presets">
      <small>{copy.note}</small>
      {settings.presets.length === 0 ? (
        <small className="graph-panel-empty">{copy.empty}</small>
      ) : (
        <ul>
          {settings.presets.map((preset) => (
            <li key={preset.name}>
              <span>{preset.name}</span>
              <button
                aria-label={`${copy.apply}: ${preset.name}`}
                data-preset-apply={preset.name}
                onClick={() => onChange(applyPreset(settings, preset.name))}
                type="button"
              >
                {copy.apply}
              </button>
              <button
                aria-label={`${copy.remove}: ${preset.name}`}
                data-preset-remove={preset.name}
                onClick={() => onChange(removePreset(settings, preset.name))}
                type="button"
              >
                <Trash2 aria-hidden size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="graph-panel-preset-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onChange(savePreset(settings, trimmed));
          setName("");
        }}
      >
        <label>
          <span className="sr-only">{copy.nameLabel}</span>
          <input
            data-preset-name
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.namePlaceholder}
            type="text"
            value={name}
          />
        </label>
        <button disabled={name.trim().length === 0} type="submit">
          {copy.save}
        </button>
      </form>
      <small>{copy.count(settings.presets.length, PRESET_LIMIT)}</small>
    </div>
  );
}

export function GraphForcePanel({
  labelCount,
  lod,
  onChange,
  onClose,
  settings,
}: GraphForcePanelProps) {
  const copy = DASHBOARD.forcePanel;
  const collapsed = onClose ? false : settings.collapsed;
  return (
    <section
      aria-label={copy.aria}
      className="graph-force-panel"
      data-collapsed={collapsed}
      data-testid="graph-force-panel"
    >
      <header>
        <strong>{copy.title}</strong>
        {onClose ? (
          <button
            aria-label={copy.close}
            data-force-close
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={15} />
          </button>
        ) : (
          <button
            aria-expanded={!settings.collapsed}
            onClick={() => onChange({ collapsed: !settings.collapsed })}
            type="button"
          >
            {settings.collapsed ? copy.expand : copy.collapse}
          </button>
        )}
      </header>
      {collapsed ? null : (
        <div className="graph-force-sliders">
          <h3 className="graph-panel-section">{copy.sections.forces}</h3>
          {SLIDERS.map((slider) => (
            <label key={slider.key}>
              <span>{slider.label}</span>
              <input
                data-force-key={slider.key}
                max={FORCE_LIMITS[slider.key].max}
                min={FORCE_LIMITS[slider.key].min}
                onChange={(event) =>
                  onChange({ [slider.key]: Number(event.target.value) })
                }
                step={slider.step}
                type="range"
                value={settings[slider.key]}
              />
            </label>
          ))}
          <label title={copy.domainAnchorNote}>
            <span>{copy.domainAnchorStrength}</span>
            <input
              data-force-key="domainAnchorStrength"
              max={FORCE_LIMITS.domainAnchorStrength.max}
              min={FORCE_LIMITS.domainAnchorStrength.min}
              onChange={(event) =>
                onChange({ domainAnchorStrength: Number(event.target.value) })
              }
              step={0.005}
              type="range"
              value={settings.domainAnchorStrength}
            />
          </label>
          <label>
            <span>{copy.textFadeThreshold}</span>
            <input
              data-force-key="textFadeThreshold"
              max={1}
              min={0}
              onChange={(event) =>
                onChange({ textFadeThreshold: Number(event.target.value) })
              }
              step={0.05}
              type="range"
              value={settings.textFadeThreshold}
            />
          </label>

          <h3 className="graph-panel-section">{copy.sections.display}</h3>
          <label className="graph-panel-check">
            <input
              checked={settings.showOrphans}
              data-display-key="showOrphans"
              onChange={(event) =>
                onChange({ showOrphans: event.target.checked })
              }
              type="checkbox"
            />
            <span>{copy.display.showOrphans}</span>
          </label>
          <label className="graph-panel-check">
            <input
              checked={settings.showArrows}
              data-display-key="showArrows"
              onChange={(event) =>
                onChange({ showArrows: event.target.checked })
              }
              type="checkbox"
            />
            <span>{copy.display.showArrows}</span>
          </label>
          <label>
            <span>{copy.display.nodeSize}</span>
            <input
              data-force-key="nodeSize"
              max={DISPLAY_LIMITS.nodeSize.max}
              min={DISPLAY_LIMITS.nodeSize.min}
              onChange={(event) =>
                onChange({ nodeSize: Number(event.target.value) })
              }
              step={0.1}
              type="range"
              value={settings.nodeSize}
            />
          </label>
          <label>
            <span>{copy.display.linkThickness}</span>
            <input
              data-force-key="linkThickness"
              max={DISPLAY_LIMITS.linkThickness.max}
              min={DISPLAY_LIMITS.linkThickness.min}
              onChange={(event) =>
                onChange({ linkThickness: Number(event.target.value) })
              }
              step={0.1}
              type="range"
              value={settings.linkThickness}
            />
          </label>
          <label>
            <span>
              {copy.display.localGraphDepth} ·{" "}
              {copy.display.depth(settings.localGraphDepth)}
            </span>
            <input
              data-force-key="localGraphDepth"
              max={LOCAL_GRAPH_DEPTH_LIMITS.max}
              min={LOCAL_GRAPH_DEPTH_LIMITS.min}
              onChange={(event) =>
                onChange({ localGraphDepth: Number(event.target.value) })
              }
              step={1}
              type="range"
              value={settings.localGraphDepth}
            />
          </label>

          <h3 className="graph-panel-section">{copy.sections.groups}</h3>
          <GroupsEditor
            groups={settings.groups}
            onChange={(groups) => onChange({ groups })}
          />

          <h3 className="graph-panel-section">{copy.sections.presets}</h3>
          <PresetsEditor onChange={onChange} settings={settings} />

          <button
            className="graph-force-reset"
            onClick={() => onChange(RESET_VIEW_PATCH)}
            type="button"
          >
            {copy.reset}
          </button>
          {lod ? (
            <small data-testid="graph-lod-status">
              {copy.lodStatus(copy.lodLevels[lod], labelCount ?? 0)}
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}
