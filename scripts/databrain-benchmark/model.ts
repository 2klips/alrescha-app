import type {
  BenchmarkModel,
  BenchmarkModelOutput,
  BenchmarkTask,
} from "./types";

const BENCHMARK_OUTPUT_SCHEMA = {
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    files: {
      items: {
        additionalProperties: false,
        properties: {
          content: { type: "string" },
          path: { type: "string" },
        },
        required: ["content", "path"],
        type: "object",
      },
      type: "array",
    },
    findings: { items: { type: "string" }, type: "array" },
  },
  required: ["answer", "files", "findings"],
  type: "object",
} as const;

const BENCHMARK_SYSTEM_PROMPT =
  "Use only the supplied repository context. Complete the task objectively. Return complete changed files without Markdown fences. Put direct answers in answer and semantic drift identifiers in findings.";

const BENCHMARK_OUTPUT_TOOL_NAME = "databrain_benchmark_output";

function redactProviderMessage(message: string): string {
  return message
    .replace(/organization\s+\S+/gi, "organization [redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]");
}

function retryDelayMilliseconds(input: {
  attempt: number;
  message: string;
  retryAfterHeader: string | null;
}): number {
  const retryAfter = Number(input.retryAfterHeader);
  const messageDelay = input.message.match(/try again in ([\d.]+)(ms|s)/i);
  const milliseconds =
    input.retryAfterHeader !== null &&
    Number.isFinite(retryAfter) &&
    retryAfter >= 0
      ? retryAfter * 1_000
      : messageDelay
        ? Number(messageDelay[1]) *
          (messageDelay[2]?.toLowerCase() === "ms" ? 1 : 1_000)
        : input.attempt * 500;
  return Math.min(20_000, Math.max(250, Math.ceil(milliseconds)));
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

const IMPLEMENTATIONS: Record<string, BenchmarkModelOutput["files"]> = {
  "fixture-implement-github-login": [
    {
      content: `export function loginWithGitHub(code: string): string {
  if (code.length === 0) throw new TypeError("GitHub code is required.");
  return \`/auth/callback?code=\${encodeURIComponent(code)}\`;
}
`,
      path: "src/auth.ts",
    },
  ],
  "fixture-implement-password-reset": [
    {
      content: `export function createPasswordResetRequest(email: string, now: number): {
  email: string;
  expiresAt: number;
} {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length === 0) throw new TypeError("Email is required.");
  return { email: normalizedEmail, expiresAt: now + 15 * 60 * 1_000 };
}
`,
      path: "src/password-reset.ts",
    },
  ],
  "fixture-implement-refresh-session": [
    {
      content: `export interface Session {
  readonly lastActivityAt: number;
}

export const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;

export function isSessionExpired(session: Session, now: number): boolean {
  return now - session.lastActivityAt >= SESSION_TIMEOUT_MS;
}

export function refreshSession(session: Session, now: number): Session | null {
  return isSessionExpired(session, now) ? null : { lastActivityAt: now };
}
`,
      path: "src/session.ts",
    },
  ],
  "fixture-implement-remaining-session-ms": [
    {
      content: `export interface Session {
  readonly lastActivityAt: number;
}

export const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;

export function isSessionExpired(session: Session, now: number): boolean {
  return now - session.lastActivityAt >= SESSION_TIMEOUT_MS;
}

export function remainingSessionMs(session: Session, now: number): number {
  return Math.max(0, SESSION_TIMEOUT_MS - (now - session.lastActivityAt));
}
`,
      path: "src/session.ts",
    },
  ],
};

function objectiveOutput(task: BenchmarkTask): BenchmarkModelOutput {
  if (task.grader.kind === "test-pass") {
    return { answer: "", files: IMPLEMENTATIONS[task.id] ?? [], findings: [] };
  }
  if (task.grader.kind === "findings-manifest") {
    return { answer: "", files: [], findings: task.grader.expectedFindings };
  }
  return {
    answer: task.grader.requiredFacts
      .map(([canonical]) => canonical)
      .join("; "),
    files: [],
    findings: [],
  };
}

export function createMockBenchmarkModel(manifest: {
  tasks: readonly BenchmarkTask[];
}): BenchmarkModel {
  const tasks = new Map(manifest.tasks.map((task) => [task.id, task]));
  return {
    async generate(input) {
      const task = tasks.get(input.taskId);
      if (!task)
        throw new TypeError(`Unknown mock benchmark task: ${input.taskId}`);
      const output = objectiveOutput(task);
      return {
        inputTokens: Math.ceil(`${input.context}\n${input.prompt}`.length / 4),
        output,
        outputTokens: Math.ceil(JSON.stringify(output).length / 4),
        responseId: `mock-${input.taskId}-${input.arm}-${input.trial}`,
      };
    },
  };
}

interface ResponsesApiBody {
  error?: { message?: string };
  id?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string }>;
    type?: string;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseModelOutput(value: unknown): BenchmarkModelOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "The provider returned an invalid benchmark output object.",
    );
  }
  const output = value as Partial<BenchmarkModelOutput>;
  if (
    typeof output.answer !== "string" ||
    !Array.isArray(output.files) ||
    !output.files.every(
      (file) =>
        file &&
        typeof file === "object" &&
        typeof file.path === "string" &&
        typeof file.content === "string",
    ) ||
    !Array.isArray(output.findings) ||
    !output.findings.every((finding) => typeof finding === "string")
  ) {
    throw new TypeError(
      "The provider returned benchmark output that violates the JSON schema.",
    );
  }
  return output as BenchmarkModelOutput;
}

function responseText(body: ResponsesApiBody): string {
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string")
        return content.text;
    }
  }
  throw new TypeError("OpenAI response did not contain output_text.");
}

