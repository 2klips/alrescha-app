/**
 * The v3 auxiliary experiments (todo 25), pre-registered separately in
 * `preregistration.v3-auxiliary.json` and never part of the main verdict.
 *
 * Three are observational — they read the main run's trials and change
 * nothing about how it ran: ① progress-log adoption, ② tokens per model
 * call, ③ todo duplication. ④ is the relational question set, its own
 * pre-registration and grid, summarised here. ⑤ is the risk top-N precision
 * labelling, computed offline in `risk-precision.ts`.
 */

import type { GraphSurfaceArm } from "./manifest";
import {
  aggregateArm,
  type GraphSurfaceTrial,
  type HypothesisJudgment,
} from "./report";
import type { RiskPrecisionReport } from "./risk-precision";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface AdoptionSummary {
  /** Graph-arm trials with at least one `log_progress` call. */
  readonly adopted: number;
  readonly model: string | "pooled";
  /** `adopted / trials`; null when there were no trials. */
  readonly rate: number | null;
  /** Every graph-arm trial, failed ones included — a failure adopted nothing. */
  readonly trials: number;
}

/** ① How often the installed flow's closing `log_progress` actually happened. */
export function progressAdoption(
  trials: readonly GraphSurfaceTrial[],
  model: string | "pooled",
): AdoptionSummary {
  const mine = trials.filter(
    (trial) =>
      trial.arm === "graph-surface" &&
      (model === "pooled" || trial.model === model),
  );
  const adopted = mine.filter((trial) =>
    (trial.toolNames ?? []).includes("log_progress"),
  ).length;
  return {
    adopted,
    model,
    rate: mine.length === 0 ? null : round(adopted / mine.length),
    trials: mine.length,
  };
}

export interface TokensPerCallSummary {
  readonly arm: GraphSurfaceArm;
  /** Model invocations with a usage record. */
  readonly calls: number;
  /** `cacheRead / (input + cacheRead + cacheCreation)`; null with no calls. */
  readonly cacheReadShare: number | null;
  readonly meanCacheCreation: number | null;
  readonly meanCacheRead: number | null;
  readonly meanInput: number | null;
  readonly meanOutput: number | null;
  readonly model: string | "pooled";
}

/** ② What one model call costs, from the per-call usage the loop recorded. */
export function tokensPerCall(
  trials: readonly GraphSurfaceTrial[],
  arm: GraphSurfaceArm,
  model: string | "pooled",
): TokensPerCallSummary {
  const calls = trials
    .filter(
      (trial) =>
        trial.arm === arm && (model === "pooled" || trial.model === model),
    )
    .flatMap((trial) => trial.calls ?? []);
  const sum = (
    key:
      | "cacheCreationTokens"
      | "cacheReadTokens"
      | "inputTokens"
      | "outputTokens",
  ) => calls.reduce((total, call) => total + call[key], 0);
  const mean = (key: Parameters<typeof sum>[0]) =>
    calls.length === 0 ? null : round(sum(key) / calls.length);
  const served =
    sum("inputTokens") + sum("cacheReadTokens") + sum("cacheCreationTokens");
  return {
    arm,
    calls: calls.length,
    cacheReadShare:
      calls.length === 0 || served === 0
        ? null
        : round(sum("cacheReadTokens") / served),
    meanCacheCreation: mean("cacheCreationTokens"),
    meanCacheRead: mean("cacheReadTokens"),
    meanInput: mean("inputTokens"),
    meanOutput: mean("outputTokens"),
    model,
  };
}

export interface TodoDuplicationSummary {
  /** Todos minted by `log_progress` across graph-arm trials. */
  readonly created: number;
  /** Minted todos whose normalised title another todo already carried. */
  readonly duplicated: number;
  /** `log_progress` events by the writer's `matched` verdict. */
  readonly matched: Readonly<Record<string, number>>;
  /** `duplicated / created`; null when nothing was minted. */
  readonly rate: number | null;
  /** Graph-arm trials that carried observations. */
  readonly trials: number;
}

