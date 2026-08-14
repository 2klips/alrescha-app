# SpecProof 작업 설계서 (Work Specification)

**버전:** 1.0 (2026-08-09)
**목적:** 이 문서 하나로 어떤 AI 에이전트든 SpecProof MVP를 기획 의도와 방향 그대로 구현할 수 있도록 한다. 실행 순서·할일 단위는 [BUILD_PLAN.md](BUILD_PLAN.md)(19개 할일, 웨이브·의존성·수용 기준 포함)를 따르고, 이 문서는 **왜(의도)와 무엇(명세)**을 정의한다. 두 문서가 충돌하면 이 문서와 [DECISIONS-ADR.md](DECISIONS-ADR.md)의 ADR이 우선한다.

---

## 목차

1. [제품 정의와 의도](#1-제품-정의와-의도)
2. [확정 결정 요약 (ADR-001~003)](#2-확정-결정-요약)
3. [절대 원칙 (가드레일)](#3-절대-원칙-가드레일)
4. [사용자 플로우](#4-사용자-플로우)
5. [화면 명세 (IA + 화면별 상세)](#5-화면-명세)
6. [시스템 아키텍처](#6-시스템-아키텍처)
7. [데이터 모델](#7-데이터-모델)
8. [분석 파이프라인 명세](#8-분석-파이프라인-명세)
9. [드리프트 발견 6종 판정 규칙](#9-드리프트-발견-6종-판정-규칙)
10. [CI 테스트 증거 수집 규칙](#10-ci-테스트-증거-수집-규칙)
11. [호스티드 MCP 계약](#11-호스티드-mcp-계약)
12. [컨텍스트 팩 · 최소 인덱스 명세](#12-컨텍스트-팩--최소-인덱스-명세)
13. [영수증(Receipt) 포맷](#13-영수증receipt-포맷)
14. [AI 판단 레이어와 크레딧 규칙](#14-ai-판단-레이어와-크레딧-규칙)
15. [가격 정책](#15-가격-정책)
16. [비목표 (Phase 2 이후)](#16-비목표-phase-2-이후)
17. [검증 전략 요약](#17-검증-전략-요약)
18. [용어집](#18-용어집)

---

## 1. 제품 정의와 의도

### 1.1 한 줄 정의

> **SpecProof** — GitHub에 푸시하면, 기획(스펙·ADR·에이전트 지시문)이 실제 코드와 테스트로 증명됐는지 자동 검증하고, 그 증거를 영수증으로 남기는 AI 개발 보증 SaaS.

### 1.2 이름의 의미

Spec(기획·명세) → Proof(증명). 바이브 코딩 시대의 핵심 불안 — "AI가 만든 코드가 정말 기획대로인가?" — 에 대해 **주장 대신 증거**를 제공한다는 뜻이다. 모든 화면·카피·기능은 이 한 단어 쌍("주장이 아니라 증거")으로 수렴해야 한다.

### 1.3 타깃 사용자 (개인 + 팀, ADR-006)

- **포지셔닝:** 바이브 코딩 **개인과 팀**을 위한 솔루션.
- **MVP 타깃:** 솔로 바이브 코더 — Claude Code·Codex·Cursor 등으로 코드를 "지시"해서 만드는 1인 개발자/기획자. 코드를 직접 읽는 능력이 낮거나 시간이 없어, AI 결과물이 기획을 지켰는지 **스스로 검증할 수 없다**는 것이 핵심 고통.
- **팀은 1순위 후속:** 워크스페이스 초대·역할·공유 그래프·팀 진척 대시보드는 MVP 직후 최우선 항목. 데이터 스키마는 MVP부터 팀 확장 가능하게 설계한다.
- **새 프로젝트 온보딩:** 새로 시작하는 프로젝트도 **깃허브에 먼저 푸시**하도록 안내한다(빈 레포 생성 가이드 포함). 퍼블릭 레포여도 SpecProof 워크스페이스는 GitHub과 동일한 원칙으로 **본인(권한자)만 접근**한다.

### 1.4 핵심 가치 제안 (우선순위 순 — ADR-004 재조정)

1. **세컨드 브레인 그래프 + 데이터 색인(히어로):** 레포의 문서·요구사항·코드·테스트를 구조화 색인으로 만들고, Obsidian graph view처럼 전면 그래프로 보여준다. 에이전트는 MCP로 이 색인을 검색해 필요한 데이터를 쉽게 찾아 참조한다.
2. **라이브 에이전트 활동(뉴런 발광):** 에이전트가 MCP를 통해 데이터를 조회하는 순간, 그래프의 해당 노드·엣지가 뉴런처럼 발광한다. "내 에이전트가 내 세컨드 브레인을 사용하는 게 보인다" — 이 제품의 시그니처 경험.
3. **드리프트 검증(2순위, 유료 차별화):** 푸시마다 기획-코드-테스트 불일치를 근거(파일·라인)와 함께 판정. 그래프 노드 배지·HUD 패널로 통합 표시.
4. **정직한 증거 등급:** 모든 판정은 `verified`/`inferred`로 명시 구분. 신뢰 차별화 포인트.
5. **영수증:** 커밋 단위 변조 감지 가능 기록.
6. **주문형 컨텍스트 서빙 + 지시문 린트:** 색인의 소비 형태(컨텍스트 팩)와 지시문 비용·모순 감사.

> 내러티브 통합: 그래프는 "증거가 사는 곳", 발광은 "증거가 사용되는 순간", 드리프트는 "증거가 끊어진 곳". 세 기능은 하나의 그래프 위에서 만난다.

### 1.6 Data Brain — 프로젝트 전용 지식 DB (ADR-005)

SpecProof가 레포마다 구축하는 지식 시스템의 공식 명칭은 **Data Brain**이다. 가능한 모든 용법을 조합해 "이 프로젝트만을 위한 가장 효율적인 DB"를 만든다:

| 레이어 | 내용 | 성격 |
|---|---|---|
| ① 증거 그래프 DB | 아티팩트·요구사항·증거·엣지의 구조화 저장 (§7) | 결정론, provenance 필수 |
| ② LLM Wiki | 문서 간 상호링크·백링크 그래프 + 문서별 `inferred` AI 요약·관련문서 캐시. **주문형 서빙 전용** — 정적 파일에 절대 인라인하지 않음 | 링크는 결정론, 요약은 `inferred` |
| ③ Data Index | 제목·경로·헤딩·태그·심볼·그래프 이웃 기반 결정론 검색 색인 (§8-6) | 결정론, 크레딧 0 |
| ④ 주문형 서빙 | MCP `search_index`/`get_artifact`/컨텍스트 팩 — 작업에 필요한 만큼만 (§11–12) | ETH 정합 |

**Data Brain의 존재 이유는 단 하나다: 같은 작업을 더 정확하게, 더 적은 토큰으로.** 이 주장은 구호가 아니라 §17.1의 효율 벤치마크로 실측·증명한다. 벤치마크가 증명하지 못하면 Data Brain 구성을 바꾼다 — 주장을 바꾸는 게 아니라.

### 1.5 왜 이 순서인가 (시장 근거 요약)

2026-08-09 시장 조사([RESEARCH_UPDATE_2026-08-09.md](RESEARCH_UPDATE_2026-08-09.md)) 결론:
- 조사한 21개 경쟁 제품 중 **requirement→구현→테스트를 커밋 단위로 추적하는 제품은 없음** (보증 = 최대 공백). Tessl $125M 펀딩이 이 방향 지불의사 증거.
- 반면 컨텍스트 허브는 Claude Code 네이티브 메모리·Google Antigravity·DeepWiki와 정면 경쟁 (혼잡).
- ETH 취리히 연구(arXiv 2602.11988): 정적 컨텍스트 파일은 성공률 개선 없이 비용 +20% → **항상-로드 문서 생성은 금지**, 주문형 로드만 허용.
- 따라서: 보증이 리드, 허브(문서 인벤토리·그래프·팩)는 보증을 뒷받침하는 기반 데이터 레이어.

---

## 2. 확정 결정 요약

전문은 [DECISIONS-ADR.md](DECISIONS-ADR.md). 구현자는 아래 요약만으로도 방향을 잃지 않아야 한다.

| ADR | 결정 | 구현에 미치는 영향 |
|---|---|---|
| ADR-001 (2026-07-28) | 증거 그래프 중심 통합 정의. AI 추론은 `inferred`, 실행 증거만 `verified`. 모든 영수증은 commit·digest와 연결. Git-native. | 데이터 모델의 provenance 필수 제약, 판정 규칙의 증거 등급 |
| ADR-002 (2026-08-09) | ① 주문형 로드 코어 (정적 파일은 최소 인덱스만) ② 보증 리드 MVP ③ $20 앵커 가격 ④ 표준: MCP 2026-07-28 stateless·SKILL.md·Agent Plugins 1.0·in-toto형 영수증 | MCP 서버 스펙 선택, 인덱스 파일 설계, 기능 우선순위 |
| ADR-003 (2026-08-09) | 전달 형태 = **GitHub-우선 웹 SaaS**: GitHub App(읽기 전용) + 서버 분석 + 웹 대시보드 + 호스티드 MCP. 로컬 CLI는 2단계. 테스트 증거는 사용자 CI 리포트 수집. 레포 쓰기는 advisory-only(PR 제안). 솔로 워크스페이스만. | 전체 아키텍처 형태, 권한 설계, 쓰기 경로 단일화 |

---

## 3. 절대 원칙 (가드레일)

구현 중 판단이 애매하면 이 목록으로 돌아온다. **모든 항목은 자동 테스트로 강제한다** (BUILD_PLAN의 adr-guardrails·scope-fidelity 참조).

1. **verified/inferred 분리:** 실행 증거(분석 대상 커밋의 CI 테스트 리포트, 실재하는 파일/심볼) 없이는 절대 `verified`로 표시하지 않는다. AI 판단은 confidence를 올릴 수 있어도 `verified`로 승격시킬 수 없다. `inferred`만으로 이루어진 판정 체인은 심각도 상한 = medium.
2. **provenance 필수:** 모든 그래프 엣지·발견 사항은 근거(source artifact + span) 또는 명시적 사유 없이 저장될 수 없다 (DB NOT NULL + zod 이중 강제).
3. **원본 코드 비저장:** 소스 코드 본문은 분석 시 일시적으로만 가져오고 저장하지 않는다. 영속화 대상은 문서·메타데이터(경로·심볼명·span·digest)·요약뿐.
4. **레포 쓰기는 advisory-only:** 유일한 쓰기 경로는 "최소 인덱스 PR 제안"이며, 브랜치 직접 커밋·기본 브랜치 쓰기·자율 쓰기는 존재하지 않는다.
5. **항상-로드 컨텍스트 생성 금지:** AGENTS.md/CLAUDE.md에 문서 본문·자동 생성 개요를 인라인하는 코드 경로 자체가 없어야 한다. 관리 영역은 마커로 감싼 ≤30줄 인덱스 섹션뿐.
6. **MCP 금지 기능:** Sampling·Roots·Logging·프로토콜 세션 사용 금지 (2026-07-28 스펙에서 폐기됨). 레포를 변경하는 MCP tool 금지.
7. **과금 정직성:** 결정론 분석(스캔·파싱·룰)은 크레딧 소모 0. 실패/스키마 불일치 AI 출력에 과금 금지. 재시도로 이중 과금 금지 (idempotency key).
8. **거짓 정밀도 금지:** 토큰 추정·비용 추정은 항상 가정(토크나이저·모델)을 명시하고 범위로 표시. 계측 없는 "토큰 N% 절감" 류 주장 금지. 데이터가 부족하면 "증거 부족"을 표시.
9. **최소 GitHub 권한:** contents:read, checks:read, actions:read, metadata + (선택, 인덱스 PR 기능 사용 시에만) pull-requests:write·contents:write (ADR-008로 개정 — PR 브랜치 생성에 contents:write가 기술적으로 필요). 각 권한은 요청 시점에 UI에서 이유를 설명하며, "레포 쓰기는 advisory-only PR 하나뿐" 원칙은 불변.
10. **품질:** 타입/린트/테스트 실패를 억제하거나 테스트를 약화시켜 통과시키지 않는다.

---

## 4. 사용자 플로우

### 4.1 온보딩 (첫 사용, 목표: 5분 내 첫 발견)

1. 랜딩 → "GitHub으로 시작" → Supabase auth(GitHub OAuth) 로그인.
2. 개인 워크스페이스 자동 생성 (팀 UI 없음).
3. "레포 연결" → GitHub App 설치 화면으로 이동. **권한 목록과 각 권한이 왜 필요한지 한국어로 설명** (예: "contents:read — 문서와 코드 구조를 읽기 위해. 코드 원본은 저장하지 않습니다").
4. 설치 후 레포 선택 → 첫 스캔이 백그라운드 잡으로 시작. 진행 상태 화면 (스캔 → 파싱 → 요구사항 추출 → 증거 조사 → 판정).
5. 완료 시 대시보드 랜딩. CI 리포트가 없으면 배너: "테스트 증거를 연결하면 verified 판정이 가능합니다" + GitHub Actions 아티팩트 업로드 가이드 링크.

### 4.2 일상 사용 (푸시 → 자동 분석)

1. 사용자가 평소처럼 에이전트로 코딩하고 GitHub에 푸시.
2. webhook(push) 수신 → 서명 검증 → 증분 스캔 잡 큐잉 (digest 변경분만).
3. 분석 완료 → 대시보드 갱신 + 영수증 1건 추가. (알림은 MVP 범위 외 — 대시보드 방문 시 확인)
4. workflow_run/check_run 완료 webhook 수신 시 해당 커밋의 테스트 리포트를 수집해 증거 승격(→ `verified`) 재판정.

### 4.3 발견 사항 확인 → 해소

1. 대시보드에서 심각도순 발견 목록 확인.
2. 발견 상세: 근거 span(문서 원문 발췌 + 코드 위치), 증거 체인, verified/inferred 라벨, **권장 다음 행동** (예: "이 요구사항을 구현했다면 테스트를 추가하고 CI 리포트를 연결하세요 / 의도적으로 뺐다면 스펙에서 제거하세요").
3. AI 판단이 필요한 애매한 항목(예: 모순 후보)은 "AI 판단 실행" 버튼 → 크레딧 예약 → 결과가 `inferred` 라벨로 confidence 갱신.
4. 사용자가 코드/문서를 고쳐 푸시하면 다음 분석에서 발견이 해소(resolved)로 전환 — 해소 이력은 영수증 체인과 stats에 반영.

### 4.4 에이전트 연결 (MCP)

1. 설정 → "MCP 토큰 발급" → 스코프(해당 워크스페이스 읽기+진행 기록) 명시된 토큰 생성.
2. 화면에 Claude Code/Codex/Cursor별 설정 스니펫 제공 (호스티드 URL + 토큰).
3. 에이전트는 작업 시작 시 `request_context_pack(task)`으로 필요한 문서만 받고, 작업 후 `log_progress`로 진행을 기록한다.
4. (선택) "인덱스 PR 제안" — AGENTS.md에 ≤30줄 SpecProof 관리 섹션(MCP 접속 안내)을 추가하는 PR을 생성. 사용자가 직접 머지.

### 4.5 실패·이탈 경로 (반드시 구현)

- GitHub App 설치 취소/권한 회수 → 해당 레포 "연결 끊김" 상태로 강등, 데이터 보존 + 재연결 안내. 앱은 죽지 않는다.
- webhook 서명 불일치 → 401, 아무것도 기록하지 않음.
- 스캔 실패(레이트리밋, 대용량) → 잡 재시도(상한 있음) 후 실패 사유를 대시보드에 그대로 표시.
- 크레딧 소진 → AI 판단만 비활성화(안내 + 충전 유도), 결정론 분석은 계속 동작.

---

## 5. 화면 명세

### 5.1 정보 구조 (IA)

```
/                     랜딩(로그인 전) → 로그인 후 /app 리다이렉트
/app                  레포 목록(연결된 레포 카드) + 연결 CTA
/app/[repo]           ① 레포 헬스 대시보드 (기본 탭)
/app/[repo]/findings  ② 발견 사항 목록 + 상세(드로어 또는 서브뷰)
/app/[repo]/harness   ③ 하네스 대시보드 (인벤토리 + 지시문 린트 통합, ADR-006)
/app/[repo]/graph     ④ 증거 그래프
/app/[repo]/receipts  ⑤ 영수증 목록 + 검증
/app/[repo]/docs      ⑥ 문서 인벤토리 (경량)
/app/[repo]/progress  ⑧ 진행 대시보드 (진척율·todo·최근 작업, ADR-006)
/app/library          ⑨ 개인 라이브러리 (저장·조회, ADR-006)
/app/settings         ⑦ 설정: MCP 토큰, 크레딧/사용량, BYOK, 인덱스 PR, 계정
/onboarding           연결 마법사 (4.1 플로우)
```

전 화면 공통: 다크 테마 콘솔 스타일(기존 대시보드 목업 `Project Command Center` 계승), 좌측 사이드바 내비게이션, 상단에 현재 레포·브랜치·마지막 분석 커밋 SHA(7자)·영수증 링크. **verified는 초록, inferred는 호박색(amber)으로 전 화면 일관 표시** — 이 색 규약은 제품 정체성이다.

### 5.2 화면별 상세

#### ① 메인 대시보드 = 세컨드 브레인 그래프 (`/app/[repo]`) — 목업: `screens/dashboard.html` (ADR-004)

**그래프가 화면 전체를 채우고(전면, full-bleed), 나머지는 전부 반투명 HUD 오버레이다.**

- **그래프(본체):** 노드 = 문서(스펙/ADR/지시문/스킬)·요구사항·코드 영역·테스트. 엣지 = 링크·증거 관계(provenance 있는 것만). 물리 시뮬레이션 배치(force-directed), 줌/팬, 노드 드래그, 검색, 노드 유형·증거 등급 필터, 클릭 시 로컬 그래프(깊이 2) 포커스 + 상세 패널. 대형 레포는 클러스터 기본 뷰(헤어볼 금지).
- **드리프트 통합 표시:** 발견이 열린 노드는 붉은 링/배지, 증거가 끊어진 엣지는 붉은 점선. 클릭 → findings 상세.
- **라이브 활동(뉴런 발광):** 에이전트가 MCP로 색인·문서·팩을 조회하면 해당 노드가 발광(pulse)하고 관련 엣지에 흐름 애니메이션. 발광은 2–3초에 걸쳐 감쇠, 동시 다발 조회는 파동처럼 겹친다. 최근 활동일수록 잔광(afterglow) 유지. 데이터: `access_events` 실시간 구독(§11).
- **HUD 구성:**
  - 좌상: 레포 칩(브랜치·마지막 분석 커밋·영수증 링크) + 요약 지표 4칩(미해소 발견 / 구현 커버리지 / 테스트 커버리지 / 상시 로드 토큰 — 클릭 시 해당 화면 이동. 근거로 이동할 수 없는 수치는 표시하지 않는다).
  - 우측: **에이전트 활동 피드** — MCP 호출 실시간 목록("Claude Code가 spec/auth.md 조회 · 방금"), 발광과 동기화. 항목 클릭 시 해당 노드로 카메라 이동.
  - 하단: 범례(노드 유형·증거 등급 색·발광 의미) + CI 증거 미연결 배너(해당 시).
- **성능:** 노드 500+에서 60fps 목표(캔버스/WebGL 렌더러 허용 — React Flow가 한계면 교체 가능, BUILD_PLAN 수용 기준 유지). 발광 이벤트는 배치 렌더링.
- 빈 상태(첫 스캔 전): 온보딩 진행 상태를 그래프 자리에서 애니메이션으로 표시.

#### ② 발견 사항 (`/findings`) — 목업: `screens/findings.html`

- 필터: 유형(6종)·심각도(high/medium/low)·증거 등급(verified/inferred)·상태(open/resolved).
- 리스트 행: 유형 아이콘 + 제목(요구사항 요약) + 심각도 + 증거 등급 배지 + 발생 커밋.
- 상세(우측 드로어): ⑴ 요구사항 원문 발췌(문서명·라인, 원문 span 하이라이트) ⑵ 증거 체인(예: "구현 증거: src/auth/login.ts#L42 export loginWithGitHub — verified / 테스트 증거: 없음 — inferred 강등") ⑶ 판정 사유 ⑷ 권장 다음 행동 ⑸ AI 판단 실행 버튼(크레딧 표시) ⑹ 이 발견의 이력(언제 열림/해소).
- `inferred` 라벨에는 항상 툴팁: "실행 증거가 없어 추론으로 판정됨. CI 리포트를 연결하면 verified 판정이 가능합니다."

#### ③ 하네스 대시보드 (`/harness`) — 인벤토리 + 린트 통합 (ADR-006)

**상단: 인벤토리** — 이 프로젝트에서 발견된 하네스 자산을 "무엇이 있고 어디에 활성인가"로 표시.
- 그룹: Skills(SKILL.md) / Rules·지시문(AGENTS.md·CLAUDE.md·.claude/rules·.cursor/rules) / Plugins·MCP 설정(발견된 설정 파일 기준).
- 각 행: 이름·경로·어느 에이전트가 로드하는지(Claude Code/Codex/Cursor 로딩 규칙 기반)·상시 로드 여부·토큰 비용·연결된 발견(모순 등)·"라이브러리에 저장" 버튼(→⑨).
**하단: 린트** —
- 표1 상시 로드 비용: 파일별 토큰 수 + 로드 주체 + 합계. 헤더에 토크나이저 가정 명시.
- 표2 모순 후보: 두 지시문 발췌(양쪽 span 필수) + 모순 사유 + AI 확정 버튼.
- 표3 중복/겹침: 동일 내용이 여러 파일에 있는 경우.

#### ④ 증거 그래프 상세 (`/graph`) — 목업: `screens/graph.html`

메인 대시보드(①)가 그래프 전면 뷰를 담당하므로, 이 화면은 **분석용 상세 뷰**다: 특정 요구사항/발견을 중심으로 한 로컬 그래프(깊이 2) + provenance 검사.
- 노드 유형: 요구사항(사각)·문서(둥근사각)·코드 영역(육각)·테스트(원). 엣지: 근거 있는 관계만, 호버/선택 시 provenance(스팬·confidence·등급) 표시.
- 미연결(고아) 문서 토글. 노드 클릭 → 해당 발견/문서로 이동. ①에서 노드 더블클릭 시 이 화면으로 진입.

#### ⑤ 영수증 (`/receipts`) — 목업: `screens/receipts.html`

- 커밋순 영수증 리스트: SHA·시각·발견 요약(신규 n / 해소 m / 미해소 k)·검증 상태 배지(verified chain / stale / tampered).
- 상세: in-toto Statement JSON 뷰어(§13 포맷) + "다시 검증" 버튼(digest 재계산).
- 카피 톤: 영수증은 이 제품의 "도장"이다 — 시각적으로 각인되게 (스탬프 모티프).

#### ⑥ 문서 인벤토리 (`/docs`)

- 아티팩트 유형별 그룹(스펙/ADR/지시문/스킬/TODO·진행). 각 행: 경로·최종 수정 커밋·신선도(참조하는 코드가 변경된 후 문서가 갱신 안 됨 = stale 표시)·연결된 발견 수.
- 편집 기능 없음(MVP). GitHub 파일로 딥링크.

#### ⑧ 진행 대시보드 (`/progress`) — ADR-006, 경량 원칙

**데이터 소스 두 가지뿐:** ⑴ 레포의 TODO/진행 문서 파싱(태스크 리스트 체크 상태) ⑵ 에이전트의 `log_progress` 구조화 기록. 추가 추론·AI 요약으로 진척을 "지어내지" 않는다.
- **진척율:** 요구사항 커버리지(§5.2-①과 동일 수치) + todo 완료율(체크박스 기준)을 나란히. 출처 명시.
- **Todo 보드:** TODO.md 등에서 파싱한 항목 + `log_progress`로 생성된 항목. 상태: open / in-progress / done / blocked. 각 항목은 원문 span 또는 기록 이벤트로 링크.
- **최근 작업 타임라인:** log_progress 이벤트 역순 — "방금 한 작업"이 최상단. 커밋·발견 해소와 시간축 병기.
- **토큰 낭비 금지 (설계 원칙):** 기록 양식은 구조화 1콜(목표 ≤150 토큰). 서술형 일지 강요 금지, 매 턴 기록 리마인더 금지 — 양식은 스킬/최소 인덱스에 "작업 단위 완료 시 1회" 지침으로만 안내.

#### ⑨ 개인 라이브러리 (`/app/library`) — ADR-006, MVP는 저장·조회만

- 워크스페이스 전역(레포 횡단) 화면. 하네스 대시보드(③)에서 "라이브러리에 저장"한 skill·rules·지시문 스니펫을 보관.
- 각 항목: 이름·출처(레포·경로·커밋)·내용 스냅샷·태그·저장일. 검색·태그 필터.
- **MVP 제외(2단계):** 새 프로젝트로 가져오기(PR 생성), Data Brain 템플릿 이식, 팀 공유. 공개 마켓플레이스는 계속 비목표.

#### ⑦ 설정 (`/app/settings`)

- MCP 토큰: 발급/폐기, 마지막 사용 시각, 에이전트별 설정 스니펫(복사 버튼).
- 크레딧: 잔액, 월 갱신일, 사용 내역(잡별 예약→정산 기록), 충전 안내(MVP는 관리자 수동 충전).
- BYOK: Anthropic/OpenAI 키 등록(암호화 저장 안내), 등록 시 AI 판단이 크레딧 대신 사용자 키로 실행됨을 명시.
- 인덱스 PR: 대상 레포 선택 → PR 미리보기(diff) → 생성. pull-requests:write 권한이 없으면 권한 추가 안내 또는 수동 복사 경로 제공.

---

## 6. 시스템 아키텍처

```
[사용자 브라우저] ──> [Next.js 웹앱 (Vercel 또는 동급)]
                         │  auth: Supabase (GitHub OAuth)
                         │  DB: Supabase Postgres (RLS)
[GitHub] ─ webhook ──> [API route: webhook 수신·서명검증·정규화] ─> [잡 큐 (Postgres 기반)]
                                                                    │
                                              [워커 프로세스] <─ claim ┘
                                              │  scan → parse → extract → probe → rules → receipt
                                              │  (판단 잡만: AI provider 호출 + 크레딧)
                                              └─ GitHub API 읽기 (installation token, 일시 fetch)
[에이전트 (Claude Code/Codex/Cursor)] ──> [호스티드 MCP 서비스 (packages/mcp, Streamable HTTP)]
                                              │  per-user 토큰 인증, stateless (2026-07-28)
                                              └─ 같은 DB를 읽고 progress/note만 기록
```

- **모노레포:** `apps/web`(Next.js) · `packages/core`(엔진: 파서·추출기·프로브·룰 — 순수 함수 지향, DB 비의존) · `packages/mcp`(호스티드 MCP 서비스). 워커는 web과 같은 배포 단위의 백그라운드 러너 또는 별도 프로세스 — BUILD_PLAN todo 7의 수용 기준을 만족하면 형태는 구현 재량.
- **core는 순수하게:** 엔진은 "입력(아티팩트·리포트) → 출력(요구사항·증거·발견)"의 결정론 함수로 작성해 픽스처만으로 오프라인 테스트 가능해야 한다. GitHub 호출·DB 접근은 어댑터로 분리.
- 스택 기본값: Next.js + TypeScript strict + Supabase(Postgres·Auth) + pnpm + vitest + Playwright. 대체 시 BUILD_PLAN의 수용 기준을 동일하게 만족해야 한다.

---

## 7. 데이터 모델

핵심 테이블 (전부 workspace 스코프 + RLS, ULID PK). 상세 제약은 BUILD_PLAN todo 5.

| 테이블 | 역할 | 핵심 필드/제약 |
|---|---|---|
| `workspaces` | 개인 워크스페이스 (팀 확장 대비) | owner_user_id; `members` 테이블 존재하되 MVP UI 없음 |
| `github_installations` | App 설치 상태 | installation_id, 권한 스냅샷, revoked_at |
| `repositories` | 연결 레포 | full_name, default_branch, 연결 상태 |
| `artifacts` | 스캔된 문서·코드 메타데이터 | type(enum: spec/adr/agents_md/claude_md/cursor_rules/skill/todo_progress/code_meta), path, digest, commit_sha, spans; **본문 컬럼 없음**(문서는 발췌 span만, 코드는 심볼 목록만) |
| `requirements` | 추출된 요구사항 | text 발췌, source_artifact_id + span **NOT NULL**, extraction_method(deterministic/ai), status |
| `evidence` | 증거 레코드 | kind(impl_path/impl_symbol/test_report), grade(**verified/inferred**), source(커밋 SHA·리포트 ID·프로브 사유) NOT NULL |
| `edges` | 그래프 엣지 | from/to, relation, confidence, provenance(span or reason) **NOT NULL** |
| `findings` | 드리프트 발견 | type(6종 enum), severity, confidence, status(open/resolved), evidence 링크들, suggested_action, opened_at_commit, resolved_at_commit |
| `receipts` | 영수증 | in-toto Statement JSON, commit_sha, digest 목록, verify 상태 |
| `jobs` | 잡 큐 | type, status, idempotency_key UNIQUE, claim/heartbeat/retry 필드, tenant 스코프 |
| `credit_ledger` | 크레딧 원장 | event(grant/reserve/settle/refund/topup/adjust), amount, job_id, idempotency_key |
| `mcp_tokens` | MCP 접근 토큰 | hash 저장, scope, last_used_at, revoked_at |
| `index_entries` | 데이터 색인 | artifact/requirement 참조, 검색 키(제목·경로·헤딩·태그·심볼), 그래프 이웃 캐시; MVP는 결정론 색인(임베딩 컬럼은 2단계 예약) |
| `access_events` | 에이전트 조회 이벤트 (발광 소스) | mcp_token_id, tool/resource명, 대상 node_ids[], ts; 실시간 채널로 브로드캐스트, 보존 30일(Free)/무제한(Pro) |
| `judgments` | AI 판단 기록 | 대상 finding, provider, 입력 요약, 출력 payload(스키마 검증 통과분), 크레딧 정산 링크 |
| `progress_events` | 에이전트 진행 기록 | MCP log_progress 구조화 저장소 (task·status·summary·refs) — 진행 대시보드 소스 |
| `todos` | Todo 항목 | 출처(TODO 문서 파싱 span 또는 log_progress), 상태(open/in-progress/done/blocked), 연결 요구사항 |
| `library_items` | 개인 라이브러리 (워크스페이스 전역) | 유형(skill/rules/지시문), 출처(레포·경로·커밋), 내용 스냅샷, 태그 — MVP는 저장·조회만 |

---

## 8. 분석 파이프라인 명세

푸시 webhook 1건 → 아래 단계가 잡으로 순차 실행된다. 전 단계 결정론(크레딧 0).

1. **scan:** GitHub API로 커밋 기준 트리 조회 → 아티팩트 분류(§7 type enum) → digest 비교로 변경분만 처리. 코드 파일은 일시 fetch 후 심볼 추출(ts/js는 TS 컴파일러 API, 그 외 언어는 정규식 프로브 + confidence 강등)하고 본문 폐기.
2. **parse:** 문서를 remark/unified AST로 → 제목·프런트매터·링크·태스크 리스트·수용 기준 블록·MUST/SHOULD 문장 + byte/line span.
3. **extract:** 요구사항 후보 생성(결정론 규칙: 태스크 항목, "수용 기준" 하위 항목, ADR 결정문, MUST/SHOULD 문장). span 없는 요구사항은 생성 불가.
4. **probe:** 요구사항별 증거 수집 — 경로/글롭 존재, 심볼 존재, (있다면) 해당 커밋의 CI 테스트 리포트 매핑(§10).
5. **rules:** §9 규칙으로 발견 생성/해소 판정.
6. **index (Data Brain 구축):** 데이터 색인 갱신 — 아티팩트·요구사항별 검색 키(제목·경로·헤딩·태그·심볼) + 그래프 이웃 캐시를 `index_entries`에 반영하고, **LLM Wiki 레이어**의 상호링크·백링크 그래프를 갱신한다. 결정론(크레딧 0). 검색 랭킹: 정확 일치 > 제목/헤딩 > 경로/심볼 > 그래프 이웃 근접. 문서별 `inferred` 요약·관련문서 캐시는 판단 잡(선택, 크레딧)으로 생성하며 주문형 서빙에서만 사용. 임베딩 검색은 2단계.
7. **receipt:** §13 포맷으로 영수증 append.

성능 목표: 2,000파일 레포 콜드 스캔 60초 이내(AI 단계 제외), 증분은 변경 아티팩트 수에 비례.

---

## 9. 드리프트 발견 6종 판정 규칙

| 유형 | 판정 조건 | 기본 심각도 | 비고 |
|---|---|---|---|
| `missing-implementation` | 요구사항에 구현 증거(경로/심볼) 없음 | high (inferred-only면 medium 상한) | 프로브가 못 찾은 것 ≠ 없는 것 — 사유 명시 |
| `missing-test` | 구현 증거는 있으나 해당 커밋의 테스트 증거 없음 | medium | CI 미연결 레포는 일괄 배너로 안내, 개별 스팸 금지 |
| `stale-doc` | 문서가 참조하는 경로/심볼이 현재 커밋에 없음 | medium | 문서 span + 소멸된 참조 대상 명시 |
| `contradicting-instructions` | 두 지시문이 같은 주제에 상충 지시(결정론 휴리스틱: 부정쌍·동일 토픽 MUST 충돌) | medium (AI 확정 시 high 가능) | **양쪽 span 필수**. AI 확정은 판단 잡 |
| `orphan-doc` | 어떤 요구사항·코드와도 연결되지 않는 스펙류 문서 | low | 지시문·TODO는 제외 |
| `unproven-claim` | 문서가 "~지원함/~동작함"류 주장을 하는데 증거 없음 | medium | 주장 문장 span 필수 |

공통: 발견은 같은 span에 중복 생성 금지. 다음 분석에서 조건이 사라지면 `resolved` 전환(삭제 아님 — 이력 보존). 허용 오차 파일(tolerance)은 빈 상태로 시작하며 항목 추가 시 사유 필수.

---

## 10. CI 테스트 증거 수집 규칙

1. 수집원: 분석 대상 커밋의 GitHub Actions **artifacts**(JUnit XML, vitest/jest JSON) 및 **check runs**.
2. 매핑: 테스트 이름/파일 경로와 요구사항의 연결은 관례 기반 — ⑴ 테스트 이름에 요구사항 슬러그/키워드 포함 ⑵ 테스트 파일 경로가 구현 증거 경로와 인접. 매핑 신뢰도는 confidence에 반영.
3. **`verified` 조건:** 리포트가 분석 대상 커밋의 실행에서 나왔고(다른 커밋 리포트 금지), 파싱에 성공했으며, 해당 테스트가 pass일 것. 그 외 전부 `inferred`.
4. 리포트 없음 → 테스트 증거는 전부 `inferred` + 대시보드 배너로 연결 가이드(레포별 1회성 안내, 발견마다 반복 금지).
5. 미래(2단계): SpecProof 전용 GitHub Action으로 리포트 업로드 표준화.

---

## 11. 호스티드 MCP 계약

- **스펙:** MCP 2026-07-28 stateless. Streamable HTTP. `server/discover` 구현. 리스트 결과에 `ttlMs` 캐시. **Sampling/Roots/Logging/세션 금지.**
- **인증:** 설정 화면에서 발급한 per-user 토큰(Bearer). 해시만 저장, 폐기 즉시 무효, 모든 호출 tenant 검증.
- **Resources:** `overview`(레포 요약+미해소 발견 수), `artifacts`(인벤토리), `findings`(필터 파라미터), `receipts-summary`, `context-packs`.
- **Tools:**
  - `search_index(query, type_filter?)` → 색인 검색 결과(아티팩트·요구사항, 랭킹·경로·발췌). 에이전트가 "데이터를 쉽게 찾는" 1차 진입점.
  - `query_brain(filter)` → 구조화 질의 (ADR-006): 유형·상태·관계 필터로 Data Brain 조회 — 예: "테스트 증거 없는 요구사항 전부", "spec/auth.md와 연결된 코드 영역". 결정론, 색인·그래프 기반.
  - `get_artifact(path | id)` → 단일 아티팩트 내용/발췌 + 그래프 이웃 요약.
  - `request_context_pack(task_description, token_budget?)` → §12 팩. 
  - `get_findings(filter?)` → 발견 목록(증거 등급 라벨 포함 — MCP 응답에서도 inferred 라벨 생략 금지).
  - `log_progress({task, status, summary, refs?})` → 구조화 작업 기록 (ADR-006 양식): `task`(짧은 제목 또는 기존 todo id), `status`(started|progress|done|blocked), `summary`(≤200자), `refs`(경로/커밋, 선택). **호출당 목표 ≤150 토큰** — 진행 대시보드(§5.2-⑧)의 데이터 소스. 양식은 스킬/최소 인덱스에 "작업 단위 완료 시 1회" 지침으로 포함.
  - `record_note(text, target?)` → 사용자 확인용 노트.
  - **레포를 변경하는 tool 없음.**
- **Access 이벤트 (발광 소스):** 모든 read성 tool/resource 호출은 대상 노드 ID들과 함께 `access_events`에 기록되고 워크스페이스 실시간 채널로 브로드캐스트된다 → 대시보드 그래프 발광(§5.2-①). 기록 실패가 tool 응답을 막아선 안 된다(fire-and-forget). 이벤트에는 프롬프트/작업 내용 원문을 저장하지 않는다 — tool명·대상·타임스탬프만.
- 에러: 스키마 불일치 입력은 typed error, 부분 상태 저장 금지.

---

## 12. 컨텍스트 팩 · 최소 인덱스 명세

### 컨텍스트 팩

- 입력: 작업 설명(+선택 토큰 예산). 그래프에서 관련 요구사항→문서를 선정.
- 출력: ⑴ 읽기 순서가 있는 문서 발췌/전문 목록 ⑵ **제외한 문서와 제외 사유** ⑶ 토큰 추정(가정 명시) ⑷ 대상 에이전트 포맷(Claude/Codex/Cursor/generic).
- 원칙: "전부 넣기"를 조장하는 UI/기본값 금지. 예산 초과 시 제거 우선순위를 제안.

### 최소 인덱스 (AGENTS.md 관리 섹션)

- 형식: 마커로 감싼 ≤30줄 섹션. 내용은 ⑴ SpecProof MCP 접속 방법 ⑵ "작업 전 request_context_pack 호출" 지침 ⑶ 비추론가능 정보 위치 안내 — **문서 본문·자동 요약 인라인 절대 금지**.

```markdown
<!-- SPECPROOF:BEGIN (managed — do not edit inside) -->
## Project context via SpecProof
- Before coding, call MCP tool `request_context_pack` with your task description.
- MCP endpoint: https://mcp.specproof.app  (token: see project settings)
- Findings & receipts: https://2klips.github.io/... (dashboard)
<!-- SPECPROOF:END -->
```

- CLAUDE.md가 없으면 `@AGENTS.md` 한 줄짜리 래퍼 생성 제안 포함.
- 전달: **PR 제안만**. 재생성 시 byte-idempotent. 마커 밖 내용 불가침. 마커 안을 사용자가 수정했으면 덮어쓰지 않고 충돌 경고.

---

## 13. 영수증(Receipt) 포맷

in-toto Statement 형태(서명은 Phase 2, `signatures: []`).

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    { "name": "git:commit", "digest": { "sha1": "<commit sha>" } },
    { "name": "spec/prd.md", "digest": { "sha256": "<file digest>" } }
  ],
  "predicateType": "https://specproof.app/attestation/analysis/v1",
  "predicate": {
    "tool": { "name": "specproof", "version": "0.1.0" },
    "analyzedAt": "2026-08-09T12:00:00Z",
    "findings": { "opened": [/* finding 요약 */], "resolved": [], "open_total": 7 },
    "coverage": { "requirements": 24, "implVerified": 11, "testVerified": 6 },
    "evidenceGrades": { "verified": 17, "inferred": 14 }
  },
  "signatures": []
}
```

- `verify` 동작: subject digest 재계산 → 불일치 시 tampered, 대상 파일이 이후 커밋에서 변경됐으면 stale 표시.
- 마이그레이션 없이 Sigstore 서명을 붙일 수 있어야 한다(포맷 변경 금지).

---

## 14. AI 판단 레이어와 크레딧 규칙

- **판단 잡 종류:** 드리프트 verdict 확정(애매 케이스), 요구사항 중의성 해소, 모순 후보 확정.
- **실행:** 워커에서 provider 추상화(Anthropic·OpenAI 어댑터, core에 하드코딩 금지)로 호출. 출력은 zod 스키마 검증 → 통과분만 `judgments`에 저장, 발견 confidence 갱신(`verified` 승격은 불가, §3-1).
- **크레딧:** 판단 잡만 소모. 흐름 = 예약(reserve) → 성공 시 정산(settle) / 실패·스키마 불일치·취소 시 환불(refund). idempotency key로 이중 과금 차단. 월 무료 갱신(Free 50), 관리자 수동 충전(외부 결제 없음).
- **BYOK:** 사용자 키 등록 시 크레딧 우회. 키는 암호화 저장·로그 금지.

---

## 15. 가격 정책

MVP는 과금 코드 없이 원장만 구현하되, 제품 카피·플랜 게이트는 아래를 전제로 설계한다 (ADR-002, 시장 조사 4절 근거):

| 플랜 | 가격 | 내용 |
|---|---|---|
| Free | $0 | 레포 1개, 크레딧 50/월, 히스토리(영수증·발견 이력) 30일 |
| Pro | $20/월 | 무제한 레포, 달러 페그 크레딧(공개 단가표·라이브 미터·기본 상한), 무제한 히스토리, 토큰 절감 분석 |
| Team (2단계) | $35/user 또는 ~$300 플랫 | 풀 크레딧, 공유 그래프·드리프트 대시보드, 스킬 라이브러리, SSO는 애드온 |

원칙: 실패 실행 무과금, 요금제 의미 중도 변경 시 기존 구독자 grandfathering, 추상 이중 단위 금지.

---

## 16. 비목표 (Phase 2 이후)

**1순위 후속 (MVP 직후, ADR-006):** 팀 워크스페이스 UI(초대·역할·공유 그래프·팀 진척 대시보드) · 라이브러리 가져오기(새 프로젝트로 PR 생성) · Data Brain 템플릿 이식.

**그 외 2단계 이후:** 로컬 CLI 드리프트 체커 · 직접/자율 레포 쓰기 · 외부 결제(Stripe 등) · GitHub 외 Git 제공자 · 스킬 마켓플레이스/보안 스캔(플랫폼 영역) · Sigstore 서명 · Agent Trace 브리지 · 임베딩 검색 · 알림(이메일/슬랙). — 아카이브된 계획들(`BUILD_PLAN.md`의 R19)이 이 항목들의 설계 참고자료다.

## 17. 검증 전략 요약

- 픽스처가 진실이다: `fixtures/drifted-demo/`(6종 발견이 전부 심어진 레포) + 기대 발견 매니페스트 + 녹화된 GitHub API/webhook/아티팩트 픽스처로 전 파이프라인을 오프라인 결정론 테스트.
- TDD 대상: 파서·추출기·프로브·룰·영수증·크레딧·webhook·RLS·MCP 계약. UI는 tests-after + Playwright 브라우저 QA.
- 최종 검증 웨이브(F1~F5): 계획 준수 감사 · 코드 품질/보안 감사 · 실브라우저 E2E · 범위 일탈 검사 · **효율 벤치마크 리포트** — 전부 통과해야 완료 선언. 상세는 BUILD_PLAN.

### 17.1 Data Brain 효율 벤치마크 (필수 산출물, ADR-005)

**목적:** "SpecProof를 쓰면 같은 작업의 정확도가 올라가고 토큰이 줄어든다"를 실측으로 증명한다. 시장 조사 R1 리스크(ETH 연구: 정적 컨텍스트는 무효과+비용 증가)에 대한 직접 응답이자, "측정 없는 숫자 주장 금지" 가드레일(§3-8)의 실행 수단.

**프로토콜 (A/B, 사전 등록):**
- **과제 세트:** 최소 12개 과제 × 3회 반복. 픽스처 레포(drifted-demo) + 실제 규모 레포 1개 이상. 과제 유형 3종 — ⑴ 기능 구현("R-07 비밀번호 재설정 구현") ⑵ 질의 응답("이 프로젝트의 인증 방식과 그 근거는?") ⑶ 문서 정합 판단("이 커밋이 스펙과 어긋난 부분은?"). 각 과제는 **객관 채점 기준**을 사전 정의: 구현→기존 테스트 통과 여부, 질의→정답 매니페스트 채점, 판단→기대 발견 매니페스트 대조.
- **A군 (베이스라인):** 동일 모델·동일 프롬프트의 에이전트가 레포 체크아웃만으로 수행 (필요시 자체 탐색). 보조 비교군 A′: 문서 전체를 컨텍스트에 덤프(naive full-dump).
- **B군 (SpecProof):** 동일 에이전트가 Data Brain(MCP `search_index`/`get_artifact`/컨텍스트 팩)을 사용해 수행.
- **측정 지표:** ① 과제 성공률/채점 점수 ② 총 토큰(입력+출력, 모델 리포트 기준) ③ 툴콜 수 ④ 소요 시간. 모델·버전·토크나이저 가정 명시.
- **실행 형태:** 스크립트화된 하네스(Claude Agent SDK 또는 스크립트 MCP 클라이언트)로 재현 가능하게. 결과는 JSON + 마크다운 리포트로 저장, 커밋에 포함.

**판정 기준 (가설):** 정확도 **비열등 이상(+5%p 목표)** AND 토큰 **30% 이상 절감**. 미달 시 → Data Brain 구성(색인 랭킹·팩 선정·위키 링크)을 개선해 재실행. **결과는 달성/미달 관계없이 수치 그대로 공개하며, 마케팅·제품 내 모든 효율 주장은 이 리포트 인용으로만 한다.**

## 18. 용어집

- **Data Brain:** SpecProof가 레포마다 구축하는 프로젝트 전용 지식 DB — 증거 그래프 DB + LLM Wiki(상호링크·`inferred` 요약) + Data Index + 주문형 서빙의 결합 (§1.6). 존재 이유는 "같은 작업을 더 정확하게, 더 적은 토큰으로"이며 §17.1 벤치마크로 증명한다.
- **드리프트(drift):** 기획 문서와 실제 코드/테스트 상태의 불일치.
- **증거 등급:** `verified`(분석 커밋의 실행 증거로 확인) / `inferred`(추론·간접 근거). 
- **영수증(receipt):** 커밋 시점 분석 결과의 변조 감지 가능 기록 (in-toto Statement).
- **컨텍스트 팩:** 특정 작업을 위해 선별된 문서 묶음 + 읽기 순서 + 제외 사유.
- **최소 인덱스:** AGENTS.md 안의 ≤30줄 SpecProof 관리 섹션. 유일하게 허용되는 정적 컨텍스트.
- **판단 잡(judgment job):** AI가 애매한 판정을 확정하는 크레딧 과금 작업.
- **프로브(probe):** 요구사항의 구현/테스트 증거를 찾는 결정론 검사.
