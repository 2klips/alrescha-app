"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  GitFork,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Network,
  ScanSearch,
} from "lucide-react";
import { useState } from "react";

import { buildDashboardViewModel } from "../../lib/dashboard/graph-model";
import { DashboardScreen } from "./dashboard-screen";

interface OnboardingFlowProps {
  initialPermissionError?: boolean;
}

const STEPS = ["Sign in", "Install app", "Select repo", "First scan"] as const;

export function OnboardingFlow({ initialPermissionError = false }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [permissionError, setPermissionError] = useState(initialPermissionError);
  const [seededDemo, setSeededDemo] = useState(false);

  if (step === 4) {
    return (
      <DashboardScreen
        model={buildDashboardViewModel(
          "scanned",
          seededDemo ? "specproof/drifted-demo" : "2klips/specproof-app",
        )}
      />
    );
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-backdrop" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
      <header className="onboarding-brand">
        <span className="repo-mark"><Network size={18} /></span>
        <strong>SpecProof</strong>
        <span>Project assurance workspace</span>
      </header>
      <ol className="stepper" aria-label="Onboarding progress">
        {STEPS.map((label, index) => (
          <li data-active={index === step} data-complete={index < step} key={label}>
            <span>{index < step ? <Check size={12} /> : index + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="onboarding-card" aria-labelledby="onboarding-title">
          <span className="panel-kicker">01 · Identity</span>
          <h1 id="onboarding-title">Start with your repository.</h1>
          <p>Sign in once. SpecProof creates a private solo workspace, even for public repositories.</p>
          <button className="primary-action" onClick={() => setStep(1)} type="button">
            <GitFork size={17} /> Continue with GitHub <ChevronRight size={16} />
          </button>
          <button
            className="secondary-action"
            onClick={() => {
              setSeededDemo(true);
              setStep(2);
            }}
            type="button"
          >
            Try seeded demo
          </button>
          <small><LockKeyhole size={13} /> No local install. No repository writes.</small>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="onboarding-card wide-card" aria-labelledby="permission-title">
          <span className="panel-kicker">02 · GitHub App</span>
          <h1 id="permission-title">Read only. Evidence only.</h1>
          <p>
            Choose repositories on GitHub. Access stays scoped to that selection.
            Source files are fetched transiently; SpecProof stores metadata,
            digests, spans, findings, and receipts.
          </p>
          {permissionError ? (
            <div className="permission-error" role="alert">
              <AlertTriangle size={18} />
              <div><strong>Installation missing `contents:read`</strong><span>Grant required read permission, then retry. Nothing was imported.</span></div>
              <button onClick={() => setPermissionError(false)} type="button">Review permission</button>
            </div>
          ) : (
            <div className="permission-grid">
              <div><KeyRound size={17} /><strong>Contents · read</strong><span>Specs, instructions, code metadata</span></div>
              <div><Check size={17} /><strong>Checks · read</strong><span>Commit-linked test verdicts</span></div>
              <div><ScanSearch size={17} /><strong>Actions · read</strong><span>JUnit and Vitest report artifacts</span></div>
              <div><GitFork size={17} /><strong>Metadata · read</strong><span>Repository identity and branch</span></div>
            </div>
          )}
          <button className="primary-action" disabled={permissionError} onClick={() => setStep(2)} type="button">
            Install GitHub App <ChevronRight size={16} />
          </button>
          <small>
            Access events are retained 30 days. Optional `pull_requests:write` is
            requested later only for advisory PR proposals.
          </small>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboarding-card wide-card" aria-labelledby="repo-title">
          <span className="panel-kicker">03 · Repository</span>
          <h1 id="repo-title">
            {seededDemo ? "Explore a known drift case." : "Choose first proof graph."}
          </h1>
          <p>
            {seededDemo
              ? "This bundled public fixture needs no GitHub token, private-repository permission, or credits."
              : "Installation token stays transient and is never stored."}
          </p>
          <button className="repo-choice" onClick={() => setStep(3)} type="button">
            <span className="repo-mark"><Network size={18} /></span>
            <span>
              <strong>{seededDemo ? "specproof/drifted-demo" : "2klips/specproof-app"}</strong>
              <small>
                {seededDemo
                  ? "fixtures/drifted-demo · seeded expected findings"
                  : "TypeScript · main · updated now"}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="first-scan" aria-labelledby="scan-title">
          <div className="scan-graph" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
          <div className="scan-copy">
            <LoaderCircle className="spin" size={22} />
            <span className="panel-kicker">04 · First scan</span>
            <h1 id="scan-title">Building proof spine</h1>
            <p>
              15 artifacts indexed · 13 requirements · metadata-only evidence graph
            </p>
            <div className="scan-track"><span style={{ width: "76%" }} /></div>
            <button className="primary-action" onClick={() => setStep(4)} type="button">Open evidence graph <ChevronRight size={16} /></button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
