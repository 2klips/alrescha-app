# Task 16 evidence — context packs and advisory minimal-index PR

Date: 2026-08-11

## Delivered

- Deterministic graph-driven context composer with task-term scoring, evidence-edge boosts, document-kind precedence, ordered selections, ranked omissions, bounded token estimates, and explicit estimation assumptions.
- Target formatting for Claude Code, Codex, Cursor, and generic agents.
- Hosted MCP `request_context_pack` now composes from indexed document artifacts on demand and returns `readingOrder`, `omitted`, `assumption`, `targetAgent`, graph node IDs, and formatted text.
- `/app/settings/mcp` context composer for task, target agent, and token budget with reading-order, omission, and formatted-pack output.
- Six-line managed `AGENTS.md` index bounded below 30 lines, marker-only replacement, exact outside-byte preservation, and one-line `CLAUDE.md` `@AGENTS.md` wrapper when absent.
- Advisory PR orchestration port that creates only `specproof/minimal-index-<base-sha>` branches, writes only `AGENTS.md`/`CLAUDE.md`, and opens a reviewable PR. No merge/default-branch operation exists.
- Read-only GitHub source loader for current branch SHA and existing index files. Settings display current/proposed bytes as a diff-only proposal.
- Missing-permission result keeps the diff copyable and performs zero GitHub writes. UI exposes pull-request grant and manual-copy paths.
- Machine guardrail rejects merge/default-branch mutation even inside allowed PR-proposal modules.

## Acceptance evidence

| Criterion | Result |
| --- | --- |
| Fixture task selects expected docs under budget | pass; `AGENTS.md → spec.md → TODO.md`, 247 estimated tokens under 270 |
| Ranked omissions | pass; lower-ranked auth skill and unrelated ADRs carry explicit budget/no-match reasons |
| Target-agent formatting | pass; Claude Code, Codex, Cursor, generic contract cases |
| Correct branch + PR via mocked GitHub | pass; branch `specproof/minimal-index-111111111111`, two proposal-file writes, advisory PR #42 |
| Byte-idempotent regeneration | pass; second full proposal generation yields zero changed files and identical managed bytes |
| Marker isolation | pass; prefix/suffix bytes remain exact and malformed/duplicate markers fail closed |
| No document-body static inlining | pass; minimal-index API accepts only endpoints and existing index-file bytes; guardrail remains clean |
| No direct commit/merge path | pass; runtime calls always receive proposal branch; static guard rejects merge/default-branch methods |
| Missing `pull_requests:write` | pass; zero branch/file/PR calls and copyable `permission_required` result |

## QA scenarios

| Scenario | Result |
| --- | --- |
| Settings context-pack surface | pass; component contract renders task/agent/budget controls and result structures |
| Settings diff-only index proposal | pass; component contract renders current/proposed `AGENTS.md` bytes and optional `CLAUDE.md` wrapper |
| Missing PR permission | pass; grant link and `Copy files manually` path visible |
| In-app Browser on `/app/settings/mcp` | blocked by local prerequisite; route emitted `Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, empty DOM, and no screenshot/interaction claim was made |

## GitHub permission prerequisite

GitHub's official APIs require Pull requests(write) to create a PR, while creating the proposal branch and changing `AGENTS.md`/`CLAUDE.md` requires Contents(write). The locked profile currently permits Contents(read) plus optional Pull requests(write), so production writes remain disabled and return the safe diff-copy fallback. Mock-boundary PR orchestration is fully tested. Resolution is tracked in `spec/OPEN_QUESTIONS.md` as OQ-001.

Sources: [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents), [GitHub pull requests API](https://docs.github.com/en/rest/pulls/pulls), [Git references API](https://docs.github.com/en/enterprise-cloud@latest/rest/git/refs?apiVersion=2026-03-10).

## Verification commands

| Command | Result |
| --- | --- |
| `pnpm test` | pass; 30 files, 138 tests |
| `pnpm lint` | pass; zero warnings |
| `pnpm typecheck` | pass; root and all workspace packages |
| `pnpm build` | pass; Core, MCP, Worker, and Next.js `/app/settings/mcp` production build |
| `git diff --check` | pass |
