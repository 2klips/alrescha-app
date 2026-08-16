import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_PANEL_SETTINGS,
  clampPanelSettings,
} from "../../lib/graph/graph-panel-settings";
import { FORCE_LIMITS } from "../../lib/graph/simulation-protocol";
import { DASHBOARD } from "../../lib/strings";
import { GraphForcePanel } from "./graph-force-panel";

function render(
  settings = DEFAULT_PANEL_SETTINGS,
  extra: { labelCount?: number; lod?: "far" | "mid" | "near" } = {},
): string {
  return renderToStaticMarkup(
    createElement(GraphForcePanel, {
      onChange: () => undefined,
      settings,
      ...extra,
    }),
  );
}

describe("graph force panel", () => {
  test("exposes the four Obsidian forces plus the text fade slider", () => {
    const html = render();

    for (const key of Object.keys(FORCE_LIMITS)) {
      expect(html).toContain(`data-force-key="${key}"`);
    }
    expect(html).toContain('data-force-key="textFadeThreshold"');
    expect(html.match(/type="range"/g)).toHaveLength(5);
  });

  test("sliders are bounded by the published force limits", () => {
    const html = render();

    expect(html).toContain(`min="${FORCE_LIMITS.linkDistance.min}"`);
    expect(html).toContain(`max="${FORCE_LIMITS.linkDistance.max}"`);
  });

  test("copy is Korean-first and the collapsed card hides its sliders", () => {
    const open = render();
    const closed = render(clampPanelSettings({ collapsed: true }));

    expect(open).toContain(DASHBOARD.forcePanel.title);
    expect(open).toContain(DASHBOARD.forcePanel.collapse);
    expect(open).toContain('aria-expanded="true"');
    expect(closed).toContain(DASHBOARD.forcePanel.expand);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('type="range"');
  });

  test("reports the active zoom band and label count", () => {
    const html = render(DEFAULT_PANEL_SETTINGS, { labelCount: 12, lod: "mid" });

    expect(html).toContain(
      DASHBOARD.forcePanel.lodStatus(DASHBOARD.forcePanel.lodLevels.mid, 12),
    );
  });
});
