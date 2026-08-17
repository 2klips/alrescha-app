import { SETTINGS } from "../../../../lib/strings";

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
  return provider === "openai"
    ? SETTINGS.ai.byok.providerNames.openai
    : SETTINGS.ai.byok.providerNames.anthropic;
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
        <h2 id="credit-usage-title">{SETTINGS.ai.creditUsage.heading}</h2>
        <div className="credit-meter">
          <strong>{SETTINGS.ai.creditUsage.balance(balance)}</strong>
          <span>{SETTINGS.ai.creditUsage.used(used)}</span>
        </div>
        {balance <= 0 ? (
          <div className="credit-warning" role="status">
            <strong>{SETTINGS.ai.creditUsage.pausedTitle}</strong>
            <p>{SETTINGS.ai.creditUsage.pausedBody}</p>
            <p>{SETTINGS.ai.creditUsage.pausedNote}</p>
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
                {SETTINGS.ai.creditUsage.timestamp(entry.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      </section>

      <section className="mcp-settings-card" aria-labelledby="byok-title">
        <h2 id="byok-title">{SETTINGS.ai.byok.heading}</h2>
        <p>{SETTINGS.ai.byok.intro}</p>
        <form action={saveByokKey} className="byok-key-form">
          <label htmlFor="ai-provider">
            {SETTINGS.ai.byok.providerFieldLabel}
          </label>
          <select id="ai-provider" name="provider">
            <option value="anthropic">
              {SETTINGS.ai.byok.providerNames.anthropic}
            </option>
            <option value="openai">
              {SETTINGS.ai.byok.providerNames.openai}
            </option>
          </select>
          <label htmlFor="ai-provider-key">
            {SETTINGS.ai.byok.apiKeyFieldLabel}
          </label>
          <input
            autoComplete="new-password"
            id="ai-provider-key"
            minLength={16}
            name="apiKey"
            required
            type="password"
          />
          <button className="button" type="submit">
            {SETTINGS.ai.byok.submit}
          </button>
        </form>
        <ul className="byok-provider-list">
          {(["anthropic", "openai"] as const).map((provider) => (
            <li key={provider}>
              <strong>{providerLabel(provider)}</strong>
              <span>
                {configuredProviders.includes(provider)
                  ? SETTINGS.ai.byok.configured(providerLabel(provider))
                  : SETTINGS.ai.byok.notConfigured}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
import { saveByokKey } from "./actions";
