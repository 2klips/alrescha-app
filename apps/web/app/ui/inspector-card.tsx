"use client";

import { useEffect, useState } from "react";

import type {
  ConceptCard,
  InspectorCardPayload,
  ModuleCard,
} from "../../lib/map/inspect-card";
import { WORKSPACE_MAP } from "../../lib/strings";
import { StatusBadge } from "./status-badge";

/**
 * The card under the selected node's path on `/app/map` (Phase 4 Wave D
 * todo 19 ⑴): the shared artifact card and the module card for a file, the
 * concept card for a synthesised concept. Fetched on selection from
 * `/api/map/inspect`, which reads as the signed-in member.
 *
 * Nothing here is derived on the client. The route answers with the card the
 * builders made from stored rows, and this renders it: a summary only under
 * the `inferred` badge, an absence as the sentence for its state, a module's
 * prose with the state its member digest earned.
 */

type CardState =
  | { readonly status: "error" }
  | { readonly status: "loading" }
  | { readonly payload: InspectorCardPayload; readonly status: "ready" };

const EXPORTS_SHOWN = 12;

function ModuleBlock({ module }: { readonly module: ModuleCard | null }) {
  const copy = WORKSPACE_MAP.inspector.card.module;
  if (module === null) {
    return (
      <p className="arr-card-line" data-module="none">
        {copy.none}
      </p>
    );
  }
  return (
    <div className="arr-card-module" data-module={module.state}>
      <span className="arr-kicker">{copy.kicker}</span>
      <strong>{module.name}</strong>
      <small>
        {copy.members(module.memberCount)} · {copy.states[module.state]}
      </small>
      {module.summary ? (
        <p className="arr-card-summary">
          <StatusBadge grade="inferred" />
          <span>{module.summary}</span>
        </p>
      ) : null}
    </div>
  );
}

function ConceptBlock({ concept }: { readonly concept: ConceptCard }) {
  const copy = WORKSPACE_MAP.inspector.card.concept;
  return (
    <div className="arr-card-concept" data-concept-kind={concept.kind}>
      <span className="arr-kicker">{copy.kicker}</span>
      <small>{copy.kinds[concept.kind]}</small>
      <p className="arr-card-summary">
        <StatusBadge grade="inferred" />
        <span>{concept.summary}</span>
      </p>
      <span className="arr-kicker">{copy.members(concept.memberCount)}</span>
      <ul className="arr-card-list">
        {concept.members.map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InspectorCard({ nodeId }: { readonly nodeId: string }) {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/map/inspect?node=${encodeURIComponent(nodeId)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`inspect ${response.status}`);
        return (await response.json()) as InspectorCardPayload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setState({ payload, status: "ready" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [nodeId]);

  const copy = WORKSPACE_MAP.inspector.card;
  if (state.status === "loading") {
    return (
      <p
        className="arr-card-line"
        data-testid="inspector-card"
        data-card="loading"
      >
        {copy.loading}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p
        className="arr-card-line"
        data-testid="inspector-card"
        data-card="error"
      >
        {copy.error}
      </p>
    );
  }
  const { payload } = state;
  if (payload.kind === "concept") {
    return (
      <section
        className="arr-card"
        data-card="concept"
        data-testid="inspector-card"
      >
        <ConceptBlock concept={payload.concept} />
      </section>
    );
  }
  if (payload.kind === "other") {
    return (
      <p
        className="arr-card-line"
        data-testid="inspector-card"
        data-card="other"
      >
        {copy.none}
      </p>
    );
  }
  const { card } = payload;
  const exports = card.exports.slice(0, EXPORTS_SHOWN);
  return (
    <section
      className="arr-card"
      data-card="artifact"
      data-summary-state={card.summary.state}
      data-testid="inspector-card"
    >
      <span className="arr-kicker">{copy.kicker}</span>
      <div className="arr-card-facets">
        <span>{card.kind}</span>
        <span>{card.unit}</span>
        <span>{card.domain}</span>
        {card.tested ? <span>{copy.tested}</span> : null}
        {card.openTodoCount > 0 ? (
          <span>{copy.openTodos(card.openTodoCount)}</span>
        ) : null}
      </div>
      {card.summary.state === "current" ? (
        <p className="arr-card-summary">
          <StatusBadge grade="inferred" />
          <span>{card.summary.text}</span>
        </p>
      ) : (
        <p className="arr-card-absence" data-absence={card.summary.state}>
          {copy.absence[card.summary.state]}
        </p>
      )}
      {exports.length > 0 ? (
        <>
          <span className="arr-kicker">
            {copy.exports(card.exports.length)}
          </span>
          <ul className="arr-card-list">
            {exports.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <ModuleBlock module={payload.module} />
    </section>
  );
}
