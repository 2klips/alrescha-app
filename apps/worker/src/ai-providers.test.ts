import { describe, expect, it, vi } from "vitest";

import {
  AnthropicCoachingProvider,
  AnthropicEnrichProvider,
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
          name: "alrescha_judgment",
          strict: true,
          type: "json_schema",
        },
      },
    });
  });

  it("uses the Anthropic Messages API behind the same provider contract", async () => {
    // Forced tool use: the verdict arrives as the tool call's input, never as
    // prose that has to reach `end_turn` inside the token cap.
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              id: "toolu_1",
              input: {
                confidence: 0.8,
                evidenceGrade: "inferred",
                explanation: "The requirement remains ambiguous.",
                severity: "low",
                verdict: "ambiguous",
              },
              name: "record_judgment",
              type: "tool_use",
            },
          ],
          stop_reason: "tool_use",
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
      tool_choice: { name: "record_judgment", type: "tool" },
    });
  });

  it("names a truncated Anthropic judgment instead of failing on the schema", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              id: "toolu_1",
              input: {},
              name: "record_judgment",
              type: "tool_use",
            },
          ],
          stop_reason: "max_tokens",
        }),
        { status: 200 },
      ),
    );
    const provider = new AnthropicJudgmentProvider({
      apiKey: "k",
      fetch,
      model: "m",
    });
    await expect(
      provider.run({
        context: ["x"],
        currentConfidence: 0.5,
        currentSeverity: "low",
        kind: "drift-verdict-confirmation",
        targetId: "finding-1",
      }),
    ).rejects.toThrow(/max_tokens/);
  });
});

describe("AI coaching provider adapters", () => {
  it("forces the Anthropic coaching tool and carries the axis ceilings", async () => {
    const rubric = {
      batchSize: 1,
      contextGrounding: 2,
      noOverInstruction: 2,
      specificity: 2,
      stopCondition: 0,
      verifiability: 2,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              id: "toolu_2",
              input: {
                grade: "inferred",
                rubric,
                suggestions: ["정지 조건을 넣으세요."],
              },
              name: "record_coaching",
              type: "tool_use",
            },
          ],
          stop_reason: "tool_use",
        }),
        { status: 200 },
      ),
    );
    const provider = new AnthropicCoachingProvider({
      apiKey: "test-anthropic-key",
      fetch,
      model: "test-anthropic-model",
    });

    const output = await provider.run({
      ceilings: {
        hasContextReference: true,
        hasStopCondition: false,
        hasVerificationSignal: true,
        wordCount: 24,
      },
      promptText: "spec/auth.md의 REQ-3 구현, tests 통과까지",
      suggestions: ["정지 조건을 넣으세요."],
    });

    expect(output).toMatchObject({ grade: "inferred", rubric });
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      tool_choice: { name: "record_coaching", type: "tool" },
    });
    // The deterministic floor rides along: the model is told the caps.
    const user = JSON.parse(body.messages[0].content);
    expect(user.axisCeilings).toMatchObject({
      contextGrounding: 2,
      stopCondition: 0,
      verifiability: 2,
    });
  });
});

/**
 * The provider's explanation, kept (2026-09-06 live enrich run).
 *
 * Every failure here used to read "failed with status 400", which sounds
 * like a malformed request. The first live run's 400 was a billing message —
 * the account had run out of credit mid-pass — and finding that out cost an
 * edit and a second paid call. The body is the only place the reason lives.
 */
describe("provider failures carry the reason", () => {
  const batch = [{ path: "src/a.ts", summary: "does a thing" }];

  it("includes the provider's own message", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Your credit balance is too low to access the API.",
            type: "invalid_request_error",
          },
          type: "error",
        }),
        { status: 400 },
      ),
    );
    const provider = new AnthropicEnrichProvider({
      apiKey: "k",
      fetch,
      model: "claude-sonnet-5",
    });

    await expect(provider.synthesizeConcepts(batch)).rejects.toThrow(
      /status 400\..*credit balance is too low/,
    );
  });

  it("still fails cleanly when the body cannot be read", async () => {
    const unreadable = new Response("", { status: 500 });
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("socket closed"));
    const provider = new AnthropicEnrichProvider({
      apiKey: "k",
      fetch: vi.fn().mockResolvedValue(unreadable),
      model: "claude-sonnet-5",
    });

    // A provider that dies mid-body must still produce the status, not a
    // stack trace about reading it.
    await expect(provider.synthesizeConcepts(batch)).rejects.toThrow(
      "Anthropic concept request failed with status 500.",
    );
  });

  it("bounds the detail so an error stays an error", async () => {
    const provider = new AnthropicEnrichProvider({
      apiKey: "k",
      fetch: vi
        .fn()
        .mockResolvedValue(new Response("x".repeat(4_000), { status: 413 })),
      model: "claude-sonnet-5",
    });

    await expect(provider.synthesizeConcepts(batch)).rejects.toThrow(
      /^Anthropic concept request failed with status 413\. x{500}$/,
    );
  });
});
