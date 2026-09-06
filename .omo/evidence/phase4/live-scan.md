# Phase 4 — the first live GitHub scan, and what it measured

**Date:** 2026-09-06 · **Gate:** G2 opened this session (App private key and
client secret supplied by the user; nothing was written to the repository).

Every Phase 4 todo note since Wave C has carried the same line: "G2 미개통이라
실기 0회". It is no longer true. `2klips/alrescha-app` has been scanned and
analysed through the production path — installation token, GitHub Contents
API, `apply_repository_scan`, the analyze job — against the local Supabase.

## The credential path, verified before anything else

- `githubAppEnvironment()` loads all six variables; the one-line
  `GITHUB_APP_PRIVATE_KEY` restores to a **27-line PEM**.
- `GET /app` → **200**, `app=arr-dev-2klips id=4636260 owner=2klips`.
- One installation (`154681535`, account `2klips`, `selected`), two
  repositories: `2klips/alrescha-app` (public) and
  `2klips/LostArk_Scheduler` (private).
- Installation tokens mint and are scoped to the single repository the job
  names — the connect screen's promise, checked against the API rather than
  against the copy.

## The scan — `2klips/alrescha-app` @ `24db8241`

`enqueue_backfill_scan` (todo 16) → `scan` job, **0 credits**, worker ran it
once: `scan @24db824 full → 714 rows`.

| nodes | | edges | | totals | |
|---|---|---|---|---|---|
| artifact | 711 | references | 1,369 | nodes | 1,130 |
| directory | 141 | imports | 1,086 | edges | 4,597 |
| db_object | 102 | contains | 829 | index entries | 711 |
| rationale | 86 | calls | 548 | routes | 42 |
| section | 48 | tests | 324 | db_objects | 102 |
| route | 42 | queries | 149 | sections | 48 |

Edge families: structure 1,720 · doc 1,225 · hierarchy 829 · database 384 ·
evidence 324 · route 115 — **all six that this scan can produce, present**.

Against the plan's density targets:

- **평균 차수 8.14** (목표 ≥3) ✓
- **고아 4.6%** (목표 ≤10%) ✓ — 45 of 989 non-directory nodes. The raw
  number over *all* nodes is 16.5%, and that figure is wrong to quote: the
  141 directory nodes are `layoutOnly` and carry nothing but `contains` by
  design, so counting them as orphans measures the design, not the graph.

Analyze then produced **99 requirements** and **132 findings**
(untested-code 102 · stale-doc 16 · missing-implementation 8 ·
unproven-claim 3 · orphan-doc 3) and **1 receipt** at `24db8241`.

## The number that is worth staring at: `implements` = 1

99 requirements, **one** `implements` edge (`method: symbol-owner`).

D6 said requirement coverage was a false 0% because nothing wrote
`implements`; todo 1 built the writer. The writer works — it is not zero any
more — but on a real repository it matched **once in ninety-nine**. Coverage
would render as ~1%, which is honest and nearly useless. Whether that is the
matcher being too strict or this repository genuinely not naming its
requirements in symbols is the next question, and it is now a question with a
number attached instead of a guess.

## Dug out: why that number is 1 (same session)

Full write-up in **OQ-064**. Everything below is measured on this scan.

- The **owner map is healthy** — 1,206 of 1,218 unique exported names have an
  unambiguous owner. Ambiguity is not the bottleneck.
- The **matcher saw a third of the vocabulary**: camelCase only, against
  camelCase 541 / PascalCase 899 / UPPER_SNAKE 262. Widened here to take
  PascalCase and UPPER_SNAKE — **net gain on this repository: zero (1 → 1)**,
  reported as measured rather than dressed up. The widening earns its place a
  different way: the first attempt produced a *wrong* edge (the heading
  "Theme toggle and persistence" linked to the exported type `Theme`), so
  bare PascalCase now needs two humps. Backticks cannot be the signal at all
  — the markdown parse renders inline code to plain text, and 1 of 99
  statements still holds a backtick, unbalanced.
- The **cause is the corpus**. 60 of 99 statements are Korean prose, 11
  contain any camelCase token, and **0 carry a `REQ-…` code** — so the
  tested-requirement path can never fire either. The requirements come from
  `BUILD_PLAN.md` (29), `PHASE2B` (15), `PHASE3` (15), `PHASE2C` (11),
  `PHASE2A_UI` (10), `IMPLEMENTATION_GUIDE` (8) … and **2 from
  `WORK_SPEC.md`**. Every file under `spec/` is classified `spec`, so the
  extractor mines build plans, research memos and review notes for
  requirements.
- The one surviving edge is itself noise: its statement is
  "5. 실기 파일럿: install → push → 카드 → receipt (2026-08-31 완료 …)" — a
  checklist item that happens to contain an identifier. **Meaningful
  coverage is 0 of 99, not 1 of 99.**

Nothing was reclassified. That is a Wave A change with density-fixture
consequences and it is the user's call (OQ-064 ⑴, same shape as OQ-041).

## `verified` is still unreachable, and the reason is not the product

Todo 18 wired CI evidence and the run path executes — but **evidence = 0** on
both repositories, for two different reasons, and neither is a defect here:

- `2klips/alrescha-app`: **0 workflows, 0 Actions runs.** There is no CI to
  read.
- `2klips/LostArk_Scheduler`: **248 runs, workflow "CI", all succeeding** —
  and every run uploads **0 artifacts**. Todo 18 reads junit/lcov/istanbul
  reports from a run's *artifacts*, so there is nothing to ingest. Checked
  the three most recent runs directly: `artifacts=0` on each.

So the honest state of D12 is: the ingest is built and runs, and the pilot
repositories cannot exercise it. **One CI change on either repository closes
it** — an `actions/upload-artifact` step publishing the test report.

## Not covered by this run

- **Webhooks.** The App's webhook URL is
  `https://arr-app-web.vercel.app/api/github/webhooks`, so nothing reaches
  this machine. Everything above was driven by enqueueing jobs directly,
  which is what the connect screen would have done after its OAuth leg.
- **enrich.** 0 artifacts carry a summary — the AI pass has not run, so every
  card and excerpt on this repository is still path-and-symbol only (D9).
- **The connect screen itself** (`/app/connect/github`) was not exercised; it
  needs the OAuth redirect and a callback this machine does not serve.
