# 연구 보고: AI 시대 팀 메트릭 · 프롬프트 로깅 · 기여도 · VIBE Index 초안 (2026-08-14)

> RESEARCH_AGENDA §5 대응 조사 결과 (리서치 에이전트, 웹 1차 출처 검증). 요약 결론:
>
> 1. **DORA가 공식적으로 AI 시대 진입**: 2025 리포트가 "State of AI-assisted Software Development"로 개명, **Rework Rate가 5번째 공식 메트릭** 추가, **AI Capabilities Model 7역량** 발간 — Arr는 "DORA 7역량의 자동 측정 레이어"로 정렬하면 설득 비용이 낮다.
> 2. **개발자 프롬프트를 팀 단위로 점수화·코칭하는 제품은 부재** (SpecStory=저장/재사용, LLMOps=앱 프롬프트 대상) → 명확한 화이트스페이스. 학술 루브릭 **Context/Specificity/Verification** (Verification 신호 = 채택 확률 ~8배, arXiv:2606.19644)이 채점기의 과학적 근거.
> 3. **Cursor Agent Trace(2026.1 RFC)가 귀속 표준 후보** — Arr 영수증과 결합해 "누가 무엇을 지시해 완성시켰나" 최초 지표화 기회.
> 4. **프라이버시 = 채택의 관문**: 메타데이터 우선 · 콜렉터 마스킹 · 관측-인사평가 분리 · 옵트인이 업계 규범 (Claude Code OTel 모델 참조).
> 5. **자가보고 배제**: METR RCT — 체감 +20% vs 실제 -19%. VIBE 전 지표는 로그·커밋·영수증 자동 산출 + Goodhart 검증 A/B 내장.

---

## 1. DORA 현황

