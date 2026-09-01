import type { PilotStatsReport } from "@alrescha/core/stats";

import { STATS } from "../../../../lib/strings";
import { setPilotInstrumentation } from "./actions";
import { Button } from "../../../ui/button";

export function PilotStatsDashboard({
  report,
}: {
  readonly report: PilotStatsReport;
}) {
  if (report.state === "consent-required") {
    return (
      <section className="pilot-empty-state">
        <span className="eyebrow">{STATS.consent.eyebrow}</span>
        <h2>{STATS.consent.title}</h2>
        <p>{STATS.consent.scope}</p>
        <p>{STATS.consent.noThirdParty}</p>
        <form action={setPilotInstrumentation}>
          <input name="enabled" type="hidden" value="true" />
          <Button size="md" type="submit" variant="primary">
            {STATS.consent.enable}
          </Button>
        </form>
      </section>
    );
  }

  if (report.state === "insufficient-evidence") {
    return (
      <section className="pilot-empty-state">
        <span className="eyebrow">{STATS.insufficient.eyebrow}</span>
        <h2>{STATS.insufficient.title}</h2>
        <p>{STATS.insufficient.receiptsRecorded(report.evidence.receipts)}</p>
        <p>{STATS.insufficient.requirement}</p>
        <a className="secondary-button" href="/api/stats/export">
          {STATS.insufficient.exportAvailable}
        </a>
      </section>
    );
  }

  return (
    <div className="pilot-stats-layout">
      <div className="pilot-stats-toolbar">
        <span>{STATS.toolbar.receiptCount(report.evidence.receipts)}</span>
        <div>
          <a className="secondary-button" href="/api/stats/export">
            {STATS.toolbar.export}
          </a>
          <form action={setPilotInstrumentation}>
            <input name="enabled" type="hidden" value="false" />
            <button className="pilot-stop-button" type="submit">
              {STATS.toolbar.stop}
            </button>
          </form>
        </div>
      </div>

      <section className="pilot-stats-grid" aria-label={STATS.grid.aria}>
        <article className="pilot-stat-card">
          <span>{STATS.findings.label}</span>
          <strong>
            {STATS.findings.openTotal(report.findings.latestOpenTotal)}
          </strong>
          <p>
            {STATS.findings.resolvedOpened(
              report.findings.resolved,
              report.findings.opened,
            )}
          </p>
          <small>{STATS.findings.trend(report.findings.netOpenChange)}</small>
        </article>

        <article className="pilot-stat-card">
          <span>{STATS.context.label}</span>
          <strong>
            {STATS.context.reduction(report.context.tokenReductionPercent)}
          </strong>
          <p>
            {STATS.context.tokensCompare(
              report.context.selectedTokens.toLocaleString("en-US"),
              report.context.baselineTokens.toLocaleString("en-US"),
            )}
          </p>
          <small>
            {STATS.context.packRequests(report.context.packRequests)}
          </small>
        </article>

        <article className="pilot-stat-card">
          <span>{STATS.scan.label}</span>
          <strong>{STATS.scan.average(report.scans.averageDurationMs)}</strong>
          <p>{STATS.scan.latest(report.scans.latestDurationMs)}</p>
          <small>{STATS.scan.trend(report.scans.durationChangePercent)}</small>
        </article>
      </section>

      <details className="pilot-methodology">
        <summary>{STATS.methodology.summary}</summary>
        <p>{report.methodology.findingTrend}</p>
        <p>{report.methodology.tokenBaseline}</p>
        <p>{report.methodology.scanDuration}</p>
        <p>
          {STATS.methodology.benchmarkPrefix}
          <a href="https://github.com/2klips/arr-app/blob/main/benchmarks/databrain/results.real.md">
            {STATS.methodology.benchmarkLink}
          </a>
          .
        </p>
      </details>
    </div>
  );
}
