import { describe, expect, it } from "vitest";

import {
  buildArmContext,
  STATIC_PREFIX,
  type RepositoryCorpus,
} from "../scripts/databrain-benchmark/context";
import {
  compactContext,
  measureTechniques,
  renderTechniqueReport,
} from "../scripts/databrain-benchmark/techniques";
import {
  NO_TECHNIQUES,
  TOKEN_TECHNIQUES,
  type BenchmarkTask,
} from "../scripts/databrain-benchmark/types";

const CORPUS: RepositoryCorpus = {
  entries: [
    {
      content:
        "# Auth spec\n\nREQ-AUTH-003: session renewal every fifteen minutes with sliding expiry.",
      path: "spec/auth.md",
    },
    {
      content:
        "export function renewSession() { return 'sliding expiry'; }\nexport function audit() {}",
      path: "src/session.ts",
    },
    {
      content: "# AGENTS\n\nsession 변경 전 스펙을 읽는다.",
      path: "AGENTS.md",
    },
  ],
  root: "fixtures/demo",
};

function task(id: string, facts: string[][]): BenchmarkTask {
  return {
    grader: { kind: "answer-manifest", requiredFacts: facts },
    id,
    prompt: "session 갱신 규칙이 뭐야?",
    repository: "fixtures/demo",
    retrievalQuery: "session renewal",
    type: "question-answering",
  };
}

const TASKS = [
  task("t-1", [["sliding expiry"], ["fifteen minutes", "15분"]]),
  task("t-2", [["renewSession"]]),
];

describe("token-efficiency techniques (todo 6)", () => {
  it("leaves the historical data-brain context untouched when techniques are omitted", async () => {
    const context = await buildArmContext({
      arm: "data-brain",
      corpus: CORPUS,
      retrievalQuery: "session renewal",
      taskDescription: "session 갱신 규칙이 뭐야?",
    });
    expect(context.text).not.toContain("tool_definitions");
    expect(context.text).toContain("## search_index");
    expect(context.staticPrefixChars).toBeUndefined();
  });

  it("id-first loading swaps excerpts for ids and shrinks the context", async () => {
    const base = {
      arm: "data-brain" as const,
      corpus: CORPUS,
      retrievalQuery: "session renewal",
      taskDescription: "session 갱신 규칙이 뭐야?",
    };
    const off = await buildArmContext({ ...base, techniques: NO_TECHNIQUES });
    const on = await buildArmContext({
      ...base,
      techniques: { ...NO_TECHNIQUES, "id-first-loading": true },
    });
    expect(on.text).toContain("## search_nodes");
    expect(on.text).not.toContain("## search_index");
    expect(on.toolNames).toContain("get_node_content");
    expect(on.text.length).toBeLessThan(off.text.length);
  });

  it("the static prefix is byte-identical across different tasks", async () => {
    const flags = { ...NO_TECHNIQUES, "static-prefix": true };
    const first = await buildArmContext({
      arm: "data-brain",
      corpus: CORPUS,
      retrievalQuery: "session renewal",
      taskDescription: "session 갱신 규칙이 뭐야?",
      techniques: flags,
    });
    const second = await buildArmContext({
      arm: "data-brain",
      corpus: CORPUS,
      retrievalQuery: "audit",
      taskDescription: "감사 로그는 어디서 남나?",
      techniques: flags,
    });
    expect(first.text.startsWith(STATIC_PREFIX)).toBe(true);
    expect(second.text.startsWith(STATIC_PREFIX)).toBe(true);
    expect(first.staticPrefixChars).toBe(STATIC_PREFIX.length);
  });

  it("lazy tool definitions list only the tools actually used", async () => {
    const base = {
      arm: "data-brain" as const,
      corpus: CORPUS,
      retrievalQuery: "session renewal",
      taskDescription: "session 갱신 규칙이 뭐야?",
    };
    const full = await buildArmContext({ ...base, techniques: NO_TECHNIQUES });
    const lazy = await buildArmContext({
      ...base,
      techniques: { ...NO_TECHNIQUES, "lazy-tool-definitions": true },
    });
    expect(full.text).toContain("- trace_path:");
    expect(lazy.text).not.toContain("- trace_path:");
    expect(lazy.text).toContain("- search_index:");
  });

  it("compaction-safe ordering keeps content recall after tail-keeping compaction", async () => {
    const base = {
      arm: "data-brain" as const,
      corpus: CORPUS,
      retrievalQuery: "session renewal",
      taskDescription: "session 갱신 규칙이 뭐야?",
    };
    const off = await buildArmContext({ ...base, techniques: NO_TECHNIQUES });
    const on = await buildArmContext({
      ...base,
      techniques: { ...NO_TECHNIQUES, "compaction-safe-session": true },
    });
    const fact = "sliding expiry";
    expect(compactContext(on.text)).toContain(fact);
    // The anchored variant also carries the re-derivation index.
    expect(on.text).toContain("세션 앵커");
    expect(off.text).toContain(fact); // full context has it either way
  });

  it("measures every technique and gates defaults on recall", async () => {
    const measurements = await measureTechniques({
      corpus: CORPUS,
      tasks: TASKS,
    });
    expect(measurements.map(({ technique }) => technique)).toEqual([
      ...TOKEN_TECHNIQUES,
    ]);
    for (const measurement of measurements) {
      expect(measurement.taskCount).toBe(2);
      // The gate as specified: a recall drop always keeps the default off.
      if (measurement.recallDeltaPercentagePoints < 0) {
        expect(measurement.defaultOn).toBe(false);
      }
    }
    const idFirst = measurements.find(
      ({ technique }) => technique === "id-first-loading",
    )!;
    expect(idFirst.tokenDeltaPercent).toBeLessThan(0);

    const report = renderTechniqueReport(measurements);
    for (const technique of TOKEN_TECHNIQUES) {
      expect(report).toContain(`| ${technique} |`);
    }
    expect(report).toContain("기본값 off를 유지한다");
  });
});
