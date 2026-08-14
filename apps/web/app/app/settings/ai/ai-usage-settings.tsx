export interface CreditLedgerView {
  readonly amount: number;
  readonly createdAt: string;
  readonly event:
    "adjust" | "grant" | "refund" | "reserve" | "settle" | "topup";
  readonly id: string;
  readonly jobId: string | null;
}

export type AiProviderName = "anthropic" | "openai";

function providerLabel(provider: AiProviderName): string {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

export function AiUsageSettings({
  configuredProviders,
  ledger,
}: {
  configuredProviders: readonly AiProviderName[];
  ledger: readonly CreditLedgerView[];
}) {
  const balance = ledger.reduce((sum, entry) => sum + entry.amount, 0);
  const used = ledger
    .filter(({ event }) => event === "reserve")
    .reduce((sum, entry) => sum - entry.amount, 0);

  return (
    <div className="ai-settings-grid">
      <section
        className="mcp-settings-card"
        aria-labelledby="credit-usage-title"
      >
        <h2 id="credit-usage-title">Credit usage</h2>
        <div className="credit-meter">
          <strong>{balance} credits</strong>
          <span>{used} used</span>
        </div>
        {balance <= 0 ? (
          <div className="credit-warning" role="status">
            <strong>Judgments paused</strong>
            <p>Add credits or configure BYOK, then retry the judgment.</p>
            <p>Deterministic scans and drift analysis keep working.</p>
          </div>
        ) : null}
        <ul className="credit-ledger-list">
          {ledger.map((entry) => (
            <li key={entry.id}>
              <span>{entry.event}</span>
              <strong>
                {entry.amount > 0 ? "+" : ""}
                {entry.amount}
              </strong>
              <time dateTime={entry.createdAt}>
                {entry.createdAt.slice(0, 16).replace("T", " ")} UTC
              </time>
            </li>
          ))}
        </ul>
      </section>

      <section className="mcp-settings-card" aria-labelledby="byok-title">
        <h2 id="byok-title">Bring your own key</h2>
        <p>
          BYOK judgments bypass credits. Keys are encrypted at rest and never
          displayed or logged.
        </p>
        <form action={saveByokKey} className="byok-key-form">
          <label htmlFor="ai-provider">Provider</label>
          <select id="ai-provider" name="provider">
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
          <label htmlFor="ai-provider-key">Provider API key</label>
          <input
            autoComplete="new-password"
            id="ai-provider-key"
            minLength={16}
            name="apiKey"
            required
            type="password"
          />
          <button className="button" type="submit">
            Encrypt and save
          </button>
        </form>
        <ul className="byok-provider-list">
          {(["anthropic", "openai"] as const).map((provider) => (
            <li key={provider}>
              <strong>{providerLabel(provider)}</strong>
              <span>
                {configuredProviders.includes(provider)
                  ? `${providerLabel(provider)} BYOK configured`
                  : "Not configured"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
import { saveByokKey } from "./actions";
