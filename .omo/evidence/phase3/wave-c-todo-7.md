# Phase 3 Wave C todo 7 — `enrich` 잡 ②: 개념 그래프 합성 (2026-08-24)

## 무엇을 만들었나

- **개념 레이어 스키마** (`202608240002_concept_graph.sql`): `graph_nodes.kind += 'concept'`, `concepts` 테이블(슬러그 unique — 수렴 키, member_paths, source_digest — 신선도), edges relation에 폐쇄 동사 6종 추가(`implements`는 기존). RLS select + service_role grant(반복 함정 명시 처리).
- **단일 쓰기 경로 `apply_concept_graph`**: replace-all(사라진 개념은 노드째 삭제·엣지 캐스케이드), 슬러그 upsert(같은 입력 → 같은 행 = 재실행 수렴), 2패스 링크(뒤에 정의된 개념으로의 전방 참조 허용), 폐쇄 어휘 밖 동사·미지 대상은 SQL에서도 폐기(TS clean 패스의 2차 방어선). 개념 엣지 provenance `tier: 'inferred'` → 맵에서 자동 점선.
- **clean 패스** (`packages/core/src/enrich/concept-graph.ts`): 강제 tool-use(Anthropic `tool_choice` 고정) / strict json_schema(OpenAI) 출력 → 구조 실패만 `schema_invalid`(환불), 내용 의심(개방 동사·미지 경로·앵커 없는 개념)은 **추측 없이 폐기**. 배치(48k자 상한) 간 **슬러그 병합**으로 파편화 방지. 신선도 다이제스트는 md5(`path:blobSha` 정렬 결합) — **SQL과 TS가 같은 공식**(collate "C"로 바이트 정렬 고정).
- **인큐 확장**: `enqueue_enrich_job`이 개념 레이어 신선도(요약 다이제스트 ≠ 저장 다이제스트)도 pending으로 판정 — 요약이 전부 캐시여도 개념이 낡았으면 잡이 선다.
- **그래프 뷰**: `GraphNodeType += 'concept'`(`--node-concept` 토큰, 두 테마), `/app/map` 로더가 `concepts`를 로드, **개념 레이어 토글**(`graph-concept-toggle` — off면 개념 노드+접촉 엣지 제거, 구조 불변), HUD에 개념 카운트, 필터에 "개념".
- **노드 크기 = PageRank** (`render-frame.ts`): 차수 대신 `personalizedPageRank`(무시드 = 전역) 점수를 기존 `nodeRadius` 눈금으로 스케일. GraphData 정체성 기준 WeakMap 캐시 — 프레임당 재계산 없음. `nodeRadius` 시그니처는 유지(격리 함수 교체 설계 그대로).

## 검증

- 단위: `concept-graph.test.ts` 7건(clean 패스 보존/폐기·never-billed·슬러그 수렴·배치 병합·다이제스트), `enrich-job.test.ts` 개념 3건(합성·다이제스트 일치 시 모델 0호출·구조 위반 reject).
- DB: `tests/concept-graph.test.ts` 5건 — 슬러그 upsert 수렴(노드 id 보존), inferred provenance, 폐쇄 어휘 밖 폐기, replace-all, **인큐가 낡은 개념 레이어를 pending으로 보고 신선하면 null**(SQL/TS 다이제스트 공식 일치 증명).
- Playwright: `workspace-map.spec.ts` — 실 시딩 워크스페이스에서 개념 노드 렌더 + `uses:` 점선 엣지 + **토글 off → 노드 수 -1·개념 엣지 0**(뷰 토글 수용 기준).
- 실기: 파일럿 개념 합성 결과는 `wave-c-real-run.md`.
