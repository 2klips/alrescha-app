import type { JudgmentProvider, JudgmentRequest } from "@arr/core";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const JUDGMENT_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    confidence: { maximum: 1, minimum: 0, type: "number" },
    evidenceGrade: { enum: ["inferred"], type: "string" },
    explanation: { type: "string" },
    severity: {
      enum: ["low", "medium", "high", "critical"],
      type: "string",
    },
    verdict: {
      enum: ["confirmed", "rejected", "ambiguous"],
      type: "string",
    },
  },
  required: [
    "confidence",
    "evidenceGrade",
    "explanation",
    "severity",
    "verdict",
  ],
  type: "object",
} as const;

function judgmentPrompt(request: JudgmentRequest): string {
  return JSON.stringify({
    context: request.context,
    currentConfidence: request.currentConfidence,
    currentSeverity: request.currentSeverity,
    judgmentKind: request.kind,
    targetId: request.targetId,
  });
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function openAiOutputText(payload: unknown): string {
  const response = object(payload);
  if (response?.status !== "completed" || !Array.isArray(response.output)) {
    throw new Error("OpenAI judgment response was incomplete.");
  }
  for (const item of response.output) {
    const message = object(item);
    if (message?.type !== "message" || !Array.isArray(message.content))
      continue;
    for (const part of message.content) {
      const content = object(part);
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI judgment response did not contain output text.");
}

function anthropicOutputText(payload: unknown): string {
  const response = object(payload);
  if (
    response?.stop_reason !== "end_turn" ||
    !Array.isArray(response.content)
  ) {
    throw new Error("Anthropic judgment response was incomplete.");
  }
  for (const part of response.content) {
    const content = object(part);
    if (content?.type === "text" && typeof content.text === "string") {
      return content.text;
    }
  }
  throw new Error("Anthropic judgment response did not contain output text.");
}

function parseJson(text: string, provider: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${provider} judgment response was not JSON.`);
  }
}

export class OpenAiJudgmentProvider implements JudgmentProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetch: Fetch;

  constructor(input: {
    readonly apiKey: string;
    readonly fetch?: Fetch;
    readonly model: string;
  }) {
    this.apiKey = input.apiKey;
    this.fetch = input.fetch ?? globalThis.fetch;
    this.model = input.model;
  }

  async run(request: JudgmentRequest): Promise<unknown> {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          {
            content:
              "Judge only supplied evidence. Return inferred evidence; never claim verified execution evidence.",
            role: "system",
          },
          { content: judgmentPrompt(request), role: "user" },
        ],
        max_output_tokens: 800,
        model: this.model,
        store: false,
        text: {
          format: {
            name: "specproof_judgment",
            schema: JUDGMENT_JSON_SCHEMA,
            strict: true,
            type: "json_schema",
          },
        },
      }),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `OpenAI judgment request failed with status ${response.status}.`,
      );
    }
    return parseJson(openAiOutputText(await response.json()), "OpenAI");
  }
}

export class AnthropicJudgmentProvider implements JudgmentProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetch: Fetch;

  constructor(input: {
    readonly apiKey: string;
    readonly fetch?: Fetch;
    readonly model: string;
  }) {
    this.apiKey = input.apiKey;
    this.fetch = input.fetch ?? globalThis.fetch;
    this.model = input.model;
  }

  async run(request: JudgmentRequest): Promise<unknown> {
    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 800,
        messages: [{ content: judgmentPrompt(request), role: "user" }],
        model: this.model,
        system: [
          "Judge only supplied evidence. Return one JSON object matching the schema. Evidence grade must remain inferred; never claim verified execution evidence.",
          JSON.stringify(JUDGMENT_JSON_SCHEMA),
        ].join("\n"),
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `Anthropic judgment request failed with status ${response.status}.`,
      );
    }
    return parseJson(anthropicOutputText(await response.json()), "Anthropic");
  }
}
