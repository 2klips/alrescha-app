"use client";

import { useActionState } from "react";

import { SETTINGS } from "../../../../lib/strings";
import {
  createMinimalIndexProposal,
  requestContextPackPreview,
} from "./actions";
import type { ContextPackActionState, IndexProposalActionState } from "./state";

export function ContextTools({
  initialContextState,
  initialProposalState,
}: {
  initialContextState: ContextPackActionState;
  initialProposalState: IndexProposalActionState;
}) {
  const [contextState, contextAction, contextPending] = useActionState(
    requestContextPackPreview,
    initialContextState,
  );
  const [proposalState, proposalAction, proposalPending] = useActionState(
    createMinimalIndexProposal,
    initialProposalState,
  );

  return (
    <div className="context-settings-grid">
      <section
        className="mcp-settings-card"
        aria-labelledby="context-pack-title"
      >
        <div className="eyebrow">{SETTINGS.mcp.contextPack.eyebrow}</div>
        <h2 id="context-pack-title">{SETTINGS.mcp.contextPack.title}</h2>
        <form action={contextAction} className="mcp-token-form">
          <label htmlFor="context-task">
            {SETTINGS.mcp.contextPack.taskLabel}
          </label>
          <textarea
            id="context-task"
            maxLength={1_000}
            name="taskDescription"
            placeholder={SETTINGS.mcp.contextPack.taskPlaceholder}
            required
            rows={4}
          />
          <div className="context-form-row">
            <label>
              {SETTINGS.mcp.contextPack.targetAgentLabel}
              <select defaultValue="codex" name="targetAgent">
                <option value="codex">
                  {SETTINGS.mcp.contextPack.agents.codex}
                </option>
                <option value="claude-code">
                  {SETTINGS.mcp.contextPack.agents.claudeCode}
                </option>
                <option value="cursor">
                  {SETTINGS.mcp.contextPack.agents.cursor}
                </option>
                <option value="generic">
                  {SETTINGS.mcp.contextPack.agents.generic}
                </option>
              </select>
            </label>
            <label>
              {SETTINGS.mcp.contextPack.tokenBudgetLabel}
              <input
                defaultValue={2_000}
                max={32_000}
                min={128}
                name="tokenBudget"
                type="number"
              />
            </label>
          </div>
          <button className="button" disabled={contextPending} type="submit">
            {contextPending
              ? SETTINGS.mcp.contextPack.composing
              : SETTINGS.mcp.contextPack.compose}
          </button>
        </form>
        {contextState.error ? (
          <p className="mcp-error" role="alert">
            {contextState.error}
          </p>
        ) : null}
        {contextState.pack ? (
          <div className="context-pack-result" role="status">
            <div className="context-result-meta">
              <strong>
                {SETTINGS.mcp.contextPack.estimatedTokens(
                  contextState.pack.estimatedTokens,
                )}
              </strong>
              <span>{contextState.pack.targetAgent}</span>
            </div>
            <p>{contextState.pack.assumption}</p>
            <h3>{SETTINGS.mcp.contextPack.readingOrderTitle}</h3>
            <ol>
              {contextState.pack.readingOrder.map((entry) => (
                <li key={entry.id}>
                  <code>{entry.path}</code>
                  <span>{entry.reason}</span>
                </li>
              ))}
            </ol>
            {contextState.pack.omitted.length > 0 ? (
              <details>
                <summary>
                  {SETTINGS.mcp.contextPack.omissions(
                    contextState.pack.omitted.length,
                  )}
                </summary>
                <ol>
                  {contextState.pack.omitted.map((entry) => (
                    <li key={entry.path}>
                      <code>{entry.path}</code>
                      <span>{entry.reason}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            <details>
              <summary>{SETTINGS.mcp.contextPack.formattedPack}</summary>
              <pre>{contextState.pack.text}</pre>
            </details>
          </div>
        ) : null}
      </section>

      <section
        className="mcp-settings-card"
        aria-labelledby="minimal-index-title"
      >
        <div className="eyebrow">{SETTINGS.mcp.minimalIndex.eyebrow}</div>
        <h2 id="minimal-index-title">{SETTINGS.mcp.minimalIndex.title}</h2>
        <p>
          <code>{SETTINGS.mcp.minimalIndex.agentsFile}</code>
          {SETTINGS.mcp.minimalIndex.bodyMid}
          <code>{SETTINGS.mcp.minimalIndex.claudeFile}</code>
          {SETTINGS.mcp.minimalIndex.bodySuffix}
        </p>
        <form action={proposalAction}>
          <button className="button" disabled={proposalPending} type="submit">
            {proposalPending
              ? SETTINGS.mcp.minimalIndex.preparing
              : SETTINGS.mcp.minimalIndex.create}
          </button>
        </form>
        {proposalState.error ? (
          <p className="mcp-error" role="alert">
            {proposalState.error}
          </p>
        ) : null}
        {proposalState.status === "up_to_date" ? (
          <p className="context-success" role="status">
            {SETTINGS.mcp.minimalIndex.upToDate}
          </p>
        ) : null}
        {proposalState.url ? (
          <p className="context-success" role="status">
            {SETTINGS.mcp.minimalIndex.proposalOpenedPrefix}
            <a href={proposalState.url}>{SETTINGS.mcp.minimalIndex.viewPr}</a>
          </p>
        ) : null}
        {proposalState.status === "permission_required" ? (
          <div className="permission-fallback" role="status">
            <strong>
              {SETTINGS.mcp.minimalIndex.permissionRequired(
                proposalState.missingPermission ?? "",
              )}
            </strong>
            <p>{SETTINGS.mcp.minimalIndex.permissionPausedBody}</p>
            {proposalState.missingPermission ===
            SETTINGS.mcp.minimalIndex.prWritePermission ? (
              <a className="secondary-button" href="/app/connect/github">
                {SETTINGS.mcp.minimalIndex.grantPrPermission}
              </a>
            ) : null}
          </div>
        ) : null}
        {proposalState.files.length > 0 ? (
          <div className="proposal-diff">
            <div className="context-result-meta">
              <h3>{SETTINGS.mcp.minimalIndex.diffOnlyProposalTitle}</h3>
              <span>{proposalState.repository}</span>
            </div>
            {proposalState.files.map((file) => (
              <article key={file.path}>
                <h4>{file.path}</h4>
                <div className="diff-columns">
                  <div>
                    <span>{SETTINGS.mcp.minimalIndex.current}</span>
                    <pre>
                      {file.before ??
                        SETTINGS.mcp.minimalIndex.newFilePlaceholder}
                    </pre>
                  </div>
                  <div>
                    <span>{SETTINGS.mcp.minimalIndex.proposed}</span>
                    <pre>{file.after}</pre>
                  </div>
                </div>
              </article>
            ))}
            <details>
              <summary>{SETTINGS.mcp.minimalIndex.copyManually}</summary>
              <p>{SETTINGS.mcp.minimalIndex.copyManuallyBody}</p>
            </details>
          </div>
        ) : null}
      </section>
    </div>
  );
}
