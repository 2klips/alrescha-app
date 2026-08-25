/**
 * Provider-agnostic agent loop (todo 15): one trial = repeated model calls
 * with the arm's tools until the model calls `submit_answer` or the
 * pre-registered turn cap is reached. Turns (model invocations) are the
 * primary metric; token accounting is the provider's own reported usage,
 * summed across the trial's calls — never a local estimate.
 */

import type { ToolDefinition, ToolExecutor } from "./tools";

export interface AgentTrialInput {
  readonly executor: ToolExecutor;
  readonly model: string;
  readonly prompt: string;
  /** Mock-only scripted answer so the dry run proves the whole pipeline. */
  readonly scriptedAnswer?: string;
  readonly system: string;
  readonly tools: readonly ToolDefinition[];
  readonly turnCap: number;
}

export interface AgentTrialOutcome {
  readonly answer: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly turns: number;
}

export interface AgentModel {
  runTrial(input: AgentTrialInput): Promise<AgentTrialOutcome>;
}

function redactProviderMessage(message: string): string {
  return message
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]");
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function postWithRetry(input: {
  body: unknown;
  fetchImplementation: typeof fetch;
  headers: Record<string, string>;
  retryStatuses: readonly number[];
  sleepImplementation: (milliseconds: number) => Promise<void>;
  url: string;
}): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await input.fetchImplementation(input.url, {
      body: JSON.stringify(input.body),
      headers: input.headers,
      method: "POST",
    });
    const body = (await response.json()) as Record<string, unknown> & {
      error?: { message?: string };
    };
    if (response.ok) return body;
    const message = redactProviderMessage(
      body.error?.message ?? "request failed",
    );
    lastError = new Error(`Provider ${response.status}: ${message}`);
    const retryable =
      input.retryStatuses.includes(response.status) || response.status >= 500;
    if (!retryable) throw lastError;
    if (attempt < 6) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1_000
          : attempt * 500;
      await input.sleepImplementation(
        Math.min(20_000, Math.max(250, Math.ceil(delay))),
      );
    }
  }
  throw lastError ?? new Error("Provider request failed after retries.");
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Anthropic Messages multi-turn loop: assistant tool_use blocks are answered
 * with user tool_result blocks until submit_answer or the cap.
 */
export function createAnthropicAgentModel(
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  sleepImplementation: (milliseconds: number) => Promise<void> = defaultSleep,
): AgentModel {
  if (!apiKey.trim()) {
    throw new TypeError("ANTHROPIC_API_KEY is required for the agent loop.");
  }
  return {
    async runTrial(input) {
      const tools = input.tools.map((tool) => ({
        description: tool.description,
        input_schema: tool.parameters,
        name: tool.name,
      }));
      const messages: unknown[] = [{ content: input.prompt, role: "user" }];
      let inputTokens = 0;
      let outputTokens = 0;
      let toolCalls = 0;
      for (let turn = 1; turn <= input.turnCap; turn += 1) {
        const body = await postWithRetry({
          body: {
            max_tokens: 2_048,
            messages,
            model: input.model,
            system: input.system,
            tools,
          },
          fetchImplementation,
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": apiKey,
          },
          retryStatuses: [429, 529],
          sleepImplementation,
          url: "https://api.anthropic.com/v1/messages",
        });
        const usage = body.usage as
          { input_tokens?: number; output_tokens?: number } | undefined;
        if (
          !Number.isInteger(usage?.input_tokens) ||
          !Number.isInteger(usage?.output_tokens)
        ) {
          throw new TypeError("Anthropic omitted authoritative token usage.");
        }
        inputTokens += usage!.input_tokens!;
        outputTokens += usage!.output_tokens!;
        const content = (body.content ?? []) as Array<{
          id?: string;
          input?: unknown;
          name?: string;
          text?: string;
          type?: string;
        }>;
        const toolUses = content.filter((block) => block.type === "tool_use");
        const submit = toolUses.find((block) => block.name === "submit_answer");
        if (submit) {
          const args = parseArguments(submit.input);
          return {
            answer: typeof args.answer === "string" ? args.answer : "",
            inputTokens,
            outputTokens,
            toolCalls: toolCalls + toolUses.length,
            turns: turn,
          };
        }
        if (toolUses.length === 0) {
          const text = content
            .filter((block) => block.type === "text")
            .map((block) => block.text ?? "")
            .join("\n")
            .trim();
          return {
            answer: text.length > 0 ? text : null,
            inputTokens,
            outputTokens,
            toolCalls,
            turns: turn,
          };
        }
        toolCalls += toolUses.length;
        messages.push({ content, role: "assistant" });
        messages.push({
          content: toolUses.map((block) => ({
            content: input.executor.execute(
              block.name ?? "",
              parseArguments(block.input),
            ),
            tool_use_id: block.id ?? "",
            type: "tool_result",
          })),
          role: "user",
        });
      }
      return {
        answer: null,
        inputTokens,
        outputTokens,
        toolCalls,
        turns: input.turnCap,
      };
    },
  };
}

