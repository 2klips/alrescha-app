import { describe, expect, it } from "vitest";

import { deterministicUlid } from "./deterministic-id";

describe("deterministicUlid", () => {
  it("is stable for the same seed and ULID-shaped", () => {
    const first = deterministicUlid("ws|repo|spec/auth.md|REQ-AUTH-001");
    expect(first).toBe(deterministicUlid("ws|repo|spec/auth.md|REQ-AUTH-001"));
    expect(first).toMatch(/^0[0-9A-HJKMNP-TV-Z]{25}$/);
  });

  it("changes when any stable part of the seed changes", () => {
    const base = deterministicUlid("ws|repo|spec/auth.md|REQ-AUTH-001");
    expect(deterministicUlid("ws|repo|spec/auth.md|REQ-AUTH-002")).not.toBe(base);
    expect(deterministicUlid("ws|other|spec/auth.md|REQ-AUTH-001")).not.toBe(base);
  });
});
