import { randomBytes } from "node:crypto";

import { encryptByokKey } from "@arr/core/byok";
import { describe, expect, it, vi } from "vitest";

import { JudgmentProviderLoader } from "./provider-loader";

describe("judgment provider credential loading", () => {
  it("decrypts a workspace BYOK key and does not use platform credits credentials", async () => {
    const masterKey = randomBytes(32).toString("base64");
    const envelope = encryptByokKey({
      masterKey,
      providerKey: "workspace-openai-key",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    confidence: 0.7,
                    evidenceGrade: "inferred",
                    explanation: "Ambiguous.",
                    severity: "low",
                    verdict: "ambiguous",
                  }),
                  type: "output_text",
                },
              ],
              type: "message",
            },
          ],
          status: "completed",
        }),
        { status: 200 },
      ),
    );
    const loader = new JudgmentProviderLoader({
      byokKeys: {
        load: vi.fn().mockResolvedValue(envelope),
      },
      fetch,
      masterKey,
      platformKeys: { openai: "platform-openai-key" },
    });

    const provider = await loader.load({
      billingMode: "byok",
      provider: "openai",
      workspaceId: "workspace-1",
    });
    await provider.run({
      context: ["source"],
      currentConfidence: 0.5,
      currentSeverity: "low",
      kind: "requirement-disambiguation",
      targetId: "requirement-1",
    });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer workspace-openai-key",
    });
    expect(JSON.stringify(init)).not.toContain("platform-openai-key");
  });
});
