"use client";

import { verifyInTotoStatement, type ReceiptVerification } from "@specproof/core/receipts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Braces,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileWarning,
  Fingerprint,
  GitBranch,
  LayoutDashboard,
  Link2,
  ListFilter,
  LoaderCircle,
  Network,
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
import { ThemeToggle } from "./theme-toggle";

type AssuranceSurface = "findings" | "lint" | "receipts";

interface AssuranceWorkspaceProps {
  initialReceiptId?: string | undefined;
  surface: AssuranceSurface;
}

function AppHeader({ surface }: { surface: AssuranceSurface }) {
  return (
    <header className="app-header">
      <Link className="app-identity" href="/">
        <span className="repo-mark"><Network size={18} /></span>
        <span><strong>Arr</strong><small>2klips/specproof-app · bad0551</small></span>
      </Link>
      <nav aria-label="Assurance surfaces">
        <Link href="/"><LayoutDashboard size={15} />Graph</Link>
        <Link aria-current={surface === "findings" ? "page" : undefined} href="/findings"><FileWarning size={15} />Findings</Link>
        <Link aria-current={surface === "lint" ? "page" : undefined} href="/lint"><Braces size={15} />Instruction lint</Link>
        <Link href="/progress"><Activity size={15} />Progress</Link>
        <Link aria-current={surface === "receipts" ? "page" : undefined} href="/receipts"><ReceiptText size={15} />Receipts</Link>
      </nav>
      <span className="header-actions">
        <span className="commit-chip"><GitBranch size={13} />main · clean scan</span>
        <ThemeToggle />
      </span>
    </header>
  );
}

