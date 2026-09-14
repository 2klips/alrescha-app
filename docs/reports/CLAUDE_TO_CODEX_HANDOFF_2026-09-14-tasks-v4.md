# Claude → Codex 인수인계: OQ-070 ⑴ — 동결 질문 세트 v4(`tasks.v4.json`, 개명 후 별칭 추가)

작성: 2026-09-14 · 대상: Alrescha 배포를 담당하는 Codex
상태: **머지만 — 배포·검증·벤치 실행 없음.** 매니페스트 파일 1개 신규, 벤치 로더 배선, 테스트, 문서. 웹 화면·워커·마이그레이션·환경변수·사이트 문구 무변경. 크레딧 소모 0.
브랜치: `phase4/oq-070-tasks-v4` (`main@19d789c` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/oq-070-v4-manifest-2026-09-14.md`](../../.omo/evidence/phase4/oq-070-v4-manifest-2026-09-14.md), [`spec/OPEN_QUESTIONS.md` OQ-070](../../spec/OPEN_QUESTIONS.md).

## 1. 왜

graph-surface v1·v2·v3가 채점하는 동결 매니페스트 `tasks.v3.json`의 두 정답 문자열(`arr.dev/receipt/v1`, `ARR:BEGIN`)이 제품 개명 뒤 소스에서 사라져, v3에서 두 문항이 양 군 모두 2/3 상한에 걸렸다(OQ-070). 사용자 결정 ⑴: 별칭을 **추가**한 v4 매니페스트(기존 별칭 삭제 없음, 새 다이제스트, graph-surface 다음 실행부터).

## 2. 변경 파일과 동작

| 파일                                                                                | 동작                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `benchmarks/databrain/tasks.v4.json` (신규)                                         | v3 텍스트 + 별칭 4개(`https://arr-app-web.vercel.app/receipt/v1`·`arr-app-web.vercel.app/receipt/v1`, `alrescha:begin`·`alrescha begin`). diff는 삽입 6줄. 로더 다이제스트 `4baeed03…`.              |
| `benchmarks/databrain/tasks.v3.json`                                                | **무변경**(다이제스트 `7a317232…` 유지 — v1·v2·v3 리포트 감사 그대로).                                                                                                                               |
| `scripts/graph-surface-benchmark/manifest.ts`, `audit.ts`, `bench-graph-surface.ts` | 사전등록의 `questionSource.manifest`를 파싱해 그 파일을 읽는다(레포 루트 기준). 이름은 있는데 루트가 없으면 거부, v3 다이제스트를 v4 파일에 핀하면 불일치로 거부. v1–v3 파일은 종전대로 v3를 읽는다. |
| `scripts/graph-surface-benchmark/print-manifest-digest.ts` (신규)                   | 두 다이제스트 출력(읽기 전용).                                                                                                                                                                       |
| `tests/benchmark-manifest-v4.test.ts` (신규)                                        | 6건.                                                                                                                                                                                                 |
| `spec/OPEN_QUESTIONS.md`, `.omo/evidence/benchmark-v3.md`, `AGENTS.md`              | OQ-070 상태 갱신(⑴ 적용), 다이제스트 추기, 인계 링크.                                                                                                                                                |

graph-surface **v4 사전등록은 만들지 않았다** — 다음 실행이 무엇을 바꿀지는 OQ-071 결정이고, 그 전의 잠금은 아무도 고르지 않은 것에 대한 잠금이다.

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 전체 green(수치는 PR 본문) · `scripts/verify-scope-boundaries.ts` PASS · `git diff --check` clean.
- `node --import tsx scripts/verify-benchmark-report.ts`: efficacy 600/600 PASS, graph-surface v1·v2·v3 96/96·relational 32/32 PASS — 종전과 동일(v3 매니페스트 불변).

## 4. 배포 필요 사항

- **마이그레이션** — 없음. **웹 배포** — 머지 시 Vercel이 돌지만 화면 변경 없음. **워커** — 없음. **환경변수** — 없음.

**절차: 머지만.**

1. PR을 merge commit으로 머지. Vercel 성공만 확인.
2. 검증(크레딧 0): `node --import tsx scripts/graph-surface-benchmark/print-manifest-digest.ts`가 v3 `7a317232…`·v4 `4baeed03…`를 내는지, `verify-benchmark-report.ts`가 종전 PASS 줄을 내는지 각 1회.
3. `pnpm ops:health`: 변화 없음이 정상.
4. **벤치를 돌리지 않는다.** v4 매니페스트는 다음 graph-surface 사전등록(OQ-071 결정 뒤)이 핀한다.

## 5. 롤백 지점

- 코드 revert만. 데이터·인프라 변경 없음.

## PR

- TBD_PR_URL — 커밋 1건: `feat(bench): add the tasks.v4 question manifest with post-rename aliases (OQ-070 ⑴)`. 머지만 필요하다(§4).
