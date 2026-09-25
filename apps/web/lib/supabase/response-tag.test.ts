import { describe, expect, it } from "vitest";

import { responseTag } from "./response-tag";

describe("responseTag", () => {
  it("leads with the status and a PostgREST or SQLSTATE code", () => {
    expect(responseTag({ error: { code: "PGRST116" }, status: 406 })).toBe(
      "[HTTP 406 PGRST116] ",
    );
    expect(responseTag({ error: { code: "57014" }, status: 500 })).toBe(
      "[HTTP 500 57014] ",
    );
  });

  it("says 0 when there was no HTTP answer", () => {
    // postgrest-js answers a failed fetch with status 0 and an empty code.
    expect(responseTag({ error: { code: "" }, status: 0 })).toBe("[HTTP 0] ");
  });

  it("keeps a code it cannot vouch for out of the tag", () => {
    expect(
      responseTag({ error: { code: "not a code at all" }, status: 502 }),
    ).toBe("[HTTP 502] ");
  });

  it("gives nothing for a response with no status", () => {
    expect(responseTag({ error: { code: "PGRST116" } })).toBe("");
  });
});
