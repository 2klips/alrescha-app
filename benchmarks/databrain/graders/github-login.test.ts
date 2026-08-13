import { describe, expect, it } from "vitest";

import { loginWithGitHub } from "../src/auth";

describe("REQ-AUTH-001 loginWithGitHub", () => {
  it("builds a deterministic callback and rejects empty codes", () => {
    expect(loginWithGitHub("a b/+")).toBe("/auth/callback?code=a%20b%2F%2B");
    expect(() => loginWithGitHub("")).toThrow();
  });
});
