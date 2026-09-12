/**
 * Which repository a workspace screen is about (PR #9 follow-up,
 * 2026-09-12; OQ-042).
 *
 * The live screens are workspace-flat: there is no route or stored pointer
 * that names a current repository, and each reader guessed one for itself —
 * the home, the header and the map took the newest *created* row, the index
 * proposal took the newest *selected* one. With two connected repositories
 * those disagreed, and the home kept showing a repository's old failed
 * backfill while another repository's fresh pair had just succeeded.
 *
 * One rule now, for every reader: the repository the user most recently
 * **selected** leads — `selected_at`, which the connect flow stamps every
 * time a repository is chosen in the picker, re-chosen included. A locally
 * pushed repository is never "selected" (it arrives through `alrescha
 * push`), so it counts by its creation instead; a workspace whose newest act
 * was that push shows that repository, as before.
 *
 * This is a selection contract, not a selector. Choosing a repository in the
 * connect picker is the existing act that moves it; a dedicated switcher and
 * per-repository routes are OQ-042's open decision.
 */
export interface SelectableRepositoryRow {
  readonly created_at?: string | null;
  readonly selected_at?: string | null;
}

function selectionTime(row: SelectableRepositoryRow): number {
  const at = row.selected_at ?? row.created_at ?? null;
  const parsed = at === null ? Number.NaN : Date.parse(at);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * The repository the screens agree on, or null for an empty workspace. Ties
 * and rows without a usable timestamp keep the caller's order, so a loader
 * that sorts newest-first degrades to what it showed before.
 */
export function currentRepository<Row extends SelectableRepositoryRow>(
  rows: readonly Row[],
): Row | null {
  let current: Row | null = null;
  let currentAt = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const at = selectionTime(row);
    if (current === null || at > currentAt) {
      current = row;
      currentAt = at;
    }
  }
  return current;
}

/** The columns a repository query must carry for `currentRepository`. */
export const REPOSITORY_SELECTION_COLUMNS = "created_at,selected_at";
