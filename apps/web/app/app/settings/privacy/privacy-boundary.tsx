export function PrivacyBoundary() {
  return (
    <section className="privacy-boundary-grid" aria-label="Privacy and data boundary">
      <article className="mcp-settings-card">
        <span className="eyebrow">Stored</span>
        <h2>Metadata-only storage</h2>
        <p>
          Arr stores repository identity, file paths, content digests,
          source spans, extracted requirements, evidence edges, findings, test
          reports, receipts, job status, and minimal audit events.
        </p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">Not stored</span>
        <h2>Transient source access</h2>
        <p>
          Raw repository files and GitHub installation tokens are fetched
          transiently for a scan and are not persisted. Revoking the GitHub App
          pauses scans while stored evidence remains read-only.
        </p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">Secrets</span>
        <h2>BYOK key handling</h2>
        <p>
          BYOK provider keys are encrypted separately with
          <code> BYOK_ENCRYPTION_KEY</code>, never returned after save, and never
          written to job payloads, prompts, audit metadata, or logs.
        </p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">Retention</span>
        <h2>30 days for access events</h2>
        <p>
          Pilot workspaces retain MCP access events for 30 days. Security audit
          events and evidence remain until workspace deletion. A deployment job
          prunes expired access events daily.
        </p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">Credits</span>
        <h2>Explicit AI usage only</h2>
        <p>
          Deterministic scans use zero credits. AI judgments run only after the
          user chooses platform credits or configures BYOK. No credits are used
          after GitHub access is revoked.
        </p>
      </article>
      <article className="mcp-settings-card">
        <span className="eyebrow">Claims</span>
        <h2>Your measurements, linked</h2>
        <p>
          Product impact is shown only from sufficient, opt-in workspace data.
          Review sources and export the underlying JSON in
          {" "}<a href="/app/stats">your pilot stats</a>.
        </p>
      </article>
    </section>
  );
}
