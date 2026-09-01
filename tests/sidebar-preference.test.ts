import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  LEGACY_SIDEBAR_STORAGE_KEY,
  SIDEBAR_ATTRIBUTE,
  SIDEBAR_INIT_SCRIPT,
  SIDEBAR_STORAGE_KEY,
  applySidebarState,
} from "../apps/web/lib/shell/sidebar-preference";

function runBoot(canonical: string | null, legacy: string | null) {
  const attributes = new Map<string, string>();
  runInContext(
    SIDEBAR_INIT_SCRIPT,
    createContext({
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) =>
            attributes.set(name, value),
        },
      },
      window: {
        localStorage: {
          getItem: (key: string) =>
            key === SIDEBAR_STORAGE_KEY
              ? canonical
              : key === LEGACY_SIDEBAR_STORAGE_KEY
                ? legacy
                : null,
        },
      },
    }),
  );
  return attributes.get(SIDEBAR_ATTRIBUTE) ?? null;
}

describe("sidebar preference compatibility", () => {
  it("reads the legacy key only when the canonical key is absent", () => {
    expect(runBoot(null, "rail")).toBe("rail");
    expect(runBoot("expanded", "rail")).toBeNull();
    expect(runBoot("rail", "expanded")).toBe("rail");
  });

  it("writes only the canonical Alrescha key", () => {
    const written: Array<[string, string]> = [];
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => written.push([key, value]),
      },
    });
    const root = { setAttribute: () => undefined };

    try {
      applySidebarState("rail", root as unknown as Element);
      expect(written).toEqual([[SIDEBAR_STORAGE_KEY, "rail"]]);
    } finally {
      if (original === undefined)
        Reflect.deleteProperty(globalThis, "localStorage");
      else
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: original,
        });
    }
  });
});
