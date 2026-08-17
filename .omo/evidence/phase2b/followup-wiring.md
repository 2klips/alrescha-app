# 후속 배선 + OQ-015 판정 (2026-08-17)

Phase 2B 완료 이후 사용자가 지시한 두 항목: **③ 후속 배선 묶음**과 **④ OQ-015 판정**. 네 개 커밋 단위로 진행했다.

## A. OQ-015 판정 — ADR-014 (커밋 `feat(ingest): record symbol-engine provenance`)

**판정: tree-sitter 미채택, 엔진 체인 유지 + 심볼 provenance 기록.**

결정적 논거는 크기·빌드 비용이 아니라 **결정론**이었다 — tree-sitter를 "있으면 쓰는" 선택적 의존성으로 넣으면 같은 커밋이 환경에 따라 다른 심볼을 낳고, 이는 CLI/GitHub 두 경로가 같은 그래프를 만든다는 **ADR-013의 보장을 깬다**. 따라서 전면 채택 아니면 미채택뿐이고, 전면 채택 비용(네이티브 node-gyp / wasm 수 MB를 CLI에 적재)이 **측정된 수요를 넘는다**.

대신 정직성을 강화했다: 아티팩트가 `metadata.symbolEngine`(`typescript-ast`/`python-structural`/`go-structural`, 비코드 null)으로 정밀도 출처를 밝힌다. `metadata`는 **병합** 저장이라 판단 잡 요약이 재스캔에서 살아남는다(`202608170006_symbol_engine.sql`) — 테스트가 "요약 심기 → 재스캔 → 두 키 공존"으로 그 성질을 증명한다. 재검토 트리거는 ADR-014-5에 명시.

## B. 로컬 인제스트 → run (커밋 `feat(ingest): record a run for local ingest…`)

`arr push`가 그래프만 남기고 run을 남기지 않아 커밋 카드에 보이지 않던 공백을 닫았다.

- `record_local_ingest_run` — trigger_kind `manual`, trigger_key `local:<sha>`로 **커밋당 멱등**, 상태는 도착 즉시 `succeeded`(동기 처리라 정착시킬 잡이 없다). **타임스탬프는 서버가 라우트 진입 시점에 측정**하며 클라이언트가 제공하지 않는다(자가보고 금지).
- 커밋 카드 빌더 확장: 잡이 없는 run은 **저장된 run 상태**를 신뢰하고(OQ-014 루프 완결), 잡이 있으면 잡이 계속 권위 — 오래된 run 상태가 진행 중 잡을 덮지 않음을 테스트로 고정(이중 장부).
- **receipt는 만들지 않는다.** receipt는 findings에 대한 증명이고 로컬 경로는 스캔만 하므로, 발급하면 근거 없는 증명서가 된다. 부재를 테스트로 고정하고 아키텍처 제약을 **OQ-016**으로 기록(선택지 ⑴ CLI가 분석까지 로컬 수행 ⑵ 현행 — 보증은 GitHub 연결 시에만 ⑶ CI 아티팩트 업로드).

## C. MCP `record_prompt` + 코칭 무과금 (커밋 `feat(mcp): record prompts through the hosted server`)

- MCP 툴 `record_prompt`(mcp:write) 신설 — 13 → **14 툴**. 호스티드 MCP는 서비스 롤로 동작해 `auth.uid()`가 없으므로 `record_prompt_as`(service_role 전용, 행위자 명시)를 추가했다. **동의 게이트 트리거는 그대로**라 이 경로로도 이중 옵트인을 우회할 수 없다 — 워크스페이스 미활성/미동의/비구성원/원문 스위치 off를 각각 거부하는 것을 DB 테스트로 증명.
- **access_event를 발행하지 않는다** — 발광 스트림과 프롬프트 저장소는 분리 유지(ADR-004). 계약 테스트가 이벤트 부재와 원문 미유출을 함께 단언.
- 코칭 실패의 무과금 경로를 워커와 공유: `CoachingValidationError`가 `JudgmentValidationError`와 같은 `code: "schema_invalid"` 마커를 갖고, 워커는 클래스가 아니라 **마커**로 거부(=환불)한다. 판단과 코칭이 한 규칙을 쓴다.

## D. 팀·코칭·VIBE 화면 (커밋 `feat(teams): surface roles, coaching, and the gated vibe index`)

공개 데모 라우트 `/team` — 위젯 5종. 화면의 임무는 **ADR-011 경계를 눈에 보이게** 만드는 것이라, 단언도 "무엇이 보이지 않는가"에 무게를 뒀다.

| 위젯 | 보여주는 것 |
|---|---|
| 구성원 | 역할 4종·초대 상태, "초대는 아무 권한도 주지 않는다" 명시 |
| 프롬프트 기록 | 워크스페이스 스위치·내 동의·원문 동기화(꺼짐=메타데이터만), "동의 여부는 나만 본다"·"기본 저장은 로컬 파일" |
| 코칭 | 6축 점수 + `inferred` 배지, 관측 안 되는 축은 고득점 불가 명시 |
| 기여도 | commit·verified 증거·해소 발견·증명한 요구사항 (자가보고 거부 명시) |
| VIBE | **게이트가 전부 pending이라 점수 0개 노출** — 판정 목록만 보이고, 비교 표는 정책 잠금 상태 |

픽스처의 게이트 판정은 게시 파일(`benchmarks/vibe/gate-results.json`)과 **동일함을 테스트로 고정**해, 앞으로 어떤 지표가 채택되면 화면이 자동으로 따라가되 조용히 어긋날 수는 없게 했다.

## 게이트

- vitest **661/662** (88 파일; 1 skip = win32 심링크) · Playwright **65/65** (exit 0; 신규 팀 여정 3 + `/team` 두 테마 순회) · eslint·typecheck 무결점 · 스코프 스캐너 **PASS(211 files)**
- 신규 마이그레이션 3종(symbol_engine · local_ingest_run · prompt_capture_mcp) 전부 `ALL_MIGRATIONS` 등록 — 이번에 로컬 인제스트 테스트가 rationale 마이그레이션을 건너뛰던 것도 이 정리로 해소.

## 남은 것

- **OQ-016**(로컬 경로의 findings·receipt) 기획 판단 대기.
- 실데이터 배선(`/team`·`/commits`·`/inspection`의 Supabase 로더 연결)은 Supabase 준비물 이후.
- 코칭 판단 잡의 크레딧 원장 실연결(현재는 무과금 규칙과 워커 경로만 준비).
