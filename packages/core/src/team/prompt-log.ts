/**
 * Local-first prompt log (Phase 2B todo 10, ADR-011-2).
 *
 * The DEFAULT store for prompt capture is a file inside the user's own
 * repository — gitignored, never uploaded. Server sync happens only when the
 * member explicitly turns it on, and what syncs by default is metadata: the
 * raw prompt text leaves the machine only when the member's separate
 * raw-sync switch is on. `toServerPromptSync` is that boundary — it is a
 * pure function whose output provably lacks the text unless the switch says
 * otherwise.
 */

import { z } from "zod";

export const LOCAL_PROMPT_LOG_PATH = ".alrescha/prompt-log.jsonl";
/** The directory to gitignore so the log never reaches the remote. */
export const LOCAL_PROMPT_LOG_GITIGNORE_ENTRY = ".alrescha/";
/** Read-only migration sources for repositories created before Alrescha. */
export const LEGACY_LOCAL_PROMPT_LOG_PATH = ".arr/prompt-log.jsonl";
export const LEGACY_LOCAL_PROMPT_LOG_GITIGNORE_ENTRY = ".arr/";

export const localPromptRecordSchema = z.strictObject({
  occurredAt: z.iso.datetime({ offset: true }),
  promptText: z.string().min(1).max(20_000),
  rubric: z.record(z.string(), z.number()).optional(),
  targetNodeIds: z.array(z.string().min(1).max(64)).max(50),
  tokenCount: z.number().int().nonnegative(),
  toolName: z.string().min(1).max(120),
});

export type LocalPromptRecord = z.infer<typeof localPromptRecordSchema>;

export function serializeLocalPromptLog(
  records: readonly LocalPromptRecord[],
): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

/** Malformed lines fail loudly — an append-only log must not rot silently. */
export function parseLocalPromptLog(content: string): LocalPromptRecord[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const parsed = localPromptRecordSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(`Invalid prompt-log line ${index + 1}.`);
      }
      return parsed.data;
    });
}

export interface ServerPromptSyncPayload {
  readonly occurredAt: string;
  readonly rawText: string | null;
  readonly rubric: Readonly<Record<string, number>>;
  readonly targetNodeIds: readonly string[];
  readonly tokenCount: number;
  readonly toolName: string;
}

/**
 * The metadata-first boundary (ADR-011-3): without the raw-sync switch the
 * payload carries derived data only — the prompt text stays local.
 */
export function toServerPromptSync(
  record: LocalPromptRecord,
  options: { readonly rawSyncEnabled: boolean },
): ServerPromptSyncPayload {
  return {
    occurredAt: record.occurredAt,
    rawText: options.rawSyncEnabled ? record.promptText : null,
    rubric: record.rubric ?? {},
    targetNodeIds: record.targetNodeIds,
    tokenCount: record.tokenCount,
    toolName: record.toolName,
  };
}