export function createOpenAiBenchmarkModel(
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  sleepImplementation: (milliseconds: number) => Promise<void> = defaultSleep,
): BenchmarkModel {
  if (!apiKey.trim())
    throw new TypeError("OPENAI_API_KEY is required for a real benchmark run.");
  return {
    async generate(input) {
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const response = await fetchImplementation(
          "https://api.openai.com/v1/responses",
          {
            body: JSON.stringify({
              input: [
                {
                  content: BENCHMARK_SYSTEM_PROMPT,
                  role: "developer",
                },
                {
                  content: `# Repository context\n\n${input.context}\n\n# Task\n\n${input.prompt}`,
                  role: "user",
                },
              ],
              max_output_tokens: 4_096,
              model: input.model,
              // GPT-5.6 dropped "minimal"; "low" is its nearest successor
              // (few-but-nonzero reasoning tokens, like GPT-5 "minimal").
              reasoning: { effort: "low" },
              store: false,
              text: {
                format: {
                  name: BENCHMARK_OUTPUT_TOOL_NAME,
                  schema: BENCHMARK_OUTPUT_SCHEMA,
                  strict: true,
                  type: "json_schema",
                },
              },
            }),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        const body = (await response.json()) as ResponsesApiBody;
        if (response.ok) {
          if (
            typeof body.id !== "string" ||
            !Number.isInteger(body.usage?.input_tokens) ||
            !Number.isInteger(body.usage?.output_tokens)
          ) {
            throw new TypeError(
              "OpenAI response omitted id or authoritative token usage.",
            );
          }
          return {
            inputTokens: body.usage!.input_tokens!,
            output: parseModelOutput(JSON.parse(responseText(body)) as unknown),
            outputTokens: body.usage!.output_tokens!,
            responseId: body.id,
          };
        }
        const safeMessage = redactProviderMessage(
          body.error?.message ?? "request failed",
        );
        lastError = new Error(`OpenAI API ${response.status}: ${safeMessage}`);
        if (response.status !== 429 && response.status < 500) throw lastError;
        if (attempt < 6) {
          await sleepImplementation(
            retryDelayMilliseconds({
              attempt,
              message: safeMessage,
              retryAfterHeader: response.headers.get("retry-after"),
            }),
          );
        }
      }
      throw lastError ?? new Error("OpenAI request failed after retries.");
    },
  };
}

interface MessagesApiBody {
  content?: Array<{
    input?: unknown;
    name?: string;
    text?: string;
    type?: string;
  }>;
  error?: { message?: string };
  id?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function messagesToolOutput(body: MessagesApiBody): unknown {
  for (const block of body.content ?? []) {
    if (
      block.type === "tool_use" &&
      block.name === BENCHMARK_OUTPUT_TOOL_NAME
    ) {
      return block.input;
    }
  }
  throw new TypeError(
    "Anthropic response did not contain the benchmark output tool call.",
  );
}

/**
 * Anthropic Messages API adapter. Structured output is forced through a single
 * tool whose input schema is byte-identical to the OpenAI JSON schema, so both
 * providers answer the same contract. Token accounting uses the provider's own
 * reported `usage`; no local tokenizer estimate is ever substituted.
 */
export function createAnthropicBenchmarkModel(
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  sleepImplementation: (milliseconds: number) => Promise<void> = defaultSleep,
): BenchmarkModel {
  if (!apiKey.trim()) {
    throw new TypeError(
      "ANTHROPIC_API_KEY is required for a real Anthropic benchmark run.",
    );
  }
  return {
    async generate(input) {
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const response = await fetchImplementation(
          "https://api.anthropic.com/v1/messages",
          {
            body: JSON.stringify({
              max_tokens: 4_096,
              messages: [
                {
                  content: `# Repository context\n\n${input.context}\n\n# Task\n\n${input.prompt}`,
                  role: "user",
                },
              ],
              model: input.model,
              system: BENCHMARK_SYSTEM_PROMPT,
              tool_choice: { name: BENCHMARK_OUTPUT_TOOL_NAME, type: "tool" },
              tools: [
                {
                  description:
                    "Return the benchmark result. Every field is required.",
                  input_schema: BENCHMARK_OUTPUT_SCHEMA,
                  name: BENCHMARK_OUTPUT_TOOL_NAME,
                },
              ],
            }),
            headers: {
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
              "x-api-key": apiKey,
            },
            method: "POST",
          },
        );
        const body = (await response.json()) as MessagesApiBody;
        if (response.ok) {
          if (
            typeof body.id !== "string" ||
            !Number.isInteger(body.usage?.input_tokens) ||
            !Number.isInteger(body.usage?.output_tokens)
          ) {
            throw new TypeError(
              "Anthropic response omitted id or authoritative token usage.",
            );
          }
          return {
            inputTokens: body.usage!.input_tokens!,
            output: parseModelOutput(messagesToolOutput(body)),
            outputTokens: body.usage!.output_tokens!,
            responseId: body.id,
          };
        }
        const safeMessage = redactProviderMessage(
          body.error?.message ?? "request failed",
        );
        lastError = new Error(
          `Anthropic API ${response.status}: ${safeMessage}`,
        );
        if (
          response.status !== 429 &&
          response.status !== 529 &&
          response.status < 500
        )
          throw lastError;
        if (attempt < 6) {
          await sleepImplementation(
            retryDelayMilliseconds({
              attempt,
              message: safeMessage,
              retryAfterHeader: response.headers.get("retry-after"),
            }),
          );
        }
      }
      throw lastError ?? new Error("Anthropic request failed after retries.");
    },
  };
}
