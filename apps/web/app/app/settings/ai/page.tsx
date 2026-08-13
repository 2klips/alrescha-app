import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
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

export default async function AiSettingsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const ledgerResult = await client
    .from("credit_ledger")
    .select("id,event,amount,job_id,created_at")
    .eq("workspace_id", workspace.data.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ledgerResult.error) throw new Error("Credit usage is unavailable.");

  const keyResult = await createAdminClient()
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", workspace.data.id);
  if (keyResult.error) throw new Error("BYOK configuration is unavailable.");

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
        <div className="eyebrow">AI judgments · inferred only</div>
        <h1>Judgment usage</h1>
        <p>
          AI confirms ambiguous drift candidates. Successful platform runs use
          credits; failed or schema-invalid runs are refunded. BYOK bypasses
          credits. A judgment runs only after your explicit provider choice;
          inferred output, provenance, job status, and ledger entries remain
          until workspace deletion. Raw source and plaintext keys are not
          stored. Review <a href="/app/settings/privacy">privacy &amp; retention</a>.
        </p>
      </header>
      <AiUsageSettings
        configuredProviders={configuredProviders}
        ledger={ledger}
      />
    </main>
  );
}
