import {
  buildInstructionCostTable,
  type InstructionArtifactInput,
} from "@alrescha/core";

/**
 * The drifted-demo fixture's harness files, as the scan would store them:
 * path, classification, byte size — never a body (Phase 4 Wave E todo 24).
 *
 * Shared by the demo harness page (the cost table) and the demo dashboard
 * (the "상시 로드" chip, Wave B todo 15) so the two say the same number for
 * the same fixture. The bytes are the fixture files' real sizes.
 */
export const DEMO_INSTRUCTION_ARTIFACTS: readonly InstructionArtifactInput[] = [
  {
    classification: "agents",
    id: "demo-agents",
    path: "AGENTS.md",
    repositoryId: "drifted-demo",
    sizeBytes: 317,
  },
  {
    classification: "agents",
    id: "demo-agents-api",
    path: "src/api/AGENTS.md",
    repositoryId: "drifted-demo",
    sizeBytes: 146,
  },
  {
    classification: "skill",
    id: "demo-skill",
    path: ".agents/skills/review-auth/SKILL.md",
    repositoryId: "drifted-demo",
    sizeBytes: 337,
  },
  {
    classification: "cursor_rule",
    id: "demo-cursor-rule",
    path: ".cursor/rules/testing.mdc",
    repositoryId: "drifted-demo",
    sizeBytes: 203,
  },
];

/**
 * What the demo harness loads without being asked, in estimated tokens —
 * the same builder and the same `always`-only rule the live `/app/harness`
 * table applies, so the chip on `/map` is the table on `/harness`.
 */
export function demoAlwaysLoadedTokens(): number {
  return buildInstructionCostTable(DEMO_INSTRUCTION_ARTIFACTS).totals
    .alwaysTokens;
}
