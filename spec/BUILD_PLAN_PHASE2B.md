# arr-app — Phase 2B Work Plan: 팀 · 등록 플로우 · 점검 Dashboard · Data Brain v2

> Governing decisions: `DECISIONS-ADR.md` — **ADR-011** (팀 프라이버시 모델, 이 페이즈의 선행 규범), ADR-006(팀 1순위 후속·진행/하네스/라이브러리), ADR-005(Data Brain·벤치 정직성), ADR-004(발광·access_events 원문 비저장 불변), ADR-010(미검증 이월 항목).
> Research inputs: `RESEARCH_TEAM_METRICS_2026-08-14.md` (DORA 2025·프롬프트 루브릭·VIBE 후보), `RESEARCH_GRAPH_DATABRAIN_2026-08-14.md` (그래프 툴·토큰 효율 Top5), `REVIEW_EXTERNAL_PROJECTS_2026-08-16.md` (흡수 항목 G3~G5·H1·H3·H4).
> Product spec `WORK_SPEC.md` §3(가드레일)·§5(화면)·§11(MCP)은 계속 유효하며, 이 계획이 그 위에 기능을 더한다. 충돌 우선순위: ADR = WORK_SPEC > 이 계획.

## TL;DR (For humans)

Phase 2A가 "보이는 것"을 끝냈다면 2B는 **제품이 실제로 팔리는 데 필요한 네 덩어리**다: ⑴ 누구나 5분 안에 붙일 수 있는 **등록 플로우**(레포 URL·푸시 자동 분석 카드·로컬 인제스트) ⑵ **팀 기능**(프롬프트 기록·AI 코칭·증거 기반 기여도·VIBE Index) — ADR-011 프라이버시 모델 위에서만 ⑶ **점검 Dashboard**(진척·todo·문제·문서 요약·취약점) ⑷ **Data Brain v2**(연구가 지목한 토큰 효율 5기법 + MCP 그래프 툴).

**Effort:** XL · **Risk:** High — 프라이버시(원문 저장 경계), 지표의 Goodhart 위험, 로컬 인제스트의 신뢰 경계, 다중 테넌트 확장이 모두 load-bearing.

**Decisions locked (do not relitigate):** ADR-011의 7개 프라이버시 규칙; access_events는 계속 원문 비저장; 자체 코드 보안 스캐너 비목표(의존성 감사 수집만); 레포 쓰기는 advisory-only PR 하나; 효율 주장은 벤치 리포트 인용으로만; 결정론 우선(임베딩은 실험 후순위).

---

## Wave 1 — 등록 플로우 (§4)

MVP는 GitHub App 설치가 유일한 입구다. 공개 전 진입 장벽을 없앤다.

- [x] **1. 레포 URL 등록 경로**
      온보딩에 "레포 주소 붙여넣기" 입력을 추가 — URL을 파싱해 owner/repo를 뽑고, 미설치면 **해당 레포만 선택된 상태로** GitHub App 설치 화면으로 유도, 설치돼 있으면 즉시 연결. 잘못된 URL·비공개 레포·권한 없음·이미 연결됨을 각각 구분해 안내. (Vercel Import Git Repository UX 벤치마크)
      수용 기준: URL 파서 단위 테스트(https/ssh/짧은 형태/쿼리·해시 포함/오타), 각 실패 상태의 라우트 테스트, Playwright로 붙여넣기→설치 유도→연결 완료 여정.
      Commit: `feat(onboarding): connect a repository by url`

- [x] **2. 커밋별 분석 카드**
      푸시 webhook 파이프라인은 이미 있다 — 이를 **Vercel 배포 카드처럼** 노출: 커밋별 상태(대기/분석중/완료/실패), 소요 시간, 발견 델타(+n/−n), 영수증 링크, 실패 사유. 목록과 상세.
      수용 기준: 상태 전이 테스트(대기→분석중→완료/실패), 델타 계산 테스트, 실패 사유가 그대로 표시되는지, Playwright 카드 목록 여정.
      Commit: `feat(dashboard): show per-commit analysis cards`

- [x] **3. 로컬 인제스트 CLI (`arr push`)**
      Git을 안 쓰거나 비공개로 두려는 사용자를 위한 경로. **스캔·파싱은 로컬에서 수행하고 메타데이터만 업로드**한다 — 원본 코드 비저장 원칙이 로컬 경로에서도 동일하게 성립해야 하며, 이를 테스트로 강제한다. 워크스페이스 토큰으로 인증.
      수용 기준: 업로드 페이로드에 파일 본문이 없음을 증명하는 테스트, 동일 레포를 CLI/GitHub App 두 경로로 넣었을 때 동일 그래프가 나오는 동등성 테스트, 오프라인·부분 실패 처리.
      Must NOT: 원본 코드 전송, GitHub 경로의 결정론 파이프라인과 다른 규칙 사용.
      Commit: `feat(cli): ingest a local project without github`

