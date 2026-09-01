"use client";

/**
 * Graph layout settings shared by the workspace popover and legacy fixtures.
 *
 * Four force sliders plus the text fade threshold, collapsible, persisted per
 * user. The card is deliberately presentational: all clamping and persistence
 * lives in `lib/graph/graph-panel-settings.ts`, which is where the rules are
 * tested. When `onClose` is present, the panel is always expanded and returns
 * focus through the popover owner after its close button is used.
 */

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_PANEL_SETTINGS,
  clampPanelSettings,
  loadPanelSettings,
  savePanelSettings,
  type GraphPanelSettings,
} from "../../lib/graph/graph-panel-settings";
import type { LodLevel } from "../../lib/graph/lod";
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
          <button
            className="graph-force-reset"
            onClick={() => onChange(DEFAULT_PANEL_SETTINGS)}
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
