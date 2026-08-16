import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";

import {
  ASSURANCE,
  DASHBOARD,
  GRAPH,
  ONBOARDING,
} from "../../apps/web/lib/strings";

import {
  buildMinimalIndexProposalFiles,
  proposeMinimalIndexPullRequest,
} from "../../packages/core/src/index";
import {
  createHostedMcpEndpoint,
  InMemoryMcpStore,
  type McpWorkspaceData,
} from "../../packages/mcp/src/index";
import {
  AI_JUDGMENT_MIGRATION,
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  PILOT_INSTRUMENTATION_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "../helpers/database";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Y10";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;

function mcpWorkspaceFixture(): McpWorkspaceData {
  const artifactId = "01K287J3D18V7A1MZG9E8D1Y11";
  const requirementId = "01K287J3D18V7A1MZG9E8D1Y21";
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [
      {
        artifacts: [
          {
            content:
              "# Authentication\nUse GitHub OAuth and preserve same-commit test evidence.",
            headings: ["Authentication"],
            id: artifactId,
            kind: "spec",
            path: "spec/WORK_SPEC.md",
            status: "active",
            summary: "Authentication evidence contract",
            symbols: [],
            tags: ["auth", "github"],
            title: "Authentication",
          },
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "2klips/specproof-app",
        id: REPOSITORY_ID,
        indexEntries: [
          {
            headings: ["Authentication"],
            id: "01K287J3D18V7A1MZG9E8D1Y61",
            neighborIds: [requirementId],
            nodeId: artifactId,
            path: "spec/WORK_SPEC.md",
            searchKey: "authentication github oauth evidence",
            symbols: [],
            tags: ["auth", "github"],
            title: "Authentication",
            type: "artifact",
          },
        ],
        overview: "GitHub-first assurance pilot fixture",
        receipts: [],
        requirements: [
          {
            id: requirementId,
            sourceArtifactId: artifactId,
            statement: "GitHub OAuth must have same-commit test evidence.",
            status: "active",
          },
        ],
      },
    ],
  };
}

async function exerciseHostedMcp() {
  const store = new InMemoryMcpStore({ workspaces: [mcpWorkspaceFixture()] });
  const issued = await store.issueAccessToken({
    actorUserId: USER_ID,
    name: "Pilot Codex client",
    scopes: ["mcp:read"],
    workspaceId: WORKSPACE_ID,
  });
  const endpoint = createHostedMcpEndpoint({ store });
  const client = new Client(
    { name: "pilot-flow", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.specproof.test/mcp"),
    {
      authProvider: { token: async () => issued.secret },
      fetch: endpoint.fetch,
    },
  );

  try {
    await client.connect(transport);
    const context = await client.callTool({
      arguments: {
        target_agent: "codex",
        task_description: "Implement GitHub OAuth authentication",
        token_budget: 128,
      },
      name: "request_context_pack",
    });
    const listed = await store.listAccessTokens({
      actorUserId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });
    await expect
      .poll(() => store.accessEventsForWorkspace(WORKSPACE_ID).length)
      .toBe(1);
    return { context, issued, listed };
  } finally {
    await client.close();
    await endpoint.close();
  }
}

async function exerciseJudgmentCreditsAndConsent() {
  const database = await createTestDatabase([
    AUTH_TENANCY_MIGRATION,
    EVIDENCE_GRAPH_MIGRATION,
    GITHUB_APP_MIGRATION,
    WORKER_CREDIT_MIGRATION,
    HOSTED_MCP_MIGRATION,
    AI_JUDGMENT_MIGRATION,
    PILOT_INSTRUMENTATION_MIGRATION,
  ]);
  const repositoryId = fixedUlid("A");
  const runId = fixedUlid("B");

  try {
    await database.query(
      "insert into auth.users (id, email) values ($1, 'pilot@example.test')",
      [USER_ID],
    );
    const workspaceId =
      (
        await database.query<{ id: string }>(
          "select id from public.workspaces where owner_user_id = $1",
          [USER_ID],
        )
      ).rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, '2klips/specproof-app')",
      [repositoryId, workspaceId],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'pilot-judgment', $4)`,
      [runId, workspaceId, repositoryId, "b".repeat(40)],
    );
    await database.query(
      `insert into public.credit_ledger
        (workspace_id, event, amount, idempotency_key)
       values ($1, 'grant', 50, 'pilot-grant')`,
      [workspaceId],
    );
    const jobId =
      (
        await database.query<{ id: string }>(
          `select public.enqueue_job(
            $1, $2, $3, 'judge', 'pilot-judgment', '{}'::jsonb, 10, 1
          ) as id`,
          [workspaceId, repositoryId, runId],
        )
      ).rows[0]?.id ?? "";
    await database.query(
      "select * from public.claim_next_job($1, 'pilot-worker', 30)",
      [workspaceId],
    );
    await database.query("select public.reserve_job_credits($1)", [jobId]);
    await database.query(
      `select public.record_successful_judgment(
        $1,$2,$3,'contradiction-confirmation','finding-pilot','openai',$4::jsonb,$5,'gpt-5'
      )`,
      [
        jobId,
        workspaceId,
        repositoryId,
        JSON.stringify({
          confidence: 0.86,
          evidenceGrade: "inferred",
          explanation: "Both instruction spans govern authentication.",
          severity: "medium",
          verdict: "confirmed",
        }),
        "c".repeat(64),
      ],
    );
    await database.query(
      "select public.finish_job($1, 'pilot-worker', true, null)",
      [jobId],
    );

    await asAuthenticatedUser(database, USER_ID, (transaction) =>
      transaction.query(
        `update public.workspaces
         set pilot_instrumentation_enabled = true,
             pilot_instrumentation_consented_at = now()
         where id = $1`,
        [workspaceId],
      ),
    );

    const ledger = await database.query<{ amount: number; event: string }>(
      `select event, amount from public.credit_ledger
       where job_id = $1 order by event`,
      [jobId],
    );
    const balance = await database.query<{ balance: number }>(
      `select coalesce(sum(amount), 0)::integer as balance
       from public.credit_ledger where workspace_id = $1`,
      [workspaceId],
    );
    const judgment = await database.query<{ evidence_grade: string }>(
      "select evidence_grade from public.judgments where job_id = $1",
      [jobId],
    );
    const consent = await database.query<{
      consented: boolean;
      enabled: boolean;
    }>(
      `select pilot_instrumentation_enabled as enabled,
              pilot_instrumentation_consented_at is not null as consented
       from public.workspaces where id = $1`,
      [workspaceId],
    );
    return {
      balance: balance.rows[0]?.balance,
      consent: consent.rows,
      judgment: judgment.rows,
      ledger: ledger.rows,
    };
  } finally {
    await database.close();
  }
}

test("completes the GitHub-first pilot flow with MCP, credits, stats, and receipt proof", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await test.step("sign up and install the mocked least-privilege GitHub App", async () => {
    await page.goto("/onboarding");
    await expect(page.getByText(ONBOARDING.identity.body)).toBeVisible();
    await page.getByRole("button", { name: ONBOARDING.identity.cta }).click();
    await expect(
      page.getByRole("heading", { name: ONBOARDING.permission.title }),
    ).toBeVisible();
    for (const permission of [
      ONBOARDING.permission.scopes.contents.title,
      ONBOARDING.permission.scopes.checks.title,
      ONBOARDING.permission.scopes.actions.title,
      ONBOARDING.permission.scopes.metadata.title,
    ]) {
      await expect(page.getByText(permission)).toBeVisible();
    }
    await page.getByRole("button", { name: ONBOARDING.permission.cta }).click();
  });

  await test.step("select the fixture repository and watch its first metadata-only scan", async () => {
    await page.getByRole("button", { name: /2klips\/specproof-app/ }).click();
    await expect(
      page.getByRole("heading", { name: ONBOARDING.scan.title }),
    ).toBeVisible();
    await expect(page.getByText(ONBOARDING.scan.body)).toBeVisible();
    await page.getByRole("button", { name: ONBOARDING.scan.cta }).click();
    await expect(page.getByTestId("brain-map-stage")).toBeVisible();
    await page
      .getByRole("button", { name: DASHBOARD.metrics.unresolved })
      .first()
      .click();
    await expect(page.getByTestId("metric-evidence")).toContainText(
      DASHBOARD.metricEvidence.unresolved[2],
    );
  });

  await test.step("inspect findings, transient source, evidence chain, and lint", async () => {
    await page.goto("/findings");
    await expect(page.locator("[data-source-state='fetched']")).toContainText(
      "exact analyzed commit",
    );
    await expect(
      page.getByRole("heading", { name: ASSURANCE.findings.chain.title }),
    ).toBeVisible();
    await page.goto("/lint");
    await expect(
      page.getByRole("heading", { name: ASSURANCE.lint.title }),
    ).toBeVisible();
    await expect(
      page.getByText(/cl100k_base-compatible tokenizer/),
    ).toBeVisible();
    await expect(page.getByText("AGENTS.md:18-20")).toBeVisible();
    await expect(page.getByText("apps/web/AGENTS.md:7-9")).toBeVisible();
  });

  await test.step("inspect the grounded depth-two graph", async () => {
    await page.goto("/graph?node=req-auth");
    await expect(
      page.getByRole("heading", { name: GRAPH.heading }),
    ).toBeVisible();
    await expect(page.locator(".provenance-card .grade-badge")).toBeVisible();
    await expect(page.locator("[data-canvas-nodes='4']")).toBeVisible();
  });

  await test.step("issue a scoped token and request a context pack with the official MCP client", async () => {
    const { context, issued, listed } = await exerciseHostedMcp();
    expect(issued.secret).toMatch(/^sp_mcp_/);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(listed)).not.toContain(issued.secret);
    expect(context.isError).not.toBe(true);
    expect(context.structuredContent).toMatchObject({
      paths: ["spec/WORK_SPEC.md"],
      targetAgent: "codex",
    });
  });

  await test.step("open only an advisory minimal-index pull request", async () => {
    const proposalFiles = buildMinimalIndexProposalFiles({
      agentsContent: "# Team rules\n",
      claudeContent: null,
      dashboardUrl: "https://specproof.test/project/demo",
      mcpEndpoint: "https://mcp.specproof.test",
    }).files;
    const calls: string[] = [];
    const proposal = await proposeMinimalIndexPullRequest({
      authorization: "proposal_write",
      baseBranch: "main",
      baseSha: "b".repeat(40),
      files: proposalFiles,
      github: {
        createProposalBranch: async () => {
          calls.push("branch");
        },
        openProposalPullRequest: async () => {
          calls.push("pull-request");
          return { number: 42, url: "https://github.test/pilot/pull/42" };
        },
        writeProposalFile: async ({ path: filePath }) => {
          calls.push(`write:${filePath}`);
        },
      },
    });
    expect(proposal).toMatchObject({ number: 42, status: "proposed" });
    expect(calls).toEqual([
      "branch",
      "write:AGENTS.md",
      "write:CLAUDE.md",
      "pull-request",
    ]);
  });

  await test.step("settle one inferred judgment and opt in to pilot stats", async () => {
    const result = await exerciseJudgmentCreditsAndConsent();
    expect(result.judgment).toEqual([{ evidence_grade: "inferred" }]);
    expect(result.ledger).toEqual([
      { amount: -10, event: "reserve" },
      { amount: 0, event: "settle" },
    ]);
    expect(result.balance).toBe(40);
    expect(result.consent).toEqual([{ consented: true, enabled: true }]);
  });

  await test.step("verify the current receipt and capture browser evidence", async () => {
    await page.goto("/receipts?receipt=receipt-current");
    await expect(page.getByTestId("receipt-verdict-locked")).toBeVisible();
    await page
      .getByRole("button", { name: ASSURANCE.receipts.verifyAction })
      .click();
    await expect(
      page.getByText(ASSURANCE.receipts.verification.verified),
    ).toBeVisible();
    await expect(page.getByTestId("receipt-verdict")).toContainText(
      ASSURANCE.receipts.verdict.counts(3, 1),
    );
    const evidenceDirectory = path.resolve(
      ".omo/evidence/docshub-product-strategy/final",
    );
    await mkdir(evidenceDirectory, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: path.join(evidenceDirectory, "browser-qa.png"),
    });
  });
});
