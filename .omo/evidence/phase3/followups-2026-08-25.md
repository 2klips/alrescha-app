# Phase 3 후속 3종 — OQ-017 판정 · 기법 defaultOn 재판정 · graph-surface v2 (2026-08-25)

Wave F 종결 직후 사용자 지시로 실행한 후속 세 건.

## 1. OQ-017 판정 — 로그인용 OAuth App 분리 (⑴ 채택)

- **판정 근거:** ⑴만이 가드레일을 불변으로 둔다. 계정 신원(로그인)과 레포 접근(App)은 실제로 다른 권한 모델 — 앱 분리가 정직한 구조다. ⑵는 가드레일 약화(ADR 개정 필요), ⑶은 자체 auth 재발명이라 기각.
- **구현:** `supabase/config.toml` provider 자격증명을 `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`로 분리(App 자격증명 재사용 금지 주석), `email_optional = true` 우회 제거(OAuth App은 `/user/emails` 정상 서빙). `docs/DEPLOYMENT_CHECKLIST.md`에 등록 절차 추가. `spec/OPEN_QUESTIONS.md` OQ-017 → resolved.
- **남은 사람 준비물:** GitHub OAuth App 등록(콜백 = `<SUPABASE_URL>/auth/v1/callback`) + 환경 변수 2종. 등록 전까지 GitHub 로그인 실기 검증은 보류(테스트 이메일 세션 우회 유지).

## 2. 기법 defaultOn 재판정 — 표본 3배 확대 실측

**전제 발견:** 기법 4종은 제품에 적용된 적이 없다 — e796a49는 벤치 하네스에만 on/off 플래그를 넣었고, 제품 data-brain 서빙은 TechniqueFlags를 소비하지 않는다(미지정 = 전부 off·바이트 불변). "defaultOn"은 게시된 권고 컬럼이므로, 재검토 = 재측정 후 권고 갱신이다.

- **하네스 확장:** `measureTechniquesReal`에 `repeats`(반복 = 신규 호출, 반복 내 동일 컨텍스트는 호출 공유 — 캐시 키에 반복 인덱스 포함) + `defaultOnReal`(dry-run과 동일 게이트를 실측 회수율에 적용: 하락 = off, 유지 시에도 절감·캐시·개선 중 하나로 스위치를 벌어야 on). CLI `--repeats`.
- **실행:** `--real --repeats=3` — 기법·측당 24시행(총 48/기법).

| 기법 | Δtokens (등록→실측) | Δrecall pp (등록→실측) | 재판정 |
|---|---|---|---|
| id-first-loading | −14.2 → **−26.8** | 0 → −2.78 | **off** |
| static-prefix | +2.0 → −2.5 | 0 → −1.81 | **off** |
| lazy-tool-definitions | −4.7 → −16.3 | 0 → −2.28 | **off** |
| compaction-safe-session | +4.1 → +4.4 | +16.7 → +16.3 | on |

- 1반복 실측의 큰 하락(id-first −12.5pp)은 3반복에서 −2.78pp로 줄었다 — 표본 노이즈가 컸다. 그러나 게이트는 사전등록대로 점 기준 "하락 = off"이며 세 기법 모두 하락이 측정됐다 → **off 권고**. compaction-safe는 등록값과 정합(+16.3pp) — on 유지.
- 게시: `techniques.real.{json,md}` 갱신(등록 컬럼은 dry-run 역사 기록으로 불변, 재판정 컬럼이 현행 권고).

## 3. graph-surface v2 — 표면 개선 후 사전등록 재실행

- **v1 실패 분해:** FAIL 대부분이 턴 캡 소진(미제출). 원인 ⑴ v1 그래프 군은 제품이 실제 서빙하는 발췌 검색(search_index)을 뺀 그래프-단독 구성 ⑵ 본문 폴스루가 1노드/턴.
- **제품 개선(선출하):** `get_node_content`에 배치 형태(`node_ids` ≤4, 한 호출) — `hosted.ts` 스키마 확장(단일 `node` 계약 유지 + `nodes[]`), access_event는 배치 전체 대상, 계약 테스트 추가(배치·미지 id 드롭·기존 단일 형태 불변).
- **하네스:** 툴 표면을 사전등록의 armTools 목록에서 해석(`toolDefinitionsForNames` — 하드코딩 제거), `search_index` 실행기(발췌 280자 클립), `get_node_content` 공백 구분 다중 id 배치. CLI `--preregistration=` + `resultsBasename`.
- **사전등록 v2** (`preregistration.v2.json`, 다이제스트 잠금): 그래프 군에 search_index 추가 + 배치 본문. **질문 세트·그리드·턴 캡·채점·가설은 v1과 바이트 동일**(테스트로 고정). `changesFromV1`에 근거 명문. 드라이런 96/96.
- **실행 (96/96, 실패 0): 판정 NOT MET** — 턴 Δ +2.31(v1 +2.02), PASS율 Δ −12.5pp. 판정 무관 게시(`results.v2.*`).

| 모델 | 군 | 턴 | PASS율 | 입력 토큰 |
|---|---|---|---|---|
| sonnet | 파일 탐색 | 5.04 | 0.833 | 712k |
| sonnet | 그래프 | 5.42 | **0.875** | **537k (−25%)** |
| luna | 파일 탐색 | 4.38 | 0.917 | 483k |
| luna | 그래프 | 8.63 | 0.625 | 466k |

- **v2의 발견:** sonnet은 v1 대비 개선(0.833→0.875 — search_index·배치가 작동), luna는 악화(0.708→0.625). luna의 그래프 군 FAIL 7건 전부가 **턴 캡 소진·미제출(툴콜 11~17)** — 검색 실패가 아니라 **정지 문제**다: 더 깊은 툴 메뉴가 luna를 과탐색으로 유도한다. 같은 표면에서 sonnet은 2~5턴에 제출한다 — 델타는 표면 성능만이 아니라 모델의 도구 사용 행동에 강하게 의존한다.
- **v3 후보(미착수):** 제품의 지시 블록 설치기(todo 11)가 정확히 이 문제를 위해 존재한다 — 그래프 군 하네스에 출하되는 지시 블록(사용 요령·정지 규율)을 포함해 "설치된 상태의 표면"을 측정. 별도 사전등록으로.

## 게이트

- lint ✅ · typecheck ✅ · vitest 전체 green(커밋 전 확인) · scope boundaries PASS · verify-benchmark-report PASS(v2·v3 릴리스). hosted 계약 테스트 20 + graph-surface 테스트 13.
