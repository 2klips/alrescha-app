import { describe, expect, it } from "vitest";

import { refreshSession, SESSION_TIMEOUT_MS } from "../src/session";

describe("benchmark refreshSession", () => {
  it("refreshes active sessions and rejects expired sessions", () => {
    const session = { lastActivityAt: 1_000 };
    expect(refreshSession(session, 2_000)).toEqual({ lastActivityAt: 2_000 });
    expect(refreshSession(session, 1_000 + SESSION_TIMEOUT_MS)).toBeNull();
  });
});
