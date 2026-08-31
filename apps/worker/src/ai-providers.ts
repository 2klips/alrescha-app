import {
  CONCEPT_SYNTHESIS_JSON_SCHEMA,
  rubricCeilings,
  type JudgmentProvider,
  type JudgmentRequest,
  type PromptSignals,
} from "@arr/core";

import type { CoachingProvider } from "./coaching-job";

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
            name: "arr_judgment",
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

/**
 * Enrich providers (Phase 3 Wave C todo 6) — one file in, one JSON object
 * out: `{summary}` prose. No sampling parameters are sent (current model
 * families reject them); repeatability comes from the blob-hash cache, which
 * summarizes a file once per blob rather than once per request.
 */

const ENRICH_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
  type: "object",
} as const;

const ENRICH_SYSTEM_PROMPT = [
  "You summarize one repository file for a knowledge graph.",
  "Write 3-8 sentences of plain English prose in a single paragraph:",
  "the file's purpose, its key exported symbols, and what it relates to.",
  "Never reproduce any exact line, string literal, or identifier list from",
  "the file — paraphrase in your own words. No code fences, no newlines.",
  "If the input is marked truncated, describe only what you saw.",
  "Return one JSON object matching the schema.",
].join(" ");

export interface EnrichProvider {
  readonly model: string;
  readonly name: string;
  summarize(request: {
    readonly path: string;
    readonly source: string;
    readonly truncated: boolean;
  }): Promise<unknown>;
  /** Wave C todo 7 — one summary batch in, one raw concept payload out. */
  synthesizeConcepts(
    batch: readonly { path: string; summary: string }[],
  ): Promise<unknown>;
  /** Wave C todo 8 — member summaries in, one module prose summary out. */
  summarizeModule(request: {
    readonly members: readonly { path: string; summary: string }[];
    readonly name: string;
  }): Promise<unknown>;
}

const MODULE_SYSTEM_PROMPT = [
  "You summarize one module of a repository for a knowledge graph, given",
  "prose summaries of its member files. Write 3-8 sentences of plain",
  "English prose in a single paragraph: what the module is responsible",
  "for, how its files divide that responsibility, and what it plugs into.",
  "Never reproduce exact lines or identifier lists; no code fences, no",
  "newlines. Return one JSON object matching the schema.",
].join(" ");

function modulePrompt(request: {
  readonly members: readonly { path: string; summary: string }[];
  readonly name: string;
}): string {
  return JSON.stringify({ members: request.members, module: request.name });
}

function enrichPrompt(request: {
  readonly path: string;
  readonly source: string;
  readonly truncated: boolean;
}): string {
  return JSON.stringify({
    path: request.path,
    source: request.source,
    truncated: request.truncated,
  });
}

export class OpenAiEnrichProvider implements EnrichProvider {
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

  async summarize(request: {
    readonly path: string;
    readonly source: string;
    readonly truncated: boolean;
  }): Promise<unknown> {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          { content: ENRICH_SYSTEM_PROMPT, role: "system" },
          { content: enrichPrompt(request), role: "user" },
        ],
        max_output_tokens: 500,
        model: this.model,
        store: false,
        text: {
          format: {
            name: "arr_enrich_summary",
            schema: ENRICH_JSON_SCHEMA,
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
        `OpenAI enrich request failed with status ${response.status}.`,
      );
    }
    return parseJson(openAiOutputText(await response.json()), "OpenAI");
  }

  async synthesizeConcepts(
    batch: readonly { path: string; summary: string }[],
  ): Promise<unknown> {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          { content: CONCEPT_SYSTEM_PROMPT, role: "system" },
          { content: conceptPrompt(batch), role: "user" },
        ],
        max_output_tokens: 4_000,
        model: this.model,
        store: false,
        text: {
          format: {
            name: "arr_concept_graph",
            schema: CONCEPT_SYNTHESIS_JSON_SCHEMA,
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
        `OpenAI concept request failed with status ${response.status}.`,
      );
    }
    return parseJson(openAiOutputText(await response.json()), "OpenAI");
  }

  async summarizeModule(request: {
    readonly members: readonly { path: string; summary: string }[];
    readonly name: string;
  }): Promise<unknown> {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          { content: MODULE_SYSTEM_PROMPT, role: "system" },
          { content: modulePrompt(request), role: "user" },
        ],
        max_output_tokens: 500,
        model: this.model,
        store: false,
        text: {
          format: {
            name: "arr_module_summary",
            schema: ENRICH_JSON_SCHEMA,
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
        `OpenAI module request failed with status ${response.status}.`,
      );
    }
    return parseJson(openAiOutputText(await response.json()), "OpenAI");
  }
}

