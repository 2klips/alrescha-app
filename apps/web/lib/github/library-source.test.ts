import { describe, expect, it, vi } from "vitest";

import { readHarnessAssetSource } from "./library-source";

describe("library GitHub source reader", () => {
  it("reads the exact repository path at the immutable source commit", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: Buffer.from("# Review auth\n\nCheck OAuth.").toString(
            "base64",
          ),
          encoding: "base64",
        }),
        { status: 200 },
      ),
    );

    const content = await readHarnessAssetSource({
      commitSha: "a".repeat(40),
      fetchImplementation,
      path: ".agents/skills/review auth/SKILL.md",
      repository: "arr/drifted-demo",
      token: "installation-secret",
    });

    expect(content).toBe("# Review auth\n\nCheck OAuth.");
    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "/repos/arr/drifted-demo/contents/.agents/skills/review%20auth/SKILL.md",
    );
    expect(String(url)).toContain(`ref=${"a".repeat(40)}`);
    expect(String(url)).not.toContain("installation-secret");
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer installation-secret",
    );
  });
});
