import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_SETTINGS,
  GROUP_LIMIT,
  PRESET_LIMIT,
  RESET_VIEW_PATCH,
  applyPreset,
  clampPanelSettings,
  displaySettingsOf,
  parsePanelSettings,
  removePreset,
  savePreset,
  serializePanelSettings,
} from "../apps/web/lib/graph/graph-panel-settings";
import {
  LAYOUT_STORE_VERSION,
  createMemoryLayoutStorage,
  decodeLayout,
  decodePins,
  encodeLayout,
  encodePins,
  layoutKey,
  pinsKey,
} from "../apps/web/lib/graph/layout-store";

/**
 * Phase 4 Wave B todo 13 — what is remembered between visits: the layout
 * (per commit), the pins (per workspace), and the panel's wider settings
 * with their presets (per browser).
 */

describe("layout store", () => {
  it("keys a layout by workspace and commit, and pins by workspace", () => {
    expect(layoutKey("ws", "abc")).toBe("layout:ws:abc");
    // No commit is no layout: an unscanned workspace has nothing to warm from.
    expect(layoutKey("ws", null)).toBeNull();
    expect(layoutKey("", "abc")).toBeNull();
    expect(pinsKey("ws")).toBe("pins:ws");
    expect(pinsKey("")).toBeNull();
  });

  it("round-trips positions, dropping non-finite ones on the way in", () => {
    const record = encodeLayout(
      "layout:ws:abc",
      new Map([
        ["a", { x: 1.5, y: -2 }],
        ["b", { x: Number.NaN, y: 0 }],
        ["c", { x: 3, y: 4 }],
      ]),
      1_000,
    );
    expect(record).toEqual({
      key: "layout:ws:abc",
      nodeIds: ["a", "c"],
      positions: [1.5, -2, 3, 4],
      savedAt: 1_000,
      version: LAYOUT_STORE_VERSION,
    });
    expect(decodeLayout(record)).toEqual(
      new Map([
        ["a", { x: 1.5, y: -2 }],
        ["c", { x: 3, y: 4 }],
      ]),
    );
  });

  it("refuses anything that is not a whole layout of this version", () => {
    expect(decodeLayout(null)).toBeNull();
    expect(decodeLayout("layout")).toBeNull();
    expect(
      decodeLayout({ ...encodeLayout("k", new Map(), 0), version: 99 }),
    ).toBeNull();
    // A truncated buffer is a layout of a different graph.
    expect(
      decodeLayout({
        key: "k",
        nodeIds: ["a", "b"],
        positions: [1, 2],
        savedAt: 0,
        version: LAYOUT_STORE_VERSION,
      }),
    ).toBeNull();
    expect(
      decodeLayout({
        key: "k",
        nodeIds: ["a"],
        positions: [1, "2"],
        savedAt: 0,
        version: LAYOUT_STORE_VERSION,
      }),
    ).toBeNull();
  });

  it("round-trips pins and refuses a malformed one whole", () => {
    const record = encodePins(
      "pins:ws",
      new Map([
        ["a", { x: 10, y: 20 }],
        ["b", { x: Number.POSITIVE_INFINITY, y: 0 }],
      ]),
      5,
    );
    expect(record.pins).toEqual([{ id: "a", x: 10, y: 20 }]);
    expect(decodePins(record)).toEqual(new Map([["a", { x: 10, y: 20 }]]));
    expect(decodePins({ ...record, pins: [{ id: "a", x: 1 }] })).toBeNull();
    expect(decodePins({ ...record, version: 0 })).toBeNull();
  });

  it("the memory storage reads back what it wrote and forgets on remove", async () => {
    const storage = createMemoryLayoutStorage();
    expect(await storage.read("k")).toBeNull();
    const record = encodeLayout("k", new Map([["a", { x: 1, y: 1 }]]), 1);
    await storage.write("k", record);
    expect(decodeLayout(await storage.read("k"))).toEqual(
      new Map([["a", { x: 1, y: 1 }]]),
    );
    await storage.remove("k");
    expect(await storage.read("k")).toBeNull();
  });
});

