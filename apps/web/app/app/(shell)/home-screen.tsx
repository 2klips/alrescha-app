import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  GitCommitHorizontal,
  KeyRound,
  Link2,
  Network,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";

import type {
  JourneyStepState,
  ScanProgressModel,
  ScanStageState,
  WorkspaceJourneyModel,
} from "../../../lib/home/journey";
import { HOME } from "../../../lib/strings/home";
import { ProductPageHeader } from "../../ui/page-layout";
import { requestRepositoryRescan, type RescanOutcome } from "./actions";

/**
 * `/app` workspace home (Phase 3 Wave E todo 13) — the onboarding spine as
 * one graph-centric thread: 레포 연결 → 지식그래프 생성 → 첫 그래프 뷰 +
 * MCP 토큰 발급. Every state is derived from stored rows (no demo fixture);
 * the demo dashboard stays on the public `/map`.
 *
 * The graph step carries the first run's progress (Phase 4 Wave C todo 16):
 * the structure stage and the analysis stage, read from the queue, and the
 * "다시 스캔" button that queues the same pair again.
 */

/** What the last redirect had to say — shown once, never derived from. */
export interface HomeNotices {
  readonly backfill: "unscheduled" | null;
  readonly rescan: RescanOutcome | null;
  readonly rescanMode: "full" | null;
}

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

function Stage({
  error,
  name,
  state,
}: {
  error: string | null;
  name: "analysis" | "structure";
  state: ScanStageState;
}) {
  return (
    <li data-stage={name} data-stage-state={state}>
      <span className="home-scan-stage-name">
        {HOME.scan.stages[name]}
        <span className="home-scan-stage-state" data-stage-state={state}>
          {HOME.scan.states[state]}
        </span>
      </span>
      <small>{HOME.scan.stageHints[name]}</small>
      {state === "failed" && error ? (
        // The queue's own words, verbatim (WORK_SPEC §4.5): a retried scan
        // that still fails shows why, not a spinner.
        <small className="home-scan-error" role="alert">
          {HOME.scan.failedPrefix} · {error}
        </small>
      ) : null}
      {state === "local" ? <small>{HOME.scan.localHint}</small> : null}
    </li>
  );
}

function rescanOutcomeCopy(notices: HomeNotices): string | null {
  switch (notices.rescan) {
    case "scheduled":
      return notices.rescanMode === "full"
        ? HOME.scan.rescan.outcomes.scheduledFull
        : HOME.scan.rescan.outcomes.scheduled;
    case "never-scanned":
      return HOME.scan.rescan.outcomes.neverScanned;
    case "local":
      return HOME.scan.rescan.outcomes.local;
    case "rate-limited":
      return HOME.scan.rescan.outcomes.rateLimited;
    case "error":
      return HOME.scan.rescan.outcomes.error;
    default:
      return null;
  }
}

function ScanProgress({
  notices,
  scan,
}: {
  notices: HomeNotices;
  scan: ScanProgressModel;
}) {
  const outcome = rescanOutcomeCopy(notices);
  return (
    <div className="home-scan" data-testid="scan-progress">
      <ol
        aria-label={HOME.scan.aria}
        className="home-scan-stages"
        data-analysis={scan.analysis}
        data-structure={scan.structure}
      >
        <Stage
          error={scan.structureError}
          name="structure"
          state={scan.structure}
        />
        <Stage
          error={scan.analysisError}
          name="analysis"
          state={scan.analysis}
        />
      </ol>
      {scan.commitSha ? (
        <span className="home-scan-commit">
          <GitCommitHorizontal size={13} aria-hidden />
          {HOME.scan.commit} · <code>{scan.commitSha.slice(0, 7)}</code>
        </span>
      ) : null}
      <div className="home-rescan" data-rescan={scan.rescan}>
        {scan.rescan === "available" && scan.repositoryId ? (
          <form action={requestRepositoryRescan}>
            <input
              name="repositoryId"
              type="hidden"
              value={scan.repositoryId}
            />
            <button className="home-step-cta" type="submit">
              <RefreshCw size={13} aria-hidden />
              {HOME.scan.rescan.cta}
            </button>
          </form>
        ) : scan.rescan === "busy" ? (
          <button className="home-step-cta" disabled type="button">
            <RefreshCw size={13} aria-hidden />
            {HOME.scan.rescan.busy}
          </button>
        ) : scan.rescan === "never-scanned" ? (
          <small>{HOME.scan.rescan.neverScanned}</small>
        ) : scan.rescan === "local" ? (
          <small>{HOME.scan.rescan.local}</small>
        ) : null}
        {outcome ? (
          <p
            className="home-rescan-outcome"
            data-outcome={notices.rescan ?? ""}
            data-testid="rescan-outcome"
            role="status"
          >
            {outcome}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WorkspaceHomeScreen({
  model,
  notices = { backfill: null, rescan: null, rescanMode: null },
}: {
  model: WorkspaceJourneyModel;
  notices?: HomeNotices;
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
                  {notices.backfill === "unscheduled" ||
                  (model.scan.structure === "idle" &&
                    model.scan.rescan === "never-scanned") ? (
                    <p data-testid="backfill-unscheduled" role="status">
                      {HOME.journey.graph.notScheduled}
                    </p>
                  ) : (
                    <p>{HOME.journey.graph.scanning}</p>
                  )}
                  <small>{HOME.journey.graph.scanningHint}</small>
                  <Link className="home-step-cta" href="/app/commits">
                    {HOME.journey.graph.progressCta}
                    <ArrowUpRight size={13} aria-hidden />
                  </Link>
                </>
              ) : (
                <p>{HOME.journey.graph.body}</p>
              )}
              {model.steps.connect === "done" ? (
                <ScanProgress notices={notices} scan={model.scan} />
              ) : null}
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
