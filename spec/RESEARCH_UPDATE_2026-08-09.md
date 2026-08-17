# DocsHub 시장·표준 검증 업데이트 (2026-08-09)

> 기준선: `INTEGRATED_PRODUCT_POSITIONING_RESEARCH_2026-07-28.md` (7/28 조사)
> 방법: 병렬 리서치 에이전트 7건 (웹 1차 출처 검증, 총 250+ 웹 호출). AI 코드리뷰 도구 세부 조사 1건은 세션 한도로 부분 완료.
> 모든 주요 주장에 출처 URL 병기. "미검증" 표기 항목은 외부 자료에 인용 금지.

---

## 1. 핵심 결론 (7/28 대비 무엇이 달라졌나)

1. **[최중요·리스크] ETH 취리히 연구가 DocsHub의 심장을 겨눈다.**
   _"Evaluating AGENTS.md"_ (2026-02, [arXiv 2602.11988](https://arxiv.org/abs/2602.11988)): 컨텍스트 파일(AGENTS.md 등)은 **작업 성공률을 개선하지 못하면서 추론 비용을 평균 20%+ 올린다**. LLM이 자동 생성한 파일은 성공률을 오히려 2–3% 낮춤. 반면 SkillsBench([arXiv 2602.12670](https://arxiv.org/abs/2602.12670))는 **큐레이션된, 필요 시 로드(load-on-demand)되는 지식은 +16.6pp 개선**을 보임(단 SW 엔지니어링 도메인은 +4.5pp로 최약).
   → **"항상 로드되는 정적 문서"는 근거-부정, "작고·비추론가능(non-inferable)·주문형 로드"는 근거-긍정.** DocsHub의 컨텍스트 허브는 후자로 설계해야 함. Anthropic 공식 독트린("smallest set of high-signal tokens", progressive disclosure)과도 일치.

2. **[기회] 축 4 (스펙-투-프루프 / 보증)는 여전히 가장 하얀 공간.**
   조사한 21개 제품 중 **requirement→implementation→test를 커밋 단위로 추적하는 제품은 없음**. 가장 가까운 것도 생성 시점 검증(Kiro automated reasoning)이나 PR 리뷰(Entelligence)뿐. Tessl이 $125M을 모은 것이 이 방향 지불의사의 최대 증거. 8월 결정(허브+보증 포지셔닝)과 정합.

3. **[기회] 축 3의 "분석 레이어"(충돌 감지 + 토큰 오버헤드 + 어디서 뭐가 활성화됐나)는 비어 있음 — 단, 배포와 보안은 이미 플랫폼이 먹었다.**
   - 배포(레지스트리): skills.sh(Vercel), Smithery(→ Arcade.dev 인수, ~8/5), 공식 Claude 플러그인 마켓플레이스 → **커머디티**.
   - 보안 스캔: Snyk(skills.sh 설치 시 전수 스캔), **Anthropic 자체 스킬 보안 스캔 (Enterprise 베타, 8/6 출시)** → 주도 불가, 편승 대상.
   - 남은 공백: 조직/프로젝트 횡단 스킬 인벤토리·충돌·토큰 계정. 경쟁자는 수백-스타 OSS CLI뿐(agnix 376★, AgentLinter — 인디 프로젝트지만 기능적으로 가장 유사: 토큰 추정 + 설정 파일 간 모순 감지).

4. **[위협] 퍼스트파티 흡수가 가속.**
   - Claude Code: 자동 메모리(MEMORY.md) 기본 켜짐, `.claude/rules/` 경로 스코프, `/import`(Cursor/Copilot/Devin/AGENTS.md 설정 이관), `/doctor`의 CLAUDE.md 트림 제안, 플러그인 "Context cost" 표시 + 미사용 플러그인 감지.
   - Google Antigravity 2.0: **지식 베이스가 코어 프리미티브** (에이전트가 읽고 쓰는) — 컨텍스트 허브의 가장 가까운 퍼스트파티 경쟁자.
   - Codex: Cursor 스킬 임포트 + Claude/Cursor 대화 동기화 — 크로스툴 설정 동기화도 퍼스트파티 전장이 됨.
   - 선례: Anthropic은 서드파티 하네스의 구독 인증을 서버 측에서 차단한 적 있음(1월, 4월).
     → 방어선은 **크로스 벤더 · 팀 공유 · 그래프 구조 · 검증 가능한 출처(provenance)** — 단일 벤더가 구조적으로 못 하는 것들.

5. **[표준] 지금 6주 사이에 기반이 굳었다 — 안전하게 올라탈 것.**
   - **MCP 2026-07-28 스펙 확정** (역대 최대 개정: stateless 코어, Sampling/Roots/Logging 폐기 12개월 시계, tasks 확장, 캐시 가능한 리스트). DocsHub MCP 서버는 처음부터 이 모델로.
   - **Agent Plugins 1.0 (8/6 출시)**: OpenAI·MS·Amazon·Cursor·Vercel·Google 공동 — 스킬+MCP를 하나로 묶는 벤더 중립 패키지. **DocsHub의 배포 컨테이너로 채택 권장** (스킬 매니페스트 논의 #210은 정체).
   - SKILL.md + `.agents/skills/` 디렉토리: 44개 클라이언트 지원, 수개월째 형식 안정 → 안전한 기반.
   - AGENTS.md: 형식은 동결 수준으로 안정(3월 이후 커밋 0), Linux Foundation AAIF 관할. Claude Code는 여전히 비네이티브(래퍼 필요).
   - 증거 영수증(evidence receipts): **in-toto attestation + Sigstore 서명 + OTel GenAI 트레이스**(MCP가 `_meta`로 전파 공식화) 조합이 표준 스택. Cursor의 **Agent Trace**(코드 범위↔에이전트 대화 매핑, Thoughtworks Radar 등재)와의 브리지는 아무도 안 만듦 → 방어 가능한 기능. SLSA는 에이전트 시맨틱을 명시적으로 보류 → 표준 공백.

---

## 2. 5개 축별 경쟁 판정 (21개 제품 조사 종합)

| 축                          | 판정       | 주요 경쟁                                                                                                                                                    | 비고                                                                                              |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| ① 컨텍스트 허브 (MCP 서빙)  | **혼잡**   | Claude Code 네이티브, Antigravity KB, DeepWiki(무료·400K레포 은행 사례), ByteRover(큐레이션 컨텍스트 트리, $15/mo), SpecStory, Ref.tools(Plans 피벗), Pieces | 차별화 = 팀 저작 스펙/ADR의 **큐레이션·수명주기 관리**(staleness·소유권·리뷰) — 이건 아무도 안 함 |
| ② 그래프 뷰 (docs↔code↔req) | **무경쟁** | 인접: DeepWiki 다이어그램, Hamster "Context Graph"(문서↔태스크, 코드 제외), OKF 시맨틱 모델 워크스트림(8월 신규)                                             | 단독으론 기능이지 해자 아님. 리드 축의 UI로 활용                                                  |
| ③ 스킬 레지스트리+분석      | **양분**   | 배포·보안: 플랫폼이 점유(Tessl $125M, Snyk, Anthropic 자체) / **분석(충돌·토큰·인벤토리): 공백** (agnix, AgentLinter 등 인디뿐)                              | 분석 레이어만 공략                                                                                |
| ④ 보증 (스펙-투-프루프)     | **공백**   | 인접: Kiro(생성 시점 검증), BMAD Loop, Entelligence(PR 리뷰+메트릭), Prelint(기획-코드 드리프트 PR 리뷰, PH 1위)                                             | 최대 기회. Tessl $125M이 WTP 증거                                                                 |
| ⑤ 진행 대시보드             | **격전**   | Entelligence Agent Insights, Devin Command Center(Kanban), Charlie Daemons, Amp 멀티플레이어 orbs, Taskmaster/Hamster, Traycer                               | 단독 승부 비추천. 부수 기능으로                                                                   |

### 신규 등장 경쟁자 (7/28 이후 확인)

- **Alignbase** — 회사 단위 AGENTS.md 관리 SaaS (축① 직접 경쟁)
- **Reporails** — 에이전트 지시문 진단 (축③ 분석)
- **Prelint** — 기획-코드 드리프트 PR 리뷰, Product Hunt 1위 (축④)
- **OpenSpec** — 64.3k★ / GitHub **Spec Kit** 125.9k★, 스킬 기본 설치로 전환(8/5)
- **Google OKF v0.2** (7/24 신뢰 시그널: provenance·trust tier·stale_after) + 8월 프로퍼티-그래프 워크스트림 — 수용은 미미(HN 반응 냉담)하나 방향이 DocsHub 지식그래프와 정면 중첩. **임포트/익스포트 포맷으로만 지원, 내부 모델 결합 금지**
- 구조 변화: Windsurf → Devin Desktop 흡수(자동 메모리 폐기, Skills로 이행 권고), Task Master → Hamster 산하, Traycer 오픈소스 데스크톱 피벗, Smithery → Arcade.dev 인수

---

## 3. 전제 검증 (P1–P5)

| 전제                                                        | 판정                            | 핵심 근거                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 고통은 실재 (컨텍스트 손실·지시 무시·토큰 비용·드리프트) | **강한 지지**                   | SO 2025: 66% "거의 맞지만 틀린 AI"가 최대 불만; CLAUDE.md 무시 카나리아 테스트("Mr Tinkleberry")가 커뮤니티 관행; claude-mem 46K+★; Mintlify 문서 트래픽의 45.3%가 AI 에이전트 |
| P2 구조화된 문서가 성과 개선                                | **혼재 — 최대 리스크**          | 반증: ETH 연구(위 1절). 지지: SkillsBench, Anthropic 컨텍스트 관리 evals(토큰 -84%/성능 +39%), Spec Kit 성장. → 설계로 회피 가능하나 **정면 돌파 불가**                        |
| P3 시장 규모·성장                                           | **강한 지지**                   | Anthropic $47B 런레이트(5월 공식), Claude Code 단독 >$2.5B, Cursor ~$4B 추정, Copilot 유료 470만                                                                               |
| P4 지불의사                                                 | **지지 (팀/엔터프라이즈 편중)** | Tessl $125M, Mem0 $24M, Context7 엔터프라이즈화. **단, 이 카테고리 트랙션 1위 도구는 전부 무료** (claude-mem, Spec Kit, Context7 기본, DeepWiki) — 개인 유료화는 미증명        |
| P5 플랫폼 흡수·묘지                                         | **지지 — 최대 전략 위협**       | Swimm(문서-코드 동기화 → 메인프레임 피벗), Mutable.ai(→Google 인수 후 종료), CodeSee(→GitKraken 매각). 퍼스트파티 흡수 목록은 1절 4항                                          |

### 5대 리스크와 저비용 실험 (검증 에이전트 제안 요약)

1. **R1 코어 메커니즘 (ETH)**: 비공개 레포 3곳에서 미니 AGENTbench 재현 — 큐레이션 컨텍스트 유/무로 15–20개 실작업 성공률+토큰 측정 (~1주)
2. **R2 퍼스트파티 흡수**: 자동 메모리 출시 _이후_ claude-mem 설치한 헤비유저 15명 인터뷰 — 네이티브가 못 하는 것이 크로스툴·팀 공유·거버넌스로 수렴하는지 확인
3. **R3 무료 중력**: 팀 대상 fake-door 가격 테스트 ("에이전트 3종 횡단 드리프트 검증 $X/seat") — 광고비 <$500, 2주
4. **R4 제품 형태 (외투 속 4개 제품)**: **보증 1개 결과만 컨시어지 판매** — CI 게이트 "머지된 코드가 스펙/문서와 어긋나면 플래그", 3팀 수동 파일럿 4주, 2팀 잔존+1팀 지불의사면 통과
5. **R5 ROI 입증 불가**: 파일럿 첫날부터 측정 내장 — 작업당 토큰, 재생성 횟수, 지시 준수 카나리아의 전후 대시보드

---

## 4. 가격 전략 (조사 결론)

- **$20/mo는 솔로 개발 AI 도구의 예약석** (Cursor·Copilot·Claude·Kiro·Devin·Factory·Warp·Amp 전부 $20 앵커). 팀 카드결제 천장은 ~$300/mo 플랫 (SpecStory Team).
- **로컬 코어는 영원히 무료** (Obsidian·Zed·Raycast·SpecStory 패턴). 유료화 대상: 서버 상태(동기화·히스토리), 퍼블리싱, 멀티플레이어, 호스팅 분석.
- **크레딧은 달러 페그 + 공개 단가 + 라이브 미터 + 기본 상한** — 추상 단위 이중화(Kiro)·"unlimited+숨은 스로틀"(Cursor)·사후 과금(Replit)은 2025년 3대 백래시.
- **히스토리/메모리 깊이는 검증된 저저항 페이월** (Pieces 9개월 메모리, Notion 히스토리 일수). 팀 전환 트리거는 컴퓨트가 아니라 **공유 그래프+드리프트 대시보드+스킬 라이브러리**.
- 권장 출발점 (Option 2, "SpecStory 패턴"): Free(레포 1개·크레딧 50) / **Pro $20**(무제한 레포·달러 페그 크레딧·무제한 히스토리·토큰 절감 분석) / **Team $35/user 또는 $300 플랫**(풀 크레딧·공유 그래프·드리프트 대시보드·SSO는 모듈 애드온). 상세 대안 2종은 가격 조사 원문 참고.
- 미래 마켓플레이스 수익 배분: 개발자 대상 85/15 (JetBrains 기준)가 최저선.

---

## 5. 표준 채택 지침 (빌드 시 준수)

| 기반                         | 상태             | 지침                                                                                                                                                                       |
| ---------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SKILL.md + `.agents/skills/` | 안전             | 스킬 매니저 기질. `skills-ref`로 검증                                                                                                                                      |
| Agent Plugins 1.0 (8/6)      | 신규·유력        | 배포 컨테이너로 채택 (Codex/ChatGPT/VS Code/Copilot/Cursor 도달)                                                                                                           |
| MCP 2026-07-28               | 안전 (이행기)    | stateless 코어로 신규 구축. Sampling/Roots/Logging 사용 금지. `ttlMs` 캐시 리스트 활용. **SEP-2640(Skills over MCP)** 추적 — 병합 시 컨텍스트 서버+스킬 배포가 단일 채널로 |
| AGENTS.md                    | 매우 안전 (동결) | 정본 산출물. Claude Code용 `@AGENTS.md` 래퍼 자동 생성 필수                                                                                                                |
| 증거 영수증                  | 공백 = 기회      | in-toto(runtime-trace/scai) + Sigstore + OTel GenAI + **Agent Trace 브리지**. MCP SEP-3004/2809/3140 참여 고려                                                             |
| llms.txt                     | 부정 평결        | 전략 아님. 코딩 에이전트용 저가 익스포트로만                                                                                                                               |
| OKF                          | 변동             | 임포트/익스포트만, 내부 모델 비결합                                                                                                                                        |

---

## 6. 미검증·주의 항목 (외부 인용 금지)

- Cursor-SpaceX 딜, "Claude Code $8B/점유율 54%", *Kahn v. Anthropic* 소송, "$285B Cowork 셀오프" — 전부 2차/애그리게이터 출처
- Stenography/Denigma 종료 여부, SpecStory 라운드 규모, Replit 현재 ARR
- Cursor Memories 제거의 1차 출처 확인, CodeGraph 스타 수(출처 간 32k–47k 상충)
- "Opus 4.8 무한 컨텍스트" 소문 — Anthropic 1차 출처 없음, 허위 취급
- DORA 2026·SO 2026 결과는 가을 발표 — 그때 재확인

## 7. 부분 완료

- AI 코드리뷰 도구 세부(Baz 가격, Cubic/Recurse ML 펀딩, Greptile 최신) — 에이전트 세션 한도로 중단. 단 CodeRabbit($24)·Greptile($30)·Qodo($30)·Graphite($20–40) 가격은 가격 조사에서 확보됨.
