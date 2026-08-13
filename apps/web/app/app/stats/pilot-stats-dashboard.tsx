import type { PilotStatsReport } from "@specproof/core/stats";

import { setPilotInstrumentation } from "./actions";

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? "—" : `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function PilotStatsDashboard({
  report,
}: {
  readonly report: PilotStatsReport;
}) {
  if (report.state === "consent-required") {
    return (
      <section className="pilot-empty-state">
        <span className="eyebrow">Measurement off</span>
        <h2>Pilot measurement is off</h2>
        <p>
          First-party workspace data only: receipt summaries, deterministic
          token estimates, run timestamps, and MCP pack counts.
        </p>
        <p>No data is sent to third parties.</p>
        <form action={setPilotInstrumentation}>
          <input name="enabled" type="hidden" value="true" />
          <button className="button" type="submit">
            Enable pilot measurement
          </button>
        </form>
      </section>
    );
  }

  if (report.state === "insufficient-evidence") {
    return (
      <section className="pilot-empty-state">
        <span className="eyebrow">Measurement on</span>
        <h2>Not enough evidence</h2>
        <p>
          {report.evidence.receipts} receipt
          {report.evidence.receipts === 1 ? "" : "s"} recorded.
        </p>
        <p>
          At least 2 receipts are required before finding or duration changes
          are shown. Keep running deterministic analyses.
        </p>
        <a className="secondary-button" href="/api/stats/export">
          Export available evidence
        </a>
      </section>
    );
  }

  return (
    <div className="pilot-stats-layout">
      <div className="pilot-stats-toolbar">
        <span>{report.evidence.receipts} receipts</span>
        <div>
          <a className="secondary-button" href="/api/stats/export">
            Export JSON
          </a>
          <form action={setPilotInstrumentation}>
            <input name="enabled" type="hidden" value="false" />
            <button className="pilot-stop-button" type="submit">
              Stop measurement
            </button>
          </form>
        </div>
      </div>

      <section className="pilot-stats-grid" aria-label="Measured pilot stats">
        <article className="pilot-stat-card">
          <span>Finding movement</span>
          <strong>{report.findings.latestOpenTotal} open</strong>
          <p>
            {report.findings.resolved} resolved · {report.findings.opened} opened
          </p>
          <small>
            {report.findings.netOpenChange === null
              ? "No trend yet"
              : `${report.findings.netOpenChange > 0 ? "+" : ""}${report.findings.netOpenChange} across receipt chain`}
          </small>
        </article>

        <article className="pilot-stat-card">
          <span>Context tokens</span>
          <strong>
            {report.context.tokenReductionPercent === null
              ? "No comparison"
              : `${report.context.tokenReductionPercent}% lower`}
          </strong>
          <p>
            {report.context.selectedTokens.toLocaleString("en-US")} selected /{" "}
            {report.context.baselineTokens.toLocaleString("en-US")} full dump
          </p>
          <small>{report.context.packRequests} MCP pack requests</small>
        </article>

        <article className="pilot-stat-card">
          <span>Scan duration</span>
          <strong>{seconds(report.scans.averageDurationMs)} average</strong>
          <p>{seconds(report.scans.latestDurationMs)} latest</p>
          <small>
            {report.scans.durationChangePercent === null
              ? "No duration trend yet"
              : `${report.scans.durationChangePercent > 0 ? "+" : ""}${report.scans.durationChangePercent}% first to latest`}
          </small>
        </article>
      </section>

      <details className="pilot-methodology">
        <summary>How these metrics are computed</summary>
        <p>{report.methodology.findingTrend}</p>
        <p>{report.methodology.tokenBaseline}</p>
        <p>{report.methodology.scanDuration}</p>
        <p>
          Cross-arm accuracy and model-reported token results:{" "}
          <a href="https://github.com/2klips/specproof-app/blob/main/benchmarks/databrain/results.real.md">
            full Data Brain efficacy benchmark
          </a>
          .
        </p>
      </details>
    </div>
  );
}