/** ③ Whether progress entries landed on existing todos or minted duplicates. */
export function todoDuplication(
  trials: readonly GraphSurfaceTrial[],
): TodoDuplicationSummary {
  const observed = trials.filter(
    (trial) => trial.arm === "graph-surface" && trial.observations,
  );
  const matched: Record<string, number> = {};
  let created = 0;
  let duplicated = 0;
  for (const trial of observed) {
    const observations = trial.observations!;
    created += observations.todosCreated;
    duplicated += observations.todosDuplicated;
    for (const [key, count] of Object.entries(observations.progressMatched)) {
      matched[key] = (matched[key] ?? 0) + count;
    }
  }
  return {
    created,
    duplicated,
    matched,
    rate: created === 0 ? null : round(duplicated / created),
    trials: observed.length,
  };
}

export interface RelationalSummary {
  readonly judgment: HypothesisJudgment;
  readonly models: readonly string[];
  readonly preregistrationSha256: string;
  readonly rows: readonly {
    readonly arm: GraphSurfaceArm;
    readonly meanTurns: number;
    readonly model: string;
    readonly passRate: number;
    readonly trials: number;
  }[];
  readonly trialCount: number;
}

/** ④ The relational set, summarised from its own report. */
export function relationalSummary(report: {
  readonly judgment: HypothesisJudgment;
  readonly models: readonly string[];
  readonly preregistrationSha256: string;
  readonly trials: readonly GraphSurfaceTrial[];
}): RelationalSummary {
  const rows: {
    arm: GraphSurfaceArm;
    meanTurns: number;
    model: string;
    passRate: number;
    trials: number;
  }[] = [];
  for (const model of ["pooled", ...report.models]) {
    for (const arm of ["file-exploration", "graph-surface"] as const) {
      const aggregate = aggregateArm(report.trials, arm, model);
      rows.push({
        arm,
        meanTurns: aggregate.meanTurns,
        model,
        passRate: aggregate.passRate,
        trials: aggregate.trialCount,
      });
    }
  }
  return {
    judgment: report.judgment,
    models: report.models,
    preregistrationSha256: report.preregistrationSha256,
    rows,
    trialCount: report.trials.length,
  };
}

export interface AuxiliaryReport {
  readonly adoption: readonly AdoptionSummary[];
  readonly duplication: TodoDuplicationSummary;
  readonly generatedAt: string;
  readonly mainReport: {
    readonly file: string;
    readonly mode: "dry-run" | "real";
    readonly preregistrationSha256: string;
    readonly trialCount: number;
  };
  readonly preregistrationSha256: string;
  readonly relational: RelationalSummary | null;
  readonly risk: RiskPrecisionReport | null;
  readonly tokensPerCall: readonly TokensPerCallSummary[];
}

