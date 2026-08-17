import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SCOPE_BOUNDARIES,
  TEAM_PRIVACY_INVARIANTS,
  TEAM_PRIVACY_TEST_FILE,
  type ScopeBoundary,
  verifyScopeBoundaries,
} from "../scripts/verify-scope-boundaries";

interface ForbiddenCase {
  readonly boundary: ScopeBoundary;
  readonly file: string;
  readonly source: string;
}

const FORBIDDEN_CASES: readonly ForbiddenCase[] = [
  {
    boundary: "raw-source-upload",
    file: "packages/cli/src/push.ts",
    source: `#!/usr/bin/env node
    export async function pushProject(client: any, fileContents: string) {
      return client.upload({ fileContents });
    }`,
  },
  {
    boundary: "client-submitted-assurance",
    file: "apps/web/app/api/ingest/local/route.ts",
    source: `export async function POST(request: Request) {
      const payload = await request.json();
      return store({ receipt: payload.receipt });
    }`,
  },
  {
    boundary: "unguarded-team-surface",
    file: "apps/web/app/teams/page.tsx",
    source: `export default function TeamsPage() {
      return <main><h1>Manage team members</h1></main>;
    }`,
  },
  {
    boundary: "external-billing",
    file: "apps/web/app/settings/page.tsx",
    source: `import Stripe from "stripe";
      export const billing = new Stripe("secret");`,
  },
  {
    boundary: "non-github-provider",
    file: "apps/web/app/integrations/page.tsx",
    source: `import { Gitlab } from "@gitbeaker/rest";
      export const provider = new Gitlab({ token: "secret" });`,
  },
  {
    boundary: "marketplace",
    file: "apps/web/app/marketplace/page.tsx",
    source: `export default function MarketplacePage() {
      return <main><h1>Browse marketplace listings</h1></main>;
    }`,
  },
  {
    boundary: "skill-security-scanning",
    file: "packages/core/src/skill-audit.ts",
    source: `export function scanSkillForSecurity(skill: string) {
      return { skill, malware: false, vulnerabilities: [] };
    }`,
  },
  {
    boundary: "direct-autonomous-writes",
    file: "packages/github/src/merge.ts",
    source: `export async function merge(client: any, owner: string, repo: string, number: number) {
      return client.pulls.merge({ owner, repo, pull_number: number });
    }`,
  },
  {
    boundary: "raw-code-persistence",
    file: "packages/core/src/storage.ts",
    source: `export async function saveSnippet(database: any, rawCode: string) {
      return database.persist({ rawCode });
    }`,
  },
  {
    boundary: "always-loaded-generated-context",
    file: "packages/core/src/minimal-index.ts",
    source: `export function renderIndex(document: { content: string }) {
      return \`# Generated context\n\${document.content}\`;
    }`,
  },
  {
    boundary: "deprecated-mcp",
    file: "packages/mcp/src/server.ts",
    source: `import { Sampling } from "@modelcontextprotocol/sdk";
      export const capability = Sampling;`,
  },
  {
    boundary: "unsupported-savings-claims",
    file: "apps/web/app/page.tsx",
    source: `export default function HomePage() {
      return <strong>Save 70% on token costs</strong>;
    }`,
  },
];

async function withFixture(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "arr-scope-"));

  try {
    for (const [path, source] of Object.entries(files)) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, source, "utf8");
    }

    await run(root);
  } finally {
    await rm(root, { recursive: true });
  }
}

describe("MVP scope fidelity", () => {
  it("has one negative fixture for every forbidden boundary", () => {
    expect(FORBIDDEN_CASES.map(({ boundary }) => boundary).sort()).toEqual(
      [...SCOPE_BOUNDARIES].sort(),
    );
  });

  it.each(FORBIDDEN_CASES)(
    "rejects $boundary",
    async ({ boundary, file, source }) => {
      await withFixture({ [file]: source }, async (root) => {
        const report = await verifyScopeBoundaries(root);

        expect(report.findings).toEqual([
          expect.objectContaining({
            boundary,
            file,
          }),
        ]);
        expect(report.status).toBe("fail");
      });
    },
  );

  it("accepts a metadata-only local CLI (ADR-013 — the boundary moved off CLI existence)", async () => {
    await withFixture(
      {
        "packages/cli/package.json": `{
          "name": "@arr/cli",
          "bin": { "arr": "./dist/push.js" }
        }`,
        "packages/cli/src/push.ts": `#!/usr/bin/env node
        export async function pushProject(client: any, metadata: object) {
          return client.upload({ metadata });
        }`,
      },
      async (root) => {
        const report = await verifyScopeBoundaries(root);

        expect(report.findings).toEqual([]);
        expect(report.status).toBe("pass");
      },
    );
  });

  it("accepts a graph-only ingest route, and keeps prose about the gap legal (ADR-015)", async () => {
    await withFixture(
      {
        "apps/web/app/api/ingest/local/route.ts": `export async function POST(request: Request) {
          const payload = await request.json();
          return applyScan({ artifacts: payload.artifacts });
        }`,
        "supabase/migrations/202608170007_local_ingest_run.sql": `-- No receipt is produced: a receipt asserts evidence about findings,
-- and metadata-only ingest cannot produce either (ADR-015).
create function public.record_local_ingest_run() returns uuid as $$ $$ language sql;`,
      },
      async (root) => {
        const report = await verifyScopeBoundaries(root);

        expect(report.findings).toEqual([]);
        expect(report.status).toBe("pass");
      },
    );
  });

  it("accepts a team surface once the ADR-011 negative privacy suite exists", async () => {
    const teamsPage = `export default function TeamsPage() {
      return <main><h1>Manage team members</h1></main>;
    }`;
    const privacySuite = TEAM_PRIVACY_INVARIANTS.map(
      (marker) => `it("${marker}", () => {});`,
    ).join("\n");

    await withFixture(
      {
        "apps/web/app/teams/page.tsx": teamsPage,
        [TEAM_PRIVACY_TEST_FILE]: privacySuite,
      },
      async (root) => {
        const report = await verifyScopeBoundaries(root);

        expect(report.findings).toEqual([]);
        expect(report.status).toBe("pass");
      },
    );
  });

  it("still rejects a team surface when the privacy suite misses an invariant", async () => {
    const partialSuite = TEAM_PRIVACY_INVARIANTS.slice(1)
      .map((marker) => `it("${marker}", () => {});`)
      .join("\n");

    await withFixture(
      {
        "apps/web/app/teams/page.tsx": `export default function TeamsPage() {
          return <main><h1>Manage team members</h1></main>;
        }`,
        [TEAM_PRIVACY_TEST_FILE]: partialSuite,
      },
      async (root) => {
        const report = await verifyScopeBoundaries(root);

        expect(report.findings).toEqual([
          expect.objectContaining({
            boundary: "unguarded-team-surface",
            message: expect.stringContaining(TEAM_PRIVACY_INVARIANTS[0]),
          }),
        ]);
        expect(report.status).toBe("fail");
      },
    );
  });

  it("accepts the current MVP product surface", async () => {
    const report = await verifyScopeBoundaries(
      resolve(import.meta.dirname, ".."),
    );

    expect(report.boundaryCount).toBe(SCOPE_BOUNDARIES.length);
    expect(report.findings).toEqual([]);
    expect(report.status).toBe("pass");
  });
});