describe("panel settings with display options and presets", () => {
  it("clamps every display option and drops malformed groups", () => {
    const settings = clampPanelSettings({
      domainAnchorStrength: 9,
      groups: [
        { color: "danger-fg", query: "  auth  " },
        { color: "not-a-token", query: "x" },
        { color: "accent-fg", query: "   " },
        "junk",
      ] as never,
      linkThickness: 10,
      localGraphDepth: 2.6,
      nodeSize: 0.01,
      showArrows: "yes" as never,
      showOrphans: false,
    });
    expect(settings.domainAnchorStrength).toBe(0.05);
    expect(settings.groups).toEqual([{ color: "danger-fg", query: "auth" }]);
    expect(settings.linkThickness).toBe(3);
    expect(settings.localGraphDepth).toBe(3);
    expect(settings.nodeSize).toBe(0.5);
    expect(settings.showArrows).toBe(false);
    expect(settings.showOrphans).toBe(false);
    expect(displaySettingsOf(settings)).toEqual({
      groups: [{ color: "danger-fg", query: "auth" }],
      linkThickness: 3,
      nodeSize: 0.5,
      showArrows: false,
      showOrphans: false,
    });
  });

  it("keeps at most the group and preset limits", () => {
    const groups = Array.from({ length: GROUP_LIMIT + 3 }, (_, index) => ({
      color: "accent-fg" as const,
      query: `g${index}`,
    }));
    expect(clampPanelSettings({ groups }).groups).toHaveLength(GROUP_LIMIT);
    let settings = DEFAULT_PANEL_SETTINGS;
    for (let index = 0; index < PRESET_LIMIT + 2; index += 1) {
      settings = savePreset(settings, `p${index}`);
    }
    expect(settings.presets).toHaveLength(PRESET_LIMIT);
    // The oldest made room; the newest is the last saved.
    expect(settings.presets.at(-1)?.name).toBe(`p${PRESET_LIMIT + 1}`);
    expect(settings.presets[0]?.name).toBe("p2");
  });

  it("saves, applies and removes a preset without touching the others", () => {
    const changed = clampPanelSettings({
      linkDistance: 200,
      showArrows: true,
    });
    const withPreset = savePreset(changed, " 구조만 ");
    expect(withPreset.presets).toEqual([
      {
        name: "구조만",
        settings: expect.objectContaining({
          linkDistance: 200,
          showArrows: true,
        }),
      },
    ]);
    // Presets store the view, never the card state or other presets.
    expect("collapsed" in withPreset.presets[0]!.settings).toBe(false);

    const reset = clampPanelSettings({ ...withPreset, ...RESET_VIEW_PATCH });
    expect(reset.linkDistance).toBe(DEFAULT_PANEL_SETTINGS.linkDistance);
    expect(reset.showArrows).toBe(false);
    // Resetting the view keeps the presets.
    expect(reset.presets).toHaveLength(1);

    const applied = applyPreset(reset, "구조만");
    expect(applied.linkDistance).toBe(200);
    expect(applied.showArrows).toBe(true);
    expect(applied.presets).toHaveLength(1);
    expect(applyPreset(reset, "없음")).toBe(reset);

    // Saving under the same name replaces; removing forgets.
    const replaced = savePreset({ ...applied, linkDistance: 50 }, "구조만");
    expect(replaced.presets).toHaveLength(1);
    expect(replaced.presets[0]?.settings.linkDistance).toBe(50);
    expect(removePreset(replaced, "구조만").presets).toEqual([]);
  });

  it("survives a round trip through storage, and a hostile payload degrades to defaults", () => {
    const settings = savePreset(
      clampPanelSettings({ groups: [{ color: "accent-fg", query: "web" }] }),
      "웹",
    );
    expect(parsePanelSettings(serializePanelSettings(settings))).toEqual(
      settings,
    );
    expect(parsePanelSettings("{not json")).toEqual(DEFAULT_PANEL_SETTINGS);
    expect(
      parsePanelSettings(JSON.stringify({ presets: "nope", groups: 1 })),
    ).toEqual(DEFAULT_PANEL_SETTINGS);
  });
});
