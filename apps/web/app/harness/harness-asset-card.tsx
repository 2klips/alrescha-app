"use client";

import type { LibraryItemSource, LibraryItemType } from "@arr/core";
import {
  BookmarkPlus,
  CheckCircle2,
  CopyCheck,
  ExternalLink,
} from "lucide-react";
import { useActionState } from "react";

import { HARNESS } from "../../lib/strings";

export interface HarnessAsset {
  readonly digest: string;
  readonly id: string;
  readonly name: string;
  readonly source: LibraryItemSource;
  readonly tags: readonly string[];
  readonly type: LibraryItemType;
}

export interface SaveLibraryActionState {
  readonly notice: string | null;
  readonly status: "duplicate" | "error" | "idle" | "saved";
}

export type SaveLibraryAction = (
  state: SaveLibraryActionState,
  formData: FormData,
) => Promise<SaveLibraryActionState>;

const INITIAL_STATE: SaveLibraryActionState = { notice: null, status: "idle" };

async function saveDemoAsset(
  state: SaveLibraryActionState,
): Promise<SaveLibraryActionState> {
  return state.status === "saved" || state.status === "duplicate"
    ? {
        notice: HARNESS.notices.duplicate,
        status: "duplicate",
      }
    : { notice: HARNESS.notices.saved, status: "saved" };
}

export function HarnessAssetCard({
  asset,
  saveAction,
}: {
  readonly asset: HarnessAsset;
  readonly saveAction?: SaveLibraryAction;
}) {
  const [state, formAction, pending] = useActionState(
    saveAction ?? saveDemoAsset,
    INITIAL_STATE,
  );
  const demo = saveAction === undefined;
  const saved = state.status === "saved" || state.status === "duplicate";

  return (
    <article className="harness-asset-card" data-asset-id={asset.id}>
      <header>
        <span className={`library-type ${asset.type}`}>{asset.type}</span>
        <code>{asset.digest.slice(0, 12)}</code>
      </header>
      <h2>{asset.name}</h2>
      <a
        className="harness-source"
        href={`https://github.com/${asset.source.repository}/blob/${asset.source.commitSha}/${asset.source.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`}
        rel="noreferrer"
        target="_blank"
      >
        <span>{asset.source.repository}</span>
        <code>{asset.source.path}</code>
        <code>{asset.source.commitSha}</code>
        <ExternalLink aria-hidden="true" size={13} />
      </a>
      <form action={formAction} className="harness-save-form">
        <input name="assetId" type="hidden" value={asset.id} />
        <label htmlFor={`tags-${asset.id}`}>{HARNESS.card.tagsLabel}</label>
        <input
          defaultValue={asset.tags.join(", ")}
          id={`tags-${asset.id}`}
          maxLength={400}
          name="tags"
          placeholder={HARNESS.card.tagsPlaceholder}
        />
        <button disabled={pending} type="submit">
          {saved ? <CopyCheck size={15} /> : <BookmarkPlus size={15} />}
          {pending ? HARNESS.card.saving : HARNESS.card.save}
        </button>
      </form>
      <div className="harness-save-result" data-save-status={state.status}>
        <p aria-live="polite">
          {saved ? <CheckCircle2 aria-hidden="true" size={14} /> : null}
          {state.notice}
        </p>
        {saved ? (
          <a href={demo ? "/library?saved=1" : "/app/library"}>
            {HARNESS.card.browseLibrary}
          </a>
        ) : null}
      </div>
    </article>
  );
}
