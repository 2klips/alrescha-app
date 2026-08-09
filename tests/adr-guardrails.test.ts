import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { scanGuardrailFile, scanGuardrails } from "../scripts/adr-guardrails";

const ROOT = resolve(import.meta.dirname, "..");

describe("repo ADRs", () => {
  const decisions = [
    {
      file: "001-integrated-product-positioning.md",
      required: [
        "상태: 채택 (Accepted)",
        "## 결정",
        "## 결과",
        "AI 추론은 `inferred`, 실행 증거만 `verified`",
        "requirement→code→test→receipt",
      ],
    },
    {
      file: "002-load-on-demand-assurance-mvp.md",
      required: [
        "상태: 채택 (Accepted)",
        "## 결정",
        "## 결과",
        "주문형 로드(load-on-demand)",
        "Sampling/Roots/Logging 사용 금지",
        "실패한 실행에 과금 금지",
        "in-toto attestation",
      ],
    },
    {
      file: "003-github-first-web-saas.md",
      required: [
        "상태: 채택 (Accepted)",
        "## 결정",
        "## 결과",
        "GitHub에 푸시하면 자동 분석",
        "읽기 전용 최소 권한",
        "없으면 `inferred`로 강등",
        "advisory-only",
      ],
    },
  ] as const;

  it.each(decisions)("ports $file without weakening its constraints", async ({ file, required }) => {
    const adr = await readFile(join(ROOT, "docs", "adr", file), "utf8");

    for (const fragment of required) {
      expect(adr, `Missing canonical ADR fragment: ${fragment}`).toContain(fragment);
    }
  });
});

describe("machine-checkable guardrails", () => {
  it("keeps production sources free of banned patterns", async () => {
    await expect(scanGuardrails(ROOT)).resolves.toEqual([]);
  });

  it("rejects a fixture importing MCP Sampling with a specific message", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "specproof-guardrails-"));

    try {
      const sourceDirectory = join(fixtureRoot, "packages", "mcp", "src");
      await mkdir(sourceDirectory, { recursive: true });
      await writeFile(
        join(sourceDirectory, "server.ts"),
        'import { Sampling } from "@modelcontextprotocol/sdk";\nexport { Sampling };\n',
        "utf8",
      );

      await expect(scanGuardrails(fixtureRoot)).resolves.toEqual([
        expect.objectContaining({
          file: "packages/mcp/src/server.ts",
          message: "MCP Sampling capability is forbidden; MCP 2026-07-28 is stateless.",
          rule: "deprecated-mcp-capability",
        }),
      ]);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it.each([
    {
      file: "supabase/migrations/001.sql.ts",
      source: 'const migration = "raw_source text";',
      rule: "raw-code-persistence",
    },
    {
      file: "packages/context/src/minimal-index.ts",
      source: "const template = `${document.body}`;",
      rule: "doc-body-inlining",
    },
    {
      file: "apps/worker/src/github.ts",
      source: "await octokit.createOrUpdateFileContents(input);",
      rule: "repo-write-outside-pr-proposal",
    },
    {
      file: "packages/core/src/github.ts",
      source: 'const response = await fetch("https://api.github.com");',
      rule: "network-in-core",
    },
  ] as const)("detects $rule", ({ file, source, rule }) => {
    expect(scanGuardrailFile(file, source)).toEqual([
      expect.objectContaining({ rule }),
    ]);
  });

  it("allows transient source handling and advisory PR writes in their bounded modules", () => {
    expect(
      scanGuardrailFile(
        "apps/worker/src/transient/fetch-source.ts",
        "async function fetchSource() { return fetchSourceMetadata(); }",
      ),
    ).toEqual([]);
    expect(
      scanGuardrailFile(
        "packages/github/src/pr-proposal/create.ts",
        "await octokit.createOrUpdateFileContents(input);",
      ),
    ).toEqual([]);
  });
});

