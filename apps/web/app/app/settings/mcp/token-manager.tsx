"use client";

import type { PublicMcpTokenRecord } from "@specproof/mcp";
import { useActionState } from "react";

import { SETTINGS } from "../../../../lib/strings";
import {
  issueMcpToken,
  revokeMcpToken,
} from "./actions";
import { INITIAL_ISSUE_MCP_TOKEN_STATE } from "./state";

function timestamp(value: string | null): string {
  return value
    ? SETTINGS.mcp.tokens.withUtc(value.slice(0, 16).replace("T", " "))
    : SETTINGS.mcp.tokens.never;
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
        <h2 id="mcp-issue-title">{SETTINGS.mcp.tokens.issueTitle}</h2>
        <form action={issueAction} className="mcp-token-form">
          <label htmlFor="mcp-token-name">{SETTINGS.mcp.tokens.nameLabel}</label>
          <input
            autoComplete="off"
            id="mcp-token-name"
            maxLength={80}
            name="name"
            placeholder={SETTINGS.mcp.tokens.namePlaceholder}
            required
          />
          <fieldset>
            <legend>{SETTINGS.mcp.tokens.scopesLegend}</legend>
            <label>
              <input
                defaultChecked
                name="scopes"
                type="checkbox"
                value="mcp:read"
              />
              {SETTINGS.mcp.tokens.scopeReadLabel}
            </label>
            <label>
              <input name="scopes" type="checkbox" value="mcp:write" />
              {SETTINGS.mcp.tokens.scopeWriteLabel}
            </label>
          </fieldset>
          <button className="button" disabled={pending} type="submit">
            {pending ? SETTINGS.mcp.tokens.issuing : SETTINGS.mcp.tokens.issue}
          </button>
        </form>
        {state.error ? (
          <p className="mcp-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.secret ? (
          <div className="mcp-secret" role="status">
            <strong>{SETTINGS.mcp.tokens.secretNotice}</strong>
            <code>{state.secret}</code>
          </div>
        ) : null}
      </section>

      <section
        className="mcp-settings-card"
        aria-labelledby="mcp-token-list-title"
      >
        <h2 id="mcp-token-list-title">{SETTINGS.mcp.tokens.listTitle}</h2>
        {tokens.length === 0 ? <p>{SETTINGS.mcp.tokens.empty}</p> : null}
        <ul className="mcp-token-list">
          {tokens.map((token) => (
            <li key={token.id}>
              <div>
                <strong>{token.name}</strong>
                <code>{token.tokenPrefix}…</code>
                <span>{token.scopes.join(", ")}</span>
                <span>{SETTINGS.mcp.tokens.lastUsed(timestamp(token.lastUsedAt))}</span>
              </div>
              {token.revokedAt ? (
                <span className="mcp-revoked">{SETTINGS.mcp.tokens.revoked}</span>
              ) : (
                <form action={revokeMcpToken}>
                  <input name="tokenId" type="hidden" value={token.id} />
                  <button className="mcp-revoke" type="submit">
                    {SETTINGS.mcp.tokens.revoke}
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
