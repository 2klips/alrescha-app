import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { SETTINGS } from "../../../../lib/strings";
import { createClient } from "../../../../lib/supabase/server";
import { runEnrichPass } from "./actions";
import {
  AiUsageSettings,
  type AiProviderName,
  type CreditLedgerView,
} from "./ai-usage-settings";

export const dynamic = "force-dynamic";

interface CreditLedgerRow {
  readonly amount: number;
  readonly created_at: string;
  readonly event: CreditLedgerView["event"];
  readonly id: string;
  readonly job_id: string | null;
}

interface ProviderRow {
  readonly provider: AiProviderName;
}

export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ enrich?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const { enrich } = (await searchParams) ?? {};

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error(SETTINGS.errors.workspaceUnavailable);
  }

  const ledgerResult = await client
    .from("credit_ledger")
    .select("id,event,amount,job_id,created_at")
    .eq("workspace_id", workspace.data.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ledgerResult.error)
    throw new Error(SETTINGS.errors.creditUsageUnavailable);

  const keyResult = await createAdminClient()
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", workspace.data.id);
  if (keyResult.error) throw new Error(SETTINGS.errors.byokConfigUnavailable);

  const ledger: CreditLedgerView[] = (
    (ledgerResult.data ?? []) as CreditLedgerRow[]
  ).map((entry) => ({
    amount: entry.amount,
    createdAt: entry.created_at,
    event: entry.event,
    id: entry.id,
    jobId: entry.job_id,
  }));
  const configuredProviders = ((keyResult.data ?? []) as ProviderRow[]).map(
    ({ provider }) => provider,
  );

  return (
    <main className="mcp-settings-shell">
      <header>
        <div className="eyebrow">{SETTINGS.ai.eyebrow}</div>
        <h1>{SETTINGS.ai.title}</h1>
        <p>
          {SETTINGS.ai.introPrefix}
          <a href="/app/settings/privacy">{SETTINGS.privacy.linkLabel}</a>
          {SETTINGS.ai.introSuffix}
        </p>
      </header>
      <section className="mcp-token-card" data-testid="enrich-card">
        <h2>{SETTINGS.ai.enrich.heading}</h2>
        <p>{SETTINGS.ai.enrich.intro}</p>
        {enrich === "queued" ? (
          <p role="status">{SETTINGS.ai.enrich.queued}</p>
        ) : enrich === "fresh" ? (
          <p role="status">{SETTINGS.ai.enrich.fresh}</p>
        ) : enrich === "no-repository" ? (
          <p role="alert">{SETTINGS.ai.enrich.noRepository}</p>
        ) : null}
        <form action={runEnrichPass}>
          <button type="submit">{SETTINGS.ai.enrich.run}</button>
        </form>
      </section>
      <AiUsageSettings
        configuredProviders={configuredProviders}
        ledger={ledger}
      />
    </main>
  );
}
