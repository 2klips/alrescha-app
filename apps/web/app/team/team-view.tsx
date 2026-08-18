import {
  VIBE_METRICS,
  type ContributionRow,
  type PromptRubric,
} from "@arr/core";
import { Ban, KeyRound, ShieldCheck, Sparkles, Users } from "lucide-react";

import type { DemoTeam } from "../../lib/team/fixtures";
import { GRADE, TEAM } from "../../lib/strings";

/**
 * What the screen needs, from either source. The demo fixture satisfies it as
 * written; the workspace loader satisfies it with `coaching: null`, because a
 * workspace that has never run a coaching job has no graded prompt — and an
 * ungraded workspace must read as "no evidence", never as the demo's rubric
 * (Phase 2C: demo fixtures are not a fallback for real data).
 */
export interface TeamViewModel {
  readonly capture: DemoTeam["capture"];
  readonly coaching: DemoTeam["coaching"] | null;
  readonly gate: DemoTeam["gate"];
  readonly members: DemoTeam["members"];
  readonly vibe: DemoTeam["vibe"];
}

interface TeamViewProps {
  readonly team: TeamViewModel;
}

const AXIS_ORDER = [
  "contextGrounding",
  "specificity",
  "verifiability",
  "batchSize",
  "stopCondition",
  "noOverInstruction",
] as const satisfies readonly (keyof PromptRubric)[];

function memberName(members: TeamViewModel["members"], userId: string): string {
  return members.find((member) => member.userId === userId)?.name ?? userId;
}

function ContributionTable({
  members,
  rows,
}: {
  readonly members: DemoTeam["members"];
  readonly rows: readonly ContributionRow[];
}) {
  return (
    <table className="team-table">
      <thead>
        <tr>
          <th>{TEAM.contribution.columns.member}</th>
          <th>{TEAM.contribution.columns.commits}</th>
          <th>{TEAM.contribution.columns.verified}</th>
          <th>{TEAM.contribution.columns.resolved}</th>
          <th>{TEAM.contribution.columns.proven}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId}>
            <td>{memberName(members, row.userId)}</td>
            <td>{row.commitCount}</td>
            <td>{row.verifiedEvidenceCount}</td>
            <td>{row.resolvedFindingCount}</td>
            <td>
              {row.provenRequirementIds.length === 0 ? (
                <span className="team-none">{TEAM.contribution.none}</span>
              ) : (
                row.provenRequirementIds.map((id) => <code key={id}>{id}</code>)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CoachingDetail({
  coaching,
}: {
  readonly coaching: NonNullable<TeamViewModel["coaching"]>;
}) {
  return (
    <>
      <div className="team-rubric">
        {AXIS_ORDER.map((axis) => (
          <span key={axis}>
            <small>{TEAM.coaching.axes[axis]}</small>
            <strong>{TEAM.coaching.axisScore(coaching.rubric[axis])}</strong>
          </span>
        ))}
      </div>
      <details className="team-prompt">
        <summary>{TEAM.coaching.samplePromptTitle}</summary>
        <p>{coaching.promptText}</p>
      </details>
      {coaching.suggestions.length > 0 ? (
        <>
          <h3>{TEAM.coaching.suggestionsTitle}</h3>
          <ul className="inspection-list">
            {coaching.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

export function TeamView({ team }: TeamViewProps) {
  const adopted = team.gate.verdicts.filter(
    ({ status }) => status === "adopted",
  ).length;
  const exposedMetrics = Object.keys(team.vibe.teamView);

  return (
    <main className="team-main" aria-label={TEAM.ariaMain}>
      <header className="progress-section-heading inspection-heading">
        <div>
          <span>{TEAM.kicker}</span>
          <h1>{TEAM.title}</h1>
        </div>
      </header>
      <p className="commit-lead">{TEAM.lead}</p>

      <div className="team-grid">
        <section className="inspection-widget" data-testid="team-roster">
          <header>
            <Users size={15} />
            <h2>{TEAM.roster.title}</h2>
          </header>
          <strong className="inspection-figure">
            {TEAM.roster.count(team.members.length)}
          </strong>
          <ul className="inspection-list">
            {team.members.map((member) => (
              <li className="team-member" key={member.userId}>
                <span>{member.name}</span>
                <code>{TEAM.roster.roles[member.role]}</code>
                <em className={`team-status ${member.status}`}>
                  {TEAM.roster.statuses[member.status]}
                </em>
              </li>
            ))}
          </ul>
          <p className="inspection-note">{TEAM.roster.note}</p>
        </section>

        <section className="inspection-widget" data-testid="team-capture">
          <header>
            <KeyRound size={15} />
            <h2>{TEAM.capture.title}</h2>
          </header>
          <ul className="inspection-list">
            <li>
              {team.capture.workspaceEnabled
                ? TEAM.capture.workspaceOn
                : TEAM.capture.workspaceOff}
            </li>
            <li>
              {team.capture.consented
                ? TEAM.capture.consentOn
                : TEAM.capture.consentOff}
            </li>
            <li>
              {team.capture.rawSyncEnabled
                ? TEAM.capture.rawOn
                : TEAM.capture.rawOff}
            </li>
          </ul>
          <p className="inspection-note">{TEAM.capture.privacyNote}</p>
          <p className="inspection-note">{TEAM.capture.localNote}</p>
        </section>

        <section className="inspection-widget" data-testid="team-coaching">
          <header>
            <Sparkles size={15} />
            <h2>{TEAM.coaching.title}</h2>
          </header>
          <span className="team-graded">
            <span className="grade-badge inferred">{GRADE.inferred}</span>
            <small>{TEAM.coaching.note}</small>
          </span>
          {team.coaching === null ? (
            <p className="inspection-insufficient">
              {TEAM.coaching.insufficient}
            </p>
          ) : (
            <CoachingDetail coaching={team.coaching} />
          )}
        </section>

        <section className="inspection-widget" data-testid="team-contribution">
          <header>
            <ShieldCheck size={15} />
            <h2>{TEAM.contribution.title}</h2>
          </header>
          <ContributionTable
            members={team.members}
            rows={team.vibe.contributions}
          />
          <p className="inspection-note">{TEAM.contribution.note}</p>
        </section>

        <section className="inspection-widget" data-testid="team-vibe">
          <header>
            <Ban size={15} />
            <h2>{TEAM.vibe.title}</h2>
          </header>
          <p className="inspection-note">{TEAM.vibe.note}</p>
          <strong className="inspection-figure">
            {TEAM.vibe.gateSummary(adopted, VIBE_METRICS.length)}
          </strong>
          {exposedMetrics.length === 0 ? (
            <p className="inspection-insufficient">{TEAM.vibe.gatePending}</p>
          ) : (
            <ul className="inspection-list">
              {exposedMetrics.map((metric) => (
                <li key={metric}>
                  <code>{metric}</code>
                  <strong>
                    {
                      team.vibe.teamView[
                        metric as keyof typeof team.vibe.teamView
                      ]
                    }
                  </strong>
                </li>
              ))}
            </ul>
          )}
          <ul className="inspection-list team-gate-list">
            {team.gate.verdicts.map((verdict) => (
              <li key={verdict.metric}>
                <code>{verdict.metric}</code>
                <em className={`team-verdict ${verdict.status}`}>
                  {TEAM.vibe.statuses[verdict.status]}
                </em>
              </li>
            ))}
          </ul>
          {team.vibe.comparisonTable === null ? (
            <p className="inspection-note">{TEAM.vibe.comparisonLocked}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
