import { describe, expect, it, vi } from "vitest";

import { readMinimalIndexSource } from "./source";

describe("minimal-index GitHub source reader", () => {
  it("reads the base SHA and agent files without repository writes", async () => {
    const agents = "# Existing rules\n\nKeep these bytes.\n";
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.includes("/git/ref/heads/main")) {
        return Response.json({ object: { sha: "a".repeat(40) } });
      }
      if (url.includes("/contents/AGENTS.md")) {
        return Response.json({
          content: Buffer.from(agents).toString("base64"),
          encoding: "base64",
        });
      }
      if (url.includes("/contents/CLAUDE.md")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 500 });
    });

    await expect(
      readMinimalIndexSource({
        branch: "main",
        fetchImplementation,
        repository: "2klips/specproof-app",
        token: "installation-token",
      }),
    ).resolves.toEqual({
      agentsContent: agents,
      baseSha: "a".repeat(40),
      claudeContent: null,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(
      fetchImplementation.mock.calls.every(
        ([, init]) => init?.method === undefined,
      ),
    ).toBe(true);
  });
});
