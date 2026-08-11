"use client";

import type { PublicMcpTokenRecord } from "@specproof/mcp";
import { useActionState } from "react";

import {
  INITIAL_ISSUE_MCP_TOKEN_STATE,
  issueMcpToken,
  revokeMcpToken,
} from "./actions";

function timestamp(value: string | null): string {
  return value ? `${value.slice(0, 16).replace("T", " ")} UTC` : "Never";
}

export function McpTokenManager({
  tokens,
}: {
  tokens: PublicMcpTokenRecord[];
}) {
  const [state, issueAction, pending] = useActionState(
    issueMcpToken,
    INITIAL_ISSUE_MCP_TOKEN_STATE,
  );

  return (
    <div className="mcp-settings-grid">
      <section className="mcp-settings-card" aria-labelledby="mcp-issue-title">
        <h2 id="mcp-issue-title">Issue access token</h2>
        <form action={issueAction} className="mcp-token-form">
          <label htmlFor="mcp-token-name">Token name</label>
          <input
            autoComplete="off"
            id="mcp-token-name"
            maxLength={80}
            name="name"
            placeholder="Local coding agent"
            required
          />
          <fieldset>
            <legend>Scopes</legend>
            <label>
              <input
                defaultChecked
                name="scopes"
                type="checkbox"
                value="mcp:read"
              />
              Read context and findings
            </label>
            <label>
              <input name="scopes" type="checkbox" value="mcp:write" />
              Record progress and notes
            </label>
          </fieldset>
          <button className="button" disabled={pending} type="submit">
            {pending ? "Issuing…" : "Issue token"}
          </button>
        </form>
        {state.error ? (
          <p className="mcp-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.secret ? (
          <div className="mcp-secret" role="status">
            <strong>Copy now. This token is shown once.</strong>
            <code>{state.secret}</code>
          </div>
        ) : null}
      </section>

      <section
        className="mcp-settings-card"
        aria-labelledby="mcp-token-list-title"
      >
        <h2 id="mcp-token-list-title">Access tokens</h2>
        {tokens.length === 0 ? <p>No tokens issued.</p> : null}
        <ul className="mcp-token-list">
          {tokens.map((token) => (
            <li key={token.id}>
              <div>
                <strong>{token.name}</strong>
                <code>{token.tokenPrefix}…</code>
                <span>{token.scopes.join(", ")}</span>
                <span>Last used: {timestamp(token.lastUsedAt)}</span>
              </div>
              {token.revokedAt ? (
                <span className="mcp-revoked">Revoked</span>
              ) : (
                <form action={revokeMcpToken}>
                  <input name="tokenId" type="hidden" value={token.id} />
                  <button className="mcp-revoke" type="submit">
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
