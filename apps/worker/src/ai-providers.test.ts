import { describe, expect, it, vi } from "vitest";

import {
  AnthropicJudgmentProvider,
  OpenAiJudgmentProvider,
} from "./ai-providers";

describe("AI judgment provider adapters", () => {
  it("uses the OpenAI Responses API structured-output contract", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    confidence: 0.9,
                    evidenceGrade: "inferred",
                    explanation: "The two requirements conflict.",
                    severity: "medium",
                    verdict: "confirmed",
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
    const provider = new OpenAiJudgmentProvider({
      apiKey: "test-openai-key",
      fetch,
      model: "test-openai-model",
    });

    const output = await provider.run({
      context: ["Root requires camelCase.", "API scope requires snake_case."],
      currentConfidence: 0.62,
      currentSeverity: "medium",
      kind: "contradiction-confirmation",
      targetId: "finding-1",
    });

    expect(output).toMatchObject({
      evidenceGrade: "inferred",
      verdict: "confirmed",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-openai-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-openai-model",
      store: false,
      text: {
        format: {
          name: "specproof_judgment",
          strict: true,
          type: "json_schema",
        },
      },
    });
  });

  it("uses the Anthropic Messages API behind the same provider contract", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              text: JSON.stringify({
                confidence: 0.8,
                evidenceGrade: "inferred",
                explanation: "The requirement remains ambiguous.",
                severity: "low",
                verdict: "ambiguous",
              }),
              type: "text",
            },
          ],
          stop_reason: "end_turn",
        }),
        { status: 200 },
      ),
    );
    const provider = new AnthropicJudgmentProvider({
      apiKey: "test-anthropic-key",
      fetch,
      model: "test-anthropic-model",
    });

    const output = await provider.run({
      context: ["Requirement says responses should be fast."],
      currentConfidence: 0.55,
      currentSeverity: "low",
      kind: "requirement-disambiguation",
      targetId: "requirement-1",
    });

    expect(output).toMatchObject({
      evidenceGrade: "inferred",
      verdict: "ambiguous",
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": "test-anthropic-key",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-anthropic-model",
    });
  });
});
