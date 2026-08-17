import {
  VIBE_METRICS,
  analyzePromptSignals,
  buildVibeIndex,
  coachingSuggestions,
  vibeGateResultsSchema,
  type PromptRubric,
  type VibeGateResults,
  type VibeIndex,
} from "@arr/core";

export type DemoTeamState = "team" | "solo";

export interface DemoMember {
  readonly name: string;
  readonly role: "owner" | "admin" | "member" | "viewer";
  readonly status: "invited" | "active" | "revoked";
  readonly userId: string;
}

export interface DemoTeam {
  readonly capture: {
    readonly consented: boolean;
    readonly rawSyncEnabled: boolean;
    readonly workspaceEnabled: boolean;
  };
  readonly coaching: {
    readonly promptText: string;
    readonly rubric: PromptRubric;
    readonly suggestions: readonly string[];
  };
  readonly gate: VibeGateResults;
  readonly members: readonly DemoMember[];
  readonly vibe: VibeIndex;
}

const SAMPLE_PROMPT =
  "spec/auth.md의 REQ-AUTH-003을 구현해줘. tests/session.test.ts가 통과하면 완료이고, 결제 모듈은 건드리지 마.";

/**
 * The published Goodhart-gate verdicts (`benchmarks/vibe/gate-results.json`).
 * Mirrored here rather than imported so the browser bundle carries no build
 * asset; `tests/team-view.test.tsx` asserts the two stay identical, so a
 * future adopted verdict cannot silently diverge from what the screen shows.
 */
function publishedGate(): VibeGateResults {
  return vibeGateResultsSchema.parse({
    experiment: "vibe-harness-injection-v0",
    generatedBy: "scripts/vibe-injection-experiment.ts",
    verdicts: VIBE_METRICS.map((metric) => ({
      detail:
        "실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기.",
      metric,
      status: "pending" as const,
    })),
  });
}

const MEMBERS: readonly DemoMember[] = [
  { name: "김소유", role: "owner", status: "active", userId: "user-owner" },
  { name: "이관리", role: "admin", status: "active", userId: "user-admin" },
  { name: "박구현", role: "member", status: "active", userId: "user-member" },
  { name: "최열람", role: "viewer", status: "invited", userId: "user-viewer" },
];

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

export function buildDemoTeam(state: DemoTeamState): DemoTeam {
  const members = state === "solo" ? [MEMBERS[0]!] : MEMBERS;
  const gate = publishedGate();
  const signals = analyzePromptSignals(SAMPLE_PROMPT);

  const vibe = buildVibeIndex(
    {
      commits:
        state === "solo"
          ? [
              {
                authorUserId: "user-owner",
                occurredAt: "2026-08-17T09:00:00.000Z",
                sha: SHA_A,
              },
            ]
          : [
              {
                authorUserId: "user-owner",
                occurredAt: "2026-08-17T09:00:00.000Z",
                sha: SHA_A,
              },
              {
                authorUserId: "user-member",
                occurredAt: "2026-08-17T10:00:00.000Z",
                sha: SHA_B,
              },
              {
                authorUserId: "user-member",
                occurredAt: "2026-08-17T11:00:00.000Z",
                sha: SHA_C,
              },
            ],
      promptRecords:
        state === "solo"
          ? []
          : [
              {
                rubric: { specificity: 2, verifiability: 2 },
                userId: "user-member",
              },
            ],
      provenRequirements:
        state === "solo"
          ? []
          : [{ id: "REQ-AUTH-003", provenCommitSha: SHA_B }],
      receipts:
        state === "solo"
          ? [{ commitSha: SHA_A, inferredCount: 1, verifiedCount: 1 }]
          : [
              { commitSha: SHA_A, inferredCount: 1, verifiedCount: 2 },
              { commitSha: SHA_B, inferredCount: 0, verifiedCount: 4 },
            ],
      resolvedFindings:
        state === "solo" ? [] : [{ id: "finding-1", resolvedCommitSha: SHA_C }],
    },
    gate,
    // ADR-011-4: the per-person comparison table stays off until a workspace
    // policy explicitly enables it.
    { comparisonTableEnabled: false },
  );

  return {
    capture: {
      consented: state === "team",
      rawSyncEnabled: false,
      workspaceEnabled: state === "team",
    },
    coaching: {
      promptText: SAMPLE_PROMPT,
      rubric: {
        batchSize: 2,
        contextGrounding: 2,
        noOverInstruction: 2,
        specificity: 2,
        stopCondition: 2,
        verifiability: 2,
      },
      suggestions: coachingSuggestions(signals),
    },
    gate,
    members,
    vibe,
  };
}
