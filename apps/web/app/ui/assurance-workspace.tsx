"use client";

import {
  verifyInTotoStatement,
  type ReceiptVerification,
} from "@arr/core/receipts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Fingerprint,
  Link2,
  ListFilter,
  LoaderCircle,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  CONTRADICTIONS,
  FINDINGS,
  INSTRUCTION_COSTS,
  OVERLAPS,
  RECEIPTS,
  TOKENIZER_ASSUMPTION,
  filterFindings,
  renderSourceSpan,
  type FindingFixture,
  type FindingKind,
  type FindingSeverity,
  type ReceiptFixture,
  type SourceFixture,
} from "../../lib/assurance/fixtures";
import { ASSURANCE, GRADE } from "../../lib/strings";
import { Icon } from "./ui-icon";
import { ProductPageHeader } from "./page-layout";
import { StatusBadge } from "./status-badge";

type AssuranceSurface = "findings" | "lint" | "receipts";

interface AssuranceWorkspaceProps {
  initialReceiptId?: string | undefined;
  surface: AssuranceSurface;
}

function SourceSpan({ finding }: { finding: FindingFixture }) {
  const [source, setSource] = useState<SourceFixture | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSource(null);
    setFailed(false);
    void fetch(`/api/demo/source?findingId=${encodeURIComponent(finding.id)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Source fetch failed");
        return response.json() as Promise<SourceFixture>;
      })
      .then(setSource)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setFailed(true);
      });
    return () => controller.abort();
  }, [finding.id]);

  return (
    <section
      className="source-panel"
      aria-label={ASSURANCE.findings.sourceSpan.ariaLabel}
    >
      <header>
        <span>{ASSURANCE.findings.sourceSpan.title}</span>
        <code>
          {finding.source.path}:{finding.source.startLine}-
          {finding.source.endLine}
        </code>
      </header>
      {!source && !failed ? (
        <p className="inline-status">
          <Icon className="spin" icon={LoaderCircle} size="xs" />{" "}
          {ASSURANCE.findings.sourceSpan.loading}
        </p>
      ) : null}
      {failed ? (
        <p className="inline-status error-text">
          <Icon icon={AlertTriangle} size="xs" />{" "}
          {ASSURANCE.findings.sourceSpan.failed}
        </p>
      ) : null}
      {source ? (
        <pre data-source-state="fetched">
          {renderSourceSpan(source, finding.source).map((line) => (
            <span
              className={line.highlighted ? "highlighted" : ""}
              key={line.lineNumber}
            >
              <i>{line.lineNumber}</i>
              <code>{line.line || " "}</code>
            </span>
          ))}
        </pre>
      ) : null}
    </section>
  );
}

function FindingsSurface() {
  const [kind, setKind] = useState<FindingKind | "all">("all");
  const [severity, setSeverity] = useState<FindingSeverity | "all">("all");
  const visible = useMemo(
    () => filterFindings(FINDINGS, { kind, severity }),
    [kind, severity],
  );
  const [selectedId, setSelectedId] = useState(FINDINGS[0]!.id);
  const selected =
    FINDINGS.find((finding) => finding.id === selectedId) ??
    visible[0] ??
    FINDINGS[0]!;

  return (
    <main className="assurance-main findings-layout product-page">
      <aside className="findings-rail">
        <ProductPageHeader
          className="surface-heading"
          description={ASSURANCE.findings.summary(
            visible.length,
            FINDINGS.length,
          )}
          kicker={ASSURANCE.findings.kicker}
          title={ASSURANCE.findings.title}
        />
        <div className="finding-filters">
          <label>
            <Icon icon={ListFilter} size="xs" />
            <span className="sr-only">{ASSURANCE.findings.typeLabel}</span>
            <select
              aria-label={ASSURANCE.findings.typeLabel}
              onChange={(event) =>
                setKind(event.target.value as FindingKind | "all")
              }
              value={kind}
            >
              <option value="all">{ASSURANCE.findings.types.all}</option>
              <option value="missing-test">
                {ASSURANCE.findings.types["missing-test"]}
              </option>
              <option value="contradicting-instructions">
                {ASSURANCE.findings.types["contradicting-instructions"]}
              </option>
              <option value="stale-doc">
                {ASSURANCE.findings.types["stale-doc"]}
              </option>
              <option value="orphan-doc">
                {ASSURANCE.findings.types["orphan-doc"]}
              </option>
            </select>
          </label>
          <label>
            <Icon icon={ShieldAlert} size="xs" />
            <span className="sr-only">{ASSURANCE.findings.severityLabel}</span>
            <select
              aria-label={ASSURANCE.findings.severityLabel}
              onChange={(event) =>
                setSeverity(event.target.value as FindingSeverity | "all")
              }
              value={severity}
            >
              <option value="all">{ASSURANCE.findings.severities.all}</option>
              <option value="critical">
                {ASSURANCE.findings.severities.critical}
              </option>
              <option value="high">{ASSURANCE.findings.severities.high}</option>
              <option value="medium">
                {ASSURANCE.findings.severities.medium}
              </option>
              <option value="low">{ASSURANCE.findings.severities.low}</option>
            </select>
          </label>
        </div>
        <div className="finding-list" role="list">
          {visible.map((finding) => (
            <button
              aria-pressed={selected.id === finding.id}
              className="finding-row"
              key={finding.id}
              onClick={() => setSelectedId(finding.id)}
              role="listitem"
              type="button"
            >
              {/* P2: colour never carries severity alone — dot + text label. */}
              <span className="severity-marker">
                <span className={`severity-dot ${finding.severity}`} />
                <span className={`severity-label ${finding.severity}`}>
                  {finding.severity}
                </span>
              </span>
              <span>
                <strong>{finding.title}</strong>
                <small>
                  {ASSURANCE.findings.rowMeta(
                    finding.kind,
                    Math.round(finding.confidence * 100),
                  )}
                </small>
              </span>
              <StatusBadge grade={finding.grade} />
            </button>
          ))}
          {visible.length === 0 ? (
            <p className="empty-list">{ASSURANCE.findings.emptyList}</p>
          ) : null}
        </div>
      </aside>

      <article className="finding-detail" aria-labelledby="finding-title">
        <header className="finding-titlebar">
          <div>
            <span className={`severity-label ${selected.severity}`}>
              {ASSURANCE.findings.severityLabelText(selected.severity)}
            </span>
            <h2 id="finding-title">{selected.title}</h2>
          </div>
          <StatusBadge grade={selected.grade} />
        </header>
        <div className="detail-meta">
          <span>
            {ASSURANCE.findings.meta.rule} <strong>{selected.kind}</strong>
          </span>
          <span>
            {ASSURANCE.findings.meta.confidence}{" "}
            <strong>{Math.round(selected.confidence * 100)}%</strong>
          </span>
          <span>
            {ASSURANCE.findings.meta.status}{" "}
            <strong>{ASSURANCE.findings.meta.statusOpen}</strong>
          </span>
        </div>
        <SourceSpan finding={selected} />

        <section className="evidence-chain" aria-labelledby="chain-title">
          <header>
            <span className="panel-kicker">
              {ASSURANCE.findings.chain.kicker}
            </span>
            <h3 id="chain-title">{ASSURANCE.findings.chain.title}</h3>
          </header>
          <ol>
            {selected.evidence.map((step, index) => (
              <li key={step.id}>
                <span className="chain-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <small>{step.relation}</small>
                  <strong>{step.label}</strong>
                  <code>{step.source}</code>
                </div>
                <StatusBadge grade={step.grade} />
                {index < selected.evidence.length - 1 ? (
                  <Icon className="chain-arrow" icon={ArrowRight} size="xs" />
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="suggested-action">
          <span>
            <Icon icon={CheckCircle2} size="sm" />{" "}
            {ASSURANCE.findings.action.label}
          </span>
          <p>{selected.action}</p>
          <Link
            href={`/receipts?receipt=${encodeURIComponent(selected.receiptId)}`}
          >
            {ASSURANCE.findings.action.link}{" "}
            <Icon icon={ChevronRight} size="xs" />
          </Link>
        </section>
      </article>
    </main>
  );
}

function LintSurface() {
  const totalTokens = INSTRUCTION_COSTS.reduce(
    (sum, file) => sum + file.tokens,
    0,
  );
  return (
    <main className="assurance-main lint-surface product-page">
      <ProductPageHeader
        className="surface-heading wide-heading"
        description={
          <>
            {ASSURANCE.lint.lead}
            <strong>{GRADE.inferred}</strong>
            {ASSURANCE.lint.leadTail}
          </>
        }
        kicker={ASSURANCE.lint.kicker}
        title={ASSURANCE.lint.title}
      />
      <section className="lint-summary">
        <div>
          <span>{ASSURANCE.lint.summary.perTurn}</span>
          <strong>
            {ASSURANCE.lint.summary.tokens(totalTokens.toLocaleString())}
          </strong>
        </div>
        <div>
          <span>{ASSURANCE.lint.summary.alwaysLoaded}</span>
          <strong>
            {ASSURANCE.lint.summary.files(INSTRUCTION_COSTS.length)}
          </strong>
        </div>
        <div>
          <span>{ASSURANCE.lint.summary.overlap}</span>
          <strong>
            {ASSURANCE.lint.summary.tokens(
              String(OVERLAPS.reduce((sum, row) => sum + row.tokens, 0)),
            )}
          </strong>
        </div>
        <div>
          <span>{ASSURANCE.lint.summary.contradictions}</span>
          <strong>
            {CONTRADICTIONS.length} <StatusBadge grade="inferred" />
          </strong>
        </div>
      </section>

      <section className="lint-block">
        <header>
          <div>
            <span className="panel-kicker">{ASSURANCE.lint.cost.kicker}</span>
            <h2>{ASSURANCE.lint.cost.title}</h2>
          </div>
          <p>{TOKENIZER_ASSUMPTION}</p>
        </header>
        <div
          className="data-table"
          role="table"
          aria-label={ASSURANCE.lint.cost.ariaTable}
        >
          <div className="table-row table-head" role="row">
            <span>{ASSURANCE.lint.cost.columns.file}</span>
            <span>{ASSURANCE.lint.cost.columns.loadedBy}</span>
            <span>{ASSURANCE.lint.cost.columns.findings}</span>
            <span>{ASSURANCE.lint.cost.columns.tokens}</span>
          </div>
          {INSTRUCTION_COSTS.map((file) => (
            <div className="table-row" key={file.path} role="row">
              <code>{file.path}</code>
              <span>{file.agents}</span>
              <span>{file.findings}</span>
              <strong>{file.tokens}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="lint-block">
        <header>
          <div>
            <span className="panel-kicker">
              {ASSURANCE.lint.overlap.kicker}
            </span>
            <h2>{ASSURANCE.lint.overlap.title}</h2>
          </div>
          <p>{ASSURANCE.lint.overlap.note}</p>
        </header>
        <div className="overlap-list">
          {OVERLAPS.map((row) => (
            <article key={row.left}>
              <code>{row.left}</code>
              <span>
                <Icon icon={Link2} size="xs" />
                {row.overlap}
                <strong>{row.tokens} t</strong>
              </span>
              <code>{row.right}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="lint-block contradiction-block">
        <header>
          <div>
            <span className="panel-kicker">
              {ASSURANCE.lint.contradiction.kicker}
            </span>
            <h2>{ASSURANCE.lint.contradiction.title}</h2>
          </div>
          <StatusBadge grade="inferred" />
        </header>
        {CONTRADICTIONS.map((pair) => (
          <article className="contradiction-pair" key={pair.left.path}>
            <div>
              <code>
                {pair.left.path}:{pair.left.span}
              </code>
              <blockquote>{pair.left.quote}</blockquote>
            </div>
            <span>
              <Icon icon={AlertTriangle} size="sm" />
              {Math.round(pair.confidence * 100)}%
            </span>
            <div>
              <code>
                {pair.right.path}:{pair.right.span}
              </code>
              <blockquote>{pair.right.quote}</blockquote>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function VerificationBadge({
  verification,
}: {
  verification: ReceiptVerification | { state: "pending" | "verifying" };
}) {
  // Terminal grades use the shared StatusBadge (design §5.3 — label-only
  // mono badge); the transient verifying/pending states stay bespoke.
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
  if (verification.state === "invalid")
    return (
      <StatusBadge grade="broken">
        {ASSURANCE.receipts.verification.invalid}
      </StatusBadge>
    );
  if (verification.state === "verifying")
    return (
      <span className="verification-badge">
        <Icon className="spin" icon={LoaderCircle} size="xs" />
        {ASSURANCE.receipts.verification.verifying}
      </span>
    );
  return (
    <span className="verification-badge">
      <Icon icon={Fingerprint} size="xs" />
      {ASSURANCE.receipts.verification.pending}
    </span>
  );
}

function ReceiptDetail({ receipt }: { receipt: ReceiptFixture }) {
  const [verification, setVerification] = useState<
    ReceiptVerification | { state: "pending" | "verifying" }
  >({ state: "pending" });

  async function verify() {
    setVerification({ state: "verifying" });
    setVerification(
      await verifyInTotoStatement(receipt.statement, receipt.expectedDigest),
    );
  }

  return (
    <article className="receipt-detail" aria-labelledby="receipt-title">
      <header className="receipt-titlebar">
        <div>
          <span className="panel-kicker">
            {ASSURANCE.receipts.statementKicker}
          </span>
          <h2 id="receipt-title">{receipt.label}</h2>
        </div>
        <VerificationBadge verification={verification} />
      </header>
      {receipt.stale ? (
        <div className="stale-banner">
          <Icon icon={Clock3} size="xs" />
          {ASSURANCE.receipts.staleBanner}
        </div>
      ) : null}
      <dl className="receipt-fields">
        <div>
          <dt>{ASSURANCE.receipts.fields.statementType}</dt>
          <dd>{receipt.statement._type}</dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.predicateType}</dt>
          <dd>{receipt.statement.predicateType}</dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.subject}</dt>
          <dd>{receipt.statement.subject[0]!.name}</dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.commit}</dt>
          <dd>{receipt.statement.predicate.commitSha.slice(0, 12)}</dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.run}</dt>
          <dd>{receipt.statement.predicate.runId}</dd>
        </div>
        <div>
          <dt>{ASSURANCE.receipts.fields.previous}</dt>
          <dd>
            {receipt.statement.predicate.previousReceiptDigest?.slice(0, 12) ??
              ASSURANCE.receipts.fields.chainRoot}
          </dd>
        </div>
      </dl>
      <section className="digest-panel">
        <span>{ASSURANCE.receipts.digest.expected}</span>
        <code>{receipt.expectedDigest}</code>
        {verification.state === "verified" ||
        verification.state === "tampered" ? (
          <>
            <span>{ASSURANCE.receipts.digest.computed}</span>
            <code>{verification.actualDigest}</code>
          </>
        ) : null}
      </section>
      {verification.state === "verified" ? (
        <section className="receipt-verdict" data-testid="receipt-verdict">
          <Icon icon={BadgeCheck} size="md" />
          <div>
            <span>{ASSURANCE.receipts.verdict.label}</span>
            <strong>
              {ASSURANCE.receipts.verdict.counts(
                receipt.statement.predicate.evidence.verified,
                receipt.statement.predicate.evidence.inferred,
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
      <button
        className="verify-action"
        disabled={verification.state === "verifying"}
        onClick={() => void verify()}
        type="button"
      >
        <Icon icon={ShieldCheck} size="sm" /> {ASSURANCE.receipts.verifyAction}
      </button>
    </article>
  );
}

function ReceiptsSurface({
  initialReceiptId,
}: {
  initialReceiptId?: string | undefined;
}) {
  const initial =
    RECEIPTS.find((receipt) => receipt.id === initialReceiptId) ?? RECEIPTS[0]!;
  const [selectedId, setSelectedId] = useState(initial.id);
  const selected =
    RECEIPTS.find((receipt) => receipt.id === selectedId) ?? initial;
  return (
    <main className="assurance-main receipts-layout product-page">
      <aside className="receipt-rail">
        <ProductPageHeader
          className="surface-heading"
          description={ASSURANCE.receipts.summary(RECEIPTS.length)}
          kicker={ASSURANCE.receipts.kicker}
          title={ASSURANCE.receipts.title}
        />
        <div className="receipt-list">
          {RECEIPTS.map((receipt) => (
            <button
              aria-pressed={receipt.id === selected.id}
              key={receipt.id}
              onClick={() => setSelectedId(receipt.id)}
              type="button"
            >
              <Icon icon={ReceiptText} size="sm" />
              <span>
                <strong>{receipt.label}</strong>
                <small>
                  {new Date(receipt.createdAt).toISOString().slice(0, 10)} ·{" "}
                  {receipt.stale
                    ? ASSURANCE.receipts.stale
                    : ASSURANCE.receipts.current}
                </small>
              </span>
              <Icon icon={ChevronRight} size="xs" />
            </button>
          ))}
        </div>
      </aside>
      <ReceiptDetail key={selected.id} receipt={selected} />
    </main>
  );
}

export function AssuranceWorkspace({
  initialReceiptId,
  surface,
}: AssuranceWorkspaceProps) {
  return (
    <>
      {surface === "findings" ? <FindingsSurface /> : null}
      {surface === "lint" ? <LintSurface /> : null}
      {surface === "receipts" ? (
        <ReceiptsSurface initialReceiptId={initialReceiptId} />
      ) : null}
    </>
  );
}
