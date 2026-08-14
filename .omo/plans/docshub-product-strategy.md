# DocsHub product strategy — executable coverage map

This final audit map connects every completed build-plan todo to executable proof and retained evidence. It is intentionally machine-readable by `scripts/verify-plan-coverage.ts`.

## Must Haves

Todos 1–22 each map to at least one focused test or browser-QA test below.

## Must NOTs

Every boundary maps to a scenario and an explicit negative assertion. The six release-critical boundaries are: no raw-code storage, no document inlining, no deprecated MCP capability, advisory-only repository writes, verified/inferred separation, and no charge on failure.

<!-- specproof-coverage:start -->

```json
{
  "schemaVersion": 1,
  "mustHaves": [
    {
      "id": "MH-01",
      "todo": 1,
      "requirement": "Bootstrap the pnpm monorepo and app shell",
      "proof": {
        "kind": "browser-qa",
        "path": "tests/e2e/app-shell.spec.ts",
        "contains": "opens the SpecProof app shell"
      }
    },
    {
      "id": "MH-02",
      "todo": 2,
      "requirement": "Enforce canonical architectural guardrails",
      "proof": {
        "kind": "test",
        "path": "tests/adr-guardrails.test.ts",
        "contains": "keeps production sources free of banned patterns"
      }
    },
    {
      "id": "MH-03",
      "todo": 3,
      "requirement": "Ship the drifted-demo fixture and oracle",
      "proof": {
        "kind": "test",
        "path": "tests/drifted-demo.test.ts",
        "contains": "validates all six finding types and their real source spans"
      }
    },
    {
      "id": "MH-04",
      "todo": 4,
      "requirement": "Provision authenticated users into isolated workspaces",
      "proof": {
        "kind": "test",
        "path": "tests/auth-tenancy.test.ts",
        "contains": "auto-provisions exactly one owner workspace and membership per auth user"
      }
    },
    {
      "id": "MH-05",
      "todo": 5,
      "requirement": "Create the tenant-scoped graph domain model",
      "proof": {
        "kind": "test",
        "path": "tests/domain-model.test.ts",
        "contains": "creates the full tenant-scoped schema with RLS, indexes, and foreign keys"
      }
    },
    {
      "id": "MH-06",
      "todo": 6,
      "requirement": "Integrate a least-privilege GitHub App",
      "proof": {
        "kind": "test",
        "path": "tests/github-app.test.ts",
        "contains": "accepts only the exact read-only profile or separately enabled PR proposals"
      }
    },
    {
      "id": "MH-07",
      "todo": 7,
      "requirement": "Run durable jobs with atomic credit accounting",
      "proof": {
        "kind": "test",
        "path": "tests/job-lifecycle-credit-reconciliation.test.ts",
        "contains": "single-claims jobs and never crosses the requested tenant"
      }
    },
    {
      "id": "MH-08",
      "todo": 8,
      "requirement": "Scan repositories into deterministic artifact metadata",
      "proof": {
        "kind": "test",
        "path": "tests/repository-scanner.test.ts",
        "contains": "classifies every recorded fixture artifact with exact digest and exported symbols"
      }
    },
    {
      "id": "MH-09",
      "todo": 9,
      "requirement": "Parse normative Markdown with exact spans",
      "proof": {
        "kind": "test",
        "path": "tests/markdown-parser.test.ts",
        "contains": "extracts fixture headings, tasks, and normative statements with exact spans"
      }
    },
    {
      "id": "MH-10",
      "todo": 10,
      "requirement": "Generate deterministic assurance findings",
      "proof": {
        "kind": "test",
        "path": "tests/assurance-rules.test.ts",
        "contains": "reproduces the fixture findings manifest exactly with actionable provenance"
      }
    },
    {
      "id": "MH-11",
      "todo": 11,
      "requirement": "Ingest same-commit CI evidence",
      "proof": {
        "kind": "test",
        "path": "tests/ci-evidence.test.ts",
        "contains": "maps recorded JUnit and Vitest reports to one verified same-commit requirement"
      }
    },
    {
      "id": "MH-12",
      "todo": 12,
      "requirement": "Onboard and show the repository dashboard",
      "proof": {
        "kind": "browser-qa",
        "path": "tests/e2e/dashboard.spec.ts",
        "contains": "onboards through mocked GitHub into the fixture evidence graph"
      }
    },
    {
      "id": "MH-13",
      "todo": 13,
      "requirement": "Explain findings, lint costs, and evidence receipts",
      "proof": {
        "kind": "browser-qa",
        "path": "tests/e2e/findings.spec.ts",
        "contains": "shows labeled lint cost assumptions and contradiction dual spans"
      }
    },
    {
      "id": "MH-14",
      "todo": 14,
      "requirement": "Visualize live graph activity and detail",
      "proof": {
        "kind": "browser-qa",
        "path": "tests/e2e/live-graph.spec.ts",
        "contains": "scripted MCP reads pulse the graph and feed focus follows the newest call"
      }
    },
    {
      "id": "MH-15",
      "todo": 15,
      "requirement": "Expose hosted read-only MCP and data indexes",
      "proof": {
        "kind": "test",
        "path": "tests/mcp-persistence.test.ts",
        "contains": "lets an owner issue only their own scoped token and keeps hashes private"
      }
    },
    {
      "id": "MH-16",
      "todo": 16,
      "requirement": "Build bounded context packs and minimal index proposals",
      "proof": {
        "kind": "test",
        "path": "tests/context-pack.test.ts",
        "contains": "selects fixture authentication docs under budget in reading order"
      }
    },
    {
      "id": "MH-17",
      "todo": 17,
      "requirement": "Persist inferred AI judgments with safe BYOK credit handling",
      "proof": {
        "kind": "test",
        "path": "tests/ai-judgment-database.test.ts",
        "contains": "stores one inferred payload record per successful judgment job"
      }
    },
    {
      "id": "MH-18",
      "todo": 18,
      "requirement": "Compute sourced pilot statistics",
      "proof": {
        "kind": "test",
        "path": "packages/core/src/stats/pilot-stats.test.ts",
        "contains": "computes documented trends over a three-receipt chain"
      }
    },
    {
      "id": "MH-19",
      "todo": 19,
      "requirement": "Ship security, privacy, deployment, and release documentation",
      "proof": {
        "kind": "test",
        "path": "tests/release-hardening.test.ts",
        "contains": "ships explicit security, privacy, deployment, and pilot documents"
      }
    },
    {
      "id": "MH-20",
      "todo": 20,
      "requirement": "Benchmark retrieval with the DataBrain harness",
      "proof": {
        "kind": "test",
        "path": "tests/databrain-benchmark.test.ts",
        "contains": "loads 12 tasks, three trials, all grading types, and a realistic repository"
      }
    },
    {
      "id": "MH-21",
      "todo": 21,
      "requirement": "Present sourced progress and work history",
      "proof": {
        "kind": "browser-qa",
        "path": "tests/e2e/progress.spec.ts",
        "contains": "shows sourced metrics, four todo states, and newest-first work"
      }
    },
    {
      "id": "MH-22",
      "todo": 22,
      "requirement": "Save and browse reusable harness assets",
      "proof": {
        "kind": "browser-qa",
        "path": "tests/e2e/library.spec.ts",
        "contains": "saves a harness skill, dedupes its digest, and browses exact provenance"
      }
    }
  ],
  "mustNots": [
    {
      "id": "verified-inferred-separation",
      "boundary": "AI judgment must never become verified evidence",
      "proof": {
        "kind": "test",
        "path": "tests/ai-judgment-database.test.ts",
        "contains": "rejects any attempt to store AI judgment as verified",
        "assertion": ".rejects.toThrow"
      }
    },
    {
      "id": "provenance-required",
      "boundary": "Graph edges must never omit provenance",
      "proof": {
        "kind": "test",
        "path": "tests/domain-model.test.ts",
        "contains": "rejects edges without provenance at Zod and SQL layers",
        "assertion": ".rejects.toThrow"
      }
    },
    {
      "id": "no-raw-code-storage",
      "boundary": "Persistent domain tables must never contain raw source code or prompts",
      "proof": {
        "kind": "test",
        "path": "tests/domain-model.test.ts",
        "contains": "keeps raw code and prompt text out of persistent domain tables",
        "assertion": "expect(forbiddenColumns.rows).toEqual([])"
      }
    },
    {
      "id": "advisory-only-writes",
      "boundary": "Repository writes must stay inside explicit index PR proposals",
      "proof": {
        "kind": "test",
        "path": "tests/adr-guardrails.test.ts",
        "contains": "repo-write-outside-pr-proposal",
        "assertion": "toEqual(["
      }
    },
    {
      "id": "no-inlining",
      "boundary": "Generated index files must never inline document bodies",
      "proof": {
        "kind": "test",
        "path": "tests/minimal-index.test.ts",
        "contains": "proposes bounded index files without document-body inlining",
        "assertion": ".not.toContain"
      }
    },
    {
      "id": "no-deprecated-mcp",
      "boundary": "Production MCP must never use Sampling or deprecated capabilities",
      "proof": {
        "kind": "test",
        "path": "tests/adr-guardrails.test.ts",
        "contains": "rejects a fixture importing MCP Sampling with a specific message",
        "assertion": "deprecated-mcp-capability"
      }
    },
    {
      "id": "no-charge-on-failure",
      "boundary": "Failed or schema-invalid AI work must never consume credits",
      "proof": {
        "kind": "test",
        "path": "tests/ai-judgment-database.test.ts",
        "contains": "records schema-invalid metadata, rejects the job, and refunds immediately",
        "assertion": "expect(balance.rows[0]?.balance).toBe(20)"
      }
    },
    {
      "id": "no-false-precision",
      "boundary": "Token estimates must never hide tokenizer assumptions",
      "proof": {
        "kind": "test",
        "path": "tests/assurance-surfaces.test.ts",
        "contains": "labels the tokenizer assumptions behind every lint token number",
        "assertion": "TOKENIZER_ASSUMPTION"
      }
    },
    {
      "id": "minimal-github-permissions",
      "boundary": "GitHub permissions must never exceed the declared minimum",
      "proof": {
        "kind": "test",
        "path": "tests/github-app.test.ts",
        "contains": "accepts only the exact read-only profile or separately enabled PR proposals",
        "assertion": ".toThrow(/exceed/)"
      }
    },
    {
      "id": "quality-gates-unsuppressed",
      "boundary": "Quality gates must never be weakened or suppressed",
      "proof": {
        "kind": "test",
        "path": "tests/plan-compliance.test.ts",
        "contains": "never weakens or suppresses the repository quality gates",
        "assertion": ".not.toMatch"
      }
    }
  ],
  "todoEvidence": [
    { "todo": 1, "path": ".omo/evidence/docshub-product-strategy/task-1.md" },
    { "todo": 2, "path": ".omo/evidence/docshub-product-strategy/task-2.md" },
    { "todo": 3, "path": ".omo/evidence/docshub-product-strategy/task-3.md" },
    { "todo": 4, "path": ".omo/evidence/docshub-product-strategy/task-4.md" },
    { "todo": 5, "path": ".omo/evidence/docshub-product-strategy/task-5.md" },
    { "todo": 6, "path": ".omo/evidence/docshub-product-strategy/task-6.md" },
    { "todo": 7, "path": ".omo/evidence/docshub-product-strategy/task-7.md" },
    { "todo": 8, "path": ".omo/evidence/docshub-product-strategy/task-8.json" },
    { "todo": 9, "path": ".omo/evidence/docshub-product-strategy/task-9.json" },
    {
      "todo": 10,
      "path": ".omo/evidence/docshub-product-strategy/task-10.json"
    },
    {
      "todo": 11,
      "path": ".omo/evidence/docshub-product-strategy/task-11.json"
    },
    {
      "todo": 12,
      "path": ".omo/evidence/docshub-product-strategy/task-12.png"
    },
    {
      "todo": 13,
      "path": ".omo/evidence/docshub-product-strategy/task-13.png"
    },
    {
      "todo": 14,
      "path": ".omo/evidence/docshub-product-strategy/task-14.png"
    },
    { "todo": 15, "path": ".omo/evidence/docshub-product-strategy/task-15.md" },
    { "todo": 16, "path": ".omo/evidence/docshub-product-strategy/task-16.md" },
    { "todo": 17, "path": ".omo/evidence/docshub-product-strategy/task-17.md" },
    {
      "todo": 18,
      "path": ".omo/evidence/docshub-product-strategy/task-18.png"
    },
    {
      "todo": 19,
      "path": ".omo/evidence/docshub-product-strategy/task-19.png"
    },
    { "todo": 20, "path": ".omo/evidence/docshub-product-strategy/task-20.md" },
    {
      "todo": 21,
      "path": ".omo/evidence/docshub-product-strategy/task-21.png"
    },
    { "todo": 22, "path": ".omo/evidence/docshub-product-strategy/task-22.png" }
  ]
}
```

<!-- specproof-coverage:end -->