## Wave 2 — Data Brain v2 (§1·§2)

연구가 지목한 효율 기법과 그래프 툴. **각 기법은 벤치 A/B로 효과를 측정한 뒤 기본값이 된다.**

- [x] **4. MCP 그래프 툴 5종**
      `search_nodes` / `get_neighbors`(depth≤2) / `trace_path` / `get_node_content` / `impact_of`. 응답은 **ID-first**(본문은 명시 요청 시 2단계), graphify의 `path`/`explain` 출력 형식을 레퍼런스로. 기존 `search_index`·`query_brain`과 역할이 겹치지 않게 정리하고, 겹치면 통합한다.
      수용 기준: 툴별 계약 테스트, 멀티홉 정답 경로 픽스처, ID-first 응답에 본문이 섞이지 않음, 테넌트 격리, 호출 시 access_event 발행(원문 비저장 유지).
      Commit: `feat(mcp): add graph traversal tools`

- [x] **5. 질의 라우팅**
      독립 연구 결론: **단순 조회는 grep/검색, 멀티홉·관계형만 그래프**. 서버가 질의 유형을 판별해 적절한 경로를 추천/선택하고, 라우팅 근거를 응답에 남긴다.
      수용 기준: 질의를 단순/멀티홉으로 태깅한 픽스처에서 라우팅 정확도, 잘못 라우팅됐을 때의 폴백, 벤치에 grep-only / graph-only / 라우팅 3조건 과제 추가.
      Commit: `feat(brain): route queries by question shape`

- [x] **6. 토큰 효율 기법**
      ⑴ ID-first 계층 로딩 ⑵ 프롬프트 캐싱(정적 프리픽스) ⑶ 툴 정의 지연 로드 ⑷ compaction-safe 장기 세션. 각각 **벤치 A/B로 켜기 전후를 측정**하고 결과를 리포트에 남긴다.
      수용 기준: 기법별 on/off 플래그와 측정, 리포트에 기법별 델타 표, 정확도 하락 시 기본값 off 유지.
      Commit: `feat(brain): apply measured token-efficiency techniques`

- [x] **7. 스캐너 확장 (흡수 항목)**
      ⑴ rationale 주석(`# WHY:` / `# NOTE:`)과 ADR 인용을 **1급 노드**로 추출해 코드↔의도를 연결 (G4) ⑵ tree-sitter 다언어 AST를 심볼 추출의 1순위로 승격, 정규식은 폴백 (G5) ⑶ 핸드오프·세션 파일(`.claude/session-state.md`, `current-task.md` 등)을 `todo_progress`로 인식 (H1).
      수용 기준: 언어별 심볼 추출 픽스처(ts/js + 최소 2개 언어), rationale 노드의 provenance, 핸드오프 파일이 진행 대시보드에 반영되는 경로 테스트.
      Commit: `feat(ingest): extract rationale, multi-language symbols, handoff files`

## Wave 3 — 점검 Dashboard (§6)

- [x] **8. 통합 점검 뷰**
      진척·todo(기존) + 발견 문제 + **문서 점검·요약**(신선도, 요약은 `inferred` 라벨 판단 잡) + **취약점**: ⑴ 문서·드리프트 기반 위험 ⑵ **의존성 감사 수집**(npm audit / CI 아티팩트 인제스트). 자체 코드 보안 스캐너는 계속 비목표.
      ⑶ **시도·배제 이력**(H3): 이미 시도해 배제된 가설·수정을 append-only로 남겨 같은 막다른 길을 반복하지 않게 한다.
      수용 기준: 각 위젯의 출처 라벨(무엇에서 왔는지), 요약이 `inferred`로 표시되는지, 의존성 감사 파서 테스트, 데이터 없을 때 "증거 부족" 표시, 자체 스캐너 부재를 증명하는 scope 테스트.
      Commit: `feat(dashboard): add project inspection view`

## Wave 4 — 팀 (§5) — **ADR-011 준수가 수용 기준의 일부**

- [x] **9. 팀 워크스페이스**
      초대·역할(owner/admin/member/viewer)·공유 그래프·팀 진척. 스키마는 이미 팀 대비 상태다.
      수용 기준: 역할별 권한 매트릭스 전수 테스트(양성·음성), 초대 수락/철회, RLS 교차 테넌트 차단, 기존 솔로 워크스페이스 무영향.
      Commit: `feat(teams): add workspaces with roles`

- [x] **10. 프롬프트 기록 (ADR-011)**
      **이중 옵트인**(워크스페이스 켜기 + 팀원 개별 동의), **로컬 우선**(레포 내 파일, gitignore 기본), 서버는 **메타데이터·파생 점수만** 기본 저장, 원문 동기화는 별도 스위치이며 **열람은 작성자 본인**이 기본. 작성자가 명시 공개한 프롬프트만 팀에 보인다. 삭제권 즉시 반영.
      수용 기준: 동의 없는 팀원의 데이터가 어떤 경로로도 저장되지 않음(음성 테스트), 원문 스위치 off 상태에서 원문이 DB에 없음, 타인 원문 열람 차단, 삭제가 파생 점수·집계에서 사라짐, **access_events와 프롬프트 저장소가 섞이지 않음**을 증명하는 테스트.
      Must NOT: 동의 상태를 팀에 노출, 원문을 access_events에 기록.
      Commit: `feat(teams): opt-in local-first prompt capture`

