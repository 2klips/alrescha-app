import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  GitCommitHorizontal,
  KeyRound,
  Link2,
  Network,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";

import type {
  JourneyStepState,
  WorkspaceJourneyModel,
} from "../../../lib/home/journey";
import { HOME } from "../../../lib/strings/home";
import { ProductPageHeader } from "../../ui/page-layout";

/**
 * `/app` workspace home (Phase 3 Wave E todo 13) — the onboarding spine as
 * one graph-centric thread: 레포 연결 → 지식그래프 생성 → 첫 그래프 뷰 +
 * MCP 토큰 발급. Every state is derived from stored rows (no demo fixture);
 * the demo dashboard stays on the public `/map`.
 */

function StepBadge({
  index,
  state,
}: {
  index: number;
  state: JourneyStepState;
}) {
  return (
    <span className="home-step-badge" data-step-state={state} aria-hidden>
      {state === "done" ? <Check size={13} /> : index}
    </span>
  );
}

function StepState({ state }: { state: JourneyStepState }) {
  return (
    <span className="home-step-state" data-step-state={state}>
      {HOME.journey.stepStates[state]}
    </span>
  );
}

export function WorkspaceHomeScreen({
  model,
}: {
  model: WorkspaceJourneyModel;
}) {
  const graphReady = model.steps.graph === "done";

  return (
    <main className="home-shell product-page" aria-label={HOME.ariaMain}>
      <div className="home-main">
        <section className="home-hero">
          <ProductPageHeader
            description={HOME.lead}
            kicker={HOME.kicker}
            title={HOME.title}
          />

          {model.installationRevoked ? (
            <p className="home-revoked" role="alert">
              <AlertTriangle size={15} aria-hidden />
              {HOME.journey.connect.revoked}
            </p>
          ) : null}

          {graphReady ? (
            <div
              className="home-graph-card"
              data-testid="home-graph-card"
              aria-label={HOME.graphCard.aria}
            >
              <div className="home-graph-counts">
                <span>
                  <strong>{model.nodeCount}</strong>
                  {HOME.graphCard.counts.nodes}
                </span>
                <span>
                  <strong>{model.edgeCount}</strong>
                  {HOME.graphCard.counts.edges}
                </span>
                <span>
                  <strong>{model.agentAssertionCount}</strong>
                  {HOME.graphCard.counts.agentNotes}
                </span>
              </div>
              <span className="home-graph-commit">
                <GitCommitHorizontal size={13} aria-hidden />
                {HOME.graphCard.lastScan} ·{" "}
                <code>
                  {model.lastScannedCommitSha
                    ? model.lastScannedCommitSha.slice(0, 7)
                    : HOME.graphCard.noScan}
                </code>
              </span>
              <Link className="home-graph-open" href="/app/map">
                <Network size={16} aria-hidden />
                {HOME.graphCard.openMap}
                <ArrowUpRight size={14} aria-hidden />
              </Link>
            </div>
          ) : null}
        </section>

        <ol className="home-journey" aria-label={HOME.journey.aria}>
          <li
            data-step-state={model.steps.connect}
            data-testid="journey-connect"
          >
            <StepBadge index={1} state={model.steps.connect} />
            <div>
              <h2>
                <Link2 size={14} aria-hidden />
                {HOME.journey.connect.title}
                <StepState state={model.steps.connect} />
              </h2>
              {model.steps.connect === "done" && model.repoFullName ? (
                <p className="home-step-done">
                  {HOME.journey.connect.done(model.repoFullName)}
                </p>
              ) : (
                <>
                  <p>{HOME.journey.connect.body}</p>
                  <Link className="home-step-cta" href="/app/connect/github">
                    {HOME.journey.connect.cta}
                    <ArrowUpRight size={13} aria-hidden />
                  </Link>
                </>
              )}
            </div>
          </li>

          <li data-step-state={model.steps.graph} data-testid="journey-graph">
            <StepBadge index={2} state={model.steps.graph} />
            <div>
              <h2>
                <ScanSearch size={14} aria-hidden />
                {HOME.journey.graph.title}
                <StepState state={model.steps.graph} />
              </h2>
              {model.steps.graph === "done" ? (
                <>
                  <p className="home-step-done">
                    {HOME.journey.graph.done(model.nodeCount, model.edgeCount)}
                  </p>
                  <Link className="home-step-cta" href="/app/map">
                    {HOME.journey.graph.cta}
                    <ArrowUpRight size={13} aria-hidden />
                  </Link>
                </>
              ) : model.steps.graph === "active" ? (
                <>
                  <p>{HOME.journey.graph.scanning}</p>
                  <small>{HOME.journey.graph.scanningHint}</small>
                  <Link className="home-step-cta" href="/app/commits">
                    {HOME.journey.graph.progressCta}
                    <ArrowUpRight size={13} aria-hidden />
                  </Link>
                </>
              ) : (
                <p>{HOME.journey.graph.body}</p>
              )}
            </div>
          </li>

          <li data-step-state={model.steps.agent} data-testid="journey-agent">
            <StepBadge index={3} state={model.steps.agent} />
            <div>
              <h2>
                <KeyRound size={14} aria-hidden />
                {HOME.journey.agent.title}
                <StepState state={model.steps.agent} />
              </h2>
              {model.steps.agent === "done" ? (
                <>
                  <p className="home-step-done">
                    {HOME.journey.agent.done(model.activeTokenCount)}
                  </p>
                  <Link className="home-step-cta" href="/app/settings/mcp">
                    {HOME.journey.agent.manageCta}
                    <ArrowUpRight size={13} aria-hidden />
                  </Link>
                </>
              ) : (
                <>
                  <p>{HOME.journey.agent.body}</p>
                  {model.steps.agent === "active" ? (
                    <Link className="home-step-cta" href="/app/settings/mcp">
                      {HOME.journey.agent.cta}
                      <ArrowUpRight size={13} aria-hidden />
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </li>
        </ol>
      </div>
    </main>
  );
}