function GradeBadge({ grade }: { grade: "broken" | "inferred" | "verified" }) {
  return <span className={`grade-badge ${grade}`}>{grade}</span>;
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
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    return () => controller.abort();
  }, [finding.id]);

  return (
    <section className="source-panel" aria-label="Source span">
      <header><span>Source span</span><code>{finding.source.path}:{finding.source.startLine}-{finding.source.endLine}</code></header>
      {!source && !failed ? <p className="inline-status"><LoaderCircle className="spin" size={14} /> Fetching commit source…</p> : null}
      {failed ? <p className="inline-status error-text"><AlertTriangle size={14} /> Source unavailable. Span metadata preserved.</p> : null}
      {source ? (
        <pre data-source-state="fetched">
          {renderSourceSpan(source, finding.source).map((line) => (
            <span className={line.highlighted ? "highlighted" : ""} key={line.lineNumber}>
              <i>{line.lineNumber}</i><code>{line.line || " "}</code>
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
  const visible = useMemo(() => filterFindings(FINDINGS, { kind, severity }), [kind, severity]);
  const [selectedId, setSelectedId] = useState(FINDINGS[0]!.id);
  const selected = FINDINGS.find((finding) => finding.id === selectedId) ?? visible[0] ?? FINDINGS[0]!;

  return (
    <main className="assurance-main findings-layout">
      <aside className="findings-rail">
        <header className="surface-heading">
          <span className="panel-kicker">Assurance queue</span>
          <h1>Findings</h1>
          <p>{visible.length} of {FINDINGS.length} unresolved · provenance required</p>
        </header>
        <div className="finding-filters">
          <label><ListFilter size={14} /><span className="sr-only">Finding type</span><select aria-label="Finding type" onChange={(event) => setKind(event.target.value as FindingKind | "all")} value={kind}>
            <option value="all">All types</option><option value="missing-test">Missing test</option><option value="contradicting-instructions">Contradictions</option><option value="stale-doc">Stale docs</option><option value="orphan-doc">Orphan docs</option>
          </select></label>
          <label><ShieldAlert size={14} /><span className="sr-only">Severity</span><select aria-label="Severity" onChange={(event) => setSeverity(event.target.value as FindingSeverity | "all")} value={severity}>
            <option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select></label>
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
              <span className={`severity-dot ${finding.severity}`} />
              <span><strong>{finding.title}</strong><small>{finding.kind} · {Math.round(finding.confidence * 100)}% confidence</small></span>
              <GradeBadge grade={finding.grade} />
            </button>
          ))}
          {visible.length === 0 ? <p className="empty-list">No findings match both filters.</p> : null}
        </div>
      </aside>

      <article className="finding-detail" aria-labelledby="finding-title">
        <header className="finding-titlebar">
          <div>
            <span className={`severity-label ${selected.severity}`}>{selected.severity} severity</span>
            <h2 id="finding-title">{selected.title}</h2>
          </div>
          <GradeBadge grade={selected.grade} />
        </header>
        <div className="detail-meta">
          <span>Rule <strong>{selected.kind}</strong></span>
          <span>Confidence <strong>{Math.round(selected.confidence * 100)}%</strong></span>
          <span>Status <strong>open</strong></span>
        </div>
        <SourceSpan finding={selected} />

        <section className="evidence-chain" aria-labelledby="chain-title">
          <header><span className="panel-kicker">Proof path</span><h3 id="chain-title">Evidence chain</h3></header>
          <ol>
            {selected.evidence.map((step, index) => (
              <li key={step.id}>
                <span className="chain-index">{String(index + 1).padStart(2, "0")}</span>
                <div><small>{step.relation}</small><strong>{step.label}</strong><code>{step.source}</code></div>
                <GradeBadge grade={step.grade} />
                {index < selected.evidence.length - 1 ? <ArrowRight className="chain-arrow" size={15} /> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="suggested-action">
          <span><CheckCircle2 size={16} /> Suggested next action</span>
          <p>{selected.action}</p>
          <Link href={`/receipts?receipt=${encodeURIComponent(selected.receiptId)}`}>Inspect linked receipt <ChevronRight size={14} /></Link>
        </section>
      </article>
    </main>
  );
}

function LintSurface() {
  const totalTokens = INSTRUCTION_COSTS.reduce((sum, file) => sum + file.tokens, 0);
  return (
    <main className="assurance-main lint-surface">
      <header className="surface-heading wide-heading">
        <span className="panel-kicker">Always-loaded context</span>
        <h1>Instruction lint</h1>
        <p>Per-turn cost, duplication, and conflicts. Candidates remain <strong>inferred</strong> until reviewed.</p>
      </header>
      <section className="lint-summary">
        <div><span>Total / turn</span><strong>{totalTokens.toLocaleString()} tokens</strong></div>
        <div><span>Always loaded</span><strong>{INSTRUCTION_COSTS.length} files</strong></div>
        <div><span>Overlap</span><strong>{OVERLAPS.reduce((sum, row) => sum + row.tokens, 0)} tokens</strong></div>
        <div><span>Contradictions</span><strong>{CONTRADICTIONS.length} <GradeBadge grade="inferred" /></strong></div>
      </section>

      <section className="lint-block">
        <header><div><span className="panel-kicker">Cost inventory</span><h2>Always-loaded token cost</h2></div><p>{TOKENIZER_ASSUMPTION}</p></header>
        <div className="data-table" role="table" aria-label="Always-loaded token costs">
          <div className="table-row table-head" role="row"><span>File</span><span>Loaded by</span><span>Linked findings</span><span>Tokens / turn</span></div>
          {INSTRUCTION_COSTS.map((file) => (
            <div className="table-row" key={file.path} role="row"><code>{file.path}</code><span>{file.agents}</span><span>{file.findings}</span><strong>{file.tokens}</strong></div>
          ))}
        </div>
      </section>

      <section className="lint-block">
        <header><div><span className="panel-kicker">Duplication</span><h2>Overlap candidates</h2></div><p>Exact and normalized sentence overlap; token estimates use same assumption.</p></header>
        <div className="overlap-list">
          {OVERLAPS.map((row) => <article key={row.left}><code>{row.left}</code><span><Link2 size={14} />{row.overlap}<strong>{row.tokens} t</strong></span><code>{row.right}</code></article>)}
        </div>
      </section>

      <section className="lint-block contradiction-block">
        <header><div><span className="panel-kicker">Dual-source review</span><h2>Contradiction candidates</h2></div><GradeBadge grade="inferred" /></header>
        {CONTRADICTIONS.map((pair) => (
          <article className="contradiction-pair" key={pair.left.path}>
            <div><code>{pair.left.path}:{pair.left.span}</code><blockquote>{pair.left.quote}</blockquote></div>
            <span><AlertTriangle size={17} />{Math.round(pair.confidence * 100)}%</span>
            <div><code>{pair.right.path}:{pair.right.span}</code><blockquote>{pair.right.quote}</blockquote></div>
          </article>
        ))}
      </section>
    </main>
  );
}

function VerificationBadge({ verification }: { verification: ReceiptVerification | { state: "pending" | "verifying" } }) {
  if (verification.state === "verified") return <span className="verification-badge verified"><ShieldCheck size={14} />Digest verified</span>;
  if (verification.state === "tampered") return <span className="verification-badge tampered"><ShieldAlert size={14} />Tamper detected</span>;
  if (verification.state === "invalid") return <span className="verification-badge tampered"><ShieldAlert size={14} />Invalid statement</span>;
  if (verification.state === "verifying") return <span className="verification-badge"><LoaderCircle className="spin" size={14} />Verifying SHA-256</span>;
  return <span className="verification-badge"><Fingerprint size={14} />Not verified</span>;
}

function ReceiptDetail({ receipt }: { receipt: ReceiptFixture }) {
  const [verification, setVerification] = useState<ReceiptVerification | { state: "pending" | "verifying" }>({ state: "pending" });

  async function verify() {
    setVerification({ state: "verifying" });
    setVerification(await verifyInTotoStatement(receipt.statement, receipt.expectedDigest));
  }

  return (
    <article className="receipt-detail" aria-labelledby="receipt-title">
      <header className="receipt-titlebar">
        <div><span className="panel-kicker">in-toto Statement v1</span><h2 id="receipt-title">{receipt.label}</h2></div>
        <VerificationBadge verification={verification} />
      </header>
      {receipt.stale ? <div className="stale-banner"><Clock3 size={15} />Stale: receipt predates current commit bad0551.</div> : null}
      <dl className="receipt-fields">
        <div><dt>Statement type</dt><dd>{receipt.statement._type}</dd></div>
        <div><dt>Predicate type</dt><dd>{receipt.statement.predicateType}</dd></div>
        <div><dt>Subject</dt><dd>{receipt.statement.subject[0]!.name}</dd></div>
        <div><dt>Commit</dt><dd>{receipt.statement.predicate.commitSha.slice(0, 12)}</dd></div>
        <div><dt>Run</dt><dd>{receipt.statement.predicate.runId}</dd></div>
        <div><dt>Previous receipt</dt><dd>{receipt.statement.predicate.previousReceiptDigest?.slice(0, 12) ?? "chain root"}</dd></div>
      </dl>
      <section className="digest-panel">
        <span>Expected receipt digest</span><code>{receipt.expectedDigest}</code>
        {verification.state === "verified" || verification.state === "tampered" ? <><span>Computed digest</span><code>{verification.actualDigest}</code></> : null}
      </section>
      {verification.state === "verified" ? (
        <section className="receipt-verdict" data-testid="receipt-verdict">
          <BadgeCheck size={19} />
          <div><span>Verified receipt verdict</span><strong>{receipt.statement.predicate.evidence.verified} verified · {receipt.statement.predicate.evidence.inferred} inferred</strong></div>
        </section>
      ) : (
        <section className="receipt-locked" data-testid="receipt-verdict-locked">
          <Fingerprint size={18} /><span>Verdict locked until digest verification succeeds.</span>
        </section>
      )}
      <button className="verify-action" disabled={verification.state === "verifying"} onClick={() => void verify()} type="button">
        <ShieldCheck size={16} /> Verify receipt digest
      </button>
    </article>
  );
}

function ReceiptsSurface({ initialReceiptId }: { initialReceiptId?: string | undefined }) {
  const initial = RECEIPTS.find((receipt) => receipt.id === initialReceiptId) ?? RECEIPTS[0]!;
  const [selectedId, setSelectedId] = useState(initial.id);
  const selected = RECEIPTS.find((receipt) => receipt.id === selectedId) ?? initial;
  return (
    <main className="assurance-main receipts-layout">
      <aside className="receipt-rail">
        <header className="surface-heading"><span className="panel-kicker">Commit-linked chain</span><h1>Receipts</h1><p>{RECEIPTS.length} statements · signatures deferred to Phase 2</p></header>
        <div className="receipt-list">
          {RECEIPTS.map((receipt) => (
            <button aria-pressed={receipt.id === selected.id} key={receipt.id} onClick={() => setSelectedId(receipt.id)} type="button">
              <ReceiptText size={16} /><span><strong>{receipt.label}</strong><small>{new Date(receipt.createdAt).toISOString().slice(0, 10)} · {receipt.stale ? "stale" : "current"}</small></span><ChevronRight size={14} />
            </button>
          ))}
        </div>
      </aside>
      <ReceiptDetail key={selected.id} receipt={selected} />
    </main>
  );
}

export function AssuranceWorkspace({ initialReceiptId, surface }: AssuranceWorkspaceProps) {
  return (
    <div className="app-surface">
      <AppHeader surface={surface} />
      {surface === "findings" ? <FindingsSurface /> : null}
      {surface === "lint" ? <LintSurface /> : null}
      {surface === "receipts" ? <ReceiptsSurface initialReceiptId={initialReceiptId} /> : null}
    </div>
  );
}
