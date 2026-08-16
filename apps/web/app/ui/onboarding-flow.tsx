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
import { BRAND, ONBOARDING } from "../../lib/strings";
import { DashboardScreen } from "./dashboard-screen";

interface OnboardingFlowProps {
  initialPermissionError?: boolean;
}

const STEPS = [
  ONBOARDING.steps.signIn,
  ONBOARDING.steps.installApp,
  ONBOARDING.steps.selectRepo,
  ONBOARDING.steps.firstScan,
] as const;

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
        <strong>{BRAND.name}</strong>
        <span>{ONBOARDING.brandTagline}</span>
      </header>
      <ol className="stepper" aria-label={ONBOARDING.ariaProgress}>
        {STEPS.map((label, index) => (
          <li data-active={index === step} data-complete={index < step} key={label}>
            <span>{index < step ? <Check size={12} /> : index + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="onboarding-card" aria-labelledby="onboarding-title">
          <span className="panel-kicker">{ONBOARDING.identity.kicker}</span>
          <h1 id="onboarding-title">{ONBOARDING.identity.title}</h1>
          <p>{ONBOARDING.identity.body}</p>
          <button className="primary-action" onClick={() => setStep(1)} type="button">
            <GitFork size={17} /> {ONBOARDING.identity.cta} <ChevronRight size={16} />
          </button>
          <button
            className="secondary-action"
            onClick={() => {
              setSeededDemo(true);
              setStep(2);
            }}
            type="button"
          >
            {ONBOARDING.identity.demoCta}
          </button>
          <small><LockKeyhole size={13} /> {ONBOARDING.identity.note}</small>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="onboarding-card wide-card" aria-labelledby="permission-title">
          <span className="panel-kicker">{ONBOARDING.permission.kicker}</span>
          <h1 id="permission-title">{ONBOARDING.permission.title}</h1>
          <p>{ONBOARDING.permission.body}</p>
          {permissionError ? (
            <div className="permission-error" role="alert">
              <AlertTriangle size={18} />
              <div><strong>{ONBOARDING.permission.error.title}</strong><span>{ONBOARDING.permission.error.body}</span></div>
              <button onClick={() => setPermissionError(false)} type="button">{ONBOARDING.permission.error.action}</button>
            </div>
          ) : (
            <div className="permission-grid">
              <div><KeyRound size={17} /><strong>{ONBOARDING.permission.scopes.contents.title}</strong><span>{ONBOARDING.permission.scopes.contents.body}</span></div>
              <div><Check size={17} /><strong>{ONBOARDING.permission.scopes.checks.title}</strong><span>{ONBOARDING.permission.scopes.checks.body}</span></div>
              <div><ScanSearch size={17} /><strong>{ONBOARDING.permission.scopes.actions.title}</strong><span>{ONBOARDING.permission.scopes.actions.body}</span></div>
              <div><GitFork size={17} /><strong>{ONBOARDING.permission.scopes.metadata.title}</strong><span>{ONBOARDING.permission.scopes.metadata.body}</span></div>
            </div>
          )}
          <button className="primary-action" disabled={permissionError} onClick={() => setStep(2)} type="button">
            {ONBOARDING.permission.cta} <ChevronRight size={16} />
          </button>
          <small>{ONBOARDING.permission.note}</small>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboarding-card wide-card" aria-labelledby="repo-title">
          <span className="panel-kicker">{ONBOARDING.repository.kicker}</span>
          <h1 id="repo-title">
            {seededDemo ? ONBOARDING.repository.titleDemo : ONBOARDING.repository.titleDefault}
          </h1>
          <p>
            {seededDemo
              ? ONBOARDING.repository.bodyDemo
              : ONBOARDING.repository.bodyDefault}
          </p>
          <button className="repo-choice" onClick={() => setStep(3)} type="button">
            <span className="repo-mark"><Network size={18} /></span>
            <span>
              <strong>{seededDemo ? ONBOARDING.repository.demoRepo : ONBOARDING.repository.defaultRepo}</strong>
              <small>
                {seededDemo
                  ? ONBOARDING.repository.demoMeta
                  : ONBOARDING.repository.defaultMeta}
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
            <span className="panel-kicker">{ONBOARDING.scan.kicker}</span>
            <h1 id="scan-title">{ONBOARDING.scan.title}</h1>
            <p>
              {ONBOARDING.scan.body}
            </p>
            <div className="scan-track"><span style={{ width: "76%" }} /></div>
            <button className="primary-action" onClick={() => setStep(4)} type="button">{ONBOARDING.scan.cta} <ChevronRight size={16} /></button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