- 2025 연례 리포트 개명: **"State of AI-assisted Software Development"** (~5,000명, AI 도입 90%). 핵심: **"AI는 증폭기"** — 개인 산출 급증(작업 완료 +21%, 머지 PR +98%)하나 조직 딜리버리는 정체하는 역설. (https://dora.dev/dora-report-2025/)
- 메트릭 4→5: **Rework Rate(재작업률)** 공식 추가, Reliability는 준메트릭. AI 시대 부작용 데이터(Faros, 22,000명): PR 리뷰 시간 +91~441%, PR당 인시던트 +242.7%. (https://www.faros.ai/blog/key-takeaways-from-the-dora-report-2025)
- **DORA AI Capabilities Model 7역량**: ① AI 스탠스 명문화 ② 건강한 데이터 생태계 ③ AI 접근 가능한 내부 데이터 ④ 강한 버전 관리 ⑤ 소규모 배치 ⑥ 사용자 중심 ⑦ 양질의 내부 플랫폼. (https://dora.dev/ai/capabilities-model/report/) — Arr가 영수증 기반으로 자동 측정 가능한 항목 다수.
- 사실상의 측정 프레임워크: DX Core 4 + AI Measurement(Utilization/Impact/Cost 3차원, Booking.com 3,500명), Faros, Jellyfish, Swarmia(Copilot Metrics API + Cursor Admin API), LinearB. 공통: **단일 지표가 아닌 바스켓 + "사용량→효과→ROI" 단계 도입**.

## 2. 프롬프트 로깅·평가 제품 지형

- **SpecStory** (최인접): Cursor/Claude Code/Codex 대화를 `.specstory/history/*.md`에 **로컬 우선** 저장, git 관리, 팀 스페이스 승격, 히스토리→스킬 가공(Lore). **품질 점수화·코칭 기능은 확인 안 됨 → Arr 공백 기회.** (https://docs.specstory.com/integrations/terminal-coding-agents)
- **Claude Code OTel 텔레메트리** = 팀 로깅 사실상 표준: 옵트인, 토큰·비용·세션·툴 실행을 OTLP 송출. 프라이버시 모범: 메타데이터 우선, 콜렉터 단계 마스킹, 관측-인사평가 분리, RBAC. (https://docs.anthropic.com/en/docs/claude-code/monitoring-usage)
- **Cursor 팀 어드민 분석**: 수락률·Agent Edits·AI 생성 라인·비용, Admin API. LLMOps(LangSmith·PromptLayer)는 "앱 내장 프롬프트" 대상 — 개발자 프롬프트 팀 점수화는 부재.
- 프라이버시 3층: 옵트인 텔레메트리 / 로컬 우선+선택 동기화 / 메타데이터 집계+콘텐츠 마스킹.

## 3. AI 시대 기여도 측정

- 개발자 66% "현행 지표가 기여 반영 못 함"(2차 출처). LOC는 무의미화. **METR RCT**: AI 사용 시 실제 -19% 느려졌으나 체감 +20% — 자가보고 위험의 결정적 근거. (https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- **Agent Trace (Cursor, 2026.1 RFC v0.1.0)**: 코드 라인↔대화·기여자 귀속 오픈 포맷, Thoughtworks Radar 등재. Arr 영수증과 자연 결합 → "Agent Trace 네이티브 검증 계층" 포지셔닝. (https://github.com/cursor/agent-trace)
- 실무: 멀티 시그널 AI 비율 산출(코드 패턴+커밋 태그+텔레메트리), 리뷰가 새 병목(리뷰 시간 +91~441%) → **"누가 AI 산출물을 끝까지 검증해 완성시켰나(directed-to-completion)"가 기여의 실체**. 이를 직접 지표화한 제품 없음. 학술: "전문가는 vibe하지 않고 control한다" (arXiv:2512.14012).

## 4. 프롬프트 품질 기준

- **핵심 학술 근거** (arXiv:2606.19644, 265개 실제 상호작용): 품질 3차원 0-2점 루브릭 — **Context**(기술 아티팩트 근거)·**Specificity**(목표·범위·제약)·**Verification**(수용 기준·테스트·기대 동작). **Verification은 채택 확률 ~8배.**
- CHI 2026 (ETH, N=100): vibe coding 수행력 = CS 성취도(r=.39) + **글쓰기 능력(r=.29)** 독립 예측. LLM 사용 빈도≠역량.
- 벤더: Anthropic(컨텍스트 관리 최우선·계획 먼저·Writer/Reviewer 분리), OpenAI(정지 조건·과잉 프롬프트 제거 — 프롬프트 다이어트만으로 평가 +10~15% 벤더 주장), GitHub Spec Kit(수용 기준 = 능동 품질 게이트).
- **Arr 코칭 루브릭 초안 (6축 × 0-2점)**: ① 컨텍스트 근거 ② 과업 구체성 ③ **검증 가능성** ④ 배치 크기 ⑤ 정지 조건/완료 정의 ⑥ 과잉 지시 없음.

## 5. VIBE Index 초안 (7개 후보)

설계 원칙: 자가보고 배제 · 영수증/커밋/프롬프트 로그 자동 산출 · 지표별 Goodhart 방어 명시.

| #   | 지표                          | 정의                                                      | 소스                 | Goodhart 리스크 → 방어                      |
| --- | ----------------------------- | --------------------------------------------------------- | -------------------- | ------------------------------------------- |
| V1  | **PSQ** (Prompt Spec Quality) | 세션 첫 프롬프트의 6축 루브릭 점수(LLM 채점)              | 프롬프트 로그        | 형식 키워드 삽입 → 실질 채점 + V3 교차 검증 |
| V2  | **재작업률**                  | 30일 내 AI 코드 revert/재수정 비율 (DORA 5호의 개인/팀판) | 커밋 + Agent Trace   | 새 커밋 덮어쓰기 → 라인 churn·AST 유사도    |
| V3  | **1회 완수율**                | 교정 개입 없이 수용 기준 통과한 세션 비율                 | 영수증 + 세션 로그   | 느슨한 기준 → V1 Verification과 곱으로 집계 |
| V4  | **검증 커버리지**             | 머지된 AI 라인 중 영수증 커버 비율                        | Agent Trace + 영수증 | 무의미 테스트 → 뮤테이션 테스트 샘플 감사   |
| V5  | **토큰 효율**                 | 검증 통과 작업당 토큰 비용                                | OTel/Admin API       | 쉬운 작업 골라먹기 → 난이도 정규화          |
| V6  | **리뷰 기여 지수**            | 타인 AI 산출물의 실질 결함 적발 + 유효 교정 개입          | PR 리뷰 + 세션 로그  | nit 남발 → "리뷰 후 실제 변경" 건만 인정    |
| V7  | **배치 규율**                 | 과업 분해도(PR 크기 분포·세션당 단일 목표)                | 커밋/PR + 프롬프트   | 인위 분할 → PR 의존 그래프 탐지             |

개인 지수 = V1·V3·V5·V6 / 팀 지수 = V2·V4·V7 + 팀 내 분산.

### 지표 하네스 주입 A/B (구성 타당도 검증 — Arr가 선점 가능한 미검증 영역)

1. 검증 가능한 과업 200+ (SWE-bench Verified형 + 자체 뱅크), 하네스 고정.
2. 처치군: 시스템 프롬프트에 지표별 개선 지시 주입 (예: V1 "작업 전 수용 기준·참조 파일 명시 스펙 작성"), 대조군 무주입.
3. 측정: **숨겨진 정답 테스트**(에이전트 비공개 — 게이밍 차단) 통과율 + 지표값 + 토큰 + 블라인드 품질 평가.
4. 판정: 지표↑&정확도↑ → 채택 / 지표↑&정확도→↓ → **Goodhart 취약, 폐기·재설계**. 2모델×2하네스 재현 확인.

## 출처 (주요)

dora.dev/dora-report-2025 · dora.dev/ai/capabilities-model · getdx.com(Core 4·AI Measurement) · faros.ai · docs.specstory.com · docs.anthropic.com(Claude Code monitoring) · docs.cursor.com(teams analytics) · github.com/cursor/agent-trace · metr.org(2025 RCT·2026 설계 변경) · arXiv:2606.19644(프롬프트 품질↔PR 결과) · ACM CHI 2026(ETH vibe coding 역량) · github/spec-kit · arXiv:2604.13602(reward hacking) · arXiv:2512.14012(control > vibe)
