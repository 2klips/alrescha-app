import type { ReceiptVerification } from "@alrescha/core/receipts";
import {
  BadgeCheck,
  ChevronRight,
  Clock3,
  Fingerprint,
  GitCommitHorizontal,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";

import {
  countVerifications,
  type WorkspaceReceipt,
} from "../../lib/receipts/receipts-report";
import { ASSURANCE } from "../../lib/strings";
import { Icon } from "./ui-icon";
import { ProductEmptyState, ProductPageHeader } from "./page-layout";
import { ReceiptRailScroll } from "./receipt-rail-scroll";
import { StatusBadge } from "./status-badge";

const LIVE = ASSURANCE.receipts.live;

interface WorkspaceReceiptsBoardProps {
  /** `/app/receipts` — the rail links select a receipt through `?receipt=`. */
  readonly basePath: string;
  /** Where a receipt's commit card lives (`/app/commits?run=`). */
  readonly commitsPath: string;
  readonly receipts: readonly WorkspaceReceipt[];
  readonly selectedId: string | null;
}

function formatInstant(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " · ")}Z`;
}

/**
 * Server-rendered verdict: the loader already re-verified the statement, so
 * the badge states what was computed — never a "pending" placeholder.
 */
function VerificationBadge({
  verification,
}: {
  readonly verification: ReceiptVerification;
}) {
  if (verification.state === "verified")
    return (
      <StatusBadge grade="verified">
        {ASSURANCE.receipts.verification.verified}
      </StatusBadge>
    );
  if (verification.state === "tampered")
    return (
      <StatusBadge grade="broken">
        {ASSURANCE.receipts.verification.tampered}
      </StatusBadge>
    );
  return (
    <StatusBadge grade="broken">
      {ASSURANCE.receipts.verification.invalid}
    </StatusBadge>
  );
}

function ReceiptDetail({
  commitsPath,
  receipt,
}: {
  readonly commitsPath: string;
  readonly receipt: WorkspaceReceipt;
}) {
  const { statement, verification } = receipt;
  const legacy =
    verification.state !== "invalid" && verification.toolName !== "alrescha";
  return (
    <article
      aria-labelledby="receipt-title"
      className="receipt-detail"
      data-testid="receipt-detail"
      data-verification={verification.state}
    >
      <header className="receipt-titlebar">
        <div>
          <span className="panel-kicker">
            {ASSURANCE.receipts.statementKicker}
          </span>
          <h2 id="receipt-title">
            <code>{receipt.commitSha.slice(0, 7)}</code> · {receipt.repository}
          </h2>
        </div>
        <VerificationBadge verification={verification} />
      </header>
      {receipt.stale && receipt.headCommitSha ? (
        <div className="stale-banner">
          <Icon icon={Clock3} size="xs" />
          {LIVE.staleBanner(receipt.headCommitSha.slice(0, 7))}
        </div>
      ) : null}
      {legacy ? (
        <div className="verification-badge" data-testid="receipt-legacy-issuer">
          <Icon icon={Fingerprint} size="xs" />
          {LIVE.legacyIssuer}
        </div>
      ) : null}
      <dl className="receipt-fields">
        <div>
          <dt>{LIVE.fields.repository}</dt>
          <dd>{receipt.repository}</dd>
        </div>
        <div>
          <dt>{LIVE.fields.issuedAt}</dt>
          <dd>
            <time dateTime={receipt.createdAt}>
              {formatInstant(receipt.createdAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.commit}</dt>
          <dd>{receipt.commitSha.slice(0, 12)}</dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.run}</dt>
          <dd>{receipt.runId ?? statement?.predicate.runId ?? "—"}</dd>
        </div>
        {statement ? (
          <>
            <div>
              <dt>{ASSURANCE.receipts.fields.statementType}</dt>
              <dd>{statement._type}</dd>
            </div>
            <div>
              <dt>{ASSURANCE.receipts.fields.predicateType}</dt>
              <dd>{statement.predicateType}</dd>
            </div>
            <div>
              <dt>{LIVE.fields.issuer}</dt>
              <dd data-testid="receipt-issuer">
                {statement.predicate.tool.name} {statement.predicate.tool.version}
              </dd>
            </div>
            <div>
              <dt>{ASSURANCE.receipts.fields.previous}</dt>
              <dd>
                {statement.predicate.previousReceiptDigest?.slice(0, 12) ??
                  ASSURANCE.receipts.fields.chainRoot}
              </dd>
            </div>
            <div>
              <dt>{LIVE.fields.coverage}</dt>
              <dd>
                {LIVE.coverage(
                  statement.predicate.coverage.requirements,
                  statement.predicate.coverage.implVerified,
                  statement.predicate.coverage.testVerified,
                )}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>{ASSURANCE.receipts.fields.statementType}</dt>
            <dd>{LIVE.unreadable}</dd>
          </div>
        )}
        <div>
          <dt>{LIVE.fields.findings}</dt>
          <dd>
            {receipt.findings
              ? LIVE.findingsDelta(
                  receipt.findings.opened,
                  receipt.findings.resolved,
                  receipt.findings.openTotal,
                )
              : LIVE.findingsMissing}
          </dd>
        </div>
      </dl>
      <section className="digest-panel">
        <span>{ASSURANCE.receipts.digest.expected}</span>
        <code>{receipt.digest ?? LIVE.digestMissing}</code>
        {verification.state !== "invalid" ? (
          <>
            <span>{ASSURANCE.receipts.digest.computed}</span>
            <code>{verification.actualDigest}</code>
            <small>{LIVE.computedNote}</small>
          </>
        ) : (
          <ul className="receipt-issues" data-testid="receipt-issues">
            {verification.issues.map((issue, index) => (
              <li key={`${index}-${issue}`}>{issue}</li>
            ))}
          </ul>
        )}
      </section>
      {verification.state === "verified" && statement ? (
        <section className="receipt-verdict" data-testid="receipt-verdict">
          <Icon icon={BadgeCheck} size="md" />
          <div>
            <span>{ASSURANCE.receipts.verdict.label}</span>
            <strong>
              {ASSURANCE.receipts.verdict.counts(
                statement.predicate.evidence.verified,
                statement.predicate.evidence.inferred,
              )}
            </strong>
          </div>
        </section>
      ) : (
        <section
          className="receipt-locked"
          data-testid="receipt-verdict-locked"
        >
          <Icon icon={Fingerprint} size="md" />
          <span>{ASSURANCE.receipts.verdict.locked}</span>
        </section>
      )}
      {receipt.runId ? (
        <Link
          className="commit-receipt-link"
          href={`${commitsPath}?run=${encodeURIComponent(receipt.runId)}`}
        >
          <Icon icon={GitCommitHorizontal} size="xs" />
          {LIVE.commitAction}
          <Icon icon={ChevronRight} size="xs" />
        </Link>
      ) : null}
    </article>
  );
}

export function WorkspaceReceiptsBoard({
  basePath,
  commitsPath,
  receipts,
  selectedId,
}: WorkspaceReceiptsBoardProps) {
  const selected =
    receipts.find((receipt) => receipt.id === selectedId) ?? receipts[0] ?? null;
  const counts = countVerifications(receipts);
  return (
    <main className="assurance-main receipts-layout product-page">
      <aside className="receipt-rail">
        <div className="receipt-rail-sticky">
          <ProductPageHeader
            className="surface-heading"
            description={LIVE.summary(receipts.length)}
            kicker={LIVE.kicker}
            title={LIVE.title}
          />
          {receipts.length === 0 ? (
            <ProductEmptyState
              body={LIVE.empty.body}
              icon={<Icon icon={ReceiptText} size="md" />}
              title={LIVE.empty.title}
            />
          ) : (
            <>
              <p
                className="receipt-rail-summary"
                data-testid="receipt-verification-summary"
              >
                {LIVE.verificationSummary(
                  counts.verified,
                  counts.tampered,
                  counts.invalid,
                )}
              </p>
              <nav
                aria-label={LIVE.title}
                className="receipt-list receipt-list--live"
              >
                {receipts.map((receipt) => (
                  <Link
                    aria-current={receipt.id === selected?.id ? "true" : undefined}
                    data-verification={receipt.verification.state}
                    href={`${basePath}?receipt=${encodeURIComponent(receipt.id)}`}
                    key={receipt.id}
                  >
                    <Icon icon={ReceiptText} size="sm" />
                    <span>
                      <strong>
                        {receipt.commitSha.slice(0, 7)} · {receipt.repository}
                      </strong>
                      <small>
                        {receipt.createdAt.slice(0, 10)} ·{" "}
                        {receipt.stale
                          ? ASSURANCE.receipts.stale
                          : ASSURANCE.receipts.current}
                        {" · "}
                        {ASSURANCE.receipts.verification[receipt.verification.state]}
                      </small>
                    </span>
                    <Icon icon={ChevronRight} size="xs" />
                  </Link>
                ))}
              </nav>
              <ReceiptRailScroll selectedId={selected?.id ?? null} />
            </>
          )}
        </div>
      </aside>
      {selected ? (
        <ReceiptDetail commitsPath={commitsPath} receipt={selected} />
      ) : null}
    </main>
  );
}
