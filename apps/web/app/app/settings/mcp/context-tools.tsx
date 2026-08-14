"use client";

import { useActionState } from "react";

import {
  createMinimalIndexProposal,
  requestContextPackPreview,
} from "./actions";
import type {
  ContextPackActionState,
  IndexProposalActionState,
} from "./state";

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
        <div className="eyebrow">Graph-selected · load on demand</div>
        <h2 id="context-pack-title">Compose context pack</h2>
        <form action={contextAction} className="mcp-token-form">
          <label htmlFor="context-task">Task</label>
          <textarea
            id="context-task"
            maxLength={1_000}
            name="taskDescription"
            placeholder="Implement GitHub OAuth login and prove REQ-AUTH-001"
            required
            rows={4}
          />
          <div className="context-form-row">
            <label>
              Target agent
              <select defaultValue="codex" name="targetAgent">
                <option value="codex">Codex</option>
                <option value="claude-code">Claude Code</option>
                <option value="cursor">Cursor</option>
                <option value="generic">Generic agent</option>
              </select>
            </label>
            <label>
              Token budget
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
            {contextPending ? "Composing…" : "Compose context pack"}
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
                {contextState.pack.estimatedTokens} estimated tokens
              </strong>
              <span>{contextState.pack.targetAgent}</span>
            </div>
            <p>{contextState.pack.assumption}</p>
            <h3>Reading order</h3>
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
                  {contextState.pack.omitted.length} ranked omissions
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
              <summary>Formatted pack</summary>
              <pre>{contextState.pack.text}</pre>
            </details>
          </div>
        ) : null}
      </section>

      <section
        className="mcp-settings-card"
        aria-labelledby="minimal-index-title"
      >
        <div className="eyebrow">Advisory only · never direct commit</div>
        <h2 id="minimal-index-title">Minimal agent index</h2>
        <p>
          Propose a bounded managed section in <code>AGENTS.md</code> and a
          one-line
          <code> CLAUDE.md</code> wrapper when absent. Repository document
          bodies stay out.
        </p>
        <form action={proposalAction}>
          <button className="button" disabled={proposalPending} type="submit">
            {proposalPending ? "Preparing diff…" : "Create advisory PR"}
          </button>
        </form>
        {proposalState.error ? (
          <p className="mcp-error" role="alert">
            {proposalState.error}
          </p>
        ) : null}
        {proposalState.status === "up_to_date" ? (
          <p className="context-success" role="status">
            Managed index is already current.
          </p>
        ) : null}
        {proposalState.url ? (
          <p className="context-success" role="status">
            Proposal opened: <a href={proposalState.url}>view pull request</a>
          </p>
        ) : null}
        {proposalState.status === "permission_required" ? (
          <div className="permission-fallback" role="status">
            <strong>{proposalState.missingPermission} required</strong>
            <p>
              Automatic proposal is paused. Review the diff below, grant the
              optional permission, or copy the managed files manually.
            </p>
            {proposalState.missingPermission === "pull_requests:write" ? (
              <a className="secondary-button" href="/app/connect/github">
                Grant pull request permission
              </a>
            ) : null}
          </div>
        ) : null}
        {proposalState.files.length > 0 ? (
          <div className="proposal-diff">
            <div className="context-result-meta">
              <h3>Diff-only proposal</h3>
              <span>{proposalState.repository}</span>
            </div>
            {proposalState.files.map((file) => (
              <article key={file.path}>
                <h4>{file.path}</h4>
                <div className="diff-columns">
                  <div>
                    <span>Current</span>
                    <pre>{file.before ?? "(new file)"}</pre>
                  </div>
                  <div>
                    <span>Proposed</span>
                    <pre>{file.after}</pre>
                  </div>
                </div>
              </article>
            ))}
            <details>
              <summary>Copy files manually</summary>
              <p>
                Copy only the proposed bytes shown above. Existing bytes outside
                managed markers remain unchanged.
              </p>
            </details>
          </div>
        ) : null}
      </section>
    </div>
  );
}