export class AnthropicEnrichProvider implements EnrichProvider {
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

  async summarize(request: {
    readonly path: string;
    readonly source: string;
    readonly truncated: boolean;
  }): Promise<unknown> {
    // Forced tool use, not prose-JSON: the pilot run produced 37 outputs
    // wrapped in prose and 11 truncated at the old 500-token cap.
    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 700,
        messages: [{ content: enrichPrompt(request), role: "user" }],
        model: this.model,
        system: ENRICH_SYSTEM_PROMPT,
        tool_choice: { name: "record_summary", type: "tool" },
        tools: [
          {
            description: "Record the prose summary of this file.",
            input_schema: ENRICH_JSON_SCHEMA,
            name: "record_summary",
          },
        ],
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
        `Anthropic enrich request failed with status ${response.status}.`,
      );
    }
    return anthropicToolInput(await response.json(), "record_summary");
  }

  async synthesizeConcepts(
    batch: readonly { path: string; summary: string }[],
  ): Promise<unknown> {
    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 8_000,
        messages: [{ content: conceptPrompt(batch), role: "user" }],
        model: this.model,
        system: CONCEPT_SYSTEM_PROMPT,
        tool_choice: { name: "record_concepts", type: "tool" },
        tools: [
          {
            description:
              "Record the synthesized concept layer for this summary batch.",
            input_schema: CONCEPT_SYNTHESIS_JSON_SCHEMA,
            name: "record_concepts",
          },
        ],
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
        `Anthropic concept request failed with status ${response.status}.`,
      );
    }
    return anthropicToolInput(await response.json(), "record_concepts");
  }

  async summarizeModule(request: {
    readonly members: readonly { path: string; summary: string }[];
    readonly name: string;
  }): Promise<unknown> {
    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 700,
        messages: [{ content: modulePrompt(request), role: "user" }],
        model: this.model,
        system: MODULE_SYSTEM_PROMPT,
        tool_choice: { name: "record_summary", type: "tool" },
        tools: [
          {
            description: "Record the prose summary of this module.",
            input_schema: ENRICH_JSON_SCHEMA,
            name: "record_summary",
          },
        ],
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
        `Anthropic module request failed with status ${response.status}.`,
      );
    }
    return anthropicToolInput(await response.json(), "record_summary");
  }
}

/**
 * Concept synthesis (Wave C todo 7) — summaries in, a concept layer out.
 * Anthropic runs a forced tool call against the strict schema; OpenAI runs
 * the strict json_schema response format. Both shapes are validated again by
 * the deterministic clean pass in @arr/core before anything persists.
 */

const CONCEPT_SYSTEM_PROMPT = [
  "You build the concept layer of a code knowledge graph from file",
  "summaries. Identify 3-12 concepts a developer would name when explaining",
  "this repository: systems (deployable/runtime units), apis (exposed",
  "surfaces), and concepts (cross-cutting ideas, flows, domains).",
  "Each concept needs: a short name, kind, a 1-3 sentence single-line",
  "summary, member_paths drawn ONLY from the input paths, and links using",
  "ONLY the verbs part_of, uses, depends_on, produces, configures,",
  "validates, implements. A link targets either another concept by exact",
  "name (target_concept) or an input path (target_path); set the unused",
  "field to null. If a relationship is ambiguous, omit the link entirely.",
].join(" ");

function conceptPrompt(
  batch: readonly { path: string; summary: string }[],
): string {
  return JSON.stringify(batch.map(({ path, summary }) => ({ path, summary })));
}

