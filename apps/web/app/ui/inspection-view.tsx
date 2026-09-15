import type {
  DependencyAdvisory,
  InspectionDashboard,
  InspectionFindingDetail,
  InspectionFindingInput,
  RiskEntry,
} from "@alrescha/core";
import {
  Ban,
  Crosshair,
  EyeOff,
  FileText,
  FileWarning,
  Link2,
  ListChecks,
  PackageSearch,
  ShieldAlert,
} from "lucide-react";

import type { ReactNode } from "react";

import { INSPECTION } from "../../lib/strings";
import { ProductPageHeader } from "./page-layout";
import { Icon } from "./ui-icon";
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
  emptyCopy,
  icon,
  section,
  testId,
  title,
}: {
  readonly children: ReactNode;
  /**
   * What an empty section says when "nothing here" is a fact rather than a
   * gap in the evidence — a board with no dismissals is not short of data.
   */
  readonly emptyCopy?: string;
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
        emptyCopy === undefined ? (
          <p className="inspection-insufficient">{INSPECTION.insufficient}</p>
        ) : (
          <p className="inspection-empty">{emptyCopy}</p>
        )
      ) : (
        children
      )}
      <SourceLine label={section.sourceLabel} />
    </section>
  );
}

/**
 * The detail the analysis stored (todo 19 ⑶): the spans it read, its own
 * confidence and grade, the rule's reason, the suggested action and the
 * evidence nodes it pointed at. Nothing here is computed on the screen —
 * a finding whose row carries none of it shows none of it.
 */
function FindingDetailBlock({ detail }: { detail: InspectionFindingDetail }) {
  return (
    <div className="inspection-finding-detail">
      {detail.spans.length > 0 ? (
        <p className="inspection-finding-spans">
          <span>{INSPECTION.findings.detail.spanLabel}</span>
          {detail.spans.map((span) => (
            <code key={`${span.path}:${span.startLine}:${span.endLine}`}>
              {span.path}:{span.startLine}
              {span.endLine !== span.startLine ? `-${span.endLine}` : ""}
            </code>
          ))}
        </p>
      ) : null}
      <p className="inspection-finding-confidence">
        <StatusBadge grade={detail.evidenceGrade} />
        <span>
          {INSPECTION.findings.detail.confidence(
            Math.round(detail.confidence * 100),
          )}
        </span>
      </p>
      {detail.reason ? (
        <p className="inspection-finding-reason">
          <span>{INSPECTION.findings.detail.reasonLabel}</span>
          {detail.reason}
        </p>
      ) : null}
      {detail.suggestedAction ? (
        <p className="inspection-finding-action">
          <span>{INSPECTION.findings.detail.actionLabel}</span>
          {detail.suggestedAction}
        </p>
      ) : null}
      {detail.evidenceLinks.length > 0 ? (
        <p className="inspection-finding-evidence">
          <span>{INSPECTION.findings.detail.evidenceLabel}</span>
          {detail.evidenceLinks.map((nodeId) => (
            <code key={nodeId}>{nodeId}</code>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function FindingRow({ finding }: { finding: InspectionFindingInput }) {
  return (
    <li
      className="inspection-finding"
      data-finding-id={finding.id}
      data-status={finding.status}
    >
      <span className={`severity-label ${finding.severity}`}>
        {finding.severity}
      </span>
      <span>{finding.title}</span>
      <code>{finding.kind}</code>
      {finding.detail ? <FindingDetailBlock detail={finding.detail} /> : null}
      {finding.status === "dismissed" ? (
        <p className="inspection-dismissed-reason">
          <span>{INSPECTION.dismissed.reasonLabel}</span>
          {finding.dismissedReason ?? ""}
        </p>
      ) : null}
    </li>
  );
}

/**
 * How many files the widget names (todo 21). The map ranks everything with a
 * factor, which on a real repository is hundreds — "먼저 볼 파일" is a
 * question with a short answer, and the count below the list says how much
 * was left off rather than letting the cut go unmentioned.
 */
const RISK_ROWS = 10;

function RiskRow({ entry, rank }: { entry: RiskEntry; rank: number }) {
  return (
    <li
      className="inspection-risk-entry"
      data-level={entry.level}
      // The score orders the list and is checkable here; it is not printed.
      // A rank answers "what first", and three decimal places of a weighted
      // sum would read as a precision none of these signals has.
      data-score={entry.score}
    >
      <span className="inspection-risk-head">
        <span className="inspection-risk-rank">{rank}</span>
        <code>{entry.path}</code>
        <span className={`inspection-risk-level ${entry.level}`}>
          {INSPECTION.risk.levels[entry.level]}
        </span>
        <StatusBadge grade={entry.grade} />
      </span>
      <ul className="inspection-risk-factors">
        {entry.factors.map((factor) => (
          <li key={factor.kind}>
            <span className="inspection-risk-factor">
              {INSPECTION.risk.factors[factor.kind]}
            </span>
            <small>{factor.detail}</small>
          </li>
        ))}
      </ul>
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
    <main
      className="inspection-main product-page"
      aria-label={INSPECTION.ariaMain}
    >
      <ProductPageHeader
        description={INSPECTION.lead}
        kicker={INSPECTION.kicker}
        title={INSPECTION.title}
      />

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
          icon={<Icon icon={Crosshair} size="sm" />}
          section={dashboard.risk}
          testId="inspection-risk"
          title={INSPECTION.risk.title}
        >
          <p className="inspection-note">{INSPECTION.risk.note}</p>
          <ol className="inspection-list inspection-risk">
            {dashboard.risk.entries.slice(0, RISK_ROWS).map((entry, index) => (
              <RiskRow entry={entry} key={entry.nodeId} rank={index + 1} />
            ))}
          </ol>
          <small className="inspection-risk-count">
            {INSPECTION.risk.showing(
              Math.min(RISK_ROWS, dashboard.risk.entries.length),
              dashboard.risk.entries.length,
            )}
          </small>
          {dashboard.risk.unmeasured.length > 0 ? (
            // Grey, never zero. "Measured, and clean" and "nobody looked" are
            // different answers, and only one of them is reassuring.
            <p className="inspection-unmeasured">
              <span>{INSPECTION.risk.unmeasuredTitle}</span>
              {dashboard.risk.unmeasured.map((signal) => (
                <span key={signal.signal}>
                  {INSPECTION.risk.unmeasured[signal.signal]}
                  <small>{signal.reason}</small>
                </span>
              ))}
            </p>
          ) : null}
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
          emptyCopy={INSPECTION.dismissed.empty}
          icon={<Icon icon={EyeOff} size="sm" />}
          section={dashboard.dismissed}
          testId="inspection-dismissed"
          title={INSPECTION.dismissed.title}
        >
          <p className="inspection-note">{INSPECTION.dismissed.note}</p>
          <strong className="inspection-figure">
            {INSPECTION.dismissed.count(dashboard.dismissed.entries.length)}
          </strong>
          <ul className="inspection-list">
            {dashboard.dismissed.entries.map((finding) => (
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
