# Todo 19's screens: the digest and attention list on `/app/progress`, finding detail, dismissal and the dismissed board on `/app/inspection`

## Objective and acceptance

Render what todo 19 ⑵ ⑶ ⑷ already computed (2026-09-06) and give the
dismissal a button. The view models carried `digest`, `attention`,
`InspectionFindingDetail` and the `dismissed` section; no component read
them and `apps/web/app` contained no `dismiss` at all. Acceptance per the
plan: view-model tests, DB tests (already green), Playwright two-theme axe,
the Korean-first sweep, and a live `/app/inspection` run over a real
workspace.

## Starting state and isolation

- Start: `phase4/oq-070-tasks-v4` tip (stacked on PR #19; merges deferred by
  the user), branch `phase4/wave-d-todo-19`.
- Web only. No migration: `dismiss_finding` (security invoker, reason
  required) has existed since `202609060009`.

## What changed

- `app/ui/progress-dashboard.tsx` — two sections after the metrics: the
  digest (today · 최근 7일 · 마지막 방문 이후, each with total, counts and
  up to six refs; a viewer with no visit record gets a sentence, not a zero)
  and the attention list (stale and blocked, oldest first, the blocked
  reason as written or `사유가 기록되지 않았습니다` marked `data-stated`).
  A stale item shows the label and its last change, never English prose.
- `app/ui/inspection-view.tsx` — `FindingDetailBlock` (spans as
  `path:start-end`, confidence beside its grade badge, reason, suggested
  action, evidence nodes) on every finding row that carries stored
  provenance; the `제외한 문제` widget with each dismissal's reason; a
  `Widget` that can say "none" instead of "증거 부족" when emptiness is a
  fact rather than a gap.
- `app/app/(shell)/inspection/actions.ts` — `dismissFinding`: runs the RPC
  as the signed-in member, turns the function's status answers
  (`already-resolved`, `not-found`) into a status line rather than an
  error, and requires the reason before touching the database.
- `app/app/(shell)/inspection/page.tsx` — a reason input and `제외` button
  beside each open finding's judgment control; `?dismiss=` status banner.
- `lib/strings/{inspection,progress}.ts`, `styles/screens/{inspection,progress}.css`,
  `lib/inspection/fixtures.ts` (one dismissed finding in the demo, with
  detail, so the widget and the axe sweep see it).

## Screens touched

`/app/progress` and `/progress` (digest, attention), `/app/inspection` and
`/inspection` (finding detail, dismissed board; dismiss form live only).

## Verification

- vitest: `progress-dashboard.test.tsx` +4, `inspection-view.test.tsx` +3
  (source count 7 → 8 for the new widget); `korean-strings`,
  `alrescha-core-screens` green.
- Playwright: `inspection-dismiss.spec.ts` (new, live: seeded finding →
  detail on screen → reason typed → `?dismiss=done` → in the dismissed board
  with the reason, gone from the open list and the judgment panel, row names
  `dismissed_by`), `inspection.spec.ts` and `progress.spec.ts` extended on
  the demo, `a11y-contrast.spec.ts` and `a11y-keyboard.spec.ts` — numbers in
  the session report.
- `pnpm lint`, `pnpm typecheck`, `git diff --check`.

## Left open

Todo 19 ⑴ (concept summary, module card, concept MCP exposure) — next
commit on this branch. Details in `.omo/evidence/phase4/todo-19.md`.
