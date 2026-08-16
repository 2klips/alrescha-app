import { SETTINGS } from "../../../../lib/strings";

export function PrivacyBoundary() {
  return (
    <section className="privacy-boundary-grid" aria-label={SETTINGS.privacy.ariaLabel}>
      <article className="mcp-settings-card">
        <span className="eyebrow">{SETTINGS.privacy.stored.eyebrow}</span>
        <h2>{SETTINGS.privacy.stored.title}</h2>
        <p>{SETTINGS.privacy.stored.body}</p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">{SETTINGS.privacy.transient.eyebrow}</span>
        <h2>{SETTINGS.privacy.transient.title}</h2>
        <p>{SETTINGS.privacy.transient.body}</p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">{SETTINGS.privacy.secrets.eyebrow}</span>
        <h2>{SETTINGS.privacy.secrets.title}</h2>
        <p>
          {SETTINGS.privacy.secrets.bodyPrefix}
          <code>{SETTINGS.privacy.secrets.envVarName}</code>
          {SETTINGS.privacy.secrets.bodySuffix}
        </p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">{SETTINGS.privacy.retention.eyebrow}</span>
        <h2>{SETTINGS.privacy.retention.title}</h2>
        <p>{SETTINGS.privacy.retention.body}</p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">{SETTINGS.privacy.credits.eyebrow}</span>
        <h2>{SETTINGS.privacy.credits.title}</h2>
        <p>{SETTINGS.privacy.credits.body}</p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">{SETTINGS.privacy.claims.eyebrow}</span>
        <h2>{SETTINGS.privacy.claims.title}</h2>
        <p>
          {SETTINGS.privacy.claims.bodyPrefix}
          {" "}<a href="/app/stats">{SETTINGS.privacy.claims.statsLinkLabel}</a>
          {SETTINGS.privacy.claims.bodySuffix}
        </p>
      </article>
    </section>
  );
}
