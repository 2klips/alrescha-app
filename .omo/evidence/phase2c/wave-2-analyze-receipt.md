# analyze 핸들러 + receipt 발급 (2026-08-21)

파일럿이 남긴 미달분을 닫는 작업. 규칙 엔진은 Phase 2B부터 코어에 있었고 webhook은 첫날부터 `analyze` 잡을 넣고 있었지만 **둘을 잇는 코드가 없었고, receipt 행을 쓰는 코드는 프로덕션 어디에도 없었다.** 그 연결이 이 작업이다.

## 무엇을 만들었나

- `apps/worker/src/analysis-job.ts` — `createAnalysisJobHandler({ readSource, store })`. 저장된 아티팩트 메타데이터 → 필요한 본문만 일시 조회 → `analyzeRepositoryAssurance` → findings 정합 → in-toto statement + digest → receipt.
- `apps/worker/src/postgres-analysis-store.ts` — `PostgresAnalysisStore`. 정합은 트랜잭션 하나로: 재현된 findings는 fingerprint upsert, 더 이상 재현되지 않는 open findings는 `resolved`로.
- `supabase/migrations/202608210001_finding_fingerprints.sql` — `findings.fingerprint` + 부분 유니크 인덱스.
- `packages/core/src/assurance/rules.ts` — `assuranceSourceRequired` export.

## 설계에서 지킨 세 가지

**본문은 일시적이다.** store는 메타데이터만 다루고, 파일 텍스트는 주입된 `readSource`로만 들어와 규칙에 넘겨진 뒤 버려진다. 저장·반환·로그 어디에도 남지 않는다(하드 룰: 원본 코드 본문 저장 금지).

**어떤 파일의 본문이 필요한지는 규칙 옆에서 정한다.** 규칙이 `source`를 읽는 곳은 두 군데뿐이다 — 문서(스팬 슬라이스)와 테스트 파일(요구사항 id 스캔). 나머지는 스캔이 저장해둔 `exportedSymbols`로 판단한다. 그래서 판단 함수를 워커가 아니라 `rules.ts`에 `assuranceSourceRequired`로 두고 규칙과 같은 상수(`TEST_PATH`)를 쓰게 했다 — **코드 본문을 읽는 규칙이 새로 생겨도 다른 곳의 fetcher가 조용히 덜 공급하는 일이 없도록.** 실측 효과: LostArk_Scheduler 370개 아티팩트 중 본문이 필요한 것은 17개.

**재분석은 수렴한다.** 엔진의 결정론적 id(`<type>:<path>:<line>:<column>`)를 fingerprint로 저장한다. 같은 커밋을 다시 분석하면 중복이 아니라 갱신이고, 사라진 finding은 삭제가 아니라 `resolved`다 — 이전 커밋의 receipt가 여전히 그 finding을 가리키기 때문이다.

## 실기 결과

analyze 잡 3건(run당 1건) **전부 성공**, receipt 3건 발급:

```
01M0JCRWVYHP0GJV8BSEP2Y835  57fbb9f  subjects=370  → verified
01M0JCS3TKNXNMNJ62PTB2ZAY5  57fbb9f  subjects=370  → verified
01M0JCSAT70E4058JYRCSPR1G4  57fbb9f  subjects=370  → verified
tampered → tampered
```

저장된 statement를 저장된 digest로 `verifyInTotoStatement`에 넣으면 **verified**, `commitSha`를 한 글자 바꾸면 **tampered**. 수용 기준의 "receipt 발급·검증"이 실데이터에서 성립한다.

**findings는 0건이다.** 이 레포의 분류가 `code_metadata` 368 · `claude` 1 · `agents` 1이라 **`spec`/`adr` 문서가 하나도 없고**, 규칙 대부분은 그 위에서 동작한다. 드리프트가 없다는 뜻이 아니라 **판정 대상이 없다**는 뜻이고, 0을 억지로 채우지 않는 것이 맞다. 그래서 동작 증명은 실기가 아니라 테스트가 맡는다:

- 본문을 읽는 파일이 정확히 문서+테스트 2개뿐임을 단언
- 드리프트가 있는 spec(미완료 태스크가 존재하지 않는 심볼 `createSession`을 지목)에서 **finding이 실제로 생성**되고 fingerprint 형태·`source_node_id` 연결이 맞는지
- 재현되지 않는 finding이 `resolved`로 보고되는지
- receipt digest가 자기 statement로 **verified**, 변조 시 **tampered**
- 아티팩트가 0건이면 **receipt를 발급하지 않고 실패**(없는 것에 대한 보증서를 만들지 않는다)

즉 **실기는 배선을, 테스트는 동작을 증명한다.** 실기만으로 "동작한다"고 말하지 않는다.

## 판단하지 않고 남긴 것

- **OQ-018 신규** — 구현된 receipt 스키마가 `WORK_SPEC` §13과 다르다(subject의 sha1 커밋 항목, predicateType, predicate 필드, `signatures`). 충돌 우선순위상 스펙이 위이므로 구현이 벗어난 상태다. 지금 포맷을 바꾸면 기존 테스트·다이제스트가 깨지고 OQ-010이 Wave 4로 예약한 predicateType 변경과 충돌하므로 **구현 스키마 그대로 발급**하고 기록만 남겼다. §13이 요구하는 `findings{opened,resolved,open_total}`는 predicate가 아니라 `receipts.summary`에 넣었다 — 커밋 카드가 읽는 자리가 거기다.
- **커밋 하나에 receipt 3건**(push·check_run·workflow_run이 각각 run을 만든다). run당 1 receipt라는 해석은 일관되지만, "커밋당 1 receipt"가 맞는지는 제품 판단이 필요하다. 지금은 `previousReceiptDigest`로 체인되어 셋 다 검증된다.

## 검증

- vitest **736/737**(1 skip = win32 심링크, 직전 730 → +6) · Playwright **111/111**
- lint(`--max-warnings=0`)·typecheck·`format:check` green
- `verify-scope-boundaries.ts` **PASS: 12 boundaries, 236 files** · `adr-guardrails.ts` exit 0
- 실기: analyze 잡 3/3 succeeded · receipt 3건 verified · 변조 감지 1건

## 남은 것

1. **`judge`·`coach`·`pack` 배선** — judge/coach는 핸들러가 있으나 `run-local.ts`가 아직 등록하지 않는다(judge는 G3 크레딧 필요). `pack`은 핸들러 자체가 없다.
2. **OQ-018 판정** — 스펙에 맞춰 구현을 고칠지, 스펙을 개정할지.
3. **같은 출처 가드 수정**(파일럿 결함 3) · **OQ-017**(로그인 vs 최소 권한 App) — 둘 다 미해결.
4. 워커 프로덕션화(컨테이너·배포) — Wave 4.
