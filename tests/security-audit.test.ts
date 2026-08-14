import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { runSecurityAudit } from "../scripts/security-audit";

async function withFixture(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "specproof-security-"));
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

describe("security audit", () => {
  it("rejects a webhook entrypoint that processes an unverified payload", async () => {
    await withFixture(
      {
        "apps/web/app/api/github/webhooks/route.ts": `
          export async function POST(request: Request) {
            const payload = JSON.parse(await request.text());
            await store.insertEvent(payload);
            return Response.json({ received: true });
          }
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.status).toBe("fail");
        expect(report.findings).toEqual([
          expect.objectContaining({
            category: "webhook-forgery",
            file: "apps/web/app/api/github/webhooks/route.ts",
            severity: "critical",
          }),
        ]);
      },
    );
  });

  it("rejects logging plaintext tokens and provider keys", async () => {
    await withFixture(
      {
        "apps/web/app/settings/ai/actions.ts": `
          export function saveProviderKey(apiKey: string, accessToken: string) {
            console.info("saving credentials", { apiKey, accessToken });
          }
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.findings).toEqual([
          expect.objectContaining({
            category: "token-key-handling",
            severity: "critical",
          }),
        ]);
      },
    );
  });

  it("accepts an explicitly publishable Supabase browser key", async () => {
    await withFixture(
      {
        "apps/web/lib/supabase/env.ts": `
          export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.findings).toEqual([]);
      },
    );
  });

  it("rejects a tenant table without row-level security", async () => {
    await withFixture(
      {
        "supabase/migrations/001_leaky_table.sql": `
          create table public.private_notes (
            id uuid primary key,
            workspace_id uuid not null,
            body text not null
          );
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.findings).toEqual([
          expect.objectContaining({
            category: "tenant-isolation",
            file: "supabase/migrations/001_leaky_table.sql",
            severity: "critical",
          }),
        ]);
      },
    );
  });

  it("accepts tenant RLS enabled by a bounded migration loop", async () => {
    await withFixture(
      {
        "supabase/migrations/001_tenant_table.sql": `
          create table public.private_notes (
            id uuid primary key,
            workspace_id uuid not null
          );
          do $$
          declare tenant_table text;
          begin
            foreach tenant_table in array array['private_notes'] loop
              execute format('alter table public.%I enable row level security', tenant_table);
            end loop;
          end;
          $$;
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.findings).toEqual([]);
      },
    );
  });

  it("rejects persistence of raw repository source outside transient memory", async () => {
    await withFixture(
      {
        "apps/worker/src/repository-store.ts": `
          export async function saveArtifact(database: Database, rawSource: string) {
            return database.insert({ rawSource });
          }
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.findings).toEqual([
          expect.objectContaining({
            category: "transient-fetch-boundary",
            severity: "critical",
          }),
        ]);
      },
    );
  });

  it("rejects HTML injection sinks in source-span rendering", async () => {
    await withFixture(
      {
        "apps/web/app/ui/source-span.tsx": `
          export function SourceSpan({ excerpt }: { excerpt: string }) {
            return <pre dangerouslySetInnerHTML={{ __html: excerpt }} />;
          }
        `,
      },
      async (root) => {
        const report = await runSecurityAudit(root);

        expect(report.findings).toEqual([
          expect.objectContaining({
            category: "span-rendering-injection",
            severity: "high",
          }),
        ]);
      },
    );
  });
});
