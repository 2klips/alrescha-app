import type { CommitAnalysisCard, CommitAnalysisStatus } from "@alrescha/core";
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  GitCommitHorizontal,
  LoaderCircle,
  ReceiptText,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { Icon } from "./ui-icon";
import { COMMITS } from "../../lib/strings";
import { ProductEmptyState, ProductPageHeader } from "./page-layout";

interface CommitAnalysisBoardProps {
  /** Route the cards link back to — `/commits` for the demo board and
      `/app/commits` for the workspace's own runs. */
  readonly basePath: string;
  readonly cards: readonly CommitAnalysisCard[];
  /** Where "Receipt 보기" lands — `/receipts` (demo chain) or `/app/receipts`. */
  readonly receiptsPath?: string;
  readonly selectedRunId: string | null;
  readonly stateQuery: string | null;
}

const STATUS_COPY = {
  analyzing: {
    icon: LoaderCircle,
    label: COMMITS.statuses.analyzing,
    spin: true,
  },
  completed: {
    icon: CheckCircle2,
    label: COMMITS.statuses.completed,
    spin: false,
  },
  failed: { icon: XCircle, label: COMMITS.statuses.failed, spin: false },
  pending: {
    icon: CircleDashed,
    label: COMMITS.statuses.pending,
    spin: false,
  },
} as const satisfies Record<CommitAnalysisStatus, unknown>;

function RunStatusBadge({ status }: { status: CommitAnalysisStatus }) {
  const copy = STATUS_COPY[status];
  return (
    <span className={`commit-status ${status}`} data-status={status}>
      <Icon
        className={copy.spin ? "spin" : undefined}
        icon={copy.icon}
        size="xs"
      />
      {copy.label}
    </span>
  );
}

function cardHref(
  card: CommitAnalysisCard,
  basePath: string,
  stateQuery: string | null,
): string {
  const query = new URLSearchParams();
  if (stateQuery) {
    query.set("state", stateQuery);
  }
  query.set("run", card.runId);
  return `${basePath}?${query.toString()}`;
}