- [x] **11. AI 프롬프트 코칭**
      루브릭 6축 0–2점 채점(컨텍스트 근거 / 구체성 / **검증 가능성** / 배치 크기 / 정지 조건 / 과잉 지시 없음) + 개선안 제안. 학술 근거: 검증 신호가 채택 확률 ~8배. 크레딧 과금 판단 잡, 출력은 `inferred`.
      수용 기준: 루브릭 채점 스키마 계약 테스트, 형식만 갖춘 껍데기 프롬프트가 고득점을 못 받는 음성 케이스, 실패 시 무과금, 로컬 전용 사용자도 코칭 사용 가능.
      Commit: `feat(teams): score and coach prompts`

- [x] **12. 증거 기반 기여도 + VIBE Index v0**
      커밋·영수증·발견 해소·프롬프트 기록을 연결해 **"누가 어떤 요구사항을 증명까지 끌고 갔나"**를 산출. 지표 후보 V1~V7 중 **Goodhart 게이트를 통과한 것만** 노출한다(ADR-011-7). 개인 점수는 본인, 팀 뷰는 집계·분포.
      수용 기준: 지표별 산식의 결정론 테스트, 자가보고 입력이 없음을 증명, 개인 비교 표가 정책 활성화 전에는 접근 불가, **미통과 지표가 UI에 렌더되지 않음**을 증명하는 테스트.
      Commit: `feat(teams): evidence-based contribution and vibe index`

- [x] **13. 지표 하네스 주입 A/B (연구 실행)**
      "이 지표를 높여라"를 하네스에 주입하고 **숨겨진 정답 테스트**로 정확도를 측정 — 지표↑&정확도↑면 채택, 지표만 오르면 폐기·재설계. 벤치 하네스(v3)에 통합, 2모델×2하네스 재현.
      수용 기준: 실행 가능한 실험 스크립트, 지표별 판정 기록, 결과를 달성/미달 무관 공개, 미통과 지표가 todo 12에서 자동 비노출.
      Commit: `feat(bench): validate vibe metrics against hidden tests`

## Wave 5 — 이월 부채 · 최종 게이트

- [x] **14. Phase 2A 이월 항목 해소** _(OQ-006·007 해소; OQ-008은 Supabase 사람 준비물 차단 — OPEN_QUESTIONS·CHANGELOG에 명기)_
      OQ-006(캔버스 히트 레이어 axe 대상 편입 + 600 타깃 키보드 순회 비용 측정), OQ-007(HUD 26px 튜닝 상수를 구조적 레이아웃으로), OQ-008(`/auth/*`·`/app/*` 명암비 실검증 — Supabase 기동 포함).
      Commit: `fix(ui): resolve carried-over a11y and layout debt`

- [x] **15. 최종 검증·핸드오프**
      전체 vitest/Playwright green, 가드레일 스위트 무변경 증명, 프라이버시 음성 테스트 전수 통과, 신규 화면 문서화, CHANGELOG.
      Commit: `chore(release): phase 2b verification`

---

## Must NOT have (전 페이즈 공통)

- 동의 없는 프롬프트 수집, 원문의 access_events 혼입, 동의 상태의 팀 노출.
- Goodhart 게이트 미통과 지표의 제품 노출.
- 자체 코드 보안 스캐너, 스킬 마켓플레이스, 직접/자율 레포 쓰기.
- 측정 없는 효율·성능 주장(리포트 인용 없는 수치).
- 로컬 인제스트 경로에서의 원본 코드 전송·저장.
- 가드레일 스위트·분석기 약화(개명·리팩터로 무력화되는 것 포함 — 위반을 심어 실패하는지 재증명할 것).

## 검증 전략

Phase 2A와 동일: 할일 = 구현+테스트, 수용 기준은 테스트로 판정, 웨이브당 한 세션, 세션 종료 시 lint/typecheck/test green. **추가로 이 페이즈는 "음성 테스트"가 1급 산출물이다** — 프라이버시·권한·지표 노출 조건은 "되는 것"보다 "안 되는 것"을 증명해야 한다.

## 우선순위 제안

1. **Wave 1**(등록) — 공개 전 필수, 위험 낮음
2. **Wave 3**(점검 Dashboard) — 기존 데이터 재조합이라 비용 대비 효과 큼
3. **Wave 2**(Data Brain v2) — 벤치 v3와 연동해 효과 측정
4. **Wave 4**(팀) — 가장 크고 민감. ADR-011 음성 테스트가 선행
5. **Wave 5** — 마무리
