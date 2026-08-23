# 같은 출처 가드 수정 — 파일럿 결함 3 (2026-08-22)

실기 파일럿이 드러낸 결함 3의 해소. 당초 "프로덕션 도메인이 정해지는 Wave 4에서 허용 출처 명시 설정으로"라고 미뤘지만, 재검토 결과 **도메인 지식이 아예 필요 없는 수정**이라 지금 처리했다.

## 결함의 실체 — 두 갈래였다

근본 원인은 하나다: **Next가 `request.url`을 브라우저가 부른 호스트가 아니라 서버가 바인딩한 호스트로 정규화한다.** 이게 두 군데서 터진다.

**⑴ 가드.** `Origin 헤더 !== new URL(request.url).origin` 비교라, `localhost`로 바인딩된 dev 서버에 `127.0.0.1`로 접속하면 모든 보호된 POST가 403. 픽스처 테스트는 요청 URL과 Origin을 같은 문자열로 만들므로 구조적으로 못 잡는다.

**⑵ 리다이렉트 — 수정 중 추가 발견.** 같은 `requestUrl.origin`으로 리다이렉트 URL을 만들고 있었다(`/app?github=pending`, `backToConnect`, 콜백의 성공·오류 경로 전부). `127.0.0.1` 사용자가 레포 연결을 마치면 `localhost`로 보내지는데, 브라우저에겐 **다른 사이트라 세션 쿠키가 안 따라간다** — 플로우 한복판에서 로그인 화면에 떨어진다. 실제로 파일럿에서 연결 완료 후 착지 URL이 `localhost`였다(그때는 처음부터 localhost로 접속해 있어서 안 터졌을 뿐).

## 수정 — `apps/web/lib/security/same-origin.ts`

- `isSameOriginRequest(request)` — Origin의 host를 `request.url`이 아니라 **Host 헤더**와 비교한다. 두 값 모두 같은 브라우저 요청에서 오므로, 사용자가 어떤 별칭으로 접속했든 same-origin 제출은 통과하고 교차 출처는 막힌다. Origin 부재·`"null"`(opaque)·비URL은 **fail-closed** — 보호 대상 호출자는 전부 same-origin form/fetch라 Origin을 항상 보낸다. Host를 보존하는 프록시 뒤에서 그대로 동작하므로 Wave 4 배포 형태에서도 별도 설정이 필요 없다.
- `addressedOrigin(request)` — 리다이렉트용. scheme은 `request.url`에서(브라우저는 Host에 scheme을 안 보낸다), host는 Host 헤더에서.

적용: `api/github/repositories`(가드+리다이렉트), `api/github/repositories/url`(가드+리다이렉트 4곳), `api/github/callback`(리다이렉트 2곳 — GitHub이 top-level로 보내는 라우트라 Origin 가드는 없음, 그대로 유지).

## 검증

**단위** (`same-origin.test.ts`, 5건): `request.url`과 Host 헤더가 일부러 어긋난 요청 — 결함이 터지던 바로 그 형태 — 로 별칭 2종 통과·교차 출처(다른 포트 포함) 거부·fail-closed 3종·리다이렉트 origin을 단언. **위반 심기**: 비교 대상을 고정 호스트로 되돌리면 1건 실패, 복원하면 5/5.

**라이브** (실 Next dev 서버, curl):

```
① Origin=127.0.0.1 → {"error":"unauthorized"}   ← 가드 통과(401은 세션 부재) — 파일럿에서 403이던 케이스
② Origin=localhost → {"error":"unauthorized"}   ← 가드 통과
③ Origin=evil.example → {"error":"invalid_origin"}
④ Origin 없음      → {"error":"invalid_origin"}
```

## 운영 사건 둘 (코드와 무관, 절차 기록)

- **포트 3000을 다른 프로젝트(LostArk_Scheduler dev-api)가 점유** — Playwright가 `reuseExistingServer`로 엉뚱한 서버에 붙고 smee 중계도 거기로 흘러가는 상태였다. 사용자 승인 받고 종료 후 Arr dev 서버로 교체. 이 대기 중 smee가 LostArk 서버로 404를 흘리고 있었으므로, **다음 실기 검증 전 배달 재전송 필요**(`scripts/replay-github-deliveries.ts`).
- **`.next/dev/types/routes.d.ts` 손상** — dev 서버 이중 기동으로 생성 파일이 겹쳐 써져 typecheck가 깨졌다. 삭제 후 재생성으로 해소. 생성물이라 커밋 대상 아님.

## 게이트

- vitest **741/742**(1 skip = win32 심링크, +5) · Playwright **111/111**
- lint(`--max-warnings=0`)·typecheck·`format:check` green
- `verify-scope-boundaries.ts` **PASS: 12 boundaries, 237 files** · `adr-guardrails.ts` exit 0

## 남은 것

파일럿이 남긴 미해결은 이제 **OQ-017**(로그인 전용 OAuth App — 사람 준비물)뿐. 그 외는 G3(Wave 3 벤치·judge 배선)·G4(Wave 4 배포·predicateType+§13 예약 필드) 게이트 뒤에 있다.