function formatInstant(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " · ")}Z`;
}

function DurationValue({ card }: { card: CommitAnalysisCard }) {
  return card.durationMs === null ? (
    <span className="commit-not-measured">
      {COMMITS.card.durationNotMeasured}
    </span>
  ) : (
    <span className="commit-duration">
      <Icon icon={Clock3} size="xs" />
      {COMMITS.card.duration(Math.round(card.durationMs / 1000))}
    </span>
  );
}

function DeltaValue({ card }: { card: CommitAnalysisCard }) {
  if (card.findingsDelta === null) {
    // ADR-015 §4: a graph-only run has no delta *by design*, which is a
    // different fact from "not measured yet". The card says which one it is.
    return (
      <span className="commit-not-measured">
        {card.assurance === "graph-only"
          ? COMMITS.card.graphOnlyDelta
          : COMMITS.card.deltaPending}
      </span>
    );
  }
  return (
    <span className="commit-delta">
      <strong>
        {COMMITS.card.delta(
          card.findingsDelta.opened,
          card.findingsDelta.resolved,
        )}
      </strong>
      <small>{COMMITS.card.openTotal(card.findingsDelta.openTotal)}</small>
    </span>
  );
}

function CommitDetail({
  card,
  receiptsPath,
}: {
  card: CommitAnalysisCard;
  receiptsPath: string;
}) {
  return (
    <article className="commit-detail" aria-label={COMMITS.ariaDetail}>
      <header>
        <p className="panel-kicker">{COMMITS.detail.kicker}</p>
        <h2>
          <Icon icon={GitCommitHorizontal} size="sm" />
          <code>{card.commitSha.slice(0, 7)}</code>
          <span>{card.repository}</span>
        </h2>
        <RunStatusBadge status={card.status} />
      </header>
      <dl className="commit-detail-grid">
        <div>
          <dt>{COMMITS.detail.startedAtLabel}</dt>
          <dd>
            <time dateTime={card.createdAt}>
              {formatInstant(card.createdAt)}
            </time>
            <small>{COMMITS.detail.triggerKinds[card.triggerKind]}</small>
          </dd>
        </div>
        <div>
          <dt>{COMMITS.detail.durationLabel}</dt>
          <dd>
            <DurationValue card={card} />
          </dd>
        </div>
        <div>
          <dt>{COMMITS.detail.deltaLabel}</dt>
          <dd>
            <DeltaValue card={card} />
          </dd>
        </div>
        <div className="commit-assurance-cell">
          <dt>{COMMITS.detail.assuranceLabel}</dt>
          <dd data-assurance={card.assurance}>
            <span className="commit-assurance-scope">
              {COMMITS.detail.assuranceScopes[card.assurance]}
            </span>
            {card.assurance === "graph-only" ? (
              <Link className="commit-assurance-upgrade" href="/onboarding">
                {COMMITS.detail.assuranceUpgradeAction}
                <Icon icon={ChevronRight} size="xs" />
              </Link>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{COMMITS.detail.receiptLabel}</dt>
          <dd>
            {card.receiptId === null ? (
              <span className="commit-not-measured">
                {card.assurance === "graph-only"
                  ? COMMITS.detail.graphOnlyReceipt
                  : COMMITS.detail.receiptMissing}
              </span>
            ) : (
              <Link
                className="commit-receipt-link"
                href={`${receiptsPath}?receipt=${encodeURIComponent(card.receiptId)}`}
              >
                <Icon icon={ReceiptText} size="xs" />
                {COMMITS.detail.receiptAction}
                <Icon icon={ChevronRight} size="xs" />
              </Link>
            )}
          </dd>
        </div>
      </dl>
      {card.status === "failed" ? (
        <section className="commit-failure" data-testid="commit-failure">
          <h3>{COMMITS.detail.failureLabel}</h3>
          {card.failureReason === null ? (
            <p className="commit-not-measured">
              {COMMITS.detail.failureNotRecorded}
            </p>
          ) : (
            <code>{card.failureReason}</code>
          )}
        </section>
      ) : null}
      <section className="commit-jobs">
        <h3>{COMMITS.detail.jobsTitle}</h3>
        <ul>
          {card.jobs.map((job) => (
            <li data-job-status={job.status} key={job.kind}>
              <span>{COMMITS.detail.jobKinds[job.kind]}</span>
              <code>{job.status}</code>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export function CommitAnalysisBoard({
  basePath,
  cards,
  receiptsPath = "/receipts",
  selectedRunId,
  stateQuery,
}: CommitAnalysisBoardProps) {
  const selected = cards.find((card) => card.runId === selectedRunId) ?? null;
  return (
    <main className="commit-main product-page">
      <section className="commit-rail" aria-label={COMMITS.ariaList}>
        <ProductPageHeader
          actions={<small>{COMMITS.list.countSuffix(cards.length)}</small>}
          className="commit-page-header"
          description={COMMITS.lead}
          kicker={COMMITS.kicker}
          title={COMMITS.title}
        />
        {cards.length === 0 ? (
          <ProductEmptyState
            body={COMMITS.list.empty.body}
            title={COMMITS.list.empty.title}
          />
        ) : (
          <ol className="commit-card-list">
            {cards.map((card) => (
              <li key={card.runId}>
                <Link
                  aria-current={
                    card.runId === selectedRunId ? "true" : undefined
                  }
                  className="commit-card"
                  data-run-id={card.runId}
                  data-card-status={card.status}
                  data-assurance={card.assurance}
                  href={cardHref(card, basePath, stateQuery)}
                >
                  <span className="commit-card-sha">
                    <Icon icon={GitCommitHorizontal} size="xs" />
                    <code>{card.commitSha.slice(0, 7)}</code>
                  </span>
                  <RunStatusBadge status={card.status} />
                  <span className="commit-card-meta">
                    {card.assurance === "graph-only" ? (
                      <span className="commit-assurance-badge">
                        {COMMITS.card.graphOnlyBadge}
                      </span>
                    ) : null}
                    <DurationValue card={card} />
                    <DeltaValue card={card} />
                  </span>
                  <time dateTime={card.createdAt}>
                    {formatInstant(card.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
      {selected === null ? (
        <aside className="commit-detail commit-detail-empty">
          <p>{COMMITS.detail.placeholder}</p>
        </aside>
      ) : (
        <CommitDetail card={selected} receiptsPath={receiptsPath} />
      )}
    </main>
  );
}
