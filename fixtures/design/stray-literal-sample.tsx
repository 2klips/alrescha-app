/**
 * Positive control for `tests/korean-strings.test.ts` (Phase 2A todo 8).
 *
 * The string-centralization detector used to prove itself against the backlog
 * of unconverted screens. Todo 8 emptied that backlog, so the control lives
 * here instead: a file that deliberately inlines user-facing copy the way a
 * screen must not. It is a fixture, never imported by the app.
 */

export function StrayLiteralSample() {
  return (
    <section aria-label="Deliberate stray label">
      <h1>Deliberate stray heading</h1>
      <input placeholder="Deliberate stray placeholder" />
    </section>
  );
}
