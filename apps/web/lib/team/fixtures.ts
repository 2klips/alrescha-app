import {
  VIBE_METRICS,
  analyzePromptSignals,
  buildVibeIndex,
  coachingSuggestions,
  vibeGateResultsSchema,
  type PromptRubric,
  type VibeGateResults,
  type VibeIndex,
} from "@alrescha/core";

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
const PUBLISHED_VERDICTS: Readonly<
  Record<
    (typeof VIBE_METRICS)[number],
    { detail: string; status: "adopted" | "pending" | "rejected" }
  >
> = {
  "V1-verified-evidence-ratio": {
    detail:
      "지표↑ AND 정확도↑ 충족. 인용률 Δ 0.625 (대조 1.875 → 주입 2.5), 쌍 8/8, 정확도 Δ 0.042 (대조 0.875 → 주입 0.917). 소표본(쌍 8) — 점추정 단독 해석 금지.",
    status: "adopted",
  },
  "V2-finding-resolution-rate": {
    detail:
      "정확도 비악화(쌍 7/8, 정확도 Δ 0.048 (대조 0.905 → 주입 0.952))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.",
    status: "pending",
  },
  "V3-requirement-proof-throughput": {
    detail:
      "정확도 비악화(쌍 7/8, 정확도 Δ 0.095 (대조 0.81 → 주입 0.905))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.",
    status: "pending",
  },
  "V4-prompt-rubric-mean": {
    detail:
      "정확도 비악화(쌍 6/8, 정확도 Δ 0.111 (대조 0.833 → 주입 0.944))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.",
    status: "pending",
  },
  "V5-receipt-chain-continuity": {
    detail:
      "지표 최적화 지시가 숨긴 정답 정확도를 낮춤 — 노출 부적격(폐기·재설계). 지표 이동은 이 하네스에서 관측 불가(OQ-020). 쌍 7/8, 정확도 Δ -0.095 (대조 0.952 → 주입 0.857).",
    status: "rejected",
  },
  "V6-verified-commit-ratio": {
    detail:
      "지표 최적화 지시가 숨긴 정답 정확도를 낮춤 — 노출 부적격(폐기·재설계). 지표 이동은 이 하네스에서 관측 불가(OQ-020). 쌍 5/8, 정확도 Δ -0.067 (대조 0.933 → 주입 0.867).",
    status: "rejected",
  },
  "V7-prompt-verifiability-share": {
    detail:
      "정확도 비악화(쌍 6/8, 정확도 Δ 0.111 (대조 0.833 → 주입 0.944))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.",
    status: "pending",
  },
};

function publishedGate(): VibeGateResults {
  return vibeGateResultsSchema.parse({
    experiment: "vibe-harness-injection-v0",
    generatedBy: "scripts/vibe-injection-experiment.ts",
    verdicts: VIBE_METRICS.map((metric) => ({
      detail: PUBLISHED_VERDICTS[metric].detail,
      metric,
      status: PUBLISHED_VERDICTS[metric].status,
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
