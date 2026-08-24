# Phase 3 Wave C todo 8 — Lazy 모듈 요약 + `explain_module`/`repo_overview` (2026-08-24)

## 무엇을 만들었나

- **데이터 레이어 군집** (`packages/core/src/brain/modules.ts`): import/call 엣지 위 **결정론 라벨 전파**(정렬 순회·사전식 타이브레이크·고정 라운드). 재량 판정: 렌더 Louvain을 그대로 승격하지 않았다 — **Louvain은 무작위성이 있어 캐시 키가 될 수 없다**(같은 그래프가 실행마다 다른 군집이면 다이제스트 무효화가 무의미). 입력 순서 무관 동일 출력을 테스트로 고정. 클러스터 키 = `module:<최소 멤버 경로>`, 이름 = 공유 디렉터리.
- **Lazy 캐시** (`202608240003_module_summaries.sql`): `module_summaries`(모듈 키 unique upsert, member_digest = 신선도, grade `inferred` 고정 제약). `enqueue_module_summary_job` — **(모듈, 다이제스트)당 멱등** 인큐, enrich 잡에 모듈 스코프 payload, 크레딧 규칙 상속(credits 1 / byok 0).
- **워커 모듈 모드**: enrich payload에 `moduleKey`가 있으면 그 클러스터만 — 미캐시 멤버 요약 후 멤버 산문 → 모듈 산문(`summarizeModule` 프로바이더 메서드, 동일 산문 계약 검증). 저장 다이제스트는 **클레임 시점 멤버 상태** 기준(인큐~클레임 사이 rescan을 정직하게 반영).
- **MCP 22툴** (`packages/mcp/src/module-tools.ts` + hosted 등록, 알파벳 순서 유지):
  - `explain_module(node_id)` — 구조 군집은 매 호출 결정론 유도(항상 무료·신선), 산문은 3상태: `ready`(다이제스트 일치, 캐시 서빙) / `stale`(옛 산문 표시 + 갱신 잡 인큐) / `pending`(잡 인큐, 멤버 목록은 즉시). LazyGraphRAG "첫 질의 시 생성·캐시·무효화" 그대로 — 단 생성은 **동기 AI 호출이 아니라 크레딧 라이프사이클 잡**(읽기 툴 안의 새 과금 경로 금지).
  - `repo_overview()` — 모듈 클러스터·크기 + **신선한 산문만** 병기(낡은 산문은 null), 모델 호출 0. "이 레포 아키텍처" 질문의 grep 불가 응답.
- MCP 워크스페이스 데이터에 `blobSha`(신선도 입력)·`moduleSummaries` 편입(옵셔널 — 기존 픽스처 불변).

## 검증

- 단위: `modules.test.ts` 3건(군집·결정론·다이제스트), `module-tools.test.ts` 6건(**3상태 전이 전부** + 미소속 null + overview 신선/낡음 분기), `enrich-job.test.ts` 모듈 모드 1건.
- DB: `tests/module-summaries.test.ts` 2건 — (모듈,다이제스트) 멱등 인큐·크레딧 형태, upsert.
- 툴 계약: `hosted.test.ts` 갱신 — 22툴 결정론 순서·입출력 스키마·readOnly 어노테이션 전수.
