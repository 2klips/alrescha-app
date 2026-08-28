import type {
  DependencyAdvisory,
  InspectionDashboard,
  InspectionFindingInput,
} from "@arr/core";
import {
  Ban,
  FileText,
  FileWarning,
  Link2,
  ListChecks,
  PackageSearch,
  ShieldAlert,
} from "lucide-react";

import type { ReactNode } from "react";

import { INSPECTION } from "../../lib/strings";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";

interface InspectionViewProps {
  readonly dashboard: InspectionDashboard;
}

function SourceLine({ label }: { label: string }) {
  return (
    <small className="inspection-source">
      <Icon icon={Link2} size="xs" />
      {INSPECTION.sourcePrefix}
      {label}
    </small>
  );
}

function Widget({
  children,
  icon,
  section,
  testId,
  title,
}: {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly section: { sourceLabel: string; state: string };
  readonly testId: string;
  readonly title: string;
}) {
  return (
    <section
      className="inspection-widget"
      data-state={section.state}
      data-testid={testId}
    >
      <header>
        {icon}
        <h2>{title}</h2>
      </header>
      {section.state === "insufficient-evidence" ? (
        <p className="inspection-insufficient">{INSPECTION.insufficient}</p>
      ) : (
        children
      )}
      <SourceLine label={section.sourceLabel} />
    </section>
  );
}

function FindingRow({ finding }: { finding: InspectionFindingInput }) {
  return (
    <li className="inspection-finding">
      <span className={`severity-label ${finding.severity}`}>
        {finding.severity}
      </span>
      <span>{finding.title}</span>
      <code>{finding.kind}</code>
    </li>
  );
}

function AdvisoryRow({ advisory }: { advisory: DependencyAdvisory }) {
  return (
    <li className="inspection-advisory">
      <span className={`severity-label ${advisory.severity}`}>
        {INSPECTION.dependencyAudit.severities[advisory.severity]}
      </span>
      <span>
        <strong>{advisory.name}</strong>
        {advisory.range ? <code>{advisory.range}</code> : null}
        {advisory.title ? <small>{advisory.title}</small> : null}
      </span>
      <em>{INSPECTION.dependencyAudit.fix[advisory.fixAvailability]}</em>
    </li>
  );
}

export function InspectionView({ dashboard }: InspectionViewProps) {
  return (
    <main className="inspection-main" aria-label={INSPECTION.ariaMain}>
      <header className="progress-section-heading inspection-heading">
        <div>
          <span>{INSPECTION.kicker}</span>
          <h1>{INSPECTION.title}</h1>
        </div>
      </header>
      <p className="commit-lead">{INSPECTION.lead}</p>

      <div className="inspection-grid">
        <Widget
          icon={<Icon icon={ListChecks} size="sm" />}
          section={dashboard.progress}
          testId="inspection-progress"
          title={INSPECTION.progress.title}
        >
          <strong className="inspection-figure">
            {dashboard.progress.percent === null
              ? INSPECTION.progress.notMeasured
              : `${dashboard.progress.percent}%`}
          </strong>
          <p>
            {INSPECTION.progress.completed(
              dashboard.progress.done,
              dashboard.progress.total,
            )}
          </p>
        </Widget>

        <Widget
          icon={<Icon icon={FileWarning} size="sm" />}
          section={dashboard.findings}
          testId="inspection-findings"
          title={INSPECTION.findings.title}
        >
          <strong className="inspection-figure">
            {INSPECTION.findings.count(dashboard.findings.entries.length)}
          </strong>
          <ul className="inspection-list">
            {dashboard.findings.entries.map((finding) => (
              <FindingRow finding={finding} key={finding.id} />
            ))}
          </ul>
        </Widget>

        <Widget
          icon={<Icon icon={FileText} size="sm" />}
          section={dashboard.documents}
          testId="inspection-documents"
          title={INSPECTION.documents.title}
        >
          <ul className="inspection-list">
            {dashboard.documents.entries.map((entry) => (
              <li className="inspection-document" key={entry.path}>
                <span className="inspection-document-head">
                  <code>{entry.path}</code>
                  <span className={`inspection-freshness ${entry.freshness}`}>
                    {INSPECTION.documents.freshness[entry.freshness]}
                  </span>
                </span>
                {entry.summary === null ? (
                  <small className="inspection-summary-missing">
                    {INSPECTION.documents.summaryMissing}
                  </small>
                ) : (
                  <span className="inspection-summary">
                    <StatusBadge grade="inferred" />
                    <small>{entry.summary.text}</small>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Widget>

        <Widget
          icon={<Icon icon={ShieldAlert} size="sm" />}
          section={dashboard.driftRisks}
          testId="inspection-drift"
          title={INSPECTION.driftRisks.title}
        >
          <p className="inspection-note">{INSPECTION.driftRisks.note}</p>
          <ul className="inspection-list">
            {dashboard.driftRisks.entries.map((finding) => (
              <FindingRow finding={finding} key={finding.id} />
            ))}
          </ul>
        </Widget>

        <Widget
          icon={<Icon icon={PackageSearch} size="sm" />}
          section={dashboard.dependencyAudit}
          testId="inspection-audit"
          title={INSPECTION.dependencyAudit.title}
        >
          <p className="inspection-note">{INSPECTION.dependencyAudit.note}</p>
          {dashboard.dependencyAudit.report ? (
            dashboard.dependencyAudit.report.counts.total === 0 ? (
              <p>{INSPECTION.dependencyAudit.none}</p>
            ) : (
              <>
                <strong className="inspection-figure">
                  {INSPECTION.dependencyAudit.total(
                    dashboard.dependencyAudit.report.counts.total,
                  )}
                </strong>
                <ul className="inspection-list">
                  {dashboard.dependencyAudit.report.advisories.map(
                    (advisory) => (
                      <AdvisoryRow advisory={advisory} key={advisory.name} />
                    ),
                  )}
                </ul>
              </>
            )
          ) : null}
        </Widget>

        <Widget
          icon={<Icon icon={Ban} size="sm" />}
          section={dashboard.ruledOut}
          testId="inspection-ruled-out"
          title={INSPECTION.ruledOut.title}
        >
          <p className="inspection-note">{INSPECTION.ruledOut.note}</p>
          <strong className="inspection-figure">
            {INSPECTION.ruledOut.count(dashboard.ruledOut.entries.length)}
          </strong>
          <ol className="inspection-list inspection-ruled-out">
            {dashboard.ruledOut.entries.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.recordedAt}>
                  {entry.recordedAt.slice(0, 10)}
                </time>
                <strong>{entry.hypothesis}</strong>
                <p>
                  <span>{INSPECTION.ruledOut.outcomeLabel}</span>
                  {entry.outcome}
                </p>
                {entry.refs.map((ref) => (
                  <code key={ref}>{ref}</code>
                ))}
              </li>
            ))}
          </ol>
        </Widget>
      </div>
    </main>
  );
}
