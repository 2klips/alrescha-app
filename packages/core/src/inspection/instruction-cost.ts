import {
  estimateTokensFromBytes,
  type TokenEstimateAssumption,
  CHARS_PER_TOKEN,
} from "../stats/token-estimate";

/**
 * What the always-loaded harness costs, per file and per agent (WORK_SPEC
 * §5.2-③ 표1, Phase 4 Wave E todo 24).
 *
 * The screen used to list instruction files without a number beside them,
 * which made the one question the table exists to answer — "what am I paying
 * before I type anything?" — unanswerable. The inputs are what the scan
 * already stores: a path, a classification and `size_bytes`. No body is read
 * here, and none is stored anywhere for these files.
 *
 * The rule that keeps the total honest: **only files an agent loads without
 * being asked are summed.** A file that loads when you happen to work in its
 * directory, a skill that loads when it runs, and a Cursor rule whose
 * `alwaysApply` nobody can see are three different things, and folding any of
 * them into the always-loaded total would inflate exactly the number the
 * table is for.
 */

export const INSTRUCTION_CLASSIFICATIONS = [
  "agents",
  "claude",
  "cursor_rule",
  "skill",
] as const;

export type InstructionClassification =
  (typeof INSTRUCTION_CLASSIFICATIONS)[number];

/** The three harnesses this product has loading rules for. */
export const INSTRUCTION_LOADERS = ["claude_code", "codex", "cursor"] as const;

export type InstructionLoader = (typeof INSTRUCTION_LOADERS)[number];

/**
 * - `always` — loaded at session start, wherever you are working.
 * - `conditional` — loaded only while working under the file's directory.
 * - `on_demand` — the agent decides to load it during a session.
 * - `unknown` — the rule depends on something the scan cannot see.
 */
export type InstructionLoadMode =
  "always" | "conditional" | "on_demand" | "unknown";

export interface InstructionArtifactInput {
  readonly classification: InstructionClassification;
  readonly id: string;
  readonly path: string;
  readonly repositoryId: string;
  readonly sizeBytes: number;
}

export interface InstructionLoadRule {
  readonly loader: InstructionLoader;
  readonly mode: InstructionLoadMode;
  /** Why this loader treats the file this way. Checkable, not decorative. */
  readonly reason: string;
}

export interface InstructionCostRow {
  readonly classification: InstructionClassification;
  readonly estimatedTokens: number;
  readonly id: string;
  readonly loaders: readonly InstructionLoadRule[];
  /** The strongest mode any loader applies — how the row is totalled. */
  readonly mode: InstructionLoadMode;
  readonly path: string;
  readonly repositoryId: string;
  readonly sizeBytes: number;
}

export interface InstructionLoaderTotal {
  readonly alwaysFiles: number;
  readonly alwaysTokens: number;
  /** Every file this loader has a rule for, whatever that rule says. */
  readonly files: number;
  readonly loader: InstructionLoader;
  /** Files this loader might also load; never added to `alwaysTokens`. */
  readonly unresolvedFiles: number;
}

export interface InstructionCostTotals {
  readonly alwaysFiles: number;
  /** Bytes behind `alwaysTokens` — not the table total (todo 24). */
  readonly alwaysSizeBytes: number;
  readonly alwaysTokens: number;
  readonly conditionalTokens: number;
  readonly files: number;
  readonly onDemandTokens: number;
  readonly perLoader: readonly InstructionLoaderTotal[];
  readonly sizeBytes: number;
  /** Tokens whose loading rule the scan cannot resolve. Reported, not summed. */
  readonly unknownTokens: number;
}

export interface InstructionCostTable {
  readonly assumption: TokenEstimateAssumption;
  readonly rows: readonly InstructionCostRow[];
  readonly totals: InstructionCostTotals;
}

const MODE_RANK: Record<InstructionLoadMode, number> = {
  always: 3,
  conditional: 2,
  unknown: 1,
  on_demand: 0,
};

