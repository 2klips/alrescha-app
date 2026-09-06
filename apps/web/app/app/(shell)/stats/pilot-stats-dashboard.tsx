import type { PilotStatsReport } from "@alrescha/core/stats";

import { STATS } from "../../../../lib/strings";
import { setPilotInstrumentation } from "./actions";
import { Button } from "../../../ui/button";

const number = (value: number): string => value.toLocaleString("en-US");

/**
 * One card, with the kind of number it holds stated on it (Phase 4 Wave E
 * todo 24). Three different kinds of number sat in one grid before this —
 * measured bytes, a client's self-report and an estimate of a dump nobody
 * ran — and an unlabelled grid makes all three read as measurements.
 *
 * Below the evidence threshold the headline is withheld rather than shrunk:
 * the totals are still in the JSON export, but a number a reader would act
 * on is not printed until there is enough of it to act on.
 */
function StatCard({
  assumption,
  detail,
  footnote,
  headline,
  label,
  shortfall,
}: {
  readonly assumption: string;
  readonly detail: string;
  readonly footnote: string;
  readonly headline: string;
  readonly label: string;
  readonly shortfall: string | null;
}) {
  return (
    <article className="pilot-stat-card">
      <span>{label}</span>
      <strong>{shortfall ?? headline}</strong>
      {shortfall ? null : <p>{detail}</p>}
      <small>{shortfall ? shortfall : footnote}</small>
      <small className="pilot-stat-assumption">
        {STATS.cards.assumptionLabel}: {assumption}
      </small>
    </article>
  );
}

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

  // The receipt chain is one of four things this page shows. It keeps the
  // whole-page empty state only while nothing else has evidence either —
  // otherwise a workspace with real served bytes would be told it has none.
  if (
    report.state === "insufficient-evidence" &&
    report.served.state !== "ready" &&
    report.reported.state !== "ready"
  ) {
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

  const shortfall = (
    state: "insufficient-evidence" | "ready",
    count: number,
    threshold: number,
  ): string | null =>
    state === "ready" ? null : STATS.cards.insufficient(count, threshold);

  return (
    <div className="pilot-stats-layout">
      <div className="pilot-stats-toolbar">
        <span>{STATS.toolbar.receiptCount(report.evidence.receipts)}</span>
        <form
          aria-label={STATS.filter.aria}
          className="pilot-repository-filter"
          method="get"
        >
          <label htmlFor="pilot-repository">{STATS.filter.label}</label>
          <select
            defaultValue={report.repositoryFilter ?? ""}
            id="pilot-repository"
            name="repository"
          >
            <option value="">{STATS.filter.all}</option>
            {report.repositories.map(({ fullName, id }) => (
              <option key={id} value={id}>
                {fullName}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            {STATS.filter.apply}
          </button>
        </form>
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
        <StatCard
          assumption={STATS.served.assumption}
          detail={STATS.served.charsCalls(
            number(report.served.responseChars),
            report.served.calls,
          )}
          footnote={STATS.served.unmeasured(
            report.served.calls - report.served.measuredCalls,
          )}
          headline={STATS.served.tokens(number(report.served.estimatedTokens))}
          label={STATS.served.label}
          shortfall={shortfall(
            report.served.state,
            report.served.measuredCalls,
            report.thresholds.servedMeasuredCalls,
          )}
        />

        <StatCard
          assumption={STATS.reported.assumption}
          detail={STATS.reported.inputOutput(
            number(report.reported.inputTokens),
            number(report.reported.outputTokens),
          )}
          footnote={STATS.reported.cache(
            number(report.reported.cacheReadTokens),
            number(report.reported.cacheCreationTokens),
          )}
          headline={STATS.reported.reports(report.reported.reports)}
          label={STATS.reported.label}
          shortfall={shortfall(
            report.reported.state,
            report.reported.reports,
            report.thresholds.reportedReports,
          )}
        />

        <StatCard
          assumption={STATS.context.assumption}
          detail={STATS.context.tokensCompare(
            number(report.context.selectedTokens),
            number(report.context.baselineTokens),
          )}
          footnote={STATS.context.packRequests(report.context.packRequests)}
          headline={STATS.context.reduction(
            report.context.tokenReductionPercent,
          )}
          label={STATS.context.label}
          shortfall={shortfall(
            report.context.state,
            report.evidence.packMeasurements,
            report.thresholds.packMeasurements,
          )}
        />
      </section>

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
          <span>{STATS.scan.label}</span>
          <strong>{STATS.scan.average(report.scans.averageDurationMs)}</strong>
          <p>{STATS.scan.latest(report.scans.latestDurationMs)}</p>
          <small>{STATS.scan.trend(report.scans.durationChangePercent)}</small>
        </article>
      </section>

      <details className="pilot-methodology">
        <summary>{STATS.methodology.summary}</summary>
        <p>{report.methodology.servedTokens}</p>
        <p>{report.methodology.reportedUsage}</p>
        <p>{report.methodology.packEstimate}</p>
        <p>{report.methodology.findingTrend}</p>
        <p>{report.methodology.tokenBaseline}</p>
        <p>{report.methodology.scanDuration}</p>
        <p>{STATS.methodology.benchmarkCaveat}</p>
        <p>{report.methodology.benchmarkCaveat}</p>
        <p>
          {STATS.methodology.benchmarkPrefix}
          <a href="https://github.com/2klips/alrescha-app/blob/main/benchmarks/databrain/results.real.md">
            {STATS.methodology.benchmarkLink}
          </a>
          .
        </p>
      </details>
    </div>
  );
}
