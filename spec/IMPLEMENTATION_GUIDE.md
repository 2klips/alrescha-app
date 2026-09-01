# SpecProof 구현 가이드 (Implementation Guide)

**대상:** 이 프로젝트를 구현하는 코딩 전용 AI 에이전트 (그리고 그 에이전트를 운영하는 사용자)
**버전:** 1.0 (2026-08-09, ADR-007)

> **에이전트: 이 문서를 가장 먼저 읽어라.** 그다음 [WORK_SPEC.md](WORK_SPEC.md)(규범) → [BUILD_PLAN.md](BUILD_PLAN.md)(실행 순서). 충돌 시 우선순위: [DECISIONS-ADR.md](DECISIONS-ADR.md) = WORK_SPEC > BUILD_PLAN > 이 가이드.

---

## 1. 레포 구조 (ADR-007)

| 레포                  | 역할                            | 규칙                                                      |
| --------------------- | ------------------------------- | --------------------------------------------------------- |
| `2klips/alrescha-app` | **구현 레포 — 여기서 코딩한다** | 모든 코드·테스트·evidence는 여기에. `spec/`은 구현 기준본 |
| `2klips/arr`          | 기획·홍보 (사이트 + spec 원본)  | 코드 넣지 말 것. GitHub Pages가 루트를 사용 중            |

기획 변경은 specproof에서 결정된 후 specproof-app/spec으로 동기화된다. **에이전트는 spec/ 문서를 임의로 수정하지 않는다** — 모순·불명확을 발견하면 코드 대신 `spec/OPEN_QUESTIONS.md`에 기록하고 합리적 기본값으로 진행한다.

## 2. 사전 준비물 체크리스트 (사람이 할 일)

에이전트가 대신 만들 수 없는 것들. **단계별로 필요하니 처음부터 다 갖출 필요 없다.**

### Phase A — 지금 당장: 아무것도 필요 없음

Wave 0–2 전체와 Wave 3 대부분은 **픽스처 기반 오프라인**으로 개발·테스트된다 (BUILD_PLAN todo 3의 녹화된 GitHub API/webhook 픽스처). 로컬 도구만 있으면 된다: Node LTS(≥22), pnpm, Docker(로컬 Supabase용), supabase CLI.

### Phase B — Wave 1 실기 검증 전 (todo 6를 실제 GitHub과 연결해 볼 때)

- [ ] **GitHub App 등록** (사용자 계정 → Settings → Developer settings → GitHub Apps → New):
  - Permissions: `contents:read`, `checks:read`, `actions:read`, `metadata:read` (+ 선택 `pull_requests:write`)
  - Subscribe to events: `push`, `check_run`, `workflow_run`, `installation`
  - Webhook URL: 개발 중엔 `smee.io` 채널 또는 터널(cloudflared) 주소
  - 발급물을 `.env`로: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- [ ] (로컬 Supabase로 충분하므로 클라우드 Supabase는 아직 불필요)

### Phase C — Wave 4 (AI 판단·MCP 실사용)

- [ ] AI API 키 1개 이상: `ANTHROPIC_API_KEY` (기본) / `OPENAI_API_KEY` (선택)
- [ ] MCP 실사용 테스트용 에이전트 환경 (Claude Code 등)

### Phase D — Wave 5 (벤치마크·배포)

- [ ] 벤치마크 실행 예산 승인 (실제 모델 호출 비용 발생 — todo 20)
- [ ] Supabase 클라우드 프로젝트 (프로덕션 DB/Auth)
- [ ] 배포 계정: Vercel(web) + Fly.io(worker/MCP) — ADR-007 기본값, 변경 가능
- [ ] 프로덕션 webhook URL·MCP 엔드포인트 도메인

**에이전트 규칙:** 위 준비물이 없어서 막히면 — 실기 연동 부분만 mocked/skipped로 표시하고 다음 할일로 진행하라. 준비물이 필요해진 시점에 사용자에게 Phase 단위로 요청하라 (개별 키를 하나씩 조르지 말 것).

## 3. 재량 결정 기본값 (ADR-007 — 다른 지시 없으면 이대로)