function normalize(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isRootFile(path: string): boolean {
  return !normalize(path).includes("/");
}

function directoryOf(path: string): string {
  const normalized = normalize(path);
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "." : normalized.slice(0, slash);
}

const CLAUDE_RULES_SEGMENT = "/.claude/rules/";

/**
 * Codex reads the `AGENTS.md` chain from the repository root down to the
 * directory it is working in, so the root file is unconditional and a nested
 * one is a bet on where the session happens to be.
 */
function agentsRules(path: string): readonly InstructionLoadRule[] {
  return isRootFile(path)
    ? [
        {
          loader: "codex",
          mode: "always",
          reason: "Codex reads the AGENTS.md chain from the repository root.",
        },
      ]
    : [
        {
          loader: "codex",
          mode: "conditional",
          reason: `Codex reads this only while working under ${directoryOf(path)}.`,
        },
      ];
}

function claudeRules(path: string): readonly InstructionLoadRule[] {
  const normalized = normalize(path);
  const lower = normalized.toLowerCase();
  if (lower.startsWith(CLAUDE_RULES_SEGMENT.slice(1))) {
    return [
      {
        loader: "claude_code",
        mode: "always",
        reason: "Claude Code loads every rule in the project .claude/rules.",
      },
    ];
  }
  const nestedRules = lower.indexOf(CLAUDE_RULES_SEGMENT);
  if (nestedRules !== -1) {
    return [
      {
        loader: "claude_code",
        mode: "conditional",
        reason: `Claude Code loads this rule set only while working under ${normalized.slice(0, nestedRules)}.`,
      },
    ];
  }
  return isRootFile(normalized)
    ? [
        {
          loader: "claude_code",
          mode: "always",
          reason: "Claude Code loads the project CLAUDE.md at session start.",
        },
      ]
    : [
        {
          loader: "claude_code",
          mode: "conditional",
          reason: `Claude Code loads this only while working under ${directoryOf(normalized)}.`,
        },
      ];
}

/**
 * The one rule this product cannot resolve. `alwaysApply` is a frontmatter
 * key, the scan stores no bodies, and guessing `true` would put a maybe into
 * the always-loaded total while guessing `false` would hide a real cost. So
 * it says it does not know (OQ-062).
 */
function cursorRules(): readonly InstructionLoadRule[] {
  return [
    {
      loader: "cursor",
      mode: "unknown",
      reason:
        "Cursor applies this rule only when its alwaysApply frontmatter is true, and the scan stores no file bodies to read it from.",
    },
  ];
}

function skillRules(): readonly InstructionLoadRule[] {
  return [
    {
      loader: "claude_code",
      mode: "on_demand",
      reason:
        "A skill catalogue carries the name and description; the body loads when the skill runs.",
    },
  ];
}

function rulesFor(
  artifact: InstructionArtifactInput,
): readonly InstructionLoadRule[] {
  switch (artifact.classification) {
    case "agents":
      return agentsRules(artifact.path);
    case "claude":
      return claudeRules(artifact.path);
    case "cursor_rule":
      return cursorRules();
    case "skill":
      return skillRules();
  }
}

function strongestMode(
  rules: readonly InstructionLoadRule[],
): InstructionLoadMode {
  return rules.reduce<InstructionLoadMode>(
    (strongest, rule) =>
      MODE_RANK[rule.mode] > MODE_RANK[strongest] ? rule.mode : strongest,
    "on_demand",
  );
}

/**
 * Per-file token estimates, the loading rule behind each one, and the totals
 * that keep the four modes apart.
 *
 * Rows come back ordered by mode (always first) then by cost, because the
 * table's job is to put the expensive unconditional files at the top.
 */
export function buildInstructionCostTable(
  artifacts: readonly InstructionArtifactInput[],
): InstructionCostTable {
  const rows = artifacts
    .map((artifact) => {
      const loaders = rulesFor(artifact);
      return {
        classification: artifact.classification,
        estimatedTokens: estimateTokensFromBytes(artifact.sizeBytes),
        id: artifact.id,
        loaders,
        mode: strongestMode(loaders),
        path: normalize(artifact.path),
        repositoryId: artifact.repositoryId,
        sizeBytes: Math.max(0, artifact.sizeBytes),
      };
    })
    .sort(
      (left, right) =>
        MODE_RANK[right.mode] - MODE_RANK[left.mode] ||
        right.estimatedTokens - left.estimatedTokens ||
        left.path.localeCompare(right.path),
    );

  const tokensIn = (mode: InstructionLoadMode): number =>
    rows
      .filter((row) => row.mode === mode)
      .reduce((total, row) => total + row.estimatedTokens, 0);

  const perLoader = INSTRUCTION_LOADERS.map((loader) => {
    const mine = rows.filter((row) =>
      row.loaders.some((rule) => rule.loader === loader),
    );
    const always = mine.filter((row) =>
      row.loaders.some(
        (rule) => rule.loader === loader && rule.mode === "always",
      ),
    );
    return {
      alwaysFiles: always.length,
      alwaysTokens: always.reduce(
        (total, row) => total + row.estimatedTokens,
        0,
      ),
      files: mine.length,
      loader,
      unresolvedFiles: mine.filter((row) =>
        row.loaders.some(
          (rule) =>
            rule.loader === loader &&
            (rule.mode === "conditional" || rule.mode === "unknown"),
        ),
      ).length,
    };
  }).filter(({ files }) =>
    // A loader with no files at all is absent, the way an edge family with no
    // edges is absent from the schema card. One that has files but loads none
    // of them unprompted stays: "this repository gives Claude Code nothing at
    // session start" is an answer, and a missing row is not.
    Boolean(files),
  );

  return {
    assumption: { basis: "bytes", charsPerToken: CHARS_PER_TOKEN },
    rows,
    totals: {
      alwaysFiles: rows.filter((row) => row.mode === "always").length,
      alwaysSizeBytes: rows
        .filter((row) => row.mode === "always")
        .reduce((total, row) => total + row.sizeBytes, 0),
      alwaysTokens: tokensIn("always"),
      conditionalTokens: tokensIn("conditional"),
      files: rows.length,
      onDemandTokens: tokensIn("on_demand"),
      perLoader,
      sizeBytes: rows.reduce((total, row) => total + row.sizeBytes, 0),
      unknownTokens: tokensIn("unknown"),
    },
  };
}