function anthropicToolInput(payload: unknown, toolName: string): unknown {
  const response = object(payload);
  if (!Array.isArray(response?.content)) {
    throw new Error("Anthropic response was incomplete.");
  }
  // A truncated tool call arrives with an empty/partial input object — name
  // the real cause instead of letting it fail schema validation downstream.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Anthropic response hit max_tokens before completing the tool call.",
    );
  }
  for (const part of response.content) {
    const content = object(part);
    if (content?.type === "tool_use" && content.name === toolName) {
      return content.input;
    }
  }
  throw new Error("Anthropic response did not contain the forced tool call.");
}

/**
 * Coaching providers (Phase 2C todo 5 runner wiring) — one prompt in, one
 * rubric out. The deterministic floor stays with the handler: the request
 * carries the per-axis ceilings so the model is TOLD the caps, but an output
 * above a cap is rejected unbilled by `validateCoachingOutput`, never
 * clamped into validity here.
 */

const COACHING_AXIS_SCHEMA = { enum: [0, 1, 2], type: "integer" } as const;

const COACHING_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    grade: { enum: ["inferred"], type: "string" },
    rubric: {
      additionalProperties: false,
      properties: {
        batchSize: COACHING_AXIS_SCHEMA,
        contextGrounding: COACHING_AXIS_SCHEMA,
        noOverInstruction: COACHING_AXIS_SCHEMA,
        specificity: COACHING_AXIS_SCHEMA,
        stopCondition: COACHING_AXIS_SCHEMA,
        verifiability: COACHING_AXIS_SCHEMA,
      },
      required: [
        "batchSize",
        "contextGrounding",
        "noOverInstruction",
        "specificity",
        "stopCondition",
        "verifiability",
      ],
      type: "object",
    },
    suggestions: {
      items: { maxLength: 300, minLength: 1, type: "string" },
      maxItems: 3,
      type: "array",
    },
  },
  required: ["grade", "rubric", "suggestions"],
  type: "object",
} as const;

const COACHING_SYSTEM_PROMPT = [
  "You coach one AI prompt against a six-axis rubric (0-2 per axis).",
  "The request lists per-axis ceilings computed from observable signals in",
  "the prompt text — never score an axis above its ceiling; such an output",
  "is rejected. Refine the supplied baseline suggestions into at most three",
  "concrete, actionable ones written in the prompt's own language. The grade",
  "is always 'inferred'. Return one JSON object matching the schema.",
].join(" ");

interface CoachingCallRequest {
  readonly ceilings: PromptSignals;
  readonly promptText: string;
  readonly suggestions: readonly string[];
}

function coachingPrompt(request: CoachingCallRequest): string {
  return JSON.stringify({
    axisCeilings: rubricCeilings(request.ceilings),
    baselineSuggestions: request.suggestions,
    promptText: request.promptText,
  });
}

export class OpenAiCoachingProvider implements CoachingProvider {
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

  async run(request: CoachingCallRequest): Promise<unknown> {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          { content: COACHING_SYSTEM_PROMPT, role: "system" },
          { content: coachingPrompt(request), role: "user" },
        ],
        max_output_tokens: 800,
        model: this.model,
        store: false,
        text: {
          format: {
            name: "arr_prompt_coaching",
            schema: COACHING_JSON_SCHEMA,
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
        `OpenAI coaching request failed with status ${response.status}.`,
      );
    }
    return parseJson(openAiOutputText(await response.json()), "OpenAI");
  }
}

export class AnthropicCoachingProvider implements CoachingProvider {
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

  async run(request: CoachingCallRequest): Promise<unknown> {
    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 800,
        messages: [{ content: coachingPrompt(request), role: "user" }],
        model: this.model,
        system: [COACHING_SYSTEM_PROMPT, JSON.stringify(COACHING_JSON_SCHEMA)].join(
          "\n",
        ),
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
        `Anthropic coaching request failed with status ${response.status}.`,
      );
    }
    return parseJson(anthropicOutputText(await response.json()), "Anthropic");
  }
}
