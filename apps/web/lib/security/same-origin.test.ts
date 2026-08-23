import { describe, expect, it } from "vitest";

import { addressedOrigin, isSameOriginRequest } from "./same-origin";

/**
 * The pilot's defect 3 (Phase 2C todo 5): the old guard compared Origin
 * against `new URL(request.url).origin`, which Next normalises to the host
 * the server bound. A browser on `127.0.0.1` talking to a server bound on
 * `localhost` failed every guarded POST with 403. Fixture tests never caught
 * it because they built the request URL and the Origin from the same string —
 * which is exactly what these requests reproduce: `request.url` carries the
 * bound host while the headers carry what the browser sent.
 */

function post(headers: Record<string, string>): Request {
  // request.url deliberately disagrees with the Host header, as in Next dev.
  return new Request("http://localhost:3000/api/github/repositories", {
    headers,
    method: "POST",
  });
}

describe("isSameOriginRequest", () => {
  it("accepts a same-origin submission under any host alias", () => {
    expect(
      isSameOriginRequest(
        post({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        post({ host: "localhost:3000", origin: "http://localhost:3000" }),
      ),
    ).toBe(true);
  });

  it("rejects a cross-site submission", () => {
    expect(
      isSameOriginRequest(
        post({ host: "127.0.0.1:3000", origin: "https://evil.example" }),
      ),
    ).toBe(false);
    // Same hostname, different port is a different origin.
    expect(
      isSameOriginRequest(
        post({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:4000" }),
      ),
    ).toBe(false);
  });

  it("fails closed on a missing, opaque, or malformed Origin", () => {
    expect(isSameOriginRequest(post({ host: "127.0.0.1:3000" }))).toBe(false);
    expect(
      isSameOriginRequest(post({ host: "127.0.0.1:3000", origin: "null" })),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        post({ host: "127.0.0.1:3000", origin: "not a url" }),
      ),
    ).toBe(false);
  });
});

describe("addressedOrigin", () => {
  it("builds redirects for the host the browser addressed, not the bound one", () => {
    // The session cookie lives on the addressed host; a redirect to the bound
    // alias would land the user on the login screen mid-flow.
    expect(addressedOrigin(post({ host: "127.0.0.1:3000" }))).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("falls back to the request URL when no Host header exists", () => {
    expect(addressedOrigin(post({}))).toBe("http://localhost:3000");
  });
});
