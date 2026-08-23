# Phase 3 Wave B todo 3 — import/call 엣지 (신뢰도 2티어) (2026-08-23)

## 무엇을 만들었나

- **`packages/core/src/ingest/code-links.ts`** — 파일 단위 파스(TS AST: import/export-from/dynamic import + 호출 지점 + 로컬 선언; Python: 구조 파스 import) → 저장소 전역 해석(`resolveCodeLinks`). 티어 정직성:
  - `resolved` = 결정론 연결만 — 상대 지정자 모듈 해석(index·NodeNext `.js`→`.ts` 포함), import 바인딩 경유 호출(`ns.other()` 네임스페이스 멤버 포함).
  - `reference` = 단독 소유자 이름 매칭 — **정확히 한 파일만** 그 이름을 export할 때. 모호하면 엣지 없음("추측 엣지는 없느니만 못하다"). Python import는 구조 파스라 전부 reference.
  - 외부 패키지 지정자는 엣지 없음. 링크는 (source,target,kind)당 1개로 집계, 심볼 최대 8개, resolved 목격이 reference를 승격.
- **플랜 확장**: `RepositoryScanPlan.codeLinks` — 변경 파일의 링크만 재계산(미변경 파일의 저장 엣지는 유효 유지 = 증분의 본질). 이름 매칭은 미변경 파일의 저장된 `exported_symbols`(previousArtifacts)를 본다. `arr push` 경로의 strict zod 스키마에도 `codeLinks` 추가(안 하면 클라이언트 업로드가 400).
- **`202608230002_code_link_edges.sql`**: `edges_relation`에 `imports`/`calls` 추가 + `apply_repository_scan` v4 — 이번 패스에 스캔된 파일의 진출 구조 엣지를 **삭제 후 재기록**, provenance에 tier/method/symbols/span, confidence는 resolved 1.0·reference 0.6. 타깃 아티팩트가 없으면(스킵 파일) 무시. 삭제 파일의 엣지는 노드 FK 캐스케이드.
- **표시**: relation 어휘에 imports/calls 추가. **구조 티어(resolved/reference)는 등급 색이 아니라 중립 `--line-strong`** — import는 배선의 사실이지 주장의 증거가 아니므로 두 어휘를 섞지 않는다(evidence 색은 verified/inferred/broken 그대로).
- ADR-014 준수: tree-sitter 없이 기존 엔진 체인(TS 컴파일러 syntactic AST + 구조 파서). 체커 프로그램 미구축 — Go import 해석은 go.mod 모듈 해석이 필요해 이번 범위에서 제외(OQ-019 판정과 함께 재검토).

## 게이트

- vitest **767/768** (신규 `tests/code-links.test.ts` 9건: 해석 형태·바인딩 호출·단독 소유자 매칭·모호성 거부·Python·실픽스처 배선(tests/session.test.ts→src/session.ts imports+calls, isSessionExpired)·스캔 시간 상한 10s + PGlite 증분 교체 2건 — 변경 파일만 엣지 교체·미존재 타깃 스킵)
- Playwright 116/116 · lint 0경고 · typecheck · format:check · scope PASS
- 로컬 Supabase에 202608230002 적용

## 함정 기록

- 네임스페이스 임포트에서 로컬 바인딩명("ns")과 export 심볼명("*")을 한 배열에 섞으면 호출 바인딩 조회가 깨진다 — `bindings`(local↔symbol)와 `names`(표시용)를 분리해서 해소.
- strict 스키마(`repositoryScanPlanSchema`)는 필드 추가를 즉시 400으로 만든다 — 플랜 형태를 바꾸면 스키마·테스트 픽스처(EMPTY_PLAN 등)를 같은 커밋에서 갱신할 것.