| 항목          | 기본값                                                                                                                                                  | 비고                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 모노레포      | pnpm workspace: `apps/web`(Next.js App Router), `apps/worker`, `packages/core`, `packages/mcp`                                                          | core는 DB 비의존 순수 엔진                                |
| 그래프 렌더러 | graphology + d3-force(Web Worker) + Pixi.js v8 — 2026-08-14 그래프 조사로 확정 (React Flow는 힘 그래프 부적합 판명, spec/RESEARCH_GRAPH_DATABRAIN 참조) | 전환 시 사유를 evidence에 기록                            |
| 실시간 채널   | Supabase Realtime broadcast (워크스페이스별 채널)                                                                                                       | RLS와 채널 인가 필수                                      |
| 잡 큐         | Postgres 자체 구현 — `SELECT ... FOR UPDATE SKIP LOCKED` 클레임 + heartbeat 컬럼                                                                        | 외부 큐 서비스 금지 (todo 7 수용 기준이 세부 동작을 요구) |
| Markdown 파서 | remark/unified 계열                                                                                                                                     | WORK_SPEC §8                                              |
| 심볼 추출     | ts/js = TypeScript Compiler API, 그 외 = 정규식 프로브 + confidence 강등                                                                                | tree-sitter는 선택 최적화                                 |
| 토크나이저    | tiktoken cl100k 기준, 출력에 가정 명시                                                                                                                  | 거짓 정밀도 금지                                          |
| AI 판단 모델  | `claude-sonnet-5` (Anthropic 어댑터)                                                                                                                    | provider 추상화 뒤에서만 사용                             |
| 인증          | Supabase Auth, GitHub OAuth 프로바이더                                                                                                                  |                                                           |
| 개발 환경     | 로컬: `supabase start` + `pnpm dev`                                                                                                                     | 클라우드는 Phase D                                        |
| 테스트        | vitest + Playwright(chromium)                                                                                                                           |                                                           |
| 코드 스타일   | TypeScript strict, ESLint + Prettier 기본 프리셋                                                                                                        | 별도 논쟁 금지                                            |

## 4. 세션 운영법 (사용자용 + 에이전트용)

이 프로젝트는 XL(22개 할일)이므로 **한 세션에 한 웨이브**(집중도가 필요하면 2–3개 할일)만 진행한다.

### 세션 시작 프롬프트 템플릿 (사용자가 복사해서 사용)

```
specproof-app 레포에서 SpecProof 구현을 이어간다.
1. spec/IMPLEMENTATION_GUIDE.md → spec/WORK_SPEC.md(규범·가드레일) → spec/BUILD_PLAN.md를 읽어라.
2. BUILD_PLAN의 체크박스를 보고 완료된 할일을 파악하라. (git log와 .omo/evidence/도 참조)
3. 이번 세션 범위: Wave {N} (할일 {a}, {b}, {c}).
4. 각 할일은 수용 기준을 테스트로 통과시켜야 완료다. 완료 시 BUILD_PLAN 체크박스를 갱신하고,
   evidence 파일을 기록하고, 할일당 1커밋 한다.
5. 막히면: 외부 준비물 문제면 mocked로 우회하고 보고, 스펙 모순이면 spec/OPEN_QUESTIONS.md에 기록 후
   합리적 기본값으로 진행하라.
```

### 세션 종료 시 (에이전트 의무)

1. `pnpm lint && pnpm typecheck && pnpm test` 전체 green 확인 — 실패 상태로 세션을 끝내지 않는다.
2. BUILD_PLAN 체크박스 + evidence 파일 갱신 커밋.
3. 마지막 메시지에 보고: 완료 할일 / 미완·우회 사항 / OPEN_QUESTIONS 신규 항목 / 다음 세션 권장 범위 / 필요해진 준비물(Phase). 보고는 **"다음 컨텍스트가 행동하는 데 필요한 것"을 우선**하라 — 완료 기록은 git으로 복구 가능하니 방향·다음 행동·미해결 판단을 앞세운다.

### 웨이브 경계 검증 (사용자)

각 웨이브 완료 후 사용자는: 테스트 통과 확인 → 해당 웨이브의 QA 시나리오 중 1–2개를 직접 눈으로 확인(Wave 3부터는 화면) → 이상 없으면 다음 웨이브 지시.

## 5. 품질 계약 (요약 — 전문은 WORK_SPEC §3)

에이전트가 세션마다 기억해야 할 최소 계약:

1. `verified`는 실행 증거만. AI 추론은 언제나 `inferred`.
2. 모든 엣지·발견은 provenance(span 또는 사유) 필수 — DB와 zod 양쪽에서 강제.
3. 원본 코드 본문 저장 금지 (일시 fetch 후 폐기).
4. 레포 쓰기는 인덱스 PR 제안 하나뿐.
5. AGENTS.md/CLAUDE.md에 문서 본문 인라인 금지 (≤30줄 관리 섹션만).
6. MCP는 2026-07-28 stateless — Sampling/Roots/Logging/세션 사용 금지.
7. 실패·스키마 불일치에 과금 금지, 이중 과금 금지.
8. 측정 없는 효율 숫자 금지 — 가정 명시, 부족하면 "증거 부족".
9. 테스트를 약화시켜 green을 만들지 않는다.
10. 진척 기록은 구조화 1콜(≤150 토큰 목표) — 서술형 일지·매 턴 리마인더 금지.

## 6. Wave 0 첫 세션의 정확한 시작점

```
Wave 0 = todo 1 (모노레포 부트스트랩) + todo 2 (ADR 이식·가드레일 테스트) + todo 3 (drifted-demo 픽스처).
todo 1의 수용 기준: pnpm lint / typecheck / test / playwright --list 전부 통과.
spec/의 ADR을 docs/adr/로 이식하는 것이 todo 2다 — spec/ 원본은 건드리지 않는다.
```

이 가이드에 없는 것은 BUILD_PLAN의 해당 할일 명세가 정답이다. 행운을.