function cell(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function renderAuxiliaryMarkdown(report: AuxiliaryReport): string {
  const adoptionRows = report.adoption.map(
    (row) =>
      `| ${row.model} | ${row.trials} | ${row.adopted} | ${cell(row.rate)} |`,
  );
  const tokenRows = report.tokensPerCall.map(
    (row) =>
      `| ${row.model} | ${row.arm} | ${row.calls} | ${cell(row.meanInput)} | ${cell(row.meanCacheCreation)} | ${cell(row.meanCacheRead)} | ${cell(row.cacheReadShare)} | ${cell(row.meanOutput)} |`,
  );
  const duplication = report.duplication;
  const matchedLine =
    Object.keys(duplication.matched).length === 0
      ? "(no log_progress events)"
      : Object.entries(duplication.matched)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => `${key} ${count}`)
          .join(" · ");
  const relational = report.relational;
  const relationalRows = relational
    ? relational.rows.map(
        (row) =>
          `| ${row.model} | ${row.arm} | ${row.trials} | ${row.meanTurns} | ${row.passRate} |`,
      )
    : [];
  const risk = report.risk;
  const riskRows = risk
    ? risk.strata.map(
        (stratum) =>
          `| ${stratum.stratum} | ${stratum.entries} | ${cell(stratum.precisionAt10)} | ${cell(stratum.precisionAtN)} | ${stratum.truePositives} |`,
      )
    : [];
  const dryRun = report.mainReport.mode === "dry-run";
  return `${[
    "# 그래프 표면 v3 — 부속 실험 (주 가설과 분리, 별도 사전등록)",
    "",
    "## 실행 계약",
    "",
    `- 생성: ${report.generatedAt}`,
    `- 부속 사전등록 SHA-256: \`${report.preregistrationSha256}\` (benchmarks/graph-surface/preregistration.v3-auxiliary.json)`,
    `- 주 실행: \`${report.mainReport.file}\` (mode \`${report.mainReport.mode}\`, ${report.mainReport.trialCount}시행, 사전등록 \`${report.mainReport.preregistrationSha256}\`)${dryRun ? " — **릴리스 불가(모의 실행)**" : ""}`,
    "- ①②③은 주 실행의 시행을 읽기만 한다(프로토콜 무변경). ④는 별도 그리드, ⑤는 오프라인 라벨링.",
    "",
    "## ① 진행 기록 채택률 — graph-surface 군에서 `log_progress`를 1회 이상 부른 시행",
    "",
    "| model | trials | adopted | rate |",
    "|---|---|---|---|",
    ...adoptionRows,
    "",
    "## ② 호출당 토큰 — provider 보고 usage, 모델 호출 1회 평균",
    "",
    "| model | arm | calls | input | cache creation | cache read | cache read share | output |",
    "|---|---|---|---|---|---|---|---|",
    ...tokenRows,
    "",
    "## ③ todo 중복률 — `log_progress`가 기존 todo에 붙었는가",
    "",
    `- 관측 시행 ${duplication.trials} · 발행된 todo ${duplication.created} · 제목 중복 ${duplication.duplicated} · 중복률 ${cell(duplication.rate)}`,
    `- writer \`matched\` 분포: ${matchedLine}`,
    "",
    "## ④ 관계형 질문 4개 세트",
    "",
    ...(relational
      ? [
          `- 사전등록 SHA-256 \`${relational.preregistrationSha256}\` · ${relational.trialCount}시행`,
          "",
          "| model | arm | trials | mean turns | PASS rate |",
          "|---|---|---|---|---|",
          ...relationalRows,
          "",
          `- 판정(${relational.judgment.primaryHypothesis}): 턴 Δ ${relational.judgment.turnsDelta} · PASS Δ ${relational.judgment.passRateDelta} → **${relational.judgment.verdict}**`,
        ]
      : ["- 미실행."]),
    "",
    "## ⑤ 위험 상위 N 정밀도 라벨링",
    "",
    ...(risk
      ? [
          `- 레포: \`${risk.repository}\` (코퍼스 커밋 \`${risk.corpusCommit ?? "unknown"}\`) · 상위 ${risk.topN} · 라벨 규칙: 최근 ${risk.sinceDays}일 안에 제목이 \`${risk.subjectPattern}\`에 맞는 커밋이 그 파일을 건드렸으면 참`,
          `- 위험 지도 항목 ${risk.entryCount} · 규칙에 맞는 커밋 ${risk.fixCommits} · 미측정 신호: ${risk.unmeasured.length === 0 ? "없음" : risk.unmeasured.join(", ")}`,
          "",
          "| stratum | entries | precision@10 | precision@N | true positives |",
          "|---|---|---|---|---|",
          ...riskRows,
          "",
          '라벨은 판단이 아니라 규칙이다 — "최근 수정 커밋이 닿았다"는 위험의 대리 지표이지 정의가 아니며, CI 있는 층은 이 레포에 CI 증거가 없어 n=0이다.',
        ]
      : ["- 미실행."]),
    "",
    "판정과 무관하게 수치 그대로 게시한다. 주 가설(results.v3)의 판정은 이 파일의 어떤 수치에도 의존하지 않는다.",
  ].join("\n")}\n`;
}
