import { describe, expect, it } from "vitest";

import { resolveCliEnvironment } from "./environment";

describe("resolveCliEnvironment", () => {
  it("reads canonical Alrescha variables", () => {
    expect(
      resolveCliEnvironment({
        ALRESCHA_SERVER_URL: "https://alrescha.example",
        ALRESCHA_TOKEN: "canonical",
      }),
    ).toEqual({
      server: "https://alrescha.example",
      token: "canonical",
    });
  });

  it("ignores removed Arr variables", () => {
    expect(
      resolveCliEnvironment({
        ARR_SERVER_URL: "https://arr.example",
        ARR_TOKEN: "legacy",
      }),
    ).toEqual({
      server: null,
      token: null,
    });
  });
});
