# Phase 3 Wave B todo 4 — 공변경 엣지 (2026-08-23)

## 무엇을 만들었나

- **웹훅 정규화 확장** (`packages/core/src/github/webhook.ts`): push 페이로드의 `commits[]`에서 커밋별 터치 경로(`added+modified+removed`, 중복 제거·정렬)를 `commitFiles`로 추출. **파일 1개(쌍 없음)·50개 초과(벌크 churn)·sha 비정상 커밋은 정규화 단계에서 탈락.** 경로만 이동 — diff·본문 없음.
- **`202608230003_file_co_changes.sql`**: 쌍 카운트 테이블(`path_a < path_b` 체크, 테넌트 FK 캐스케이드) + `record_push_co_changes` rpc(service_role 전용, SQL에서도 2..50 가드 재검증). **grant를 스스로 지명**(authenticated select + service_role all — Wave 1·Wave A 두 번의 grant 함정을 마이그레이션 주석으로 명문화).
- **재생 안전**: webhook-store가 배달이 **inserted일 때만** 카운트 기록 — `replay-github-deliveries.ts`로 재전송해도 배달 id 중복이면 카운트가 안 움직인다.
- **표시**: 로더가 `change_count >= 3`(CO_CHANGE_MIN_COUNT)만 읽어 `co_changed` 표시 엣지로 유도(reference 티어=가는 중립 실선, confidence = count/10 캡 1.0, reason-only provenance — 증거는 스팬이 아니라 카운트). `edges` 테이블에 행을 만들지 않는다 — 카운트가 단일 사실이고 엣지는 읽기 시점 유도(facet 엔진과 같은 원칙). 맵 컨트롤에 토글(기본 켬).

## 게이트

- vitest **773/774** (신규 `tests/co-change-edges.test.ts` 6건: 정규화 필터·비push 빈 배열·임계 이상만 엣지·미만 비생성·PGlite 누적+가드·RLS 테넌트 격리)
- Playwright **116/116** — workspace-map.spec 확장: 실스캔 후 imports/calls 엣지가 sr-only 목록에 존재 + rpc 3회로 임계 돌파 → co_changed 렌더 → 토글로 소거
- lint·typecheck·format·scope 245파일 PASS · 로컬 Supabase 적용

## 판단 기록

- 임계 3회: 2회는 우연(한 PR의 리팩터), 3회부터 결합 신호로 간주. 상수 `CO_CHANGE_MIN_COUNT` 한 곳.
- 벌크 커밋 50 파일 컷: n²로 커지는 쌍 수(50→1,225쌍)와 "일괄 포맷 커밋은 결합이 아니다"의 절충. 정규화·SQL 양쪽에서 강제(클라이언트 신뢰 안 함).
