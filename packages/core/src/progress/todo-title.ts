/**
 * One title, written six ways (Phase 4 Wave D todo 21).
 *
 * The scan reads a checkbox out of a document as `- [ ] 3. Wire the CI
 * evidence source.` and an agent calls `log_progress({task: "wire the ci
 * evidence source"})`. Those are the same piece of work, and until now they
 * became two todos: the matcher only knew the exact id and the key it had
 * minted itself, so a scanned todo could never be the one an agent updated.
 *
 * Normalising is what closes that, and it has to be **the same rule in two
 * languages** — `public.normalize_todo_title` is the SQL half, and
 * `tests/progress-attribution.test.ts` runs both over the same strings in a
 * real database rather than trusting that they agree.
 *
 * What it removes is only ever *decoration*: list markers, checkboxes,
 * ordinals, trailing punctuation, case and repeated whitespace. It never
 * removes a word, because two different tasks that differ by one word must
 * stay two tasks.
 */

/** Leading `-`/`*`/`+` bullet, optional `[ ]`/`[x]` checkbox, optional `1.`. */
const DECORATION =
  /^\s*(?:[-*+]\s*)?(?:\[[\sxX]?\]\s*)?(?:\d+[.)]\s*)?(?:[-*+]\s*)?/;

/** Trailing sentence punctuation. A period is not part of a task name. */
const TRAILING = /[.,;:!?\s]+$/;

export function normalizeTodoTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(DECORATION, "")
    .replace(TRAILING, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}
