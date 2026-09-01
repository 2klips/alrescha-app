import { describe, expect, it } from "vitest";

import { resolveCliEnvironment } from "./environment";

describe("resolveCliEnvironment", () => {
  it("prefers canonical Alrescha variables", () => {
    expect(
      resolveCliEnvironment({
        ALRESCHA_SERVER_URL: "https://alrescha.example",
        ALRESCHA_TOKEN: "canonical",
        ARR_SERVER_URL: "https://arr.example",
        ARR_TOKEN: "legacy",
      }),
    ).toEqual({
      server: "https://alrescha.example",
      token: "canonical",
    });
  });

  it("accepts legacy Arr variables during migration", () => {
    expect(
      resolveCliEnvironment({
        ARR_SERVER_URL: "https://arr.example",
        ARR_TOKEN: "legacy",
      }),
    ).toEqual({
      server: "https://arr.example",
      token: "legacy",
    });
  });
});