/**
 * OpenAI Responses multi-turn loop, chained by previous_response_id so
 * reasoning state survives between turns; each turn submits only the new
 * function_call_output items.
 */
export function createOpenAiAgentModel(
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  sleepImplementation: (milliseconds: number) => Promise<void> = defaultSleep,
): AgentModel {
  if (!apiKey.trim()) {
    throw new TypeError("OPENAI_API_KEY is required for the agent loop.");
  }
  return {
    async runTrial(input) {
      const tools = input.tools.map((tool) => ({
        description: tool.description,
        name: tool.name,
        parameters: tool.parameters,
        strict: false,
        type: "function" as const,
      }));
      let requestInput: unknown = [
        { content: input.system, role: "developer" },
        { content: input.prompt, role: "user" },
      ];
      let previousResponseId: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      let toolCalls = 0;
      for (let turn = 1; turn <= input.turnCap; turn += 1) {
        const body = await postWithRetry({
          body: {
            input: requestInput,
            max_output_tokens: 4_096,
            model: input.model,
            ...(previousResponseId
              ? { previous_response_id: previousResponseId }
              : {}),
            reasoning: { effort: "low" },
            store: true,
            tools,
          },
          fetchImplementation,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          retryStatuses: [429],
          sleepImplementation,
          url: "https://api.openai.com/v1/responses",
        });
        const usage = body.usage as
          { input_tokens?: number; output_tokens?: number } | undefined;
        if (
          typeof body.id !== "string" ||
          !Number.isInteger(usage?.input_tokens) ||
          !Number.isInteger(usage?.output_tokens)
        ) {
          throw new TypeError("OpenAI omitted id or authoritative usage.");
        }
        previousResponseId = body.id;
        inputTokens += usage!.input_tokens!;
        outputTokens += usage!.output_tokens!;
        const output = (body.output ?? []) as Array<{
          arguments?: string;
          call_id?: string;
          content?: Array<{ text?: string; type?: string }>;
          name?: string;
          type?: string;
        }>;
        const functionCalls = output.filter(
          (item) => item.type === "function_call",
        );
        const submit = functionCalls.find(
          (item) => item.name === "submit_answer",
        );
        if (submit) {
          const args = parseArguments(submit.arguments);
          return {
            answer: typeof args.answer === "string" ? args.answer : "",
            inputTokens,
            outputTokens,
            toolCalls: toolCalls + functionCalls.length,
            turns: turn,
          };
        }
        if (functionCalls.length === 0) {
          const text = output
            .flatMap((item) => item.content ?? [])
            .filter((block) => block.type === "output_text")
            .map((block) => block.text ?? "")
            .join("\n")
            .trim();
          return {
            answer: text.length > 0 ? text : null,
            inputTokens,
            outputTokens,
            toolCalls,
            turns: turn,
          };
        }
        toolCalls += functionCalls.length;
        requestInput = functionCalls.map((item) => ({
          call_id: item.call_id ?? "",
          output: input.executor.execute(
            item.name ?? "",
            parseArguments(item.arguments),
          ),
          type: "function_call_output",
        }));
      }
      return {
        answer: null,
        inputTokens,
        outputTokens,
        toolCalls,
        turns: input.turnCap,
      };
    },
  };
}

/**
 * The dry-run mock: one scripted exploration call, then submit_answer with
 * the caller-provided scripted answer — proving tools, loop accounting, and
 * grading end-to-end with zero credits.
 */
export function createMockAgentModel(): AgentModel {
  return {
    async runTrial(input) {
      const firstTool = input.tools[0];
      if (firstTool && firstTool.name !== "submit_answer") {
        input.executor.execute(firstTool.name, {});
      }
      return {
        answer: input.scriptedAnswer ?? "",
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: firstTool && firstTool.name !== "submit_answer" ? 2 : 1,
        turns: 2,
      };
    },
  };
}
