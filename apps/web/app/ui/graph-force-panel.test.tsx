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
    for (const key of ["nodeSize", "linkThickness", "localGraphDepth"]) {
      expect(html).toContain(`data-force-key="${key}"`);
    }
    // Four forces, the domain anchor, the label fade, and the three display
    // sliders (node size, link thickness, local-graph depth) — todo 13 ⓒ·ⓓ.
    expect(html.match(/type="range"/g)).toHaveLength(9);
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

  test("popover mode stays expanded and exposes an accessible close action", () => {
    const html = renderToStaticMarkup(
      createElement(GraphForcePanel, {
        onChange: () => undefined,
        onClose: () => undefined,
        settings: clampPanelSettings({ collapsed: true }),
      }),
    );

    expect(html).toContain("data-force-close");
    expect(html).toContain(`aria-label="${DASHBOARD.forcePanel.close}"`);
    // Four forces, the domain anchor, the label fade, and the three display
    // sliders (node size, link thickness, local-graph depth) — todo 13 ⓒ·ⓓ.
    expect(html.match(/type="range"/g)).toHaveLength(9);
  });

  test("exposes the display options, the groups editor and the presets (todo 13)", () => {
    const html = render();

    expect(html).toContain('data-display-key="showOrphans"');
    expect(html).toContain('data-display-key="showArrows"');
    expect(html).toContain('data-force-key="domainAnchorStrength"');
    expect(html).toContain(DASHBOARD.forcePanel.sections.display);
    expect(html).toContain(DASHBOARD.forcePanel.sections.groups);
    expect(html).toContain(DASHBOARD.forcePanel.sections.presets);
    expect(html).toContain('data-testid="graph-groups"');
    expect(html).toContain('data-testid="graph-presets"');
    expect(html).toContain(DASHBOARD.forcePanel.presets.empty);
  });

  test("lists saved presets and groups with their own controls", () => {
    const html = render(
      clampPanelSettings({
        groups: [{ color: "danger-fg", query: "auth" }],
        presets: [
          {
            name: "구조만",
            settings: { ...DEFAULT_PANEL_SETTINGS, showArrows: true },
          },
        ],
      }),
    );

    expect(html).toContain('data-preset-apply="구조만"');
    expect(html).toContain('data-preset-remove="구조만"');
    expect(html).toContain("<code>auth</code>");
    expect(html).toContain("graph-group-swatch danger-fg");
  });
});
