import type {
  BenchmarkManifest,
  BenchmarkModel,
  BenchmarkModelOutput,
  BenchmarkTask,
} from "./types";

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

export function createMockBenchmarkModel(
  manifest: BenchmarkManifest,
): BenchmarkModel {
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
    throw new TypeError("OpenAI returned an invalid benchmark output object.");
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
      "OpenAI returned benchmark output that violates the JSON schema.",
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
  sleepImplementation: (milliseconds: number) => Promise<void> = (
    milliseconds,
  ) =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
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
                  content:
                    "Use only the supplied repository context. Complete the task objectively. Return complete changed files without Markdown fences. Put direct answers in answer and semantic drift identifiers in findings.",
                  role: "developer",
                },
                {
                  content: `# Repository context\n\n${input.context}\n\n# Task\n\n${input.prompt}`,
                  role: "user",
                },
              ],
              max_output_tokens: 4_096,
              model: input.model,
              reasoning: { effort: "minimal" },
              store: false,
              text: {
                format: {
                  name: "databrain_benchmark_output",
                  schema: {
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
                  },
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
        const safeMessage = (body.error?.message ?? "request failed")
          .replace(/organization\s+\S+/gi, "organization [redacted]")
          .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]");
        lastError = new Error(`OpenAI API ${response.status}: ${safeMessage}`);
        if (response.status !== 429 && response.status < 500) throw lastError;
        if (attempt < 6) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const messageDelay = safeMessage.match(
            /try again in ([\d.]+)(ms|s)/i,
          );
          const milliseconds =
            Number.isFinite(retryAfter) && retryAfter >= 0
              ? retryAfter * 1_000
              : messageDelay
                ? Number(messageDelay[1]) *
                  (messageDelay[2]?.toLowerCase() === "ms" ? 1 : 1_000)
                : attempt * 500;
          await sleepImplementation(
            Math.min(20_000, Math.max(250, Math.ceil(milliseconds))),
          );
        }
      }
      throw lastError ?? new Error("OpenAI request failed after retries.");
    },
  };
}
