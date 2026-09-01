export const ALRESCHA_INDEX_BEGIN =
  "<!-- ALRESCHA:BEGIN (managed — do not edit inside) -->";
export const ALRESCHA_INDEX_END = "<!-- ALRESCHA:END -->";
export const PROGRESS_LOGGING_INSTRUCTION = [
  "- Once per completed task unit, call `log_progress`:",
  '  `{"task":"<todo id/title>","status":"done","summary":"<verified result; max 200 chars>","refs":["<path/commit>"]}`',
  "- Use only verified work; never invent progress; never log per turn or narrative.",
].join("\n");

export interface RenderManagedIndexInput {
  readonly dashboardUrl: string;
  readonly mcpEndpoint: string;
}

export interface BuildMinimalIndexProposalFilesInput extends RenderManagedIndexInput {
  readonly agentsContent: string | null;
  readonly claudeContent: string | null;
}

export interface MinimalIndexProposalFile {
  readonly after: string;
  readonly before: string | null;
  readonly path: "AGENTS.md" | "CLAUDE.md";
}

export interface MinimalIndexProposalFiles {
  readonly files: readonly MinimalIndexProposalFile[];
  readonly managedSection: string;
}

function safeHttpsUrl(value: string, label: string): string {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new TypeError(`${label} must use https.`);
  }

  return url.toString().replace(/\/$/, "");
}

export function renderManagedIndex(input: RenderManagedIndexInput): string {
  const dashboardUrl = safeHttpsUrl(input.dashboardUrl, "dashboardUrl");
  const mcpEndpoint = safeHttpsUrl(input.mcpEndpoint, "mcpEndpoint");

  return [
    ALRESCHA_INDEX_BEGIN,
    "## Project context via Alrescha",
    "- Before coding, call MCP tool `request_context_pack` with your task description.",
    `- MCP endpoint: ${mcpEndpoint} (token: see project settings)`,
    `- Findings & receipts: ${dashboardUrl}`,
    ...PROGRESS_LOGGING_INSTRUCTION.split("\n"),
    ALRESCHA_INDEX_END,
  ].join("\n");
}

function occurrences(source: string, marker: string): number {
  return source.split(marker).length - 1;
}

export function applyManagedIndex(
  existing: string | undefined,
  section: string,
): string {
  if (
    !section.startsWith(ALRESCHA_INDEX_BEGIN) ||
    !section.endsWith(ALRESCHA_INDEX_END)
  ) {
    throw new TypeError("section must be a complete Alrescha managed index.");
  }

  if (section.split("\n").length > 30) {
    throw new RangeError("Alrescha managed index must not exceed 30 lines.");
  }

  if (existing === undefined || existing.length === 0) {
    return `${section}\n`;
  }

  const beginCount = occurrences(existing, ALRESCHA_INDEX_BEGIN);
  const endCount = occurrences(existing, ALRESCHA_INDEX_END);

  if (beginCount === 0 && endCount === 0) {
    const separator = existing.endsWith("\n\n")
      ? ""
      : existing.endsWith("\n")
        ? "\n"
        : "\n\n";
    return `${existing}${separator}${section}\n`;
  }

  if (beginCount !== 1 || endCount !== 1) {
    throw new TypeError(
      "AGENTS.md must contain exactly one complete Alrescha managed index.",
    );
  }

  const start = existing.indexOf(ALRESCHA_INDEX_BEGIN);
  const end =
    existing.indexOf(ALRESCHA_INDEX_END, start) + ALRESCHA_INDEX_END.length;

  if (end < start + ALRESCHA_INDEX_END.length) {
    throw new TypeError("Alrescha managed index markers are out of order.");
  }

  return `${existing.slice(0, start)}${section}${existing.slice(end)}`;
}

export function buildMinimalIndexProposalFiles(
  input: BuildMinimalIndexProposalFilesInput,
): MinimalIndexProposalFiles {
  const managedSection = renderManagedIndex(input);
  const agentsAfter = applyManagedIndex(
    input.agentsContent ?? undefined,
    managedSection,
  );
  const files: MinimalIndexProposalFile[] = [];

  if (agentsAfter !== input.agentsContent) {
    files.push({
      after: agentsAfter,
      before: input.agentsContent,
      path: "AGENTS.md",
    });
  }

  if (input.claudeContent === null) {
    files.push({ after: "@AGENTS.md\n", before: null, path: "CLAUDE.md" });
  }

  return { files, managedSection };
}
